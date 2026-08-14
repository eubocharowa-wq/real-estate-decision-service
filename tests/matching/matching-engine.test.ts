import { describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  criterionSchema,
  matchResultSchema,
  offerSchema,
  purchaseScenarioSchema,
  userRequestSchema,
  type Criterion,
  type UserRequest,
} from "../../src/domain";
import {
  MATCHING_ALGORITHM_VERSION,
  MATCHING_V1_CONFIG,
  matchProperty,
  type MatchPropertyInput,
} from "../../src/matching";
import { loadPilotDataset } from "../../src/pilot-dataset";

const dataset = loadPilotDataset();
const requestTemplate = dataset.userRequests.find(
  (request) => request.user_request_id === "request_pilot_c",
)!;

const criterion = (
  id: string,
  overrides: Partial<Criterion> &
    Pick<Criterion, "field" | "operator" | "target">,
): Criterion =>
  criterionSchema.parse({
    schema_version: SCHEMA_VERSION,
    criterion_id: id,
    category: "property",
    unit: null,
    priority: "preferred",
    weight: 3,
    tolerance: null,
    fit_function: null,
    criterion_group_id: null,
    applicable_property_types: [],
    source_requirement: [],
    freshness_requirement: null,
    critical_if_unknown: false,
    user_expression: null,
    ...overrides,
  });

const request = (id: string, criteria: readonly Criterion[]): UserRequest =>
  userRequestSchema.parse({
    ...requestTemplate,
    user_request_id: id,
    infrastructure: [],
    property_features: [],
    must_have: criteria.filter((item) =>
      ["must", "exclude"].includes(item.priority),
    ),
    nice_to_have: criteria.filter((item) =>
      ["preferred", "neutral", "unknown"].includes(item.priority),
    ),
    avoid: criteria.filter((item) => item.priority === "avoid"),
    unknowns: [],
    clarifications: [],
  });

const input = (
  userRequest: UserRequest,
  propertyId = "prop_nb_004",
  overrides: Partial<MatchPropertyInput> = {},
): MatchPropertyInput => {
  const property = dataset.properties.find(
    (item) => item.identity.property_id === propertyId,
  )!;
  return {
    userRequest,
    property,
    offers: dataset.offers.filter((offer) => offer.property_id === propertyId),
    purchaseScenarios: dataset.purchaseScenarios.filter(
      (scenario) => scenario.property_id === propertyId,
    ),
    financingEligibility: dataset.propertyFinancingEligibility.filter(
      (eligibility) => eligibility.property_id === propertyId,
    ),
    financingPrograms: dataset.financingPrograms,
    fieldEvidence: dataset.fieldEvidence,
    sourceConflicts: dataset.sourceConflicts,
    currentTime: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
};

const matched = (engineInput: MatchPropertyInput) => {
  const outcome = matchProperty(engineInput);
  expect(outcome.success).toBe(true);
  if (!outcome.success) throw new Error(outcome.error.message);
  expect(matchResultSchema.safeParse(outcome.result.match_result).success).toBe(
    true,
  );
  return outcome.result;
};

const budgetCriterion = (priority: Criterion["priority"] = "must") =>
  criterion("criterion_budget", {
    category: "finance",
    field: "listing_price",
    operator: "lte",
    target: { amount: "5000000.00", currency: "RUB" },
    priority,
    weight: priority === "preferred" ? 5 : null,
    critical_if_unknown: priority === "must",
  });

describe("TASK-007 Matching Engine v1", () => {
  it("passes all confirmed hard criteria without inflating an empty soft score", () => {
    const result = matched(
      input(request("request_hard_pass", [budgetCriterion()])),
    );
    expect(result.match_result).toMatchObject({
      eligibility_status: "eligible",
      match_score: 0,
      hard_failures: [],
      algorithm_version: MATCHING_ALGORITHM_VERSION,
    });
    expect(result.metric_statuses.match_score).toBe("no_evaluable_criteria");
    expect(result.metric_statuses.data_confidence_score).toBe("not_calculated");
  });

  it("keeps one confirmed hard fail from being compensated", () => {
    const preferredArea = criterion("criterion_large_area", {
      field: "physical.total_area_m2",
      operator: "gte",
      target: 80,
      priority: "preferred",
      weight: 5,
    });
    const result = matched(
      input(
        request("request_hard_fail", [budgetCriterion(), preferredArea]),
        "prop_nb_014",
      ),
    );
    expect(result.match_result.eligibility_status).toBe("hard_fail");
    expect(result.match_result.hard_failures).toContain("criterion_budget");
    expect(result.explanation.hard_failures).toHaveLength(1);
    expect(result.summary_code).toBe("HARD_CRITERIA_FAILED");
  });

  it("distinguishes a hard unknown from a hard conflict", () => {
    const unknown = matched(
      input(
        request("request_price_unknown", [budgetCriterion()]),
        "prop_special_template_001",
      ),
    );
    const conflict = matched(
      input(
        request("request_price_conflict", [budgetCriterion()]),
        "prop_nb_001",
        { purchaseScenarios: [] },
      ),
    );
    expect(unknown.match_result.eligibility_status).toBe(
      "eligible_with_unknowns",
    );
    expect(unknown.match_result.unknown_critical).toContain("criterion_budget");
    expect(conflict.match_result.eligibility_status).toBe("possible_match");
    expect(conflict.explanation.critical_unknowns[0].code).toBe(
      "HARD_CRITERION_CONFLICTING",
    );
  });

  it("separates unavailable from hard fail", () => {
    const result = matched(
      input(request("request_unavailable", []), "prop_nb_011"),
    );
    expect(result.match_result.eligibility_status).toBe("unavailable");
    expect(result.match_result.hard_failures).toEqual([]);
    expect(result.summary_code).toBe("UNAVAILABLE");
  });

  it("returns insufficient_data when a required Offer is absent", () => {
    const result = matched(
      input(request("request_missing_offer", [budgetCriterion()]), undefined, {
        offers: [],
        purchaseScenarios: [],
        financingEligibility: [],
      }),
    );
    expect(result.match_result.eligibility_status).toBe("insufficient_data");
    expect(result.summary_code).toBe("INSUFFICIENT_DATA");
  });

  it("calculates preferred exact and partial fits deterministically", () => {
    const baseOffer = dataset.offers.find(
      (offer) => offer.offer_id === "offer_nb_004_primary",
    )!;
    const slightlyOver = offerSchema.parse({
      ...baseOffer,
      listing_price: { amount: "5250000.00", currency: "RUB" },
    });
    const finish = criterion("criterion_finish", {
      field: "condition.finishing_type",
      operator: "eq",
      target: "pre_finish",
      priority: "preferred",
      weight: 5,
    });
    const result = matched(
      input(
        request("request_soft_partial", [budgetCriterion("preferred"), finish]),
        undefined,
        { offers: [slightlyOver], purchaseScenarios: [] },
      ),
    );
    expect(result.match_result.match_score).toBe(90);
    expect(result.match_result.property_fit_score).toBe(100);
    expect(result.match_result.financing_fit_score).toBe(80);
    expect(
      result.explanation.strengths.map((item) => item.criterion_id),
    ).toContain("criterion_finish");
    expect(
      result.explanation.compromises.map((item) => item.criterion_id),
    ).toContain("criterion_budget");
  });

  it("treats avoid as a scored compromise, not exclude", () => {
    const avoidFirst = criterion("criterion_avoid_first", {
      field: "physical.floor",
      operator: "neq",
      target: 1,
      priority: "avoid",
      weight: 5,
      applicable_property_types: ["apartment"],
    });
    const result = matched(
      input(request("request_avoid", [avoidFirst]), "prop_sec_003"),
    );
    expect(result.match_result.eligibility_status).toBe("eligible");
    expect(result.match_result.match_score).toBe(0);
    expect(result.match_result.hard_failures).toEqual([]);
    expect(result.match_result.compromises).toContain("criterion_avoid_first");
  });

  it("excludes neutral, not_applicable and unknown from the denominator", () => {
    const exact = criterion("criterion_exact", {
      field: "condition.finishing_type",
      operator: "eq",
      target: "pre_finish",
      priority: "preferred",
      weight: 2,
    });
    const neutral = criterion("criterion_neutral", {
      field: "property_type",
      operator: "eq",
      target: "apartment",
      priority: "neutral",
      weight: null,
    });
    const notApplicable = criterion("criterion_land", {
      category: "house",
      field: "land.area_sotka",
      operator: "gte",
      target: 6,
      priority: "preferred",
      applicable_property_types: [],
    });
    const unknown = criterion("criterion_commute", {
      category: "infrastructure",
      field: "mobility.user_destination.public_transport_time_min",
      operator: "within_time",
      target: 40,
      unit: "min",
      priority: "preferred",
      weight: 5,
    });
    const result = matched(
      input(
        request("request_denominator", [
          exact,
          neutral,
          notApplicable,
          unknown,
        ]),
      ),
    );
    expect(result.match_result.match_score).toBe(100);
    expect(result.score_details.overall.included_criterion_ids).toEqual([
      "criterion_exact",
    ]);
    expect(result.score_details.overall.excluded_criterion_ids).toEqual([
      "criterion_commute",
      "criterion_land",
      "criterion_neutral",
    ]);
  });

  it("prevents criterion groups from double-counting one user meaning", () => {
    const groupId = "criterion_group_home_quality";
    const matchedFinish = criterion("criterion_group_finish", {
      field: "condition.finishing_type",
      operator: "eq",
      target: "pre_finish",
      weight: 5,
      criterion_group_id: groupId,
    });
    const missedMarket = criterion("criterion_group_market", {
      field: "market_type",
      operator: "eq",
      target: "secondary",
      weight: 5,
      criterion_group_id: groupId,
    });
    const balcony = criterion("criterion_group_balcony", {
      field: "physical.balcony",
      operator: "boolean",
      target: true,
      weight: 5,
      applicable_property_types: ["apartment"],
    });
    const result = matched(
      input(request("request_group", [matchedFinish, missedMarket, balcony])),
    );
    expect(result.match_result.match_score).toBe(75);
    expect(result.score_details.overall.groups).toHaveLength(2);
    expect(
      result.score_details.overall.groups.find(
        (group) => group.group_id === groupId,
      ),
    ).toMatchObject({ fit: 0.5, weight: 5, contribution: 2.5 });
  });

  it("selects one real scenario and Offer without Frankenstein terms", () => {
    const family = criterion("criterion_family", {
      category: "finance",
      field: "family_mortgage",
      operator: "boolean",
      target: true,
      priority: "must",
      weight: null,
      critical_if_unknown: true,
    });
    const zero = criterion("criterion_zero", {
      category: "finance",
      field: "zero_initial_payment",
      operator: "boolean",
      target: true,
      priority: "preferred",
      weight: 4,
    });
    const result = matched(
      input(request("request_scenario", [family, zero]), "prop_nb_001"),
    );
    expect(result.match_result.eligibility_status).toBe("eligible");
    expect(result.match_result.purchase_scenario_id).toBe(
      "scenario_nb_001_zero",
    );
    expect(result.selected_offer_id).toBe("offer_nb_001_agency");
    expect(result.scenario_selection.candidates.length).toBeGreaterThanOrEqual(
      2,
    );
    const selectedScenario = dataset.purchaseScenarios.find(
      (scenario) =>
        scenario.scenario_id === result.match_result.purchase_scenario_id,
    )!;
    expect(selectedScenario.offer_id).toBe(result.selected_offer_id);
  });

  it("uses centralized deterministic tie-breaks for equal scenarios", () => {
    const original = dataset.purchaseScenarios.find(
      (scenario) => scenario.scenario_id === "scenario_nb_001_zero",
    )!;
    const alternative = purchaseScenarioSchema.parse({
      ...original,
      scenario_id: "scenario_nb_001_zero_alt",
      estimated_total_entry_cost: { amount: "100.00", currency: "RUB" },
    });
    const zero = criterion("criterion_tie_zero", {
      category: "finance",
      field: "zero_initial_payment",
      operator: "boolean",
      target: true,
      priority: "preferred",
      weight: 4,
    });
    const engineInput = input(request("request_tie", [zero]), "prop_nb_001", {
      purchaseScenarios: [original, alternative],
    });
    const first = matched(engineInput);
    const second = matched(engineInput);
    expect(first.match_result.purchase_scenario_id).toBe(
      "scenario_nb_001_zero",
    );
    expect(second).toEqual(first);
    expect(first.scenario_selection.tie_break_order).toEqual(
      MATCHING_V1_CONFIG.scenarioSelection.tieBreakOrder,
    );
  });

  it("rejects a broken scenario reference instead of combining Offers", () => {
    const scenario = dataset.purchaseScenarios.find(
      (item) => item.scenario_id === "scenario_nb_001_zero",
    )!;
    const broken = purchaseScenarioSchema.parse({
      ...scenario,
      offer_id: "offer_missing",
    });
    const zero = criterion("criterion_broken_zero", {
      category: "finance",
      field: "zero_initial_payment",
      operator: "boolean",
      target: true,
    });
    const outcome = matchProperty(
      input(request("request_broken", [zero]), "prop_nb_001", {
        purchaseScenarios: [broken],
      }),
    );
    expect(outcome).toMatchObject({
      success: false,
      error: { code: "BROKEN_REFERENCE", entity_id: broken.scenario_id },
    });
  });
});
