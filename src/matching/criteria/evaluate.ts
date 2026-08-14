import {
  SCHEMA_VERSION,
  criterionEvaluationResultSchema,
  criterionSchema,
  type Criterion,
  type CriterionEvaluationResult,
} from "../../domain";
import { extractActualValue } from "./actual-value";
import { CRITERIA_SOFT_CURVE_CONFIG } from "./config";
import {
  compareCriterion,
  moneyCurrenciesMatch,
  validateTarget,
} from "./evaluators";
import { resolveCriterionDefinition } from "./registry";
import {
  CRITERIA_EVALUATOR_VERSION,
  CRITERIA_REGISTRY_VERSION,
  type CriterionDefinition,
  type CriterionEvaluationContext,
  type CriterionEvaluationError,
  type CriterionEvaluationOutcome,
  type NormalizedActualValue,
} from "./types";

const error = (
  code: CriterionEvaluationError["code"],
  message: string,
  criterionId: string | null = null,
): CriterionEvaluationOutcome => ({
  success: false,
  error: { code, message, criterionId },
});

const isHard = (criterion: Criterion): boolean =>
  criterion.priority === "must" || criterion.priority === "exclude";

const conflictsFor = (
  context: CriterionEvaluationContext,
  definition: CriterionDefinition,
): readonly string[] => {
  const entityIds = new Set(
    [
      context.property.identity.property_id,
      context.offer?.offer_id,
      context.purchaseScenario?.scenario_id,
      context.financingEligibility?.eligibility_id,
    ].filter((value): value is string => value !== undefined && value !== null),
  );
  return (context.sourceConflicts ?? [])
    .filter(
      (conflict) =>
        entityIds.has(conflict.entity_id) &&
        definition.conflictFields.includes(conflict.field) &&
        ["open", "unknown"].includes(conflict.status),
    )
    .map((conflict) => conflict.conflict_id)
    .sort();
};

const explanationData = (
  criterion: Criterion,
  definition: CriterionDefinition,
  values: {
    readonly code: string;
    readonly params?: CriterionEvaluationResult["explanation_data"];
    readonly criticalUnknown?: boolean;
    readonly criticalConflict?: boolean;
  },
): CriterionEvaluationResult["explanation_data"] => ({
  criterion_key: definition.key,
  priority: criterion.priority,
  is_hard: isHard(criterion),
  is_critical_unknown: values.criticalUnknown ?? false,
  is_critical_conflict: values.criticalConflict ?? false,
  explanation_code: values.code,
  explanation_params: values.params ?? {},
  registry_version: CRITERIA_REGISTRY_VERSION,
  evaluator_version: CRITERIA_EVALUATOR_VERSION,
  soft_curve_config_version: CRITERIA_SOFT_CURVE_CONFIG.version,
});

const result = (
  criterion: Criterion,
  definition: CriterionDefinition,
  actual: NormalizedActualValue,
  input: Pick<
    CriterionEvaluationResult,
    "status" | "fit" | "margin" | "unknown_reason"
  > & {
    readonly verificationStatus?: CriterionEvaluationResult["verification_status"];
    readonly evidenceRefs?: readonly string[];
    readonly explanationCode: string;
    readonly explanationParams?: CriterionEvaluationResult["explanation_data"];
    readonly criticalUnknown?: boolean;
    readonly criticalConflict?: boolean;
  },
): CriterionEvaluationOutcome => {
  const candidate: CriterionEvaluationResult = {
    schema_version: SCHEMA_VERSION,
    criterion_id: criterion.criterion_id,
    status: input.status,
    actual: actual.value,
    target: criterion.target,
    fit: input.fit,
    margin: input.margin,
    verification_status: input.verificationStatus ?? actual.verificationStatus,
    freshness_status: actual.freshnessStatus,
    evidence_refs: [
      ...new Set(input.evidenceRefs ?? actual.evidenceRefs),
    ].sort(),
    unknown_reason: input.unknown_reason,
    explanation_data: explanationData(criterion, definition, {
      code: input.explanationCode,
      params: input.explanationParams,
      criticalUnknown: input.criticalUnknown,
      criticalConflict: input.criticalConflict,
    }),
  };
  return {
    success: true,
    result: criterionEvaluationResultSchema.parse(candidate),
  };
};

const validateContext = (
  context: CriterionEvaluationContext,
): CriterionEvaluationError | null => {
  const propertyId = context.property.identity.property_id;
  if (Number.isNaN(Date.parse(context.currentTime))) {
    return {
      code: "CONTEXT_MISMATCH",
      criterionId: null,
      message: "currentTime must be an ISO date-time",
    };
  }
  if (context.offer && context.offer.property_id !== propertyId) {
    return {
      code: "CONTEXT_MISMATCH",
      criterionId: null,
      message: "Offer belongs to a different Property",
    };
  }
  if (
    context.purchaseScenario &&
    (context.purchaseScenario.property_id !== propertyId ||
      (context.offer &&
        context.purchaseScenario.offer_id !== context.offer.offer_id))
  ) {
    return {
      code: "CONTEXT_MISMATCH",
      criterionId: null,
      message:
        "PurchaseScenario is not anchored to the supplied Property and Offer",
    };
  }
  if (
    context.financingEligibility &&
    (context.financingEligibility.property_id !== propertyId ||
      (context.offer &&
        context.financingEligibility.offer_id !== null &&
        context.financingEligibility.offer_id !== context.offer.offer_id))
  ) {
    return {
      code: "CONTEXT_MISMATCH",
      criterionId: null,
      message: "Financing eligibility belongs to a different Property or Offer",
    };
  }
  return null;
};

export type EvaluatorResolution =
  | { readonly success: true; readonly definition: CriterionDefinition }
  | { readonly success: false; readonly error: CriterionEvaluationError };

export const resolveEvaluator = (input: unknown): EvaluatorResolution => {
  const parsed = criterionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "MALFORMED_CRITERION",
        criterionId: null,
        message: parsed.error.issues.map((issue) => issue.message).join("; "),
      },
    };
  }
  const criterion = parsed.data;
  const definition = resolveCriterionDefinition(
    criterion.field,
    criterion.operator,
  );
  if (!definition) {
    return {
      success: false,
      error: {
        code: "UNSUPPORTED_CRITERION",
        criterionId: criterion.criterion_id,
        message: `Unsupported criterion field: ${criterion.field}`,
      },
    };
  }
  if (!definition.supportedOperators.includes(criterion.operator)) {
    return {
      success: false,
      error: {
        code: "UNSUPPORTED_OPERATOR",
        criterionId: criterion.criterion_id,
        message: `${criterion.operator} is not supported for ${definition.key}`,
      },
    };
  }
  if (
    criterion.unit !== null &&
    !definition.allowedUnits.includes(criterion.unit)
  ) {
    return {
      success: false,
      error: {
        code: "INVALID_UNIT",
        criterionId: criterion.criterion_id,
        message: `Invalid unit ${criterion.unit} for ${definition.key}`,
      },
    };
  }
  const targetError = validateTarget(criterion, definition);
  if (targetError) {
    return {
      success: false,
      error: {
        code: "INVALID_TARGET",
        criterionId: criterion.criterion_id,
        message: targetError,
      },
    };
  }
  return { success: true, definition };
};

export const evaluateCriterion = (
  input: unknown,
  context: CriterionEvaluationContext,
): CriterionEvaluationOutcome => {
  const parsed = criterionSchema.safeParse(input);
  if (!parsed.success) {
    return error(
      "MALFORMED_CRITERION",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  const criterion = parsed.data;
  const resolved = resolveEvaluator(criterion);
  if (!resolved.success) return { success: false, error: resolved.error };
  const definition = resolved.definition;
  const contextError = validateContext(context);
  if (contextError) {
    return {
      success: false,
      error: { ...contextError, criterionId: criterion.criterion_id },
    };
  }

  const actual = extractActualValue(criterion, context, definition);
  const registryApplicable = definition.applicablePropertyTypes.includes(
    context.property.property_type,
  );
  const requestApplicable =
    criterion.applicable_property_types.length === 0 ||
    criterion.applicable_property_types.includes(
      context.property.property_type,
    );
  if (!registryApplicable || !requestApplicable) {
    return result(criterion, definition, actual, {
      status: "not_applicable",
      fit: null,
      margin: null,
      unknown_reason: null,
      explanationCode: "CRITERION_NOT_APPLICABLE_TO_PROPERTY_TYPE",
      explanationParams: { property_type: context.property.property_type },
    });
  }

  const conflictIds = conflictsFor(context, definition);
  if (conflictIds.length > 0 || actual.verificationStatus === "conflicting") {
    const evidenceRefs = [
      ...actual.evidenceRefs,
      ...(context.sourceConflicts ?? [])
        .filter((conflict) => conflictIds.includes(conflict.conflict_id))
        .flatMap((conflict) => conflict.evidence_ids),
    ];
    return result(criterion, definition, actual, {
      status: "conflicting",
      fit: null,
      margin: null,
      unknown_reason: "UNRESOLVED_SOURCE_CONFLICT",
      verificationStatus: "conflicting",
      evidenceRefs,
      explanationCode: "CRITERION_VALUE_CONFLICTING",
      explanationParams: { conflict_ids: [...conflictIds] },
      criticalConflict: isHard(criterion),
    });
  }

  const claimedApplicability =
    definition.evaluatorType === "applicability" &&
    ["claimed", "unconfirmed", "unknown"].includes(actual.verificationStatus);
  if (
    actual.value === null ||
    (!actual.exact && !(claimedApplicability && !isHard(criterion))) ||
    criterion.priority === "unknown" ||
    (claimedApplicability && isHard(criterion))
  ) {
    const unknownReason =
      actual.unknownReason ??
      (criterion.priority === "unknown"
        ? "CRITERION_PRIORITY_UNKNOWN"
        : "VALUE_NOT_EXACT_OR_VERIFIED");
    return result(criterion, definition, actual, {
      status: "unknown",
      fit: null,
      margin: null,
      unknown_reason: unknownReason,
      explanationCode: unknownReason,
      criticalUnknown: isHard(criterion) || criterion.critical_if_unknown,
    });
  }

  if (!moneyCurrenciesMatch(criterion, actual)) {
    return error(
      "INVALID_UNIT",
      "Actual and target monetary currencies differ",
      criterion.criterion_id,
    );
  }

  const comparison = compareCriterion(criterion, definition, actual);
  let status: CriterionEvaluationResult["status"];
  let fit: number | null = comparison.fit;
  if (isHard(criterion)) {
    status = comparison.matched ? "matched" : "hard_failed";
    fit = comparison.matched ? 1 : 0;
  } else if (criterion.priority === "neutral") {
    status = comparison.matched ? "matched" : "not_matched";
    fit = null;
  } else if (claimedApplicability && comparison.matched) {
    status = "partially_matched";
  } else if (comparison.fit === 1) {
    status = "matched";
  } else if (comparison.fit > 0) {
    status = "partially_matched";
  } else {
    status = "not_matched";
  }

  return result(criterion, definition, actual, {
    status,
    fit,
    margin: comparison.margin,
    unknown_reason: null,
    explanationCode:
      claimedApplicability && comparison.matched
        ? "CLAIMED_MATCH_REQUIRES_CONFIRMATION"
        : comparison.explanationCode,
    explanationParams: comparison.explanationParams,
  });
};
