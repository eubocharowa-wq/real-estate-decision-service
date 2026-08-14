import { describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  criterionSchema,
  matchResultSchema,
  userRequestSchema,
  type Criterion,
  type UserRequest,
} from "../../src/domain";
import { matchProperty } from "../../src/matching";
import { loadPilotDataset } from "../../src/pilot-dataset";

const dataset = loadPilotDataset();
const template = dataset.userRequests.find(
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

const request = (id: string, criteria: readonly Criterion[]): UserRequest =>
  userRequestSchema.parse({
    ...template,
    user_request_id: id,
    infrastructure: [],
    property_features: [],
    must_have: criteria.filter((item) =>
      ["must", "exclude"].includes(item.priority),
    ),
    nice_to_have: criteria.filter((item) =>
      ["preferred", "neutral"].includes(item.priority),
    ),
    avoid: criteria.filter((item) => item.priority === "avoid"),
    unknowns: [],
    clarifications: [],
  });

const match = (userRequest: UserRequest, propertyId: string) => {
  const property = dataset.properties.find(
    (item) => item.identity.property_id === propertyId,
  )!;
  const outcome = matchProperty({
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
  });
  expect(outcome.success).toBe(true);
  if (!outcome.success) throw new Error(outcome.error.message);
  expect(matchResultSchema.safeParse(outcome.result.match_result).success).toBe(
    true,
  );
  return outcome.result;
};

const budget = criterion("criterion_pilot_budget", {
  category: "finance",
  field: "listing_price",
  operator: "lte",
  target: { amount: "5000000.00", currency: "RUB" },
});

describe("TASK-007 Pilot Dataset matching benchmarks", () => {
  it("distinguishes an apartment under and over a strict budget", () => {
    expect(
      match(request("request_pilot_under", [budget]), "prop_nb_004")
        .match_result.eligibility_status,
    ).toBe("eligible");
    const over = match(request("request_pilot_over", [budget]), "prop_nb_014");
    expect(over.match_result.eligibility_status).toBe("hard_fail");
    expect(over.match_result.hard_failures).toContain("criterion_pilot_budget");
  });

  it("keeps claimed family mortgage as eligible_with_unknowns", () => {
    const family = criterion("criterion_pilot_family", {
      category: "finance",
      field: "family_mortgage",
      operator: "boolean",
      target: true,
    });
    const result = match(
      request("request_pilot_claimed_family", [family]),
      "prop_nb_002",
    );
    expect(result.match_result.eligibility_status).toBe(
      "eligible_with_unknowns",
    );
    expect(result.match_result.unknown_critical).toContain(
      "criterion_pilot_family",
    );
  });

  it("reduces financing fit and creates a compromise for preferred zero-down", () => {
    const zero = criterion("criterion_pilot_zero", {
      category: "finance",
      field: "zero_initial_payment",
      operator: "boolean",
      target: true,
      priority: "preferred",
      weight: 4,
      critical_if_unknown: false,
    });
    const result = match(
      request("request_pilot_zero_preferred", [zero]),
      "prop_nb_003",
    );
    expect(result.match_result.eligibility_status).toBe("eligible");
    expect(result.match_result.financing_fit_score).toBe(0);
    expect(result.match_result.compromises).toContain("criterion_pilot_zero");
    expect(result.match_result.hard_failures).toEqual([]);
  });

  it("keeps unknown house gas as a critical unknown", () => {
    const gas = criterion("criterion_pilot_gas", {
      category: "house",
      field: "utilities.gas",
      operator: "boolean",
      target: "connected",
      applicable_property_types: ["house"],
    });
    const result = match(
      request("request_pilot_gas_unknown", [gas]),
      "prop_house_003",
    );
    expect(result.match_result.eligibility_status).toBe(
      "eligible_with_unknowns",
    );
    expect(result.match_result.unknown_critical).toContain(
      "criterion_pilot_gas",
    );
  });

  it("hard-fails the excluded first floor", () => {
    const firstFloor = criterion("criterion_pilot_first_floor", {
      field: "physical.floor",
      operator: "neq",
      target: 1,
      priority: "exclude",
      applicable_property_types: ["apartment"],
    });
    const result = match(
      request("request_pilot_first_floor", [firstFloor]),
      "prop_sec_003",
    );
    expect(result.match_result.eligibility_status).toBe("hard_fail");
  });

  it("matches apartment and house equally for an explicit cross-type set", () => {
    const propertyType = criterion("criterion_pilot_cross_type", {
      field: "property_type",
      operator: "in",
      target: ["apartment", "house"],
      priority: "preferred",
      weight: 5,
      critical_if_unknown: false,
    });
    const crossType = request("request_pilot_cross_type", [propertyType]);
    const apartment = match(crossType, "prop_nb_004");
    const house = match(crossType, "prop_house_005");
    expect(apartment.match_result.eligibility_status).toBe("eligible");
    expect(house.match_result.eligibility_status).toBe("eligible");
    expect(apartment.match_result.match_score).toBe(100);
    expect(house.match_result.match_score).toBe(100);
  });

  it("preserves a stale usable price without changing fit", () => {
    const preferredBudget = criterion("criterion_pilot_stale_price", {
      category: "finance",
      field: "listing_price",
      operator: "lte",
      target: { amount: "3000000.00", currency: "RUB" },
      priority: "preferred",
      weight: 5,
      critical_if_unknown: false,
    });
    const result = match(
      request("request_pilot_stale", [preferredBudget]),
      "prop_land_002",
    );
    expect(result.match_result.match_score).toBe(100);
    expect(result.match_result.criteria_results[0].freshness_status).toBe(
      "stale",
    );
  });

  it("does not turn a conflicting hard price into pass or zero fit", () => {
    const result = match(
      request("request_pilot_conflicting", [budget]),
      "prop_nb_001",
    );
    expect(result.match_result.eligibility_status).toBe("possible_match");
    expect(result.match_result.criteria_results[0].status).toBe("conflicting");
    expect(result.match_result.criteria_results[0].fit).toBeNull();
  });

  it("returns unavailable for a confirmed sold Offer", () => {
    const result = match(request("request_pilot_sold", []), "prop_nb_011");
    expect(result.match_result.eligibility_status).toBe("unavailable");
    expect(result.summary_code).toBe("UNAVAILABLE");
  });
});
