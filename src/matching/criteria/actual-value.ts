import type {
  Criterion,
  CriterionEvaluationResult,
  FieldEvidence,
} from "../../domain";
import type {
  CriterionDefinition,
  CriterionEvaluationContext,
  NormalizedActualValue,
} from "./types";

type JsonValue = CriterionEvaluationResult["actual"];

const asJson = (value: unknown): JsonValue => value as JsonValue;

const getPath = (subject: unknown, path: string): unknown => {
  let current = subject;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return current ?? null;
};

const propertyId = (context: CriterionEvaluationContext): string =>
  context.property.identity.property_id;

const evidenceFor = (
  context: CriterionEvaluationContext,
  field: string,
): readonly FieldEvidence[] =>
  (context.fieldEvidence ?? []).filter(
    (evidence) =>
      evidence.entity_id === propertyId(context) && evidence.field === field,
  );

const bestEvidence = (
  evidence: readonly FieldEvidence[],
): FieldEvidence | null => {
  const rank = {
    confirmed: 0,
    claimed: 1,
    stale: 2,
    unconfirmed: 3,
    conflicting: 4,
    unknown: 5,
  } as const;
  return (
    [...evidence].sort(
      (left, right) =>
        rank[left.verification_status] - rank[right.verification_status] ||
        left.evidence_id.localeCompare(right.evidence_id),
    )[0] ?? null
  );
};

const withEvidence = (
  context: CriterionEvaluationContext,
  definition: CriterionDefinition,
  value: unknown,
  fallback: Pick<
    NormalizedActualValue,
    "verificationStatus" | "freshnessStatus" | "evidenceRefs"
  >,
  exact = true,
  unknownReason: string | null = null,
): NormalizedActualValue => {
  const evidence = evidenceFor(context, definition.actualField);
  const selected = bestEvidence(evidence);
  return {
    value: asJson(value),
    verificationStatus:
      selected?.verification_status ?? fallback.verificationStatus,
    freshnessStatus: selected?.freshness_status ?? fallback.freshnessStatus,
    evidenceRefs:
      evidence.length > 0
        ? evidence.map((item) => item.evidence_id).sort()
        : fallback.evidenceRefs,
    exact,
    unknownReason,
  };
};

const propertyActual = (
  context: CriterionEvaluationContext,
  definition: CriterionDefinition,
): NormalizedActualValue => {
  const rawValue = getPath(context.property, definition.actualField);
  const value = rawValue === "unknown" ? null : rawValue;
  const evidenceRefs = context.property.metadata.evidence_refs;
  return withEvidence(
    context,
    definition,
    value,
    {
      verificationStatus: value === null ? "unknown" : "unconfirmed",
      freshnessStatus: "unknown",
      evidenceRefs,
    },
    true,
    value === null
      ? rawValue === "unknown"
        ? "FIELD_VALUE_UNKNOWN"
        : "FIELD_VALUE_MISSING"
      : null,
  );
};

const offerActual = (
  context: CriterionEvaluationContext,
  definition: CriterionDefinition,
): NormalizedActualValue => {
  const offer = context.offer;
  if (!offer) {
    return {
      value: null,
      verificationStatus: "unknown",
      freshnessStatus: "unknown",
      evidenceRefs: [],
      exact: false,
      unknownReason: "OFFER_MISSING",
    };
  }
  const value = getPath(offer, definition.actualField);
  const isPriceFrom =
    definition.key === "price_max" && offer.price_from === true;
  const isUnknownAvailability =
    definition.key === "availability" && value === "unknown";
  return {
    value: asJson(isUnknownAvailability ? null : value),
    verificationStatus: isUnknownAvailability
      ? "unknown"
      : offer.verification_status,
    freshnessStatus: offer.freshness_status,
    evidenceRefs: offer.evidence_refs,
    exact: !isPriceFrom,
    unknownReason: isPriceFrom
      ? "PRICE_FROM_NOT_EXACT"
      : isUnknownAvailability
        ? "AVAILABILITY_UNKNOWN"
        : value === null
          ? "FIELD_VALUE_MISSING"
          : null,
  };
};

const scenarioActual = (
  context: CriterionEvaluationContext,
  definition: CriterionDefinition,
): NormalizedActualValue => {
  const scenario = context.purchaseScenario;
  if (!scenario) {
    return {
      value: null,
      verificationStatus: "unknown",
      freshnessStatus: "unknown",
      evidenceRefs: [],
      exact: false,
      unknownReason: "PURCHASE_SCENARIO_MISSING",
    };
  }
  const value = getPath(scenario, definition.actualField);
  return {
    value: asJson(value),
    verificationStatus: scenario.verification_status,
    freshnessStatus: scenario.freshness_status,
    evidenceRefs: scenario.compatibility_evidence_refs,
    exact: value !== null,
    unknownReason: value === null ? "SCENARIO_VALUE_MISSING" : null,
  };
};

const eligibilityActual = (
  criterion: Criterion,
  context: CriterionEvaluationContext,
  definition: CriterionDefinition,
): NormalizedActualValue => {
  const eligibility = context.financingEligibility;
  if (!eligibility) {
    const scenario = context.purchaseScenario;
    if (scenario && definition.key === "zero_initial_payment") {
      const amount = scenario.initial_payment?.amount;
      return {
        value: amount === undefined ? null : /^0(?:\.0+)?$/.test(amount),
        verificationStatus: scenario.verification_status,
        freshnessStatus: scenario.freshness_status,
        evidenceRefs: scenario.compatibility_evidence_refs,
        exact:
          amount !== undefined &&
          scenario.terms_compatibility_status === "confirmed",
        unknownReason:
          amount === undefined
            ? "SCENARIO_INITIAL_PAYMENT_MISSING"
            : scenario.terms_compatibility_status === "confirmed"
              ? null
              : "SCENARIO_TERMS_NOT_CONFIRMED",
      };
    }
    if (scenario && definition.key === "financing_program") {
      const hasProgram = scenario.financing_program_id !== null;
      const isFamilyCriterion = criterion.field === "family_mortgage";
      const programType = context.financingProgram?.program_type;
      const value =
        typeof criterion.target === "boolean"
          ? isFamilyCriterion
            ? programType === undefined
              ? null
              : programType === "family_mortgage"
            : hasProgram
          : hasProgram
            ? (programType ?? scenario.financing_program_id)
            : false;
      return {
        value: asJson(value),
        verificationStatus: scenario.verification_status,
        freshnessStatus: scenario.freshness_status,
        evidenceRefs: scenario.compatibility_evidence_refs,
        exact:
          value !== null && scenario.terms_compatibility_status === "confirmed",
        unknownReason:
          value === null
            ? "FINANCING_PROGRAM_TYPE_MISSING"
            : scenario.terms_compatibility_status === "confirmed"
              ? null
              : "SCENARIO_TERMS_NOT_CONFIRMED",
      };
    }
    return {
      value: null,
      verificationStatus: "unknown",
      freshnessStatus: "unknown",
      evidenceRefs: [],
      exact: false,
      unknownReason: "FINANCING_ELIGIBILITY_MISSING",
    };
  }

  let value: JsonValue = null;
  let unknownReason: string | null = null;
  if (definition.key === "zero_initial_payment") {
    const zeroStatus = eligibility.initial_payment.zero_payment_status;
    value =
      zeroStatus === "available" || zeroStatus === "claimed"
        ? true
        : zeroStatus === "not_available"
          ? false
          : null;
    if (zeroStatus === "unknown") unknownReason = "ZERO_PAYMENT_UNKNOWN";
  } else {
    const status = eligibility.eligibility_status;
    const isFamilyCriterion = criterion.field === "family_mortgage";
    const programType = context.financingProgram?.program_type;
    if (status === "confirmed") {
      value =
        typeof criterion.target === "boolean"
          ? isFamilyCriterion
            ? programType === undefined
              ? null
              : programType === "family_mortgage"
            : true
          : asJson(programType ?? eligibility.program_id ?? true);
      if (value === null) unknownReason = "FINANCING_PROGRAM_TYPE_MISSING";
    } else if (status === "not_eligible") {
      value = false;
    } else if (status === "claimed" || status === "likely") {
      value =
        typeof criterion.target === "boolean"
          ? isFamilyCriterion
            ? programType === undefined
              ? null
              : programType === "family_mortgage"
            : true
          : criterion.target;
      unknownReason = "FINANCING_APPLICABILITY_CLAIMED";
    } else {
      value = null;
      unknownReason = "FINANCING_APPLICABILITY_UNKNOWN";
    }
  }
  return {
    value,
    verificationStatus: eligibility.verification_status,
    freshnessStatus: eligibility.freshness_status,
    evidenceRefs: eligibility.applicability_evidence_refs,
    exact:
      value !== null &&
      ["confirmed", "not_eligible"].includes(eligibility.eligibility_status),
    unknownReason,
  };
};

const derivedActual = (
  context: CriterionEvaluationContext,
  definition: CriterionDefinition,
): NormalizedActualValue => {
  const floor = context.property.physical.floor;
  let value: boolean | null = null;
  if (definition.key === "first_floor")
    value = floor === null ? null : floor === 1;
  if (definition.key === "top_floor") {
    const total = context.property.building.floors_total;
    value = floor === null || total === null ? null : floor === total;
  }
  const evidence = evidenceFor(context, "physical.floor");
  const selected = bestEvidence(evidence);
  return {
    value,
    verificationStatus:
      selected?.verification_status ??
      (value === null ? "unknown" : "unconfirmed"),
    freshnessStatus: selected?.freshness_status ?? "unknown",
    evidenceRefs: evidence.map((item) => item.evidence_id).sort(),
    exact: value !== null,
    unknownReason: value === null ? "DERIVED_INPUT_MISSING" : null,
  };
};

const evidenceActual = (
  context: CriterionEvaluationContext,
  definition: CriterionDefinition,
): NormalizedActualValue => {
  const evidence = evidenceFor(context, definition.actualField);
  const selected = bestEvidence(evidence);
  if (!selected || selected.value === null) {
    return {
      value: null,
      verificationStatus: selected?.verification_status ?? "unknown",
      freshnessStatus: selected?.freshness_status ?? "unknown",
      evidenceRefs: evidence.map((item) => item.evidence_id).sort(),
      exact: false,
      unknownReason: "EVIDENCE_VALUE_MISSING",
    };
  }
  return {
    value: selected.value,
    verificationStatus: selected.verification_status,
    freshnessStatus: selected.freshness_status,
    evidenceRefs: evidence.map((item) => item.evidence_id).sort(),
    exact: true,
    unknownReason: null,
  };
};

export const extractActualValue = (
  criterion: Criterion,
  context: CriterionEvaluationContext,
  definition: CriterionDefinition,
): NormalizedActualValue => {
  switch (definition.actualEntity) {
    case "property":
      return propertyActual(context, definition);
    case "offer":
      return offerActual(context, definition);
    case "purchase_scenario":
      return scenarioActual(context, definition);
    case "financing_eligibility":
      return eligibilityActual(criterion, context, definition);
    case "derived":
      return derivedActual(context, definition);
    case "evidence":
      return evidenceActual(context, definition);
  }
};
