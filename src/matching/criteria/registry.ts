import type { Property } from "../../domain";
import type { CriterionDefinition } from "./types";

const ALL_PROPERTY_TYPES = [
  "apartment",
  "apartments",
  "house",
  "townhouse",
  "land",
] as const satisfies readonly Property["property_type"][];
const APARTMENT_TYPES = ["apartment", "apartments"] as const;
const HOUSE_TYPES = ["house", "townhouse", "land"] as const;

type DefinitionInput = Omit<
  CriterionDefinition,
  | "aliases"
  | "conflictFields"
  | "allowedUnits"
  | "applicablePropertyTypes"
  | "sourceRequirement"
  | "freshnessRequirement"
  | "supportsTolerance"
  | "supportsSoftCurve"
> &
  Partial<
    Pick<
      CriterionDefinition,
      | "aliases"
      | "conflictFields"
      | "allowedUnits"
      | "applicablePropertyTypes"
      | "sourceRequirement"
      | "freshnessRequirement"
      | "supportsTolerance"
      | "supportsSoftCurve"
    >
  >;

const define = (input: DefinitionInput): CriterionDefinition => ({
  ...input,
  aliases: input.aliases ?? [],
  conflictFields: input.conflictFields ?? [input.actualField],
  allowedUnits: input.allowedUnits ?? [],
  applicablePropertyTypes: input.applicablePropertyTypes ?? ALL_PROPERTY_TYPES,
  sourceRequirement: input.sourceRequirement ?? [],
  freshnessRequirement: input.freshnessRequirement ?? null,
  supportsTolerance: input.supportsTolerance ?? false,
  supportsSoftCurve: input.supportsSoftCurve ?? false,
});

const definitions = [
  define({
    key: "price_max",
    category: "finance",
    evaluatorType: "financial",
    supportedOperators: ["lte"],
    actualEntity: "offer",
    actualField: "listing_price",
    aliases: ["purchase_price", "budget.purchase_price.maximum"],
    valueType: "money",
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "total_entry_cost_max",
    category: "finance",
    evaluatorType: "financial",
    supportedOperators: ["lte"],
    actualEntity: "purchase_scenario",
    actualField: "estimated_total_entry_cost",
    valueType: "money",
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "initial_payment_max",
    category: "finance",
    evaluatorType: "financial",
    supportedOperators: ["lte"],
    actualEntity: "purchase_scenario",
    actualField: "initial_payment",
    valueType: "money",
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "zero_initial_payment",
    category: "finance",
    evaluatorType: "applicability",
    supportedOperators: ["boolean", "eq"],
    actualEntity: "financing_eligibility",
    actualField: "initial_payment.zero_payment_status",
    valueType: "boolean",
  }),
  define({
    key: "monthly_payment_max",
    category: "finance",
    evaluatorType: "financial",
    supportedOperators: ["lte"],
    actualEntity: "purchase_scenario",
    actualField: "monthly_payment",
    valueType: "money",
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "financing_program",
    category: "finance",
    evaluatorType: "applicability",
    supportedOperators: ["boolean", "eq", "in", "one_of"],
    actualEntity: "financing_eligibility",
    actualField: "eligibility_status",
    aliases: ["family_mortgage"],
    conflictFields: ["eligibility_status"],
    valueType: "boolean",
  }),
  define({
    key: "property_type",
    category: "property",
    evaluatorType: "categorical",
    supportedOperators: ["eq", "neq", "in", "not_in", "one_of"],
    actualEntity: "property",
    actualField: "property_type",
    aliases: ["property.allowed_property_types"],
    valueType: "string",
  }),
  define({
    key: "market_type",
    category: "property",
    evaluatorType: "categorical",
    supportedOperators: ["eq", "neq", "in", "not_in", "one_of"],
    actualEntity: "property",
    actualField: "market_type",
    aliases: ["property.allowed_market_types"],
    valueType: "string",
  }),
  define({
    key: "rooms",
    category: "property",
    evaluatorType: "range",
    supportedOperators: ["eq", "gte", "lte", "between"],
    actualEntity: "property",
    actualField: "physical.rooms",
    valueType: "number",
    allowedUnits: ["rooms"],
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "area_min",
    category: "property",
    evaluatorType: "min",
    supportedOperators: ["gte"],
    actualEntity: "property",
    actualField: "physical.total_area_m2",
    valueType: "number",
    allowedUnits: ["m2", "sqm"],
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "area_max",
    category: "property",
    evaluatorType: "max",
    supportedOperators: ["lte"],
    actualEntity: "property",
    actualField: "physical.total_area_m2",
    valueType: "number",
    allowedUnits: ["m2", "sqm"],
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "area_range",
    category: "property",
    evaluatorType: "range",
    supportedOperators: ["between"],
    actualEntity: "property",
    actualField: "physical.total_area_m2",
    valueType: "number",
    allowedUnits: ["m2", "sqm"],
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "floor_min",
    category: "property",
    evaluatorType: "min",
    supportedOperators: ["gte"],
    actualEntity: "property",
    actualField: "physical.floor",
    valueType: "number",
    allowedUnits: ["floor"],
    applicablePropertyTypes: APARTMENT_TYPES,
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "floor_max",
    category: "property",
    evaluatorType: "max",
    supportedOperators: ["lte"],
    actualEntity: "property",
    actualField: "physical.floor",
    valueType: "number",
    allowedUnits: ["floor"],
    applicablePropertyTypes: APARTMENT_TYPES,
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "first_floor",
    category: "property",
    evaluatorType: "derived",
    supportedOperators: ["boolean", "eq", "neq"],
    actualEntity: "derived",
    actualField: "physical.floor.is_first",
    conflictFields: ["physical.floor"],
    valueType: "boolean",
    applicablePropertyTypes: APARTMENT_TYPES,
  }),
  define({
    key: "top_floor",
    category: "property",
    evaluatorType: "derived",
    supportedOperators: ["boolean", "eq", "neq"],
    actualEntity: "derived",
    actualField: "physical.floor.is_top",
    conflictFields: ["physical.floor", "building.floors_total"],
    valueType: "boolean",
    applicablePropertyTypes: APARTMENT_TYPES,
  }),
  define({
    key: "elevator",
    category: "property",
    evaluatorType: "boolean",
    supportedOperators: ["boolean", "eq", "neq"],
    actualEntity: "property",
    actualField: "building.elevator",
    valueType: "boolean",
    applicablePropertyTypes: APARTMENT_TYPES,
  }),
  define({
    key: "balcony",
    category: "property",
    evaluatorType: "boolean",
    supportedOperators: ["boolean", "eq", "neq"],
    actualEntity: "property",
    actualField: "physical.balcony",
    valueType: "boolean",
    applicablePropertyTypes: APARTMENT_TYPES,
  }),
  define({
    key: "finishing_type",
    category: "property",
    evaluatorType: "categorical",
    supportedOperators: ["eq", "neq", "in", "not_in", "one_of"],
    actualEntity: "property",
    actualField: "condition.finishing_type",
    valueType: "string",
  }),
  define({
    key: "ready_now",
    category: "timeline",
    evaluatorType: "boolean",
    supportedOperators: ["boolean", "eq"],
    actualEntity: "property",
    actualField: "condition.ready_for_living",
    valueType: "boolean",
  }),
  define({
    key: "move_in_deadline",
    category: "timeline",
    evaluatorType: "date",
    supportedOperators: ["before", "lte"],
    actualEntity: "property",
    actualField: "timeline.move_in_possible_date",
    valueType: "date",
    allowedUnits: ["date"],
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "handover_deadline",
    category: "timeline",
    evaluatorType: "date",
    supportedOperators: ["before", "lte"],
    actualEntity: "property",
    actualField: "timeline.handover_date",
    valueType: "date",
    allowedUnits: ["date"],
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "city",
    category: "location",
    evaluatorType: "set",
    supportedOperators: ["eq", "in", "one_of"],
    actualEntity: "property",
    actualField: "location.address.city",
    valueType: "string",
  }),
  define({
    key: "district",
    category: "location",
    evaluatorType: "set",
    supportedOperators: ["eq", "in", "one_of"],
    actualEntity: "property",
    actualField: "location.address.district",
    valueType: "string",
  }),
  define({
    key: "excluded_location",
    category: "location",
    evaluatorType: "set",
    supportedOperators: ["neq", "not_in"],
    actualEntity: "property",
    actualField: "location.address.district",
    valueType: "string",
  }),
  define({
    key: "travel_time_max",
    category: "infrastructure",
    evaluatorType: "travel_time",
    supportedOperators: ["within_time", "lte"],
    actualEntity: "evidence",
    actualField: "mobility.user_destination.public_transport_time_min",
    valueType: "number",
    allowedUnits: ["min", "minutes"],
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "distance_max",
    category: "infrastructure",
    evaluatorType: "distance",
    supportedOperators: ["within_distance", "lte"],
    actualEntity: "evidence",
    actualField: "mobility.user_destination.distance_m",
    valueType: "number",
    allowedUnits: ["m", "km"],
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  ...[
    ["school_distance_max", "infrastructure.school.distance_m"],
    ["kindergarten_distance_max", "infrastructure.kindergarten.distance_m"],
    ["park_distance_max", "infrastructure.park.distance_m"],
    ["transport_distance_max", "infrastructure.transport.distance_m"],
  ].map(([key, actualField]) =>
    define({
      key,
      category: "infrastructure",
      evaluatorType: "distance",
      supportedOperators: ["within_distance", "lte"],
      actualEntity: "evidence",
      actualField,
      valueType: "number",
      allowedUnits: ["m", "km"],
      supportsTolerance: true,
      supportsSoftCurve: true,
    }),
  ),
  define({
    key: "school_travel_time_max",
    category: "infrastructure",
    evaluatorType: "travel_time",
    supportedOperators: ["within_time", "lte"],
    actualEntity: "evidence",
    actualField: "infrastructure.school.walk_time_min",
    valueType: "number",
    allowedUnits: ["min", "minutes"],
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  define({
    key: "land_area_min",
    category: "house",
    evaluatorType: "min",
    supportedOperators: ["gte"],
    actualEntity: "property",
    actualField: "land.area_sotka",
    valueType: "number",
    allowedUnits: ["sotka"],
    applicablePropertyTypes: HOUSE_TYPES,
    supportsTolerance: true,
    supportsSoftCurve: true,
  }),
  ...[
    ["gas_connected", "utilities.gas"],
    ["water_connected", "utilities.water"],
    ["electricity_connected", "utilities.electricity"],
  ].map(([key, actualField]) =>
    define({
      key,
      category: "house",
      evaluatorType: "categorical",
      supportedOperators: ["boolean", "eq", "neq"],
      actualEntity: "property",
      actualField,
      valueType: "string",
      applicablePropertyTypes: HOUSE_TYPES,
    }),
  ),
  define({
    key: "road_access",
    category: "house",
    evaluatorType: "exact",
    supportedOperators: ["boolean", "eq", "neq", "exists", "absent"],
    actualEntity: "evidence",
    actualField: "land.access_road.status",
    valueType: "string",
    applicablePropertyTypes: HOUSE_TYPES,
  }),
  define({
    key: "availability",
    category: "transaction",
    evaluatorType: "categorical",
    supportedOperators: ["eq", "neq", "in", "not_in", "one_of"],
    actualEntity: "offer",
    actualField: "availability",
    valueType: "string",
  }),
] as const;

export const CRITERIA_REGISTRY: ReadonlyMap<string, CriterionDefinition> =
  new Map(definitions.map((definition) => [definition.key, definition]));

const aliasMap = new Map<string, CriterionDefinition>();
for (const definition of definitions) {
  aliasMap.set(definition.key, definition);
  aliasMap.set(definition.actualField, definition);
  for (const alias of definition.aliases) aliasMap.set(alias, definition);
}

export const resolveCriterionDefinition = (
  field: string,
  operator: string,
): CriterionDefinition | null => {
  if (field === "physical.total_area_m2") {
    const key =
      operator === "gte"
        ? "area_min"
        : operator === "lte"
          ? "area_max"
          : "area_range";
    return CRITERIA_REGISTRY.get(key) ?? null;
  }
  if (field === "physical.floor") {
    const key =
      operator === "gte"
        ? "floor_min"
        : operator === "lte"
          ? "floor_max"
          : "first_floor";
    return CRITERIA_REGISTRY.get(key) ?? null;
  }
  return aliasMap.get(field) ?? null;
};

export const listCriterionDefinitions = (): readonly CriterionDefinition[] =>
  definitions;
