import { describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  criterionEvaluationResultSchema,
  criterionSchema,
  fieldEvidenceSchema,
  offerSchema,
  type Criterion,
} from "../../src/domain";
import {
  CRITERIA_REGISTRY_VERSION,
  CRITERIA_SOFT_CURVE_CONFIG,
  evaluateCriterion,
  listCriterionDefinitions,
  resolveEvaluator,
  type CriterionEvaluationContext,
} from "../../src/matching";
import { loadPilotDataset } from "../../src/pilot-dataset";

const dataset = loadPilotDataset();
const property = dataset.properties.find(
  (item) => item.identity.property_id === "prop_nb_004",
)!;
const baseOffer = dataset.offers.find(
  (item) => item.offer_id === "offer_nb_004_primary",
)!;

const criterion = (
  overrides: Partial<Criterion> &
    Pick<Criterion, "field" | "operator" | "target">,
): Criterion =>
  criterionSchema.parse({
    schema_version: SCHEMA_VERSION,
    criterion_id: "criterion_unit",
    category: "property",
    unit: null,
    priority: "preferred",
    weight: 3,
    tolerance: null,
    fit_function: null,
    criterion_group_id: null,
    applicable_property_types: [
      "apartment",
      "apartments",
      "house",
      "townhouse",
      "land",
    ],
    source_requirement: [],
    freshness_requirement: null,
    critical_if_unknown: false,
    user_expression: null,
    ...overrides,
  });

const context = (
  offer = baseOffer,
  contextProperty = property,
): CriterionEvaluationContext => ({
  property: contextProperty,
  offer,
  fieldEvidence: dataset.fieldEvidence,
  sourceConflicts: dataset.sourceConflicts,
  currentTime: "2026-08-15T00:00:00.000Z",
});

const evaluated = (
  input: unknown,
  evaluationContext: CriterionEvaluationContext = context(),
) => {
  const outcome = evaluateCriterion(input, evaluationContext);
  expect(outcome.success).toBe(true);
  if (!outcome.success) throw new Error(outcome.error.message);
  expect(() =>
    criterionEvaluationResultSchema.parse(outcome.result),
  ).not.toThrow();
  return outcome.result;
};

describe("TASK-006 criteria registry and evaluator contracts", () => {
  it("publishes a versioned registry with every required evaluator type", () => {
    expect(CRITERIA_REGISTRY_VERSION).toBe("criteria-registry-v1");
    expect(CRITERIA_SOFT_CURVE_CONFIG.provisional).toBe(true);
    const definitions = listCriterionDefinitions();
    const keys = new Set(definitions.map((item) => item.key));
    const types = new Set(definitions.map((item) => item.evaluatorType));
    expect(keys.size).toBe(definitions.length);
    const aliases = definitions.flatMap((item) => item.aliases);
    expect(new Set(aliases).size).toBe(aliases.length);
    expect(
      definitions.every(
        (item) =>
          item.applicablePropertyTypes.length > 0 &&
          Array.isArray(item.sourceRequirement) &&
          "freshnessRequirement" in item,
      ),
    ).toBe(true);

    for (const key of [
      "price_max",
      "total_entry_cost_max",
      "initial_payment_max",
      "zero_initial_payment",
      "monthly_payment_max",
      "financing_program",
      "property_type",
      "market_type",
      "rooms",
      "area_min",
      "area_max",
      "floor_min",
      "floor_max",
      "first_floor",
      "top_floor",
      "elevator",
      "balcony",
      "finishing_type",
      "ready_now",
      "move_in_deadline",
      "handover_deadline",
      "city",
      "district",
      "excluded_location",
      "travel_time_max",
      "distance_max",
      "school_distance_max",
      "kindergarten_distance_max",
      "park_distance_max",
      "transport_distance_max",
      "land_area_min",
      "gas_connected",
      "water_connected",
      "electricity_connected",
      "road_access",
      "availability",
    ]) {
      expect(keys.has(key), key).toBe(true);
    }

    for (const type of [
      "boolean",
      "exact",
      "set",
      "min",
      "max",
      "range",
      "distance",
      "travel_time",
      "date",
      "categorical",
      "financial",
      "applicability",
      "derived",
    ]) {
      expect(types.has(type as never), type).toBe(true);
    }
  });

  it("returns controlled errors for malformed and unsupported criteria", () => {
    expect(resolveEvaluator({}).success).toBe(false);

    const unsupported = resolveEvaluator(
      criterion({ field: "custom.magic", operator: "eq", target: true }),
    );
    expect(unsupported).toMatchObject({
      success: false,
      error: { code: "UNSUPPORTED_CRITERION" },
    });

    const badOperator = resolveEvaluator(
      criterion({ field: "listing_price", operator: "gte", target: 1 }),
    );
    expect(badOperator).toMatchObject({
      success: false,
      error: { code: "UNSUPPORTED_OPERATOR" },
    });

    const badUnit = resolveEvaluator(
      criterion({
        field: "physical.total_area_m2",
        operator: "gte",
        target: 40,
        unit: "kg",
      }),
    );
    expect(badUnit).toMatchObject({
      success: false,
      error: { code: "INVALID_UNIT" },
    });

    const distanceAsTime = resolveEvaluator(
      criterion({
        field: "mobility.user_destination.public_transport_time_min",
        operator: "within_time",
        target: 40,
        unit: "m",
      }),
    );
    expect(distanceAsTime).toMatchObject({
      success: false,
      error: { code: "INVALID_UNIT" },
    });
  });

  it("applies exact hard boundaries without a hidden tolerance", () => {
    const budget = criterion({
      criterion_id: "criterion_budget_exact",
      category: "finance",
      field: "listing_price",
      operator: "lte",
      target: { amount: "5000000.00", currency: "RUB" },
      priority: "must",
      critical_if_unknown: true,
    });
    const exactOffer = offerSchema.parse({
      ...baseOffer,
      listing_price: { amount: "5000000.00", currency: "RUB" },
    });
    const overOffer = offerSchema.parse({
      ...baseOffer,
      listing_price: { amount: "5000000.01", currency: "RUB" },
    });

    expect(evaluated(budget, context(exactOffer)).status).toBe("matched");
    expect(evaluated(budget, context(overOffer)).status).toBe("hard_failed");
  });

  it("respects an explicit hard tolerance", () => {
    const budget = criterion({
      category: "finance",
      field: "listing_price",
      operator: "lte",
      target: { amount: "5000000.00", currency: "RUB" },
      tolerance: { amount: "200000.00", currency: "RUB" },
      priority: "must",
    });
    const offer = offerSchema.parse({
      ...baseOffer,
      listing_price: { amount: "5100000.00", currency: "RUB" },
    });
    expect(evaluated(budget, context(offer)).status).toBe("matched");
  });

  it("uses the provisional soft curve only for a preference", () => {
    const budget = criterion({
      category: "finance",
      field: "listing_price",
      operator: "lte",
      target: { amount: "5000000.00", currency: "RUB" },
      priority: "preferred",
    });
    const offer = offerSchema.parse({
      ...baseOffer,
      listing_price: { amount: "5250000.00", currency: "RUB" },
    });
    const result = evaluated(budget, context(offer));
    expect(result.status).toBe("partially_matched");
    expect(result.fit).toBeCloseTo(0.8);
  });

  it("keeps avoid negative preferences non-hard", () => {
    const firstFloor = dataset.properties.find(
      (item) => item.identity.property_id === "prop_sec_003",
    )!;
    const firstFloorOffer = dataset.offers.find(
      (item) => item.offer_id === "offer_sec_003_primary",
    )!;
    const avoid = criterion({
      field: "physical.floor",
      operator: "neq",
      target: 1,
      priority: "avoid",
      applicable_property_types: ["apartment"],
    });
    const result = evaluated(avoid, context(firstFloorOffer, firstFloor));
    expect(result.status).toBe("not_matched");
    expect(result.status).not.toBe("hard_failed");
    expect(result.fit).toBe(0);
  });

  it("returns partial fit for area and a mismatch for finishing", () => {
    const area = evaluated(
      criterion({
        field: "physical.total_area_m2",
        operator: "gte",
        target: 50,
      }),
    );
    const finishing = evaluated(
      criterion({
        field: "condition.finishing_type",
        operator: "eq",
        target: "renovated",
      }),
    );
    expect(area.status).toBe("partially_matched");
    expect(area.fit).toBeGreaterThan(0);
    expect(area.fit).toBeLessThan(1);
    expect(finishing).toMatchObject({ status: "not_matched", fit: 0 });
  });

  it("keeps neutral criteria outside scoring", () => {
    const result = evaluated(
      criterion({
        field: "property_type",
        operator: "eq",
        target: "apartment",
        priority: "neutral",
      }),
    );
    expect(result).toMatchObject({ status: "matched", fit: null });
  });

  it("covers exact, numeric max, range and distance evaluator paths", () => {
    const house = dataset.properties.find(
      (item) => item.identity.property_id === "prop_house_004",
    )!;
    const houseOffer = dataset.offers.find(
      (item) => item.offer_id === "offer_house_004_primary",
    )!;
    const road = evaluated(
      criterion({
        category: "house",
        field: "land.access_road.status",
        operator: "eq",
        target: "seasonal_access_issue",
        applicable_property_types: ["house"],
      }),
      context(houseOffer, house),
    );
    const areaMax = evaluated(
      criterion({
        field: "physical.total_area_m2",
        operator: "lte",
        target: 50,
        unit: "m2",
      }),
    );
    const rooms = evaluated(
      criterion({
        field: "physical.rooms",
        operator: "between",
        target: [1, 3],
        unit: "rooms",
      }),
    );
    const baseEvidence = dataset.fieldEvidence.find(
      (item) => item.entity_id === "prop_nb_004",
    )!;
    const distanceEvidence = fieldEvidenceSchema.parse({
      ...baseEvidence,
      evidence_id: "evidence_unit_distance",
      field: "mobility.user_destination.distance_m",
      value: 1000,
      raw_value: 1000,
    });
    const distance = evaluated(
      criterion({
        category: "infrastructure",
        field: "mobility.user_destination.distance_m",
        operator: "within_distance",
        target: 1.2,
        unit: "km",
      }),
      { ...context(), fieldEvidence: [distanceEvidence] },
    );
    expect(road).toMatchObject({ status: "matched", fit: 1 });
    expect(areaMax).toMatchObject({ status: "matched", fit: 1 });
    expect(rooms).toMatchObject({ status: "matched", fit: 1 });
    expect(distance).toMatchObject({ status: "matched", fit: 1 });
  });

  it("is deterministic and emits only structured explanation data", () => {
    const input = criterion({
      field: "condition.ready_for_living",
      operator: "boolean",
      target: true,
      priority: "must",
    });
    const first = evaluated(input);
    const second = evaluated(input);
    expect(second).toEqual(first);
    expect(first.explanation_data).toMatchObject({
      registry_version: "criteria-registry-v1",
      evaluator_version: "criteria-evaluators-v1",
      is_hard: true,
    });
  });
});
