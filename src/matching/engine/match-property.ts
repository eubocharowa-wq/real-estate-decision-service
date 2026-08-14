import {
  SCHEMA_VERSION,
  fieldEvidenceSchema,
  financingProgramSchema,
  isoDateTimeSchema,
  matchResultSchema,
  offerSchema,
  propertyFinancingEligibilitySchema,
  propertySchema,
  purchaseScenarioSchema,
  sourceConflictSchema,
  userRequestSchema,
  type Criterion,
  type CriterionEvaluationResult,
  type FinancingProgram,
  type MatchResult,
  type Offer,
  type PropertyFinancingEligibility,
  type PurchaseScenario,
} from "../../domain";
import { evaluateCriterion, resolveEvaluator } from "../criteria";
import { MATCHING_V1_CONFIG } from "../config";
import { aggregateCriteria } from "./aggregation";
import {
  selectCompromises,
  selectStrengths,
  structuredCriterion,
  summaryCode,
} from "./explanations";
import {
  MATCHING_ALGORITHM_VERSION,
  type CriterionResultPair,
  type MatchPropertyInput,
  type MatchPropertyOutcome,
  type MatchingEngineError,
  type ScenarioCandidateSummary,
  type StructuredCriterionExplanation,
  type StructuredScenarioUnknown,
} from "./types";

interface CandidatePath {
  readonly offer: Offer | null;
  readonly scenario: PurchaseScenario | null;
}

interface HardUnknown {
  readonly pair: CriterionResultPair;
  readonly code: string;
  readonly conflict: boolean;
}

interface CandidateEvaluation {
  readonly path: CandidatePath;
  readonly pairs: readonly CriterionResultPair[];
  readonly eligibility: MatchResult["eligibility_status"];
  readonly hardFailures: readonly CriterionResultPair[];
  readonly hardUnknowns: readonly HardUnknown[];
  readonly criticalUnknowns: readonly HardUnknown[];
  readonly scenarioUnknowns: readonly StructuredScenarioUnknown[];
  readonly overallScore: ReturnType<typeof aggregateCriteria>;
  readonly propertyScore: ReturnType<typeof aggregateCriteria>;
  readonly financingScore: ReturnType<typeof aggregateCriteria>;
}

interface ValidatedInput extends MatchPropertyInput {
  readonly financingEligibility: readonly PropertyFinancingEligibility[];
  readonly financingPrograms: readonly FinancingProgram[];
  readonly fieldEvidence: NonNullable<MatchPropertyInput["fieldEvidence"]>;
  readonly sourceConflicts: NonNullable<MatchPropertyInput["sourceConflicts"]>;
}

const failure = (
  code: MatchingEngineError["code"],
  message: string,
  entityId: string | null = null,
  criterionId: string | null = null,
): MatchPropertyOutcome => ({
  success: false,
  error: {
    code,
    message,
    entity_id: entityId,
    criterion_id: criterionId,
  },
});

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

const validateInput = (
  input: MatchPropertyInput,
):
  | { readonly success: true; readonly data: ValidatedInput }
  | MatchPropertyOutcome => {
  const request = userRequestSchema.safeParse(input.userRequest);
  if (!request.success) {
    return failure(
      "MALFORMED_USER_REQUEST",
      request.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  const property = propertySchema.safeParse(input.property);
  if (!property.success) {
    return failure(
      "MALFORMED_PROPERTY",
      property.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  if (!isoDateTimeSchema.safeParse(input.currentTime).success) {
    return failure(
      "INVALID_CURRENT_TIME",
      "currentTime must be an ISO date-time with an explicit offset",
    );
  }

  const lists = {
    offers: parseList(input.offers, offerSchema),
    purchaseScenarios: parseList(
      input.purchaseScenarios,
      purchaseScenarioSchema,
    ),
    financingEligibility: parseList(
      input.financingEligibility ?? [],
      propertyFinancingEligibilitySchema,
    ),
    financingPrograms: parseList(
      input.financingPrograms ?? [],
      financingProgramSchema,
    ),
    fieldEvidence: parseList(input.fieldEvidence ?? [], fieldEvidenceSchema),
    sourceConflicts: parseList(
      input.sourceConflicts ?? [],
      sourceConflictSchema,
    ),
  };
  if (!lists.offers.success)
    return failure("MALFORMED_OFFER", lists.offers.message);
  if (!lists.purchaseScenarios.success)
    return failure(
      "MALFORMED_PURCHASE_SCENARIO",
      lists.purchaseScenarios.message,
    );
  if (!lists.financingEligibility.success)
    return failure(
      "MALFORMED_FINANCING_ELIGIBILITY",
      lists.financingEligibility.message,
    );
  if (!lists.financingPrograms.success)
    return failure(
      "MALFORMED_FINANCING_PROGRAM",
      lists.financingPrograms.message,
    );
  if (!lists.fieldEvidence.success)
    return failure("MALFORMED_FIELD_EVIDENCE", lists.fieldEvidence.message);
  if (!lists.sourceConflicts.success)
    return failure("MALFORMED_SOURCE_CONFLICT", lists.sourceConflicts.message);

  return {
    success: true,
    data: {
      userRequest: request.data,
      property: property.data,
      offers: lists.offers.data,
      purchaseScenarios: lists.purchaseScenarios.data,
      financingEligibility: lists.financingEligibility.data,
      financingPrograms: lists.financingPrograms.data,
      fieldEvidence: lists.fieldEvidence.data,
      sourceConflicts: lists.sourceConflicts.data,
      currentTime: input.currentTime,
    },
  };
};

const allCriteria = (input: ValidatedInput): readonly Criterion[] =>
  [
    ...input.userRequest.must_have,
    ...input.userRequest.nice_to_have,
    ...input.userRequest.avoid,
    ...input.userRequest.infrastructure,
    ...input.userRequest.property_features,
  ].sort((left, right) => left.criterion_id.localeCompare(right.criterion_id));

const validateCriteria = (
  criteria: readonly Criterion[],
):
  | {
      readonly success: true;
      readonly requirements: {
        readonly requiresOffer: boolean;
        readonly requiresScenario: boolean;
      };
    }
  | MatchPropertyOutcome => {
  const ids = new Set<string>();
  let requiresOffer = false;
  let requiresScenario = false;
  for (const criterion of criteria) {
    if (ids.has(criterion.criterion_id)) {
      return failure(
        "DUPLICATE_CRITERION_ID",
        `Duplicate criterion ID: ${criterion.criterion_id}`,
        null,
        criterion.criterion_id,
      );
    }
    ids.add(criterion.criterion_id);
    const resolved = resolveEvaluator(criterion);
    if (!resolved.success) {
      return failure(
        "UNSUPPORTED_CRITERION",
        resolved.error.message,
        null,
        criterion.criterion_id,
      );
    }
    requiresOffer ||= resolved.definition.actualEntity === "offer";
    requiresScenario ||=
      resolved.definition.actualEntity === "purchase_scenario" ||
      resolved.definition.actualEntity === "financing_eligibility";
  }
  return { success: true, requirements: { requiresOffer, requiresScenario } };
};

const validateReferences = (
  input: ValidatedInput,
): MatchPropertyOutcome | null => {
  const propertyId = input.property.identity.property_id;
  const offerIds = new Set(input.offers.map((offer) => offer.offer_id));
  const programIds = new Set(
    input.financingPrograms.map((program) => program.program_id),
  );
  for (const offer of input.offers) {
    if (offer.property_id !== propertyId) {
      return failure(
        "BROKEN_REFERENCE",
        `Offer ${offer.offer_id} belongs to another Property`,
        offer.offer_id,
      );
    }
  }
  for (const scenario of input.purchaseScenarios) {
    if (
      scenario.property_id !== propertyId ||
      !offerIds.has(scenario.offer_id)
    ) {
      return failure(
        "BROKEN_REFERENCE",
        `PurchaseScenario ${scenario.scenario_id} is not anchored to a supplied Property and Offer`,
        scenario.scenario_id,
      );
    }
    if (
      programIds.size > 0 &&
      scenario.financing_program_id !== null &&
      !programIds.has(scenario.financing_program_id)
    ) {
      return failure(
        "BROKEN_REFERENCE",
        `PurchaseScenario ${scenario.scenario_id} references an unknown FinancingProgram`,
        scenario.scenario_id,
      );
    }
  }
  for (const eligibility of input.financingEligibility) {
    if (
      eligibility.property_id !== propertyId ||
      (eligibility.offer_id !== null && !offerIds.has(eligibility.offer_id))
    ) {
      return failure(
        "BROKEN_REFERENCE",
        `Eligibility ${eligibility.eligibility_id} is not anchored to a supplied Property and Offer`,
        eligibility.eligibility_id,
      );
    }
    if (
      programIds.size > 0 &&
      eligibility.program_id !== null &&
      !programIds.has(eligibility.program_id)
    ) {
      return failure(
        "BROKEN_REFERENCE",
        `Eligibility ${eligibility.eligibility_id} references an unknown FinancingProgram`,
        eligibility.eligibility_id,
      );
    }
  }
  return null;
};

const candidatePaths = (
  input: ValidatedInput,
  requiresScenario: boolean,
): readonly CandidatePath[] => {
  if (requiresScenario && input.purchaseScenarios.length > 0) {
    return [...input.purchaseScenarios]
      .sort((left, right) => left.scenario_id.localeCompare(right.scenario_id))
      .map((scenario) => ({
        scenario,
        offer:
          input.offers.find((offer) => offer.offer_id === scenario.offer_id) ??
          null,
      }));
  }
  if (input.offers.length > 0) {
    return [...input.offers]
      .sort((left, right) => left.offer_id.localeCompare(right.offer_id))
      .map((offer) => ({ offer, scenario: null }));
  }
  return [{ offer: null, scenario: null }];
};

const eligibilityFor = (
  input: ValidatedInput,
  path: CandidatePath,
): PropertyFinancingEligibility | null => {
  const candidates = input.financingEligibility.filter((eligibility) => {
    if (
      eligibility.offer_id !== null &&
      eligibility.offer_id !== path.offer?.offer_id
    ) {
      return false;
    }
    if (path.scenario) {
      return (
        eligibility.program_id === path.scenario.financing_program_id &&
        (eligibility.financing_offer_id === null ||
          eligibility.financing_offer_id === path.scenario.financing_offer_id)
      );
    }
    return true;
  });
  return (
    [...candidates].sort((left, right) =>
      left.eligibility_id.localeCompare(right.eligibility_id),
    )[0] ?? null
  );
};

const programFor = (
  input: ValidatedInput,
  path: CandidatePath,
  eligibility: PropertyFinancingEligibility | null,
): FinancingProgram | null => {
  const programId =
    path.scenario?.financing_program_id ?? eligibility?.program_id ?? null;
  return (
    input.financingPrograms.find(
      (program) => program.program_id === programId,
    ) ?? null
  );
};

const isHard = (criterion: Criterion): boolean =>
  criterion.priority === "must" || criterion.priority === "exclude";

const freshnessExceeded = (
  criterion: Criterion,
  result: CriterionEvaluationResult,
): boolean => {
  if (criterion.freshness_requirement === null) return false;
  return (
    MATCHING_V1_CONFIG.freshnessOrder[result.freshness_status] >
    MATCHING_V1_CONFIG.freshnessOrder[criterion.freshness_requirement]
  );
};

const hardUnknownFor = (pair: CriterionResultPair): HardUnknown | null => {
  if (!isHard(pair.criterion)) return null;
  if (pair.result.status === "conflicting") {
    return {
      pair,
      code: "HARD_CRITERION_CONFLICTING",
      conflict: true,
    };
  }
  if (pair.result.status === "unknown") {
    return { pair, code: "HARD_CRITERION_UNKNOWN", conflict: false };
  }
  if (
    ["claimed", "unconfirmed", "unknown"].includes(
      pair.result.verification_status,
    )
  ) {
    return {
      pair,
      code: "HARD_CRITERION_NOT_CONFIRMED",
      conflict: false,
    };
  }
  if (freshnessExceeded(pair.criterion, pair.result)) {
    return {
      pair,
      code: "HARD_CRITERION_FRESHNESS_INSUFFICIENT",
      conflict: false,
    };
  }
  return null;
};

const confirmedUnavailable = (offer: Offer | null): boolean =>
  offer !== null &&
  offer.verification_status === "confirmed" &&
  MATCHING_V1_CONFIG.unavailableOfferStatuses.includes(
    offer.availability as (typeof MATCHING_V1_CONFIG.unavailableOfferStatuses)[number],
  );

const scenarioUnknowns = (
  scenario: PurchaseScenario | null,
): readonly StructuredScenarioUnknown[] => {
  const uncertainAssumptions =
    scenario?.assumptions.filter(
      (assumption) => assumption.verification_status !== "confirmed",
    ) ?? [];
  if (
    scenario === null ||
    (scenario.terms_compatibility_status === "confirmed" &&
      scenario.verification_status === "confirmed" &&
      uncertainAssumptions.length === 0)
  ) {
    return [];
  }
  return [
    {
      scenario_id: scenario.scenario_id,
      code:
        scenario.terms_compatibility_status === "conflicting" ||
        scenario.verification_status === "conflicting" ||
        uncertainAssumptions.some(
          (assumption) => assumption.verification_status === "conflicting",
        )
          ? "SCENARIO_TERMS_CONFLICTING"
          : uncertainAssumptions.length > 0
            ? "SCENARIO_ASSUMPTIONS_NOT_CONFIRMED"
            : "SCENARIO_TERMS_NOT_CONFIRMED",
      verification_status: scenario.verification_status,
      compatibility_status: scenario.terms_compatibility_status,
      evidence_refs: [
        ...new Set([
          ...scenario.compatibility_evidence_refs,
          ...uncertainAssumptions.flatMap(
            (assumption) => assumption.evidence_refs,
          ),
        ]),
      ].sort(),
    },
  ];
};

const evaluatePath = (
  input: ValidatedInput,
  criteria: readonly Criterion[],
  path: CandidatePath,
  requirements: {
    readonly requiresOffer: boolean;
    readonly requiresScenario: boolean;
  },
): CandidateEvaluation | MatchPropertyOutcome => {
  const eligibility = eligibilityFor(input, path);
  const financingProgram = programFor(input, path, eligibility);
  const pairs: CriterionResultPair[] = [];
  for (const criterion of criteria) {
    const outcome = evaluateCriterion(criterion, {
      property: input.property,
      offer: path.offer,
      purchaseScenario: path.scenario,
      financingEligibility: eligibility,
      financingProgram,
      fieldEvidence: input.fieldEvidence,
      sourceConflicts: input.sourceConflicts,
      currentTime: input.currentTime,
    });
    if (!outcome.success) {
      return failure(
        "CRITERION_EVALUATION_FAILED",
        outcome.error.message,
        input.property.identity.property_id,
        criterion.criterion_id,
      );
    }
    pairs.push({ criterion, result: outcome.result });
  }

  const hardUnknowns = pairs
    .map(hardUnknownFor)
    .filter((value): value is HardUnknown => value !== null);
  const hardUnknownIds = new Set(
    hardUnknowns.map((unknown) => unknown.pair.criterion.criterion_id),
  );
  const criticalUnknowns = [
    ...hardUnknowns,
    ...pairs
      .filter(
        (pair) =>
          !isHard(pair.criterion) &&
          pair.criterion.critical_if_unknown &&
          ["unknown", "conflicting"].includes(pair.result.status),
      )
      .map((pair) => ({
        pair,
        code:
          pair.result.status === "conflicting"
            ? "CRITICAL_SOFT_CRITERION_CONFLICTING"
            : "CRITICAL_SOFT_CRITERION_UNKNOWN",
        conflict: pair.result.status === "conflicting",
      })),
  ];
  const hardFailures = pairs.filter(
    (pair) =>
      isHard(pair.criterion) &&
      pair.result.status === "hard_failed" &&
      !hardUnknownIds.has(pair.criterion.criterion_id),
  );
  const scenarioUncertainty = scenarioUnknowns(path.scenario);
  const missingRequiredEntity =
    (requirements.requiresOffer && path.offer === null) ||
    (requirements.requiresScenario && path.scenario === null);

  let eligibilityStatus: MatchResult["eligibility_status"];
  if (confirmedUnavailable(path.offer)) {
    eligibilityStatus = "unavailable";
  } else if (hardFailures.length > 0) {
    eligibilityStatus = "hard_fail";
  } else if (missingRequiredEntity) {
    eligibilityStatus = "insufficient_data";
  } else if (
    hardUnknowns.some((unknown) => unknown.conflict) ||
    scenarioUncertainty.some(
      (unknown) => unknown.code === "SCENARIO_TERMS_CONFLICTING",
    )
  ) {
    eligibilityStatus = "possible_match";
  } else if (hardUnknowns.length > 0 || scenarioUncertainty.length > 0) {
    eligibilityStatus = "eligible_with_unknowns";
  } else {
    eligibilityStatus = "eligible";
  }

  const overallScore = aggregateCriteria(pairs);
  const propertyScore = aggregateCriteria(
    pairs.filter((pair) => pair.criterion.category !== "finance"),
  );
  const financingScore = aggregateCriteria(
    pairs.filter((pair) => pair.criterion.category === "finance"),
  );
  return {
    path,
    pairs,
    eligibility: eligibilityStatus,
    hardFailures,
    hardUnknowns,
    criticalUnknowns,
    scenarioUnknowns: scenarioUncertainty,
    overallScore,
    propertyScore,
    financingScore,
  };
};

interface ComparableDecimal {
  readonly digits: bigint;
  readonly scale: number;
}

const decimal = (value: string): ComparableDecimal => {
  const [whole, fraction = ""] = value.split(".");
  return { digits: BigInt(`${whole}${fraction}`), scale: fraction.length };
};

const compareEntryCost = (
  left: PurchaseScenario | null,
  right: PurchaseScenario | null,
): number => {
  const leftMoney = left?.estimated_total_entry_cost;
  const rightMoney = right?.estimated_total_entry_cost;
  if (leftMoney === null || leftMoney === undefined) {
    return rightMoney === null || rightMoney === undefined ? 0 : 1;
  }
  if (rightMoney === null || rightMoney === undefined) return -1;
  if (leftMoney.currency !== rightMoney.currency) {
    return leftMoney.currency.localeCompare(rightMoney.currency);
  }
  const leftDecimal = decimal(leftMoney.amount);
  const rightDecimal = decimal(rightMoney.amount);
  const scale = Math.max(leftDecimal.scale, rightDecimal.scale);
  const leftValue =
    leftDecimal.digits * BigInt(10) ** BigInt(scale - leftDecimal.scale);
  const rightValue =
    rightDecimal.digits * BigInt(10) ** BigInt(scale - rightDecimal.scale);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
};

const candidateComparator = (
  left: CandidateEvaluation,
  right: CandidateEvaluation,
): number => {
  const eligibilityDifference =
    MATCHING_V1_CONFIG.scenarioSelection.eligibilityOrder[right.eligibility] -
    MATCHING_V1_CONFIG.scenarioSelection.eligibilityOrder[left.eligibility];
  if (eligibilityDifference !== 0) return eligibilityDifference;
  const financingDifference =
    right.financingScore.score - left.financingScore.score;
  if (financingDifference !== 0) return financingDifference;
  const leftVerification = left.path.scenario?.verification_status;
  const rightVerification = right.path.scenario?.verification_status;
  const verificationDifference =
    (rightVerification
      ? MATCHING_V1_CONFIG.scenarioSelection.verificationOrder[
          rightVerification
        ]
      : 0) -
    (leftVerification
      ? MATCHING_V1_CONFIG.scenarioSelection.verificationOrder[leftVerification]
      : 0);
  if (verificationDifference !== 0) return verificationDifference;
  const entryCostDifference = compareEntryCost(
    left.path.scenario,
    right.path.scenario,
  );
  if (entryCostDifference !== 0) return entryCostDifference;
  const scenarioDifference = (
    left.path.scenario?.scenario_id ?? ""
  ).localeCompare(right.path.scenario?.scenario_id ?? "");
  if (scenarioDifference !== 0) return scenarioDifference;
  return (left.path.offer?.offer_id ?? "").localeCompare(
    right.path.offer?.offer_id ?? "",
  );
};

const candidateSummary = (
  candidate: CandidateEvaluation,
): ScenarioCandidateSummary => ({
  offer_id: candidate.path.offer?.offer_id ?? null,
  purchase_scenario_id: candidate.path.scenario?.scenario_id ?? null,
  eligibility_status: candidate.eligibility,
  match_score: candidate.overallScore.score,
  financing_fit_score: candidate.financingScore.score,
  scenario_verification_status:
    candidate.path.scenario?.verification_status ?? null,
});

const uniqueCriterionIds = (
  items: readonly StructuredCriterionExplanation[],
): readonly string[] =>
  [...new Set(items.map((item) => item.criterion_id))].sort();

const buildResult = (
  input: ValidatedInput,
  selected: CandidateEvaluation,
  candidates: readonly CandidateEvaluation[],
): MatchPropertyOutcome => {
  const strengths = selectStrengths(selected.pairs);
  const compromises = selectCompromises(selected.pairs);
  const hardFailures = selected.hardFailures.map((pair) =>
    structuredCriterion(pair),
  );
  const criticalUnknowns = selected.criticalUnknowns
    .map((unknown) => structuredCriterion(unknown.pair, unknown.code))
    .sort((left, right) => left.criterion_id.localeCompare(right.criterion_id));
  const summary = summaryCode(
    selected.eligibility,
    selected.overallScore.score,
  );
  const recommendedActions = [
    ...(selected.eligibility === "unavailable" ? ["CHECK_AVAILABILITY"] : []),
    ...(hardFailures.length > 0 ? ["REVIEW_HARD_FAILURES"] : []),
    ...(criticalUnknowns.length > 0 || selected.scenarioUnknowns.length > 0
      ? ["VERIFY_CRITICAL_CRITERIA"]
      : []),
  ];
  const scenarioId = selected.path.scenario?.scenario_id ?? null;
  const offerId = selected.path.offer?.offer_id ?? null;
  const matchResultId = `matching:${input.userRequest.user_request_id}:${input.property.identity.property_id}:${scenarioId ?? offerId ?? "property_only"}`;

  const formal = matchResultSchema.parse({
    schema_version: SCHEMA_VERSION,
    match_result_id: matchResultId,
    user_request_id: input.userRequest.user_request_id,
    property_id: input.property.identity.property_id,
    purchase_scenario_id: scenarioId,
    eligibility_status: selected.eligibility,
    match_score: selected.overallScore.score,
    property_fit_score: selected.propertyScore.score,
    financing_fit_score: selected.financingScore.score,
    data_confidence_score: MATCHING_V1_CONFIG.formalMetricPlaceholder,
    data_completeness_score: MATCHING_V1_CONFIG.formalMetricPlaceholder,
    ranking_score: MATCHING_V1_CONFIG.formalMetricPlaceholder,
    criteria_results: selected.pairs.map((pair) => pair.result),
    hard_failures: uniqueCriterionIds(hardFailures),
    compromises: uniqueCriterionIds(compromises),
    strengths: uniqueCriterionIds(strengths),
    unknown_critical: [
      ...uniqueCriterionIds(criticalUnknowns),
      ...selected.scenarioUnknowns.map((unknown) => unknown.scenario_id),
    ].sort(),
    recommended_actions: recommendedActions,
    algorithm_version: MATCHING_ALGORITHM_VERSION,
    calculated_at: input.currentTime,
  });

  return {
    success: true,
    result: {
      match_result: formal,
      selected_offer_id: offerId,
      summary_code: summary,
      metric_statuses: {
        match_score: selected.overallScore.status,
        property_fit_score: selected.propertyScore.status,
        financing_fit_score: selected.financingScore.status,
        data_confidence_score: "not_calculated",
        data_completeness_score: "not_calculated",
        ranking_score: "not_calculated",
      },
      score_details: {
        overall: selected.overallScore,
        property: selected.propertyScore,
        financing: selected.financingScore,
      },
      explanation: {
        summary_code: summary,
        strengths,
        compromises,
        hard_failures: hardFailures,
        critical_unknowns: criticalUnknowns,
        scenario_unknowns: selected.scenarioUnknowns,
      },
      scenario_selection: {
        selected_offer_id: offerId,
        selected_purchase_scenario_id: scenarioId,
        selection_code: "BEST_COMPATIBLE_SCENARIO_V1",
        tie_break_order: MATCHING_V1_CONFIG.scenarioSelection.tieBreakOrder,
        candidates: candidates.map(candidateSummary),
      },
    },
  };
};

export const matchProperty = (
  input: MatchPropertyInput,
): MatchPropertyOutcome => {
  const validated = validateInput(input);
  if (!("data" in validated)) return validated;
  const referencesError = validateReferences(validated.data);
  if (referencesError) return referencesError;
  const criteria = allCriteria(validated.data);
  const criteriaValidation = validateCriteria(criteria);
  if (!("requirements" in criteriaValidation)) return criteriaValidation;
  const paths = candidatePaths(
    validated.data,
    criteriaValidation.requirements.requiresScenario,
  );
  const candidates: CandidateEvaluation[] = [];
  for (const path of paths) {
    const evaluated = evaluatePath(
      validated.data,
      criteria,
      path,
      criteriaValidation.requirements,
    );
    if (!("pairs" in evaluated)) return evaluated;
    candidates.push(evaluated);
  }
  candidates.sort(candidateComparator);
  return buildResult(validated.data, candidates[0], candidates);
};
