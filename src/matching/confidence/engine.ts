import {
  SCHEMA_VERSION,
  dataQualitySchema,
  fieldEvidenceSchema,
  isoDateTimeSchema,
  matchResultSchema,
  offerSchema,
  promotionSchema,
  purchaseScenarioSchema,
  sourceConflictSchema,
  sourceSchema,
  userRequestSchema,
  type Criterion,
  type CriterionEvaluationResult,
  type FieldEvidence,
  type SourceConflict,
} from "../../domain";
import { resolveEvaluator } from "../criteria";
import { CONFIDENCE_V1_CONFIG } from "./config";
import {
  calculateFieldConfidence,
  completenessBandForScore,
  confidenceBandForScore,
  leastReliableVerificationStatus,
  resolveEvidenceQuality,
  resolveFreshnessStatus,
} from "./field-confidence";
import { applyDataQualityToMatchResult } from "./match-integration";
import type {
  DataQualityReasonCode,
  RecommendedCheckCode,
} from "./reason-codes";
import type {
  CalculateDataQualityInput,
  CriticalConflict,
  CriticalUnknown,
  DataQualityBand,
  DataQualityConflictStatus,
  DataQualityEngineError,
  DataQualityEngineOutcome,
  FieldDataQualityResult,
  RecommendedCheck,
  RelevantCriterion,
} from "./types";

interface SafeParser<T> {
  safeParse(input: unknown):
    | { readonly success: true; readonly data: T }
    | {
        readonly success: false;
        readonly error: {
          readonly issues: readonly { readonly message: string }[];
        };
      };
}

interface ValidatedInput extends CalculateDataQualityInput {
  readonly fieldEvidence: readonly FieldEvidence[];
  readonly sourceConflicts: readonly SourceConflict[];
  readonly selectedOffer: NonNullable<
    CalculateDataQualityInput["selectedOffer"]
  > | null;
  readonly selectedPurchaseScenario: NonNullable<
    CalculateDataQualityInput["selectedPurchaseScenario"]
  > | null;
  readonly selectedPromotion: NonNullable<
    CalculateDataQualityInput["selectedPromotion"]
  > | null;
}

interface FieldAccumulator {
  readonly key: string;
  readonly dataFields: Set<string>;
  readonly displayFields: Set<string>;
  readonly criterionIds: Set<string>;
  readonly entityIds: Set<string>;
  readonly evidenceRefs: Set<string>;
  readonly verificationStatuses: FieldEvidence["verification_status"][];
  readonly freshnessStatuses: FieldEvidence["freshness_status"][];
  readonly completenessFactors: number[];
  importance: number;
  critical: boolean;
  hard: boolean;
  conflictFromResult: boolean;
  allowIndirectEvidenceFallback: boolean;
  validUntil: string | null;
}

const failure = (
  code: DataQualityEngineError["code"],
  message: string,
  entityId: string | null = null,
  criterionId: string | null = null,
): DataQualityEngineOutcome => ({
  success: false,
  error: {
    code,
    message,
    entity_id: entityId,
    criterion_id: criterionId,
  },
});

const parseList = <T>(
  values: readonly unknown[],
  parser: SafeParser<T>,
):
  | { readonly success: true; readonly data: readonly T[] }
  | { readonly success: false; readonly message: string } => {
  const parsed: T[] = [];
  for (const [index, value] of values.entries()) {
    const result = parser.safeParse(value);
    if (!result.success) {
      return {
        success: false,
        message: `Item ${index}: ${result.error.issues
          .map((issue) => issue.message)
          .join("; ")}`,
      };
    }
    parsed.push(result.data);
  }
  return { success: true, data: parsed };
};

const allCriteria = (
  request: ValidatedInput["userRequest"],
): readonly Criterion[] =>
  [
    ...request.must_have,
    ...request.nice_to_have,
    ...request.avoid,
    ...request.infrastructure,
    ...request.property_features,
  ].sort((left, right) => left.criterion_id.localeCompare(right.criterion_id));

const referencedEvidenceIds = (input: ValidatedInput): readonly string[] => [
  ...input.matchResult.criteria_results.flatMap(
    (result) => result.evidence_refs,
  ),
  ...(input.selectedOffer?.evidence_refs ?? []),
  ...(input.selectedOffer?.source_reference.evidence_ids ?? []),
  ...(input.selectedPurchaseScenario?.compatibility_evidence_refs ?? []),
  ...(input.selectedPurchaseScenario?.assumptions.flatMap(
    (assumption) => assumption.evidence_refs,
  ) ?? []),
  ...(input.selectedPurchaseScenario?.mandatory_costs.flatMap(
    (cost) => cost.evidence_refs,
  ) ?? []),
  ...(input.selectedPromotion?.evidence_refs ?? []),
  ...(input.selectedPromotion?.source_reference.evidence_ids ?? []),
];

const validateReferences = (
  input: ValidatedInput,
): DataQualityEngineOutcome | null => {
  if (input.matchResult.user_request_id !== input.userRequest.user_request_id) {
    return failure(
      "BROKEN_REFERENCE",
      "MatchResult belongs to another UserRequest",
      input.matchResult.match_result_id,
    );
  }

  const criteria = allCriteria(input.userRequest);
  const criterionIds = new Set<string>();
  for (const criterion of criteria) {
    if (criterionIds.has(criterion.criterion_id)) {
      return failure(
        "DUPLICATE_CRITERION_ID",
        `Duplicate criterion ID: ${criterion.criterion_id}`,
        null,
        criterion.criterion_id,
      );
    }
    criterionIds.add(criterion.criterion_id);
    const resolved = resolveEvaluator(criterion);
    if (!resolved.success) {
      return failure(
        "UNSUPPORTED_CRITERION",
        resolved.error.message,
        null,
        criterion.criterion_id,
      );
    }
  }

  const resultIds = new Set(
    input.matchResult.criteria_results.map((result) => result.criterion_id),
  );
  if (
    resultIds.size !== input.matchResult.criteria_results.length ||
    resultIds.size !== criterionIds.size ||
    [...criterionIds].some((criterionId) => !resultIds.has(criterionId))
  ) {
    return failure(
      "BROKEN_REFERENCE",
      "MatchResult criteria must correspond one-to-one with UserRequest criteria",
      input.matchResult.match_result_id,
    );
  }

  const evidenceIds = new Set(
    input.fieldEvidence.map((evidence) => evidence.evidence_id),
  );
  for (const evidenceId of referencedEvidenceIds(input)) {
    if (!evidenceIds.has(evidenceId)) {
      return failure(
        "BROKEN_REFERENCE",
        `Referenced FieldEvidence does not exist: ${evidenceId}`,
        evidenceId,
      );
    }
  }
  for (const conflict of input.sourceConflicts) {
    for (const evidenceId of conflict.evidence_ids) {
      if (!evidenceIds.has(evidenceId)) {
        return failure(
          "BROKEN_REFERENCE",
          `SourceConflict ${conflict.conflict_id} references missing evidence ${evidenceId}`,
          conflict.conflict_id,
        );
      }
    }
  }

  const sourceIds = new Set(input.sources.map((source) => source.source_id));
  for (const evidence of input.fieldEvidence) {
    if (!sourceIds.has(evidence.source_id)) {
      return failure(
        "BROKEN_REFERENCE",
        `FieldEvidence ${evidence.evidence_id} references missing Source ${evidence.source_id}`,
        evidence.evidence_id,
      );
    }
  }

  const propertyId = input.matchResult.property_id;
  if (
    input.selectedOffer !== null &&
    input.selectedOffer.property_id !== propertyId
  ) {
    return failure(
      "BROKEN_REFERENCE",
      "Selected Offer belongs to another Property",
      input.selectedOffer.offer_id,
    );
  }

  const scenarioId = input.matchResult.purchase_scenario_id;
  if (
    (scenarioId === null) !== (input.selectedPurchaseScenario === null) ||
    (scenarioId !== null &&
      input.selectedPurchaseScenario?.scenario_id !== scenarioId)
  ) {
    return failure(
      "BROKEN_REFERENCE",
      "Selected PurchaseScenario must match MatchResult.purchase_scenario_id",
      scenarioId,
    );
  }
  if (input.selectedPurchaseScenario !== null) {
    if (
      input.selectedOffer === null ||
      input.selectedPurchaseScenario.property_id !== propertyId ||
      input.selectedPurchaseScenario.offer_id !== input.selectedOffer.offer_id
    ) {
      return failure(
        "BROKEN_REFERENCE",
        "Selected PurchaseScenario must be anchored to the selected Property and Offer",
        input.selectedPurchaseScenario.scenario_id,
      );
    }
  }

  const promotionId = input.selectedPurchaseScenario?.promotion_id ?? null;
  if (
    (promotionId === null) !== (input.selectedPromotion === null) ||
    (promotionId !== null &&
      input.selectedPromotion?.promotion_id !== promotionId)
  ) {
    return failure(
      "BROKEN_REFERENCE",
      "Selected Promotion must match the selected PurchaseScenario",
      promotionId,
    );
  }
  return null;
};

const validateInput = (
  input: CalculateDataQualityInput,
):
  | { readonly success: true; readonly data: ValidatedInput }
  | DataQualityEngineOutcome => {
  const request = userRequestSchema.safeParse(input.userRequest);
  if (!request.success) {
    return failure(
      "MALFORMED_USER_REQUEST",
      request.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  const match = matchResultSchema.safeParse(input.matchResult);
  if (!match.success) {
    return failure(
      "MALFORMED_MATCH_RESULT",
      match.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  if (!isoDateTimeSchema.safeParse(input.currentTime).success) {
    return failure(
      "INVALID_CURRENT_TIME",
      "currentTime must be an ISO date-time with an explicit offset",
    );
  }

  const evidence = parseList(input.fieldEvidence, fieldEvidenceSchema);
  if (!evidence.success)
    return failure("MALFORMED_FIELD_EVIDENCE", evidence.message);
  const conflicts = parseList(input.sourceConflicts, sourceConflictSchema);
  if (!conflicts.success)
    return failure("MALFORMED_SOURCE_CONFLICT", conflicts.message);
  const sources = parseList(input.sources, sourceSchema);
  if (!sources.success) return failure("MALFORMED_SOURCE", sources.message);

  const offer =
    input.selectedOffer === undefined || input.selectedOffer === null
      ? null
      : offerSchema.safeParse(input.selectedOffer);
  if (offer !== null && !offer.success) {
    return failure(
      "MALFORMED_SELECTED_OFFER",
      offer.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  const scenario =
    input.selectedPurchaseScenario === undefined ||
    input.selectedPurchaseScenario === null
      ? null
      : purchaseScenarioSchema.safeParse(input.selectedPurchaseScenario);
  if (scenario !== null && !scenario.success) {
    return failure(
      "MALFORMED_SELECTED_SCENARIO",
      scenario.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  const promotion =
    input.selectedPromotion === undefined || input.selectedPromotion === null
      ? null
      : promotionSchema.safeParse(input.selectedPromotion);
  if (promotion !== null && !promotion.success) {
    return failure(
      "MALFORMED_SELECTED_PROMOTION",
      promotion.error.issues.map((issue) => issue.message).join("; "),
    );
  }

  const validated: ValidatedInput = {
    userRequest: request.data,
    matchResult: match.data,
    fieldEvidence: evidence.data,
    sourceConflicts: conflicts.data,
    sources: sources.data,
    selectedOffer: offer?.data ?? null,
    selectedPurchaseScenario: scenario?.data ?? null,
    selectedPromotion: promotion?.data ?? null,
    currentTime: input.currentTime,
  };
  const referenceError = validateReferences(validated);
  return referenceError ?? { success: true, data: validated };
};

const importanceFor = (criterion: Criterion): number => {
  if (
    (criterion.priority === "preferred" || criterion.priority === "avoid") &&
    criterion.weight !== null
  ) {
    return criterion.weight;
  }
  return CONFIDENCE_V1_CONFIG.priorityImportance[criterion.priority];
};

const completenessFor = (result: CriterionEvaluationResult): number => {
  if (result.status === "conflicting") {
    return CONFIDENCE_V1_CONFIG.conflictCompletenessFactor;
  }
  if (
    result.unknown_reason === "PRICE_FROM_NOT_EXACT" ||
    result.unknown_reason === "SCENARIO_TERMS_NOT_CONFIRMED"
  ) {
    return CONFIDENCE_V1_CONFIG.inexactCompletenessFactor;
  }
  if (result.actual === null) return 0;
  if (result.status === "unknown" && result.verification_status === "unknown") {
    return 0;
  }
  if (result.verification_status === "claimed") {
    return CONFIDENCE_V1_CONFIG.claimedCompletenessFactor;
  }
  return 1;
};

const createAccumulator = (key: string): FieldAccumulator => ({
  key,
  dataFields: new Set(),
  displayFields: new Set(),
  criterionIds: new Set(),
  entityIds: new Set(),
  evidenceRefs: new Set(),
  verificationStatuses: [],
  freshnessStatuses: [],
  completenessFactors: [],
  importance: 0,
  critical: false,
  hard: false,
  conflictFromResult: false,
  allowIndirectEvidenceFallback: false,
  validUntil: null,
});

const relevantCriteria = (
  input: ValidatedInput,
): {
  readonly included: readonly RelevantCriterion[];
  readonly excludedCriterionIds: readonly string[];
} => {
  const resultById = new Map(
    input.matchResult.criteria_results.map((result) => [
      result.criterion_id,
      result,
    ]),
  );
  const included: RelevantCriterion[] = [];
  const excludedCriterionIds: string[] = [];
  for (const criterion of allCriteria(input.userRequest)) {
    const result = resultById.get(criterion.criterion_id)!;
    if (
      criterion.priority === "neutral" ||
      criterion.priority === "unknown" ||
      result.status === "not_applicable"
    ) {
      excludedCriterionIds.push(criterion.criterion_id);
      continue;
    }
    included.push({ criterion, result });
  }
  return { included, excludedCriterionIds };
};

const buildAccumulators = (
  input: ValidatedInput,
  relevant: readonly RelevantCriterion[],
): readonly FieldAccumulator[] => {
  const accumulators = new Map<string, FieldAccumulator>();
  const get = (key: string): FieldAccumulator => {
    const existing = accumulators.get(key);
    if (existing) return existing;
    const created = createAccumulator(key);
    accumulators.set(key, created);
    return created;
  };

  for (const { criterion, result } of relevant) {
    const resolved = resolveEvaluator(criterion);
    if (!resolved.success) continue;
    const dependencies =
      resolved.definition.conflictFields.length > 0
        ? resolved.definition.conflictFields
        : [resolved.definition.actualField];
    const fieldImportance = importanceFor(criterion) / dependencies.length;
    for (const dataField of dependencies) {
      const accumulator = get(
        `${resolved.definition.actualEntity}:${dataField}`,
      );
      accumulator.dataFields.add(dataField);
      accumulator.displayFields.add(criterion.field);
      accumulator.criterionIds.add(criterion.criterion_id);
      accumulator.entityIds.add(input.matchResult.property_id);
      if (input.selectedOffer) {
        accumulator.entityIds.add(input.selectedOffer.offer_id);
      }
      if (input.selectedPurchaseScenario) {
        accumulator.entityIds.add(input.selectedPurchaseScenario.scenario_id);
      }
      for (const evidenceRef of result.evidence_refs) {
        accumulator.evidenceRefs.add(evidenceRef);
      }
      accumulator.verificationStatuses.push(result.verification_status);
      accumulator.freshnessStatuses.push(result.freshness_status);
      accumulator.completenessFactors.push(completenessFor(result));
      accumulator.importance = Math.max(
        accumulator.importance,
        fieldImportance,
      );
      accumulator.hard ||= ["must", "exclude"].includes(criterion.priority);
      accumulator.critical ||=
        accumulator.hard || criterion.critical_if_unknown;
      accumulator.conflictFromResult ||=
        result.status === "conflicting" ||
        result.verification_status === "conflicting";
      accumulator.allowIndirectEvidenceFallback ||=
        resolved.definition.actualEntity === "purchase_scenario" ||
        resolved.definition.actualEntity === "financing_eligibility";
    }
  }

  if (input.selectedOffer) {
    const availability = get("offer:availability");
    availability.dataFields.add("availability");
    availability.displayFields.add("availability");
    availability.entityIds.add(input.matchResult.property_id);
    availability.entityIds.add(input.selectedOffer.offer_id);
    for (const evidenceRef of input.selectedOffer.evidence_refs) {
      availability.evidenceRefs.add(evidenceRef);
    }
    availability.verificationStatuses.push(
      input.selectedOffer.verification_status,
    );
    availability.freshnessStatuses.push(input.selectedOffer.freshness_status);
    availability.completenessFactors.push(
      input.selectedOffer.availability === "unknown" ? 0 : 1,
    );
    availability.importance = Math.max(
      availability.importance,
      CONFIDENCE_V1_CONFIG.operationalFields.availabilityImportance,
    );
    availability.critical = true;
    availability.conflictFromResult ||=
      input.selectedOffer.verification_status === "conflicting";
    availability.validUntil = input.selectedOffer.expires_at;
  }

  if (input.selectedPromotion) {
    const promotion = get(
      `promotion:current_validity:${input.selectedPromotion.promotion_id}`,
    );
    promotion.dataFields.add("promotion.current_validity");
    promotion.displayFields.add("promotion.current_validity");
    promotion.entityIds.add(input.matchResult.property_id);
    promotion.entityIds.add(input.selectedPromotion.promotion_id);
    for (const evidenceRef of input.selectedPromotion.evidence_refs) {
      promotion.evidenceRefs.add(evidenceRef);
    }
    promotion.verificationStatuses.push(
      input.selectedPromotion.verification_status,
    );
    promotion.freshnessStatuses.push(input.selectedPromotion.freshness_status);
    promotion.completenessFactors.push(1);
    promotion.importance = Math.max(
      promotion.importance,
      CONFIDENCE_V1_CONFIG.operationalFields.promotionValidityImportance,
    );
    promotion.critical = true;
    promotion.conflictFromResult ||=
      input.selectedPromotion.verification_status === "conflicting";
    promotion.validUntil = input.selectedPromotion.valid_until;
  }

  return [...accumulators.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
};

const fieldAliases = (accumulator: FieldAccumulator): readonly string[] => {
  const aliases = new Set([
    ...accumulator.dataFields,
    ...accumulator.displayFields,
  ]);
  for (const field of accumulator.dataFields) {
    const configured = (
      CONFIDENCE_V1_CONFIG.evidenceFieldAliases as Readonly<
        Record<string, readonly string[]>
      >
    )[field];
    for (const alias of configured ?? []) aliases.add(alias);
  }
  return [...aliases].sort();
};

const evidenceFor = (
  accumulator: FieldAccumulator,
  evidenceById: ReadonlyMap<string, FieldEvidence>,
): {
  readonly evidence: readonly FieldEvidence[];
  readonly usedIndirectFallback: boolean;
} => {
  const referenced = [...accumulator.evidenceRefs]
    .map((evidenceId) => evidenceById.get(evidenceId))
    .filter((evidence): evidence is FieldEvidence => evidence !== undefined);
  const aliases = new Set(fieldAliases(accumulator));
  const direct = referenced.filter((evidence) => aliases.has(evidence.field));
  if (direct.length > 0) {
    return { evidence: direct, usedIndirectFallback: false };
  }
  if (accumulator.allowIndirectEvidenceFallback) {
    return {
      evidence: referenced,
      usedIndirectFallback: referenced.length > 0,
    };
  }
  return { evidence: [], usedIndirectFallback: false };
};

const conflictStatusFor = (
  accumulator: FieldAccumulator,
  conflicts: readonly SourceConflict[],
  evidence: readonly FieldEvidence[],
): DataQualityConflictStatus => {
  const evidenceIds = new Set(evidence.map((item) => item.evidence_id));
  const aliases = new Set(fieldAliases(accumulator));
  const relevant = conflicts.filter(
    (conflict) =>
      conflict.status === "open" &&
      (conflict.evidence_ids.some((evidenceId) =>
        evidenceIds.has(evidenceId),
      ) ||
        (accumulator.entityIds.has(conflict.entity_id) &&
          aliases.has(conflict.field))),
  );
  const statuses: DataQualityConflictStatus[] = relevant.map(
    (conflict) =>
      CONFIDENCE_V1_CONFIG.conflictSeverityStatus[conflict.severity],
  );
  if (accumulator.conflictFromResult && statuses.length === 0) {
    statuses.push("unresolved");
  }
  if (statuses.length === 0) return "none";
  return [...statuses].sort(
    (left, right) =>
      CONFIDENCE_V1_CONFIG.conflictFactors[left] -
        CONFIDENCE_V1_CONFIG.conflictFactors[right] ||
      left.localeCompare(right),
  )[0];
};

const checkCodeFor = (
  fields: readonly string[],
  conflictStatus: DataQualityConflictStatus,
): RecommendedCheckCode => {
  if (conflictStatus !== "none") return "RESOLVE_SOURCE_CONFLICT";
  if (fields.some((field) => field.includes("listing_price"))) {
    return "REFRESH_PRICE";
  }
  if (fields.some((field) => field.includes("availability"))) {
    return "VERIFY_AVAILABILITY";
  }
  if (
    fields.some(
      (field) =>
        field.includes("initial_payment") ||
        field.includes("zero_initial_payment"),
    )
  ) {
    return "VERIFY_INITIAL_PAYMENT";
  }
  if (
    fields.some(
      (field) =>
        field.includes("eligibility") ||
        field.includes("mortgage") ||
        field.includes("financing") ||
        field.includes("promotion"),
    )
  ) {
    return "VERIFY_FINANCING_APPLICABILITY";
  }
  if (
    fields.some(
      (field) => field.includes("handover") || field.includes("move_in"),
    )
  ) {
    return "VERIFY_HANDOVER_DATE";
  }
  if (fields.some((field) => field.includes("gas"))) {
    return "VERIFY_GAS_CONNECTION";
  }
  return "VERIFY_FIELD";
};

const checkPriority = (
  critical: boolean,
  conflictStatus: DataQualityConflictStatus,
  freshnessStatus: FieldEvidence["freshness_status"],
  verificationStatus: FieldEvidence["verification_status"],
): RecommendedCheck["priority"] => {
  if (critical) return "critical";
  if (
    conflictStatus !== "none" ||
    freshnessStatus === "expired" ||
    freshnessStatus === "stale"
  ) {
    return "high";
  }
  if (
    freshnessStatus === "aging" ||
    ["claimed", "unconfirmed", "stale", "unknown"].includes(verificationStatus)
  ) {
    return "medium";
  }
  return "low";
};

const reasonCodesFor = (input: {
  readonly verificationStatus: FieldEvidence["verification_status"];
  readonly freshnessStatus: FieldEvidence["freshness_status"];
  readonly conflictStatus: DataQualityConflictStatus;
  readonly evidenceCount: number;
  readonly multipleAgreeing: boolean;
  readonly completenessFactor: number;
  readonly critical: boolean;
}): readonly DataQualityReasonCode[] => {
  const reasons = new Set<DataQualityReasonCode>();
  if (
    input.verificationStatus === "confirmed" &&
    input.freshnessStatus === "fresh" &&
    input.conflictStatus === "none" &&
    input.evidenceCount > 0
  ) {
    reasons.add("CONFIRMED_FRESH");
  }
  if (input.verificationStatus === "claimed") {
    reasons.add("CLAIMED_SOURCE_ONLY");
  }
  if (input.verificationStatus === "unconfirmed") {
    reasons.add("FIELD_UNCONFIRMED");
  }
  if (
    input.verificationStatus === "unknown" ||
    input.completenessFactor === 0
  ) {
    reasons.add("FIELD_UNKNOWN");
  }
  if (input.conflictStatus !== "none") reasons.add("FIELD_CONFLICTING");
  if (input.freshnessStatus === "aging") reasons.add("FIELD_AGING");
  if (input.freshnessStatus === "stale") reasons.add("FIELD_STALE");
  if (input.freshnessStatus === "expired") reasons.add("FIELD_EXPIRED");
  if (input.evidenceCount === 0) reasons.add("NO_EVIDENCE");
  if (input.multipleAgreeing) reasons.add("MULTIPLE_AGREEING_EVIDENCE");
  if (
    input.critical &&
    input.conflictStatus === "none" &&
    (input.completenessFactor < 1 ||
      ["claimed", "unconfirmed", "unknown"].includes(input.verificationStatus))
  ) {
    reasons.add("CRITICAL_MUST_FIELD_UNKNOWN");
  }
  if (
    input.critical &&
    ["stale", "expired", "unknown"].includes(input.freshnessStatus)
  ) {
    reasons.add("CRITICAL_FIELD_STALE");
  }
  return [...reasons].sort();
};

const needsCheck = (reasons: readonly DataQualityReasonCode[]): boolean =>
  reasons.some((reason) =>
    [
      "CLAIMED_SOURCE_ONLY",
      "FIELD_UNCONFIRMED",
      "FIELD_UNKNOWN",
      "FIELD_CONFLICTING",
      "FIELD_AGING",
      "FIELD_STALE",
      "FIELD_EXPIRED",
      "NO_EVIDENCE",
      "CRITICAL_MUST_FIELD_UNKNOWN",
      "CRITICAL_FIELD_STALE",
    ].includes(reason),
  );

const finalizeField = (
  input: ValidatedInput,
  accumulator: FieldAccumulator,
  evidenceById: ReadonlyMap<string, FieldEvidence>,
): FieldDataQualityResult => {
  const aliases = fieldAliases(accumulator);
  const selectedEvidence = evidenceFor(accumulator, evidenceById);
  const conflictStatus = conflictStatusFor(
    accumulator,
    input.sourceConflicts,
    selectedEvidence.evidence,
  );
  const verificationStatus = leastReliableVerificationStatus([
    ...accumulator.verificationStatuses,
    ...selectedEvidence.evidence.map((item) => item.verification_status),
  ]);
  const freshnessStatus = resolveFreshnessStatus({
    fields: aliases,
    declared_statuses: [
      ...accumulator.freshnessStatuses,
      ...selectedEvidence.evidence.map((item) => item.freshness_status),
    ],
    evidence: selectedEvidence.evidence,
    current_time: input.currentTime,
    valid_until: accumulator.validUntil,
  });
  const evidenceQuality = resolveEvidenceQuality(
    selectedEvidence.evidence,
    input.sources,
    conflictStatus !== "none",
  );
  const effectiveEvidenceQuality = selectedEvidence.usedIndirectFallback
    ? {
        ...evidenceQuality,
        quality:
          evidenceQuality.quality === "direct"
            ? ("indirect" as const)
            : evidenceQuality.quality,
        factor: Math.min(
          evidenceQuality.factor,
          CONFIDENCE_V1_CONFIG.evidenceQualityFactors.indirect,
        ),
      }
    : evidenceQuality;
  const confidence = calculateFieldConfidence({
    verification_status: verificationStatus,
    freshness_status: freshnessStatus,
    conflict_status: conflictStatus,
    evidence_quality: effectiveEvidenceQuality.quality,
    evidence_quality_factor: effectiveEvidenceQuality.factor,
  });
  const completenessFactor = Math.min(...accumulator.completenessFactors);
  const criterionIds = [...accumulator.criterionIds].sort();
  const displayField = [...accumulator.displayFields].sort()[0];
  const evidenceRefs = selectedEvidence.evidence
    .map((item) => item.evidence_id)
    .sort();
  const reasons = reasonCodesFor({
    verificationStatus,
    freshnessStatus,
    conflictStatus,
    evidenceCount: selectedEvidence.evidence.length,
    multipleAgreeing:
      effectiveEvidenceQuality.multiple_agreeing_independent_evidence,
    completenessFactor,
    critical: accumulator.critical,
  });
  const recommendedCheck = needsCheck(reasons)
    ? {
        field: displayField,
        criterion_ids: criterionIds,
        code: checkCodeFor(aliases, conflictStatus),
        priority: checkPriority(
          accumulator.critical,
          conflictStatus,
          freshnessStatus,
          verificationStatus,
        ),
        evidence_refs: evidenceRefs,
      }
    : null;

  return {
    field: displayField,
    data_fields: [...accumulator.dataFields].sort(),
    criterion_ids: criterionIds,
    importance: accumulator.importance,
    confidence_score: confidence.confidence_score,
    completeness_factor: completenessFactor,
    verification_status: verificationStatus,
    freshness_status: freshnessStatus,
    conflict_status: conflictStatus,
    evidence_quality: effectiveEvidenceQuality.quality,
    evidence_count: selectedEvidence.evidence.length,
    evidence_refs: evidenceRefs,
    critical: accumulator.critical,
    factors: confidence.factors,
    reason_codes: reasons,
    recommended_check: recommendedCheck,
  };
};

const roundScore = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value + Number.EPSILON)));

const aggregateScore = (
  fields: readonly FieldDataQualityResult[],
  value: (field: FieldDataQualityResult) => number,
): number => {
  const weight = fields.reduce((sum, field) => sum + field.importance, 0);
  if (weight === 0) return 0;
  return roundScore(
    fields.reduce((sum, field) => sum + value(field) * field.importance, 0) /
      weight,
  );
};

const statusRank: Readonly<Record<DataQualityBand, number>> = {
  high: 3,
  medium: 2,
  low: 1,
  critical: 0,
};

const applyCriticalOverride = (
  status: DataQualityBand,
  criticalOverride: boolean,
): DataQualityBand => {
  if (!criticalOverride) return status;
  const maximum = CONFIDENCE_V1_CONFIG.criticalOverrideMaximumBand;
  return statusRank[status] > statusRank[maximum] ? maximum : status;
};

const criticalUnknownFor = (
  field: FieldDataQualityResult,
): CriticalUnknown | null => {
  if (!field.critical || field.conflict_status !== "none") return null;
  const reason = field.reason_codes.includes("CRITICAL_MUST_FIELD_UNKNOWN")
    ? "CRITICAL_MUST_FIELD_UNKNOWN"
    : field.reason_codes.includes("CRITICAL_FIELD_STALE")
      ? "CRITICAL_FIELD_STALE"
      : null;
  if (reason === null || field.recommended_check === null) return null;
  return {
    field: field.field,
    criterion_ids: field.criterion_ids,
    reason,
    current_status:
      field.freshness_status === "fresh"
        ? field.verification_status
        : field.freshness_status,
    recommended_check: field.recommended_check,
  };
};

const criticalConflictFor = (
  field: FieldDataQualityResult,
): CriticalConflict | null => {
  if (
    !field.critical ||
    field.conflict_status === "none" ||
    field.recommended_check === null
  ) {
    return null;
  }
  return {
    field: field.field,
    criterion_ids: field.criterion_ids,
    evidence_refs: field.evidence_refs,
    reason: "FIELD_CONFLICTING",
    recommended_check: field.recommended_check,
  };
};

const uniqueChecks = (
  fields: readonly FieldDataQualityResult[],
): readonly RecommendedCheck[] => {
  const checks = new Map<string, RecommendedCheck>();
  for (const field of fields) {
    const check = field.recommended_check;
    if (check) checks.set(`${check.field}:${check.code}`, check);
  }
  const priorityRank: Readonly<Record<RecommendedCheck["priority"], number>> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return [...checks.values()].sort(
    (left, right) =>
      priorityRank[left.priority] - priorityRank[right.priority] ||
      left.field.localeCompare(right.field) ||
      left.code.localeCompare(right.code),
  );
};

const buildResult = (input: ValidatedInput): DataQualityEngineOutcome => {
  const relevant = relevantCriteria(input);
  const accumulators = buildAccumulators(input, relevant.included);
  const evidenceById = new Map(
    input.fieldEvidence.map((evidence) => [evidence.evidence_id, evidence]),
  );
  const fieldResults = accumulators.map((accumulator) =>
    finalizeField(input, accumulator, evidenceById),
  );
  const criticalUnknowns = fieldResults
    .map(criticalUnknownFor)
    .filter((value): value is CriticalUnknown => value !== null);
  const criticalConflicts = fieldResults
    .map(criticalConflictFor)
    .filter((value): value is CriticalConflict => value !== null);
  const checks = uniqueChecks(fieldResults);
  const confidenceScore = aggregateScore(
    fieldResults,
    (field) => field.confidence_score,
  );
  const completenessScore = aggregateScore(
    fieldResults,
    (field) => field.completeness_factor * 100,
  );
  const freshnessScore = aggregateScore(
    fieldResults,
    (field) => field.factors.freshness * 100,
  );
  const criticalOverride =
    criticalUnknowns.length > 0 || criticalConflicts.length > 0;
  const confidenceStatus = applyCriticalOverride(
    confidenceBandForScore(confidenceScore),
    criticalOverride,
  );
  const completenessStatus = completenessBandForScore(completenessScore);

  const dataQuality = dataQualitySchema.parse({
    schema_version: SCHEMA_VERSION,
    data_quality_id: `data-quality:${input.matchResult.match_result_id}`,
    data_confidence_score: confidenceScore,
    data_completeness_score: completenessScore,
    freshness_score: freshnessScore,
    confidence_status: confidenceStatus,
    critical_unknown_count: criticalUnknowns.length,
    critical_conflict_count: criticalConflicts.length,
    critical_override: criticalOverride,
    fields: fieldResults.map((field) => ({
      field: field.field,
      importance: field.importance,
      verification_status: field.verification_status,
      freshness_status: field.freshness_status,
      conflict_status: field.conflict_status,
      evidence_quality: field.evidence_quality,
      field_confidence: field.confidence_score / 100,
      evidence_refs: field.evidence_refs,
    })),
    recommended_checks: checks.map((check) => ({
      field: check.field,
      priority: check.priority,
      action: check.code,
    })),
    algorithm_version: CONFIDENCE_V1_CONFIG.algorithmVersion,
  });
  const matchResult = applyDataQualityToMatchResult(
    input.matchResult,
    dataQuality,
  );

  return {
    success: true,
    result: {
      data_quality: dataQuality,
      match_result: matchResult,
      confidence_status: confidenceStatus,
      completeness_status: completenessStatus,
      field_results: fieldResults,
      critical_unknowns: criticalUnknowns,
      critical_conflicts: criticalConflicts,
      recommended_checks: checks,
      algorithm_version: CONFIDENCE_V1_CONFIG.algorithmVersion,
      policy_version: CONFIDENCE_V1_CONFIG.policyVersion,
      calculated_at: input.currentTime,
      excluded_criterion_ids: relevant.excludedCriterionIds,
    },
  };
};

export const calculateDataQuality = (
  input: CalculateDataQualityInput,
): DataQualityEngineOutcome => {
  const validated = validateInput(input);
  if (!("data" in validated)) return validated;
  return buildResult(validated.data);
};
