import { z } from "zod";

import {
  entityIdSchema,
  freshnessStatusSchema,
  isoDateTimeSchema,
  marketTypeSchema,
  nonEmptyStringSchema,
  prioritySchema,
  propertyTypeSchema,
  ratioSchema,
  schemaVersionSchema,
  scoreSchema,
  sourceTrustSchema,
  verificationStatusSchema,
} from "../common/schema";

export const criterionOperatorSchema = z.enum([
  "eq",
  "neq",
  "in",
  "not_in",
  "lte",
  "gte",
  "between",
  "within_distance",
  "within_time",
  "exists",
  "absent",
  "before",
  "after",
  "one_of",
  "boolean",
  "custom",
]);

export const criterionSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    criterion_id: entityIdSchema,
    category: z.enum([
      "finance",
      "property",
      "timeline",
      "location",
      "infrastructure",
      "house",
      "data",
      "transaction",
      "custom",
    ]),
    field: nonEmptyStringSchema,
    operator: criterionOperatorSchema,
    target: z.json(),
    unit: nonEmptyStringSchema.nullable(),
    priority: prioritySchema,
    weight: z.number().int().min(1).max(5).nullable(),
    tolerance: z.json(),
    fit_function: nonEmptyStringSchema.nullable(),
    criterion_group_id: entityIdSchema.nullable(),
    applicable_property_types: z.array(propertyTypeSchema),
    source_requirement: z.array(sourceTrustSchema),
    freshness_requirement: freshnessStatusSchema.nullable(),
    critical_if_unknown: z.boolean(),
    user_expression: nonEmptyStringSchema.nullable(),
  })
  .meta({ title: "Criterion" });

export const criterionEvaluationStatusSchema = z.enum([
  "matched",
  "partially_matched",
  "not_matched",
  "unknown",
  "conflicting",
  "not_applicable",
  "hard_failed",
]);

export const criterionEvaluationResultSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    criterion_id: entityIdSchema,
    status: criterionEvaluationStatusSchema,
    actual: z.json(),
    target: z.json(),
    fit: ratioSchema.nullable(),
    margin: z.json(),
    verification_status: verificationStatusSchema,
    freshness_status: freshnessStatusSchema,
    evidence_refs: z.array(entityIdSchema),
    unknown_reason: nonEmptyStringSchema.nullable(),
    explanation_data: z.record(z.string(), z.json()),
  })
  .meta({ title: "CriterionEvaluationResult" });

export const confidenceStatusSchema = z.enum([
  "high",
  "medium",
  "low",
  "critical",
]);
export const conflictStatusSchema = z.enum([
  "none",
  "minor",
  "significant",
  "critical",
  "unresolved",
]);
export const evidenceQualitySchema = z.enum([
  "direct",
  "derived",
  "indirect",
  "weak",
  "missing",
]);

export const fieldDataQualitySchema = z.strictObject({
  field: nonEmptyStringSchema,
  importance: z.number().min(0).max(5),
  verification_status: verificationStatusSchema,
  freshness_status: freshnessStatusSchema,
  conflict_status: conflictStatusSchema,
  evidence_quality: evidenceQualitySchema,
  field_confidence: ratioSchema,
  evidence_refs: z.array(entityIdSchema),
});

export const recommendedCheckSchema = z.strictObject({
  field: nonEmptyStringSchema,
  priority: z.enum(["critical", "high", "medium", "low"]),
  action: nonEmptyStringSchema,
});

export const dataQualitySchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    data_quality_id: entityIdSchema,
    data_confidence_score: scoreSchema,
    data_completeness_score: scoreSchema,
    freshness_score: scoreSchema,
    confidence_status: confidenceStatusSchema,
    critical_unknown_count: z.number().int().nonnegative(),
    critical_conflict_count: z.number().int().nonnegative(),
    critical_override: z.boolean(),
    fields: z.array(fieldDataQualitySchema),
    recommended_checks: z.array(recommendedCheckSchema),
    algorithm_version: nonEmptyStringSchema,
  })
  .meta({ title: "DataQuality" });

export const eligibilityStatusSchema = z.enum([
  "eligible",
  "eligible_with_unknowns",
  "possible_match",
  "hard_fail",
  "insufficient_data",
  "unavailable",
]);

export const matchResultSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    match_result_id: entityIdSchema,
    user_request_id: entityIdSchema,
    property_id: entityIdSchema,
    purchase_scenario_id: entityIdSchema.nullable(),
    eligibility_status: eligibilityStatusSchema,
    match_score: scoreSchema,
    property_fit_score: scoreSchema,
    financing_fit_score: scoreSchema,
    data_confidence_score: scoreSchema,
    data_completeness_score: scoreSchema,
    ranking_score: z.number().meta({
      description:
        "An internal ordering value. Its range is intentionally not fixed by the domain contract.",
    }),
    criteria_results: z.array(criterionEvaluationResultSchema),
    hard_failures: z.array(entityIdSchema),
    compromises: z.array(nonEmptyStringSchema),
    strengths: z.array(nonEmptyStringSchema),
    unknown_critical: z.array(nonEmptyStringSchema),
    recommended_actions: z.array(nonEmptyStringSchema),
    algorithm_version: nonEmptyStringSchema,
    calculated_at: isoDateTimeSchema,
  })
  .meta({ title: "MatchResult" });

export const marketSelectionSchema = z.strictObject({
  property_types: z.array(propertyTypeSchema),
  market_types: z.array(marketTypeSchema),
});

export type Criterion = z.infer<typeof criterionSchema>;
export type CriterionEvaluationResult = z.infer<
  typeof criterionEvaluationResultSchema
>;
export type DataQuality = z.infer<typeof dataQualitySchema>;
export type MatchResult = z.infer<typeof matchResultSchema>;
