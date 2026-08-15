import { describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  criterionSchema,
  fieldEvidenceSchema,
  matchResultSchema,
  userRequestSchema,
  type Criterion,
  type UserRequest,
} from "../../src/domain";
import {
  CONFIDENCE_ALGORITHM_VERSION,
  CONFIDENCE_V1_CONFIG,
  calculateDataQuality,
  calculateFieldConfidence,
  completenessBandForScore,
  confidenceBandForScore,
  matchProperty,
  type CalculateDataQualityInput,
  type MatchingEngineResult,
} from "../../src/matching";
import { loadPilotDataset } from "../../src/pilot-dataset";

const dataset = loadPilotDataset();
const requestTemplate = dataset.userRequests.find(
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
    infrastructure: criteria.filter(
      (item) => item.category === "infrastructure",
    ),
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

const matched = (
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

const qualityInput = (
  userRequest: UserRequest,
  matching: MatchingEngineResult,
  overrides: Partial<CalculateDataQualityInput> = {},
): CalculateDataQualityInput => {
  const selectedOffer = dataset.offers.find(
    (offer) => offer.offer_id === matching.selected_offer_id,
  );
  const selectedPurchaseScenario = dataset.purchaseScenarios.find(
    (scenario) =>
      scenario.scenario_id === matching.match_result.purchase_scenario_id,
  );
  const selectedPromotion = dataset.promotions.find(
    (promotion) =>
      promotion.promotion_id === selectedPurchaseScenario?.promotion_id,
  );
  return {
    userRequest,
    matchResult: matching.match_result,
    fieldEvidence: dataset.fieldEvidence,
    sourceConflicts: dataset.sourceConflicts,
    sources: dataset.sources,
    selectedOffer: selectedOffer ?? null,
    selectedPurchaseScenario: selectedPurchaseScenario ?? null,
    selectedPromotion: selectedPromotion ?? null,
    currentTime,
    ...overrides,
  };
};

const calculated = (input: CalculateDataQualityInput) => {
  const outcome = calculateDataQuality(input);
  expect(outcome.success).toBe(true);
  if (!outcome.success) throw new Error(outcome.error.message);
  return outcome.result;
};

const budget = (id: string, priority: Criterion["priority"] = "preferred") =>
  criterion(id, {
    category: "finance",
    field: "listing_price",
    operator: "lte",
    target: { amount: "5000000.00", currency: "RUB" },
    priority,
    weight: priority === "preferred" ? 5 : null,
    critical_if_unknown: priority === "must",
  });

describe("TASK-008 field confidence factors", () => {
  it("handles confirmed, claimed, unknown, stale, expired and conflicting fields", () => {
    const field = (
      overrides: Partial<Parameters<typeof calculateFieldConfidence>[0]> = {},
    ) =>
      calculateFieldConfidence({
        verification_status: "confirmed",
        freshness_status: "fresh",
        conflict_status: "none",
        evidence_quality: "direct",
        ...overrides,
      }).confidence_score;

    expect(field()).toBe(100);
    expect(field({ verification_status: "claimed" })).toBe(70);
    expect(field({ verification_status: "unknown" })).toBe(0);
    expect(field({ freshness_status: "stale" })).toBe(45);
    expect(field({ freshness_status: "expired" })).toBe(0);
    expect(field({ conflict_status: "critical" })).toBe(10);
  });

  it("uses config-driven confidence and completeness band boundaries", () => {
    expect(confidenceBandForScore(85)).toBe("high");
    expect(confidenceBandForScore(84.999)).toBe("medium");
    expect(confidenceBandForScore(65)).toBe("medium");
    expect(confidenceBandForScore(64.999)).toBe("low");
    expect(confidenceBandForScore(40)).toBe("low");
    expect(confidenceBandForScore(39.999)).toBe("critical");

    expect(completenessBandForScore(90)).toBe("high");
    expect(completenessBandForScore(89.999)).toBe("medium");
    expect(completenessBandForScore(70)).toBe("medium");
    expect(completenessBandForScore(69.999)).toBe("low");
    expect(completenessBandForScore(40)).toBe("low");
    expect(completenessBandForScore(39.999)).toBe("critical");
  });
});

describe("TASK-008 request-specific aggregation", () => {
  it("treats claimed hard financing as partially known", () => {
    const family = criterion("criterion_confidence_family", {
      category: "finance",
      field: "family_mortgage",
      operator: "boolean",
      target: true,
      priority: "must",
      weight: null,
      critical_if_unknown: true,
    });
    const userRequest = request("request_confidence_family", [family]);
    const benchmark = (propertyId: string) => {
      const matching = matched(userRequest, propertyId);
      const input = qualityInput(userRequest, matching);
      return {
        matching,
        result: calculated({
          ...input,
          selectedPurchaseScenario: input.selectedPurchaseScenario
            ? { ...input.selectedPurchaseScenario, promotion_id: null }
            : null,
          selectedPromotion: null,
        }),
      };
    };
    const confirmed = benchmark("prop_nb_005");
    const claimed = benchmark("prop_nb_002");
    const unknown = benchmark("prop_nb_004");
    const field = (benchmarkResult: typeof claimed.result) =>
      benchmarkResult.field_results.find(
        (item) => item.field === "family_mortgage",
      )!;
    const confirmedFamily = field(confirmed.result);
    const claimedFamily = field(claimed.result);
    const unknownFamily = field(unknown.result);

    expect(confirmedFamily.completeness_factor).toBe(1);
    expect(claimedFamily.completeness_factor).toBe(
      CONFIDENCE_V1_CONFIG.claimedCompletenessFactor,
    );
    expect(unknownFamily.completeness_factor).toBe(0);
    expect(claimedFamily.completeness_factor).toBeLessThan(
      confirmedFamily.completeness_factor,
    );
    expect(claimedFamily.completeness_factor).toBeGreaterThan(
      unknownFamily.completeness_factor,
    );
    expect(claimed.result.data_quality.data_completeness_score).toBeLessThan(
      confirmed.result.data_quality.data_completeness_score,
    );
    expect(claimed.result.data_quality.data_completeness_score).toBeGreaterThan(
      unknown.result.data_quality.data_completeness_score,
    );
    expect(claimedFamily.verification_status).toBe("claimed");
    expect(unknownFamily.verification_status).toBe("unknown");
    expect(claimedFamily.confidence_score).toBeLessThan(
      confirmedFamily.confidence_score,
    );
    expect(claimed.result.data_quality.data_confidence_score).toBeLessThan(
      confirmed.result.data_quality.data_confidence_score,
    );
    expect(claimed.result.critical_unknowns).toContainEqual(
      expect.objectContaining({
        field: "family_mortgage",
        current_status: "claimed",
      }),
    );
    expect(claimed.result.recommended_checks).toContainEqual(
      expect.objectContaining({
        code: "VERIFY_FINANCING_APPLICABILITY",
        priority: "critical",
      }),
    );
    expect(claimed.result.match_result.match_score).toBe(
      claimed.matching.match_result.match_score,
    );

    const familyField = claimed.result.field_results.find(
      (field) => field.field === "family_mortgage",
    );
    expect(familyField?.reason_codes).toContain("CLAIMED_SOURCE_ONLY");
    expect(claimed.result.data_quality.critical_override).toBe(true);
    expect(["low", "critical"]).toContain(claimed.result.confidence_status);
  });

  it("makes must unknown critical and preferred unknown noncritical", () => {
    const gasMust = criterion("criterion_confidence_gas_must", {
      category: "house",
      field: "utilities.gas",
      operator: "boolean",
      target: "connected",
      priority: "must",
      weight: null,
      critical_if_unknown: true,
      applicable_property_types: ["house"],
    });
    const mustRequest = request("request_confidence_gas_must", [gasMust]);
    const mustResult = calculated(
      qualityInput(mustRequest, matched(mustRequest, "prop_house_003")),
    );
    expect(mustResult.critical_unknowns).toContainEqual(
      expect.objectContaining({ field: "utilities.gas" }),
    );
    expect(mustResult.data_quality.critical_override).toBe(true);

    const gasPreferred = criterion("criterion_confidence_gas_preferred", {
      ...gasMust,
      criterion_id: "criterion_confidence_gas_preferred",
      priority: "preferred",
      weight: 2,
      critical_if_unknown: false,
    });
    const preferredRequest = request("request_confidence_gas_preferred", [
      gasPreferred,
    ]);
    const preferredResult = calculated(
      qualityInput(
        preferredRequest,
        matched(preferredRequest, "prop_house_003"),
      ),
    );
    expect(
      preferredResult.critical_unknowns.some(
        (item) => item.field === "utilities.gas",
      ),
    ).toBe(false);
  });

  it("excludes neutral and not_applicable criteria from completeness", () => {
    const neutral = criterion("criterion_confidence_neutral", {
      field: "physical.total_area_m2",
      operator: "gte",
      target: 60,
      priority: "neutral",
      weight: null,
    });
    const elevator = criterion("criterion_confidence_elevator", {
      field: "building.elevator",
      operator: "boolean",
      target: true,
      applicable_property_types: ["apartment"],
    });
    const userRequest = request("request_confidence_excluded", [
      neutral,
      elevator,
    ]);
    const result = calculated(
      qualityInput(userRequest, matched(userRequest, "prop_land_001")),
    );
    expect(result.excluded_criterion_ids).toEqual([
      "criterion_confidence_elevator",
      "criterion_confidence_neutral",
    ]);
    expect(
      result.field_results.some((field) => field.field === "building.elevator"),
    ).toBe(false);
  });

  it("deduplicates two criteria backed by the same field", () => {
    const budgetA = budget("criterion_confidence_budget_a");
    const budgetB = budget("criterion_confidence_budget_b");
    const userRequest = request("request_confidence_same_field", [
      budgetA,
      budgetB,
    ]);
    const result = calculated(
      qualityInput(userRequest, matched(userRequest, "prop_nb_005")),
    );
    const priceFields = result.field_results.filter(
      (field) => field.data_fields[0] === "listing_price",
    );
    expect(priceFields).toHaveLength(1);
    expect(priceFields[0]?.criterion_ids).toEqual([
      "criterion_confidence_budget_a",
      "criterion_confidence_budget_b",
    ]);
    expect(priceFields[0]?.importance).toBe(5);
  });

  it("derives freshness from explicit time using field-specific policies", () => {
    const area = criterion("criterion_confidence_static_area", {
      field: "physical.total_area_m2",
      operator: "gte",
      target: 30,
      weight: 2,
    });
    const userRequest = request("request_confidence_freshness_policy", [
      budget("criterion_confidence_dynamic_price"),
      area,
    ]);
    const matching = matched(userRequest, "prop_nb_005");
    const result = calculated(
      qualityInput(userRequest, matching, {
        currentTime: "2026-08-20T00:00:00.000Z",
      }),
    );
    expect(
      result.field_results.find((field) => field.field === "listing_price")
        ?.freshness_status,
    ).toBe("stale");
    expect(
      result.field_results.find(
        (field) => field.field === "physical.total_area_m2",
      )?.freshness_status,
    ).toBe("fresh");
  });

  it("recognizes multiple agreeing evidence without unbounded accumulation", () => {
    const userRequest = request("request_confidence_agreement", [
      budget("criterion_confidence_agreement"),
    ]);
    const matching = matched(userRequest, "prop_nb_005");
    const baseEvidence = dataset.fieldEvidence.find(
      (item) => item.evidence_id === "evidence_offer_nb_005_primary_price",
    )!;
    const secondEvidence = fieldEvidenceSchema.parse({
      ...baseEvidence,
      evidence_id: "evidence_offer_nb_005_agreeing_price",
      source_id: "src_project_delta",
    });
    const modifiedMatch = matchResultSchema.parse({
      ...matching.match_result,
      criteria_results: matching.match_result.criteria_results.map((result) =>
        result.criterion_id === "criterion_confidence_agreement"
          ? {
              ...result,
              evidence_refs: [
                ...result.evidence_refs,
                secondEvidence.evidence_id,
              ],
            }
          : result,
      ),
    });
    const result = calculated(
      qualityInput(userRequest, matching, {
        matchResult: modifiedMatch,
        fieldEvidence: [...dataset.fieldEvidence, secondEvidence],
      }),
    );
    const price = result.field_results.find(
      (field) => field.field === "listing_price",
    );
    expect(price?.evidence_count).toBe(2);
    expect(price?.reason_codes).toContain("MULTIPLE_AGREEING_EVIDENCE");
    expect(price?.factors.evidence_quality).toBeLessThanOrEqual(1);
  });

  it("does not treat high extraction confidence as factual confirmation", () => {
    const userRequest = request("request_confidence_extraction", [
      budget("criterion_confidence_extraction"),
    ]);
    const matching = matched(userRequest, "prop_nb_005");
    const baseEvidence = dataset.fieldEvidence.find(
      (item) => item.evidence_id === "evidence_offer_nb_005_primary_price",
    )!;
    const extractionEvidence = fieldEvidenceSchema.parse({
      ...baseEvidence,
      evidence_id: "evidence_offer_nb_005_extraction_price",
      verification_status: "claimed",
      evidence_type: "extraction",
      extraction_confidence: 0.99,
    });
    const modifiedMatch = matchResultSchema.parse({
      ...matching.match_result,
      criteria_results: matching.match_result.criteria_results.map((result) =>
        result.criterion_id === "criterion_confidence_extraction"
          ? {
              ...result,
              verification_status: "claimed",
              evidence_refs: [extractionEvidence.evidence_id],
            }
          : result,
      ),
    });
    const result = calculated(
      qualityInput(userRequest, matching, {
        matchResult: modifiedMatch,
        fieldEvidence: [...dataset.fieldEvidence, extractionEvidence],
      }),
    );
    const price = result.field_results.find(
      (field) => field.field === "listing_price",
    );
    expect(price?.verification_status).toBe("claimed");
    expect(price?.confidence_score).toBeLessThan(40);
  });

  it("preserves Match Score and ranking while filling only data-quality metrics", () => {
    const userRequest = request("request_confidence_integration", [
      budget("criterion_confidence_integration"),
    ]);
    const matching = matched(userRequest, "prop_nb_005");
    const result = calculated(qualityInput(userRequest, matching));
    expect(result.match_result.match_score).toBe(
      matching.match_result.match_score,
    );
    expect(result.match_result.ranking_score).toBe(
      matching.match_result.ranking_score,
    );
    expect(result.match_result.data_confidence_score).toBe(
      result.data_quality.data_confidence_score,
    );
    expect(result.match_result.data_completeness_score).toBe(
      result.data_quality.data_completeness_score,
    );
    expect(result.data_quality.algorithm_version).toBe(
      CONFIDENCE_ALGORITHM_VERSION,
    );
  });

  it("rejects missing evidence references and is deterministic", () => {
    const userRequest = request("request_confidence_deterministic", [
      budget("criterion_confidence_deterministic"),
    ]);
    const matching = matched(userRequest, "prop_nb_005");
    const input = qualityInput(userRequest, matching);
    expect(calculated(input)).toEqual(calculated(input));

    const requiredEvidenceId =
      matching.match_result.criteria_results[0]?.evidence_refs[0];
    const invalid = calculateDataQuality({
      ...input,
      fieldEvidence: input.fieldEvidence.filter(
        (evidence) => evidence.evidence_id !== requiredEvidenceId,
      ),
    });
    expect(invalid).toMatchObject({
      success: false,
      error: { code: "BROKEN_REFERENCE" },
    });
  });
});
