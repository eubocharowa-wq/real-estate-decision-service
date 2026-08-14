import { createHash } from "node:crypto";

import type { Criterion } from "../domain/matching/schema";
import {
  userRequestSchema,
  type UserRequest,
} from "../domain/user-request/schema";
import type {
  ExtractedFact,
  InferredCandidate,
  ParserUnknown,
  ParserWarning,
  SourceSpan,
  UserRequestParserInput,
} from "./contracts";
import { userRequestParserPolicy } from "./config";

export interface ParserDraft {
  request: UserRequest;
  extracted_facts: ExtractedFact[];
  inferred_candidates: InferredCandidate[];
  unknowns: ParserUnknown[];
  warnings: ParserWarning[];
  user_requested_limit: number | null;
}

export interface CriterionDraft {
  field: string;
  category: Criterion["category"];
  operator: Criterion["operator"];
  target: Criterion["target"];
  unit: string | null;
  priority: Criterion["priority"];
  weight: number | null;
  source_span: SourceSpan;
  priority_confidence: number;
  applicable_property_types?: Criterion["applicable_property_types"];
}

const allPropertyTypes: Criterion["applicable_property_types"] = [
  "apartment",
  "apartments",
  "house",
  "townhouse",
  "land",
];

export const stableId = (
  prefix: string,
  ...parts: readonly string[]
): string => {
  const digest = createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 16);
  return `${prefix}_${digest}`;
};

export const sourceSpan = (
  rawText: string,
  start: number,
  end: number,
): SourceSpan => ({
  text: rawText.slice(start, end).trim(),
  start,
  end,
});

export const createParserDraft = (
  input: UserRequestParserInput,
): ParserDraft => {
  const previous = input.context?.continuation
    ? input.context.previous_request
    : null;
  const request: UserRequest = previous
    ? structuredClone(previous)
    : {
        schema_version: "1.0",
        user_request_id: stableId("request", input.locale, input.raw_text),
        intent: "mixed",
        goal: { purpose: "unknown", description: null },
        location: {
          country_codes: [],
          regions: [],
          cities: [],
          preferred_districts: [],
          excluded_districts: [],
          destination_addresses: [],
          microdistricts: [],
          excluded_locations: [],
          location_flexible: null,
        },
        property: {
          allowed_property_types: [],
          allowed_market_types: [],
          rooms_min: null,
          rooms_max: null,
          excluded_property_types: [],
          property_type_flexible: null,
        },
        budget: {
          purchase_price: { minimum: null, maximum: null },
          total_budget: null,
          renovation_budget: null,
          own_funds: null,
          reserve_after_purchase: null,
          budget_flexible: null,
          budget_context: "unknown",
        },
        financing: {
          purchase_methods: ["unknown"],
          required_program_types: [],
          initial_payment_max: null,
          monthly_payment_max: null,
          financing_period: { from: null, to: null },
          preferred_banks: [],
          financing_flexible: null,
        },
        timeline: {
          purchase_by: null,
          move_in_by: null,
          ready_now_required: null,
          construction_completion_by: null,
          willing_to_wait: null,
        },
        household: {
          adults_count: null,
          children_count: null,
          pets_count: null,
          notes: null,
          children_ages: [],
          elderly_count: null,
          accessibility_needs: [],
        },
        lifestyle: {
          commute_modes: [],
          notes: [],
          remote_work: null,
          car_count: null,
        },
        infrastructure: [],
        property_features: [],
        must_have: [],
        nice_to_have: [],
        avoid: [],
        unknowns: [],
        source_links: [],
        clarifications: [],
        confidence: { extraction_confidence: 0, status: "low" },
        result_limit: userRequestParserPolicy.default_result_limit,
      };

  request.user_request_id = stableId(
    "request",
    previous?.user_request_id ?? "new",
    input.locale,
    input.raw_text,
  );
  request.clarifications = [];
  request.location.microdistricts ??= [];
  request.location.excluded_locations ??= [];
  request.location.location_flexible ??= null;
  request.property.excluded_property_types ??= [];
  request.property.property_type_flexible ??= null;
  request.budget.own_funds ??= null;
  request.budget.reserve_after_purchase ??= null;
  request.budget.budget_flexible ??= null;
  request.budget.budget_context ??= "unknown";
  request.financing.preferred_banks ??= [];
  request.financing.financing_flexible ??= null;
  request.timeline.construction_completion_by ??= null;
  request.timeline.willing_to_wait ??= null;
  request.household.children_ages ??= [];
  request.household.elderly_count ??= null;
  request.household.accessibility_needs ??= [];
  request.lifestyle.remote_work ??= null;
  request.lifestyle.car_count ??= null;

  return {
    request,
    extracted_facts: [],
    inferred_candidates: [],
    unknowns: [],
    warnings: [],
    user_requested_limit: null,
  };
};

export const addExtractedFact = (
  draft: ParserDraft,
  field: string,
  value: ExtractedFact["value"],
  span: SourceSpan,
  confidence: number,
  priority: Criterion["priority"] | null = null,
  priorityConfidence = confidence,
): void => {
  draft.extracted_facts.push({
    fact_id: stableId("fact", field, span.text, String(span.start)),
    field,
    value,
    source_span: span,
    confidence,
    priority_interpretation: priority
      ? {
          value: priority,
          confidence: priorityConfidence,
          source_text: span.text,
        }
      : null,
  });
};

export const addUnknown = (
  draft: ParserDraft,
  unknown: ParserUnknown,
): void => {
  if (
    !draft.unknowns.some(
      (item) => item.field === unknown.field && item.reason === unknown.reason,
    )
  ) {
    draft.unknowns.push(unknown);
  }
};

export const addInferredCandidate = (
  draft: ParserDraft,
  candidate: Omit<InferredCandidate, "candidate_id">,
): void => {
  draft.inferred_candidates.push({
    ...candidate,
    candidate_id: stableId(
      "candidate",
      candidate.proposed_criterion.field,
      candidate.source_text,
    ),
  });
};

export const addCriterion = (
  draft: ParserDraft,
  input: CriterionDraft,
): Criterion => {
  const criterion: Criterion = {
    schema_version: "1.0",
    criterion_id: stableId(
      "criterion",
      input.field,
      input.priority,
      JSON.stringify(input.target),
      input.source_span.text,
    ),
    category: input.category,
    field: input.field,
    operator: input.operator,
    target: input.target,
    unit: input.unit,
    priority: input.priority,
    weight: input.weight,
    tolerance: null,
    fit_function: null,
    criterion_group_id: null,
    applicable_property_types:
      input.applicable_property_types ?? allPropertyTypes,
    source_requirement: ["unknown"],
    freshness_requirement: null,
    critical_if_unknown:
      input.priority === "must" || input.priority === "exclude",
    user_expression: input.source_span.text,
  };

  if (input.category === "infrastructure") {
    draft.request.infrastructure.push(criterion);
  } else if (input.category === "property" || input.category === "house") {
    draft.request.property_features.push(criterion);
  } else if (input.priority === "avoid") {
    draft.request.avoid.push(criterion);
  } else if (input.priority === "preferred" || input.priority === "neutral") {
    draft.request.nice_to_have.push(criterion);
  } else {
    draft.request.must_have.push(criterion);
  }

  addExtractedFact(
    draft,
    input.field,
    input.target,
    input.source_span,
    input.priority_confidence,
    input.priority,
    input.priority_confidence,
  );
  return criterion;
};

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const deduplicateCriteria = (criteria: readonly Criterion[]): Criterion[] => {
  const seen = new Set<string>();
  return criteria.filter((criterion) => {
    if (seen.has(criterion.criterion_id)) return false;
    seen.add(criterion.criterion_id);
    return true;
  });
};

export const normalizeParsedRequest = (draft: ParserDraft): UserRequest => {
  const request = draft.request;
  request.location.country_codes = unique(request.location.country_codes);
  request.location.regions = unique(request.location.regions);
  request.location.cities = unique(request.location.cities);
  request.location.preferred_districts = unique(
    request.location.preferred_districts,
  );
  request.location.excluded_districts = unique(
    request.location.excluded_districts,
  );
  request.location.microdistricts = unique(
    request.location.microdistricts ?? [],
  );
  request.location.excluded_locations = unique(
    request.location.excluded_locations ?? [],
  );
  request.property.allowed_property_types = unique(
    request.property.allowed_property_types,
  );
  request.property.allowed_market_types = unique(
    request.property.allowed_market_types,
  );
  request.property.excluded_property_types = unique(
    request.property.excluded_property_types ?? [],
  );
  request.financing.purchase_methods = unique(
    request.financing.purchase_methods,
  ).filter(
    (method) =>
      method !== "unknown" || request.financing.purchase_methods.length === 1,
  );
  request.financing.required_program_types = unique(
    request.financing.required_program_types,
  );
  request.infrastructure = deduplicateCriteria(request.infrastructure);
  request.property_features = deduplicateCriteria(request.property_features);
  request.must_have = deduplicateCriteria(request.must_have);
  request.nice_to_have = deduplicateCriteria(request.nice_to_have);
  request.avoid = deduplicateCriteria(request.avoid);
  request.unknowns = draft.unknowns.map((unknown) => ({
    field: unknown.field,
    reason: unknown.explanation,
    critical: unknown.materiality === "critical",
  }));

  return userRequestSchema.parse(request);
};

const numberWords: Readonly<Record<string, number>> = {
  один: 1,
  одна: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  пяти: 5,
  шесть: 6,
  шести: 6,
  семь: 7,
  восьми: 8,
  восемь: 8,
  девять: 9,
  десять: 10,
};

export const parseNumericToken = (token: string): number | null => {
  const normalized = token.toLowerCase().replace(",", ".");
  if (normalized in numberWords) return numberWords[normalized] ?? null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

export const scaleAmount = (value: number, unit: string): number => {
  const normalizedUnit = unit.toLowerCase();
  if (
    normalizedUnit.startsWith("млн") ||
    normalizedUnit.startsWith("миллион")
  ) {
    return value * 1_000_000;
  }
  if (normalizedUnit.startsWith("тыс")) return value * 1_000;
  return value;
};

export const money = (amount: number) => ({
  amount: amount.toFixed(2),
  currency: "RUB" as const,
});

export const addYears = (date: string, years: number): string => {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year + years, month - 1, day));
  return value.toISOString().slice(0, 10);
};
