import { z } from "zod";

import {
  entityIdSchema,
  isoDateSchema,
  nonEmptyStringSchema,
  prioritySchema,
  ratioSchema,
  schemaVersionSchema,
  scoreSchema,
} from "../domain/common/schema";
import { userRequestSchema } from "../domain/user-request/schema";

export const parserLocaleSchema = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/);

export const userRequestParserInputSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    raw_text: z.string(),
    locale: parserLocaleSchema,
    context: z
      .strictObject({
        continuation: z.boolean(),
        previous_request: userRequestSchema.nullable(),
        reference_date: isoDateSchema.nullable(),
      })
      .nullable()
      .optional(),
  })
  .meta({ title: "UserRequestParserInput" });

export const sourceSpanSchema = z.strictObject({
  text: nonEmptyStringSchema,
  start: z.number().int().nonnegative().nullable(),
  end: z.number().int().nonnegative().nullable(),
});

export const priorityInterpretationSchema = z.strictObject({
  value: prioritySchema,
  confidence: ratioSchema,
  source_text: nonEmptyStringSchema,
});

export const extractedFactSchema = z.strictObject({
  fact_id: entityIdSchema,
  field: nonEmptyStringSchema,
  value: z.json(),
  source_span: sourceSpanSchema,
  confidence: ratioSchema,
  priority_interpretation: priorityInterpretationSchema.nullable(),
});

export const inferredCandidateSchema = z.strictObject({
  candidate_id: entityIdSchema,
  proposed_criterion: z.strictObject({
    field: nonEmptyStringSchema,
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
    target: z.json(),
    priority: prioritySchema.nullable(),
  }),
  reason: nonEmptyStringSchema,
  source_text: nonEmptyStringSchema,
  confidence: ratioSchema,
});

export const parserUnknownSchema = z.strictObject({
  field: nonEmptyStringSchema,
  reason: z.enum([
    "not_specified",
    "ambiguous",
    "dependent_value_missing",
    "unsupported",
  ]),
  explanation: nonEmptyStringSchema,
  materiality: z.enum(["critical", "high", "medium", "low"]),
});

export const parserContradictionSchema = z.strictObject({
  contradiction_id: entityIdSchema,
  type: z.enum([
    "location_inclusion_exclusion",
    "property_type_inclusion_exclusion",
    "invalid_min_max",
    "criterion_must_exclude",
    "impossible_deadline",
  ]),
  fields: z.array(nonEmptyStringSchema).min(1),
  message: nonEmptyStringSchema,
  source_spans: z.array(sourceSpanSchema),
  blocking: z.boolean(),
});

export const clarificationOptionSchema = z.strictObject({
  label: nonEmptyStringSchema,
  value: z.json(),
});

export const clarificationCandidateSchema = z.strictObject({
  clarification_id: entityIdSchema,
  field: nonEmptyStringSchema,
  reason: nonEmptyStringSchema,
  impact: z.enum([
    "hard_ambiguity",
    "high_search_impact",
    "finance_impact",
    "deadline_impact",
    "location_impact",
    "unsupported_criterion",
  ]),
  proposed_question: nonEmptyStringSchema,
  options: z.array(clarificationOptionSchema),
  priority: z.enum(["critical", "high", "medium", "low"]),
  source_text: z.array(nonEmptyStringSchema),
});

export const parserWarningSchema = z.strictObject({
  code: nonEmptyStringSchema,
  message: nonEmptyStringSchema,
  field: nonEmptyStringSchema.nullable(),
});

export const interpretationConfidenceSchema = z.strictObject({
  score: scoreSchema,
  band: z.enum(["high", "medium", "low"]),
  factors: z.array(
    z.strictObject({
      code: nonEmptyStringSchema,
      impact: z.number(),
      explanation: nonEmptyStringSchema,
    }),
  ),
});

export const confirmationCriterionSchema = z.strictObject({
  criterion_id: entityIdSchema,
  field: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  value: z.json(),
  priority: prioritySchema,
  source_text: nonEmptyStringSchema.nullable(),
  editable: z.strictObject({
    value: z.boolean(),
    priority: z.boolean(),
    removable: z.boolean(),
  }),
});

export const confirmationViewSchema = z.strictObject({
  summary: z.strictObject({
    headline: nonEmptyStringSchema,
    parts: z.array(nonEmptyStringSchema),
  }),
  groups: z.strictObject({
    required: z.array(confirmationCriterionSchema),
    preferred: z.array(confirmationCriterionSchema),
    flexible: z.array(confirmationCriterionSchema),
    unknown: z.array(parserUnknownSchema),
  }),
  contradictions: z.array(parserContradictionSchema),
  clarification_questions: z.array(clarificationCandidateSchema).max(3),
  source_text: nonEmptyStringSchema,
  can_confirm: z.boolean(),
  can_add_criterion: z.literal(true),
});

export const userRequestParserResultSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    raw_text: nonEmptyStringSchema,
    locale: parserLocaleSchema,
    parsed_request: userRequestSchema,
    interpretation_confidence: interpretationConfidenceSchema,
    extracted_facts: z.array(extractedFactSchema),
    inferred_candidates: z.array(inferredCandidateSchema),
    unknowns: z.array(parserUnknownSchema),
    contradictions: z.array(parserContradictionSchema),
    clarification_candidates: z.array(clarificationCandidateSchema).max(3),
    warnings: z.array(parserWarningSchema),
    confirmation_view: confirmationViewSchema,
    user_requested_limit: z.number().int().min(5).max(10).nullable(),
    system_default_limit: z.number().int().min(5).max(10),
    parser_version: nonEmptyStringSchema,
    prompt_version: nonEmptyStringSchema.nullable(),
    normalization_version: nonEmptyStringSchema,
  })
  .meta({ title: "UserRequestParserResult" });

export const parserErrorSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    type: z.enum([
      "invalid_structure",
      "unsupported_language",
      "empty_request",
      "parser_unavailable",
    ]),
    message: nonEmptyStringSchema,
    recoverable: z.boolean(),
    raw_output_reference: nonEmptyStringSchema.nullable(),
  })
  .meta({ title: "UserRequestParserError" });

export const userRequestParserOutcomeSchema = z.discriminatedUnion("success", [
  z.strictObject({
    success: z.literal(true),
    result: userRequestParserResultSchema,
  }),
  z.strictObject({ success: z.literal(false), error: parserErrorSchema }),
]);

export type UserRequestParserInput = z.infer<
  typeof userRequestParserInputSchema
>;
export type SourceSpan = z.infer<typeof sourceSpanSchema>;
export type ExtractedFact = z.infer<typeof extractedFactSchema>;
export type InferredCandidate = z.infer<typeof inferredCandidateSchema>;
export type ParserUnknown = z.infer<typeof parserUnknownSchema>;
export type ParserContradiction = z.infer<typeof parserContradictionSchema>;
export type ClarificationCandidate = z.infer<
  typeof clarificationCandidateSchema
>;
export type ParserWarning = z.infer<typeof parserWarningSchema>;
export type InterpretationConfidence = z.infer<
  typeof interpretationConfidenceSchema
>;
export type ConfirmationView = z.infer<typeof confirmationViewSchema>;
export type UserRequestParserResult = z.infer<
  typeof userRequestParserResultSchema
>;
export type UserRequestParserError = z.infer<typeof parserErrorSchema>;
export type UserRequestParserOutcome = z.infer<
  typeof userRequestParserOutcomeSchema
>;
