import { describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  criterionEvaluationResultSchema,
  criterionSchema,
  type Criterion,
} from "../../src/domain";
import {
  evaluateCriterion,
  type CriterionEvaluationContext,
} from "../../src/matching";
import { loadPilotDataset } from "../../src/pilot-dataset";

const dataset = loadPilotDataset();
const properties = new Map(
  dataset.properties.map((item) => [item.identity.property_id, item]),
);
const offers = new Map(dataset.offers.map((item) => [item.offer_id, item]));
const eligibilities = new Map(
  dataset.propertyFinancingEligibility.map((item) => [
    item.eligibility_id,
    item,
  ]),
);
const scenarios = new Map(
  dataset.purchaseScenarios.map((item) => [item.scenario_id, item]),
);
const programs = new Map(
  dataset.financingPrograms.map((item) => [item.program_id, item]),
);
const requests = new Map(
  dataset.userRequests.map((item) => [item.user_request_id, item]),
);

const requestCriterion = (
  requestId: string,
  criterionId: string,
): Criterion => {
  const request = requests.get(requestId)!;
  return [
    ...request.must_have,
    ...request.nice_to_have,
    ...request.avoid,
    ...request.infrastructure,
    ...request.property_features,
  ].find((item) => item.criterion_id === criterionId)!;
};

const customCriterion = (
  overrides: Partial<Criterion> &
    Pick<Criterion, "field" | "operator" | "target">,
): Criterion =>
  criterionSchema.parse({
    schema_version: SCHEMA_VERSION,
    criterion_id: "criterion_integration",
    category: "property",
    unit: null,
    priority: "must",
    weight: null,
    tolerance: null,
    fit_function: null,
    criterion_group_id: null,
    applicable_property_types: [],
    source_requirement: [],
    freshness_requirement: null,
    critical_if_unknown: true,
    user_expression: null,
    ...overrides,
  });

const context = (
  propertyId: string,
  offerId: string,
  options: { eligibilityId?: string; scenarioId?: string } = {},
): CriterionEvaluationContext => {
  const eligibility = options.eligibilityId
    ? eligibilities.get(options.eligibilityId)
    : undefined;
  return {
    property: properties.get(propertyId)!,
    offer: offers.get(offerId)!,
    financingEligibility: eligibility,
    financingProgram:
      eligibility?.program_id === null || eligibility?.program_id === undefined
        ? undefined
        : programs.get(eligibility.program_id),
    purchaseScenario: options.scenarioId
      ? scenarios.get(options.scenarioId)
      : undefined,
    fieldEvidence: dataset.fieldEvidence,
    sourceConflicts: dataset.sourceConflicts,
    currentTime: "2026-08-15T00:00:00.000Z",
  };
};

const evaluate = (
  criterion: Criterion,
  evaluationContext: CriterionEvaluationContext,
) => {
  const outcome = evaluateCriterion(criterion, evaluationContext);
  expect(outcome.success).toBe(true);
  if (!outcome.success) throw new Error(outcome.error.message);
  expect(
    criterionEvaluationResultSchema.safeParse(outcome.result).success,
  ).toBe(true);
  return outcome.result;
};

describe("TASK-006 pilot benchmark criterion evaluations", () => {
  it("passes and fails a strict budget deterministically", () => {
    const budget = requestCriterion("request_pilot_a", "criterion_a_budget");
    expect(
      evaluate(budget, context("prop_nb_004", "offer_nb_004_primary")).status,
    ).toBe("matched");
    expect(
      evaluate(budget, context("prop_nb_014", "offer_nb_014_primary")).status,
    ).toBe("hard_failed");
  });

  it("hard-fails an excluded first floor", () => {
    const criterion = requestCriterion(
      "request_pilot_a",
      "criterion_a_first_floor",
    );
    expect(
      evaluate(criterion, context("prop_sec_003", "offer_sec_003_primary"))
        .status,
    ).toBe("hard_failed");
  });

  it("does not promote claimed zero-down or financing eligibility", () => {
    const zero = requestCriterion("request_pilot_a", "criterion_a_zero");
    const family = requestCriterion("request_pilot_a", "criterion_a_family");
    const claimedContext = context("prop_nb_002", "offer_nb_002_primary", {
      eligibilityId: "elig_nb_002_family",
      scenarioId: "scenario_nb_002_claimed",
    });
    const zeroResult = evaluate(zero, claimedContext);
    const familyResult = evaluate(family, claimedContext);
    expect(zeroResult).toMatchObject({
      status: "partially_matched",
      verification_status: "claimed",
    });
    expect(familyResult).toMatchObject({
      status: "unknown",
      verification_status: "claimed",
    });

    const mustZero = customCriterion({
      criterion_id: "criterion_must_zero",
      category: "finance",
      field: "zero_initial_payment",
      operator: "boolean",
      target: true,
      priority: "must",
    });
    expect(evaluate(mustZero, claimedContext)).toMatchObject({
      status: "unknown",
      verification_status: "claimed",
    });
  });

  it("keeps unknown family eligibility critical and confirmed ineligibility hard", () => {
    const family = requestCriterion("request_pilot_a", "criterion_a_family");
    const unknown = evaluate(
      family,
      context("prop_nb_004", "offer_nb_004_primary", {
        eligibilityId: "elig_nb_004_unknown",
        scenarioId: "scenario_nb_004_unknown",
      }),
    );
    const ineligible = evaluate(
      family,
      context("prop_nb_006", "offer_nb_006_primary", {
        eligibilityId: "elig_nb_006_not",
      }),
    );
    expect(unknown.status).toBe("unknown");
    expect(unknown.explanation_data.is_critical_unknown).toBe(true);
    expect(ineligible.status).toBe("hard_failed");
  });

  it("hard-fails a move-in date after the deadline", () => {
    const moveIn = requestCriterion("request_pilot_b", "criterion_b_movein");
    const result = evaluate(
      moveIn,
      context("prop_nb_007", "offer_nb_007_primary"),
    );
    expect(result.status).toBe("hard_failed");
    expect(result.margin).toEqual({ days_until_deadline: -122 });
  });

  it("distinguishes absent gas from unknown gas", () => {
    const gas = requestCriterion("request_pilot_e", "criterion_e_gas");
    const absent = evaluate(
      gas,
      context("prop_house_005", "offer_house_005_primary"),
    );
    const unknown = evaluate(
      gas,
      context("prop_house_003", "offer_house_003_primary"),
    );
    expect(absent.status).toBe("hard_failed");
    expect(unknown.status).toBe("unknown");
    expect(unknown.explanation_data.is_critical_unknown).toBe(true);
  });

  it("returns not_applicable for cross-type criteria", () => {
    const elevator = customCriterion({
      field: "building.elevator",
      operator: "boolean",
      target: true,
    });
    const balcony = customCriterion({
      field: "physical.balcony",
      operator: "boolean",
      target: true,
    });
    const landArea = customCriterion({
      category: "house",
      field: "land.area_sotka",
      operator: "gte",
      target: 6,
    });
    expect(
      evaluate(elevator, context("prop_land_001", "offer_land_001_primary"))
        .status,
    ).toBe("not_applicable");
    expect(
      evaluate(balcony, context("prop_house_005", "offer_house_005_primary"))
        .status,
    ).toBe("not_applicable");
    expect(
      evaluate(landArea, context("prop_nb_004", "offer_nb_004_primary")).status,
    ).toBe("not_applicable");
  });

  it("matches an explicit cross-type set without a type bonus", () => {
    const propertyType = customCriterion({
      field: "property_type",
      operator: "in",
      target: ["apartment", "house"],
      priority: "preferred",
    });
    const apartment = evaluate(
      propertyType,
      context("prop_nb_004", "offer_nb_004_primary"),
    );
    const house = evaluate(
      propertyType,
      context("prop_house_005", "offer_house_005_primary"),
    );
    expect(apartment).toMatchObject({ status: "matched", fit: 1 });
    expect(house).toMatchObject({ status: "matched", fit: 1 });
  });

  it("keeps price_from and unknown availability unknown", () => {
    const budget = requestCriterion("request_pilot_a", "criterion_a_budget");
    const availability = customCriterion({
      category: "transaction",
      field: "availability",
      operator: "eq",
      target: "available",
    });
    expect(
      evaluate(
        budget,
        context(
          "prop_special_template_001",
          "offer_special_template_001_primary",
        ),
      ),
    ).toMatchObject({
      status: "unknown",
      unknown_reason: "PRICE_FROM_NOT_EXACT",
    });
    expect(
      evaluate(availability, context("prop_nb_013", "offer_nb_013_primary"))
        .status,
    ).toBe("unknown");
  });

  it("makes missing hard travel time a critical unknown", () => {
    const commute = requestCriterion("request_pilot_c", "criterion_c_commute");
    const result = evaluate(
      commute,
      context("prop_nb_014", "offer_nb_014_primary"),
    );
    expect(result.status).toBe("unknown");
    expect(result.explanation_data.is_critical_unknown).toBe(true);
  });

  it("returns partial fit for a preferred commute slightly over target", () => {
    const commuteEvidence = dataset.fieldEvidence.find(
      (item) =>
        item.entity_id === "prop_nb_001" &&
        item.field === "mobility.user_destination.public_transport_time_min",
    )!;
    const actualMinutes = commuteEvidence.value as number;
    const commute = customCriterion({
      criterion_id: "criterion_soft_commute",
      category: "infrastructure",
      field: "mobility.user_destination.public_transport_time_min",
      operator: "within_time",
      target: actualMinutes - 2,
      unit: "min",
      priority: "preferred",
      critical_if_unknown: false,
    });
    const result = evaluate(
      commute,
      context("prop_nb_001", "offer_nb_001_primary"),
    );
    expect(result.status).toBe("partially_matched");
    expect(result.fit).toBeGreaterThan(0);
    expect(result.fit).toBeLessThan(1);
  });

  it("reads purchase-method financial values only from PurchaseScenario", () => {
    const evaluationContext = context("prop_nb_007", "offer_nb_007_primary", {
      scenarioId: "scenario_nb_007_standard",
    });
    for (const [field, target, expected] of [
      [
        "monthly_payment",
        { amount: "80000.00", currency: "RUB" },
        { amount: "62000.00", currency: "RUB" },
      ],
      [
        "initial_payment",
        { amount: "1200000.00", currency: "RUB" },
        { amount: "1100000.00", currency: "RUB" },
      ],
      [
        "estimated_total_entry_cost",
        { amount: "1200000.00", currency: "RUB" },
        { amount: "1100000.00", currency: "RUB" },
      ],
    ] as const) {
      const financial = customCriterion({
        criterion_id: `criterion_${field}`,
        category: "finance",
        field,
        operator: "lte",
        target,
      });
      expect(evaluate(financial, evaluationContext)).toMatchObject({
        status: "matched",
        actual: expected,
      });
    }
  });

  it("can confirm zero-down from one compatible PurchaseScenario", () => {
    const zero = customCriterion({
      criterion_id: "criterion_scenario_zero",
      category: "finance",
      field: "zero_initial_payment",
      operator: "boolean",
      target: true,
      priority: "must",
    });
    const result = evaluate(
      zero,
      context("prop_nb_001", "offer_nb_001_agency", {
        scenarioId: "scenario_nb_001_zero",
      }),
    );
    expect(result).toMatchObject({
      status: "matched",
      actual: true,
      verification_status: "confirmed",
    });
  });

  it("preserves conflicts and stale freshness as distinct states", () => {
    const budget = customCriterion({
      category: "finance",
      field: "listing_price",
      operator: "lte",
      target: { amount: "5000000.00", currency: "RUB" },
    });
    const conflict = evaluate(
      budget,
      context("prop_nb_001", "offer_nb_001_primary"),
    );
    const stale = evaluate(
      budget,
      context("prop_land_002", "offer_land_002_primary"),
    );
    expect(conflict.status).toBe("conflicting");
    expect(conflict.explanation_data.is_critical_conflict).toBe(true);
    expect(stale.status).toBe("matched");
    expect(stale.freshness_status).toBe("stale");
  });

  it("rejects a Frankenstein PurchaseScenario context", () => {
    const monthly = requestCriterion("request_pilot_b", "criterion_b_payment");
    const outcome = evaluateCriterion(
      monthly,
      context("prop_nb_001", "offer_nb_001_primary", {
        scenarioId: "scenario_nb_001_zero",
      }),
    );
    expect(outcome).toMatchObject({
      success: false,
      error: { code: "CONTEXT_MISMATCH" },
    });
  });
});
