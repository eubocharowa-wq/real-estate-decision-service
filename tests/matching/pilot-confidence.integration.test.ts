import { describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  criterionSchema,
  purchaseScenarioSchema,
  userRequestSchema,
  type Criterion,
  type UserRequest,
} from "../../src/domain";
import {
  CONFIDENCE_V1_CONFIG,
  calculateDataQuality,
  matchProperty,
  type MatchingEngineResult,
} from "../../src/matching";
import { loadPilotDataset } from "../../src/pilot-dataset";

const dataset = loadPilotDataset();
const template = dataset.userRequests.find(
  (request) => request.user_request_id === "request_pilot_c",
)!;
const currentTime = "2026-08-15T00:00:00.000Z";

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
    nice_to_have: criteria.filter((item) => item.priority === "preferred"),
    avoid: criteria.filter((item) => item.priority === "avoid"),
    unknowns: [],
    clarifications: [],
  });

const match = (
  userRequest: UserRequest,
  propertyId: string,
): MatchingEngineResult => {
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
    currentTime,
  });
  expect(outcome.success).toBe(true);
  if (!outcome.success) throw new Error(outcome.error.message);
  return outcome.result;
};

const quality = (
  userRequest: UserRequest,
  matching: MatchingEngineResult,
  scenarioOverride?: ReturnType<typeof purchaseScenarioSchema.parse>,
  promotionOverride?: (typeof dataset.promotions)[number],
) => {
  const selectedOffer = dataset.offers.find(
    (offer) => offer.offer_id === matching.selected_offer_id,
  );
  const selectedScenario =
    scenarioOverride ??
    dataset.purchaseScenarios.find(
      (scenario) =>
        scenario.scenario_id === matching.match_result.purchase_scenario_id,
    );
  const selectedPromotion =
    promotionOverride ??
    dataset.promotions.find(
      (promotion) => promotion.promotion_id === selectedScenario?.promotion_id,
    );
  const outcome = calculateDataQuality({
    userRequest,
    matchResult: matching.match_result,
    fieldEvidence: dataset.fieldEvidence,
    sourceConflicts: dataset.sourceConflicts,
    sources: dataset.sources,
    selectedOffer: selectedOffer ?? null,
    selectedPurchaseScenario: selectedScenario ?? null,
    selectedPromotion: selectedPromotion ?? null,
    currentTime,
  });
  expect(outcome.success).toBe(true);
  if (!outcome.success) throw new Error(outcome.error.message);
  return outcome.result;
};

const budget = (
  id: string,
  priority: Criterion["priority"] = "must",
  maximum = "5000000.00",
) =>
  criterion(id, {
    category: "finance",
    field: "listing_price",
    operator: "lte",
    target: { amount: maximum, currency: "RUB" },
    priority,
    weight: priority === "preferred" ? 5 : null,
    critical_if_unknown: priority === "must",
  });

describe("TASK-008 Pilot Dataset confidence benchmarks", () => {
  it("supports high match with high confidence on confirmed data", () => {
    const userRequest = request("request_quality_high_high", [
      budget("criterion_quality_high_high", "preferred"),
    ]);
    const matching = match(userRequest, "prop_nb_005");
    const result = quality(userRequest, matching);
    expect(matching.match_result.match_score).toBeGreaterThanOrEqual(90);
    expect(result.confidence_status).toBe("high");
    expect(result.completeness_status).toBe("high");
    expect(result.data_quality.critical_unknown_count).toBe(0);
  });

  it("supports high match with low confidence for stale data", () => {
    const userRequest = request("request_quality_high_low", [
      budget("criterion_quality_high_low", "preferred", "6000000.00"),
    ]);
    const matching = match(userRequest, "prop_sec_009");
    const result = quality(userRequest, matching);
    expect(matching.match_result.match_score).toBe(100);
    expect(result.data_quality.data_completeness_score).toBe(100);
    expect(result.confidence_status).toBe("critical");
    expect(result.recommended_checks).toContainEqual(
      expect.objectContaining({ code: "REFRESH_PRICE" }),
    );
  });

  it("keeps claimed zero-down partially known and recommends verification", () => {
    const zeroDown = criterion("criterion_quality_zero_down", {
      category: "finance",
      field: "zero_initial_payment",
      operator: "boolean",
      target: true,
      priority: "preferred",
      weight: 4,
      critical_if_unknown: false,
    });
    const userRequest = request("request_quality_zero_down", [zeroDown]);
    const result = quality(userRequest, match(userRequest, "prop_nb_002"));
    const initialPayment = result.field_results.find(
      (field) => field.field === "zero_initial_payment",
    );
    expect(initialPayment?.completeness_factor).toBe(
      CONFIDENCE_V1_CONFIG.claimedCompletenessFactor,
    );
    expect(initialPayment?.verification_status).toBe("claimed");
    expect(initialPayment?.confidence_score).toBeLessThan(100);
    expect(result.recommended_checks).toContainEqual(
      expect.objectContaining({ code: "VERIFY_INITIAL_PAYMENT" }),
    );
  });

  it("keeps a confirmed hard fail highly confident", () => {
    const userRequest = request("request_quality_hard_fail", [
      budget("criterion_quality_hard_fail"),
    ]);
    const matching = match(userRequest, "prop_nb_014");
    const result = quality(userRequest, matching);
    expect(matching.match_result.eligibility_status).toBe("hard_fail");
    expect(result.confidence_status).toBe("high");
    expect(result.data_quality.data_completeness_score).toBe(100);
  });

  it("detects a critical claimed financing condition", () => {
    const family = criterion("criterion_quality_family", {
      category: "finance",
      field: "family_mortgage",
      operator: "boolean",
      target: true,
    });
    const userRequest = request("request_quality_family", [family]);
    const result = quality(userRequest, match(userRequest, "prop_nb_002"));
    expect(result.data_quality.critical_unknown_count).toBeGreaterThan(0);
    expect(result.recommended_checks).toContainEqual(
      expect.objectContaining({ code: "VERIFY_FINANCING_APPLICABILITY" }),
    );
  });

  it("preserves a critical price conflict without silent resolution", () => {
    const userRequest = request("request_quality_price_conflict", [
      budget("criterion_quality_price_conflict"),
    ]);
    const matching = match(userRequest, "prop_nb_001");
    const result = quality(userRequest, matching);
    expect(matching.match_result.eligibility_status).toBe("possible_match");
    expect(result.data_quality.critical_conflict_count).toBeGreaterThan(0);
    expect(
      result.field_results.find((field) => field.field === "listing_price")
        ?.completeness_factor,
    ).toBe(0.5);
    expect(result.recommended_checks).toContainEqual(
      expect.objectContaining({ code: "RESOLVE_SOURCE_CONFLICT" }),
    );
  });

  it("flags unknown gas as incomplete and critical", () => {
    const gas = criterion("criterion_quality_gas", {
      category: "house",
      field: "utilities.gas",
      operator: "boolean",
      target: "connected",
      applicable_property_types: ["house"],
    });
    const userRequest = request("request_quality_gas", [gas]);
    const result = quality(userRequest, match(userRequest, "prop_house_003"));
    expect(result.data_quality.data_completeness_score).toBeLessThan(100);
    expect(result.critical_unknowns).toContainEqual(
      expect.objectContaining({ field: "utilities.gas" }),
    );
    expect(result.recommended_checks).toContainEqual(
      expect.objectContaining({ code: "VERIFY_GAS_CONNECTION" }),
    );
  });

  it("treats removed listing availability as unknown, not sold", () => {
    const userRequest = request("request_quality_removed", []);
    const result = quality(userRequest, match(userRequest, "prop_sec_006"));
    const availability = result.field_results.find(
      (field) => field.field === "availability",
    );
    expect(availability?.completeness_factor).toBe(0);
    expect(availability?.freshness_status).toBe("expired");
    expect(result.recommended_checks).toContainEqual(
      expect.objectContaining({ code: "VERIFY_AVAILABILITY" }),
    );
  });

  it("excludes an expired promotion from current-valid confidence", () => {
    const family = criterion("criterion_quality_expired_promo", {
      category: "finance",
      field: "family_mortgage",
      operator: "boolean",
      target: true,
    });
    const userRequest = request("request_quality_expired_promo", [family]);
    const matching = match(userRequest, "prop_nb_005");
    const originalScenario = dataset.purchaseScenarios.find(
      (scenario) =>
        scenario.scenario_id === matching.match_result.purchase_scenario_id,
    )!;
    const expiredPromotion = dataset.promotions.find(
      (promotion) => promotion.promotion_id === "promo_expired_not_active",
    )!;
    const expiredScenario = purchaseScenarioSchema.parse({
      ...originalScenario,
      promotion_id: expiredPromotion.promotion_id,
    });
    const result = quality(
      userRequest,
      matching,
      expiredScenario,
      expiredPromotion,
    );
    const promotion = result.field_results.find(
      (field) => field.field === "promotion.current_validity",
    );
    expect(promotion?.freshness_status).toBe("expired");
    expect(promotion?.confidence_score).toBe(0);
    expect(result.data_quality.critical_override).toBe(true);
  });
});
