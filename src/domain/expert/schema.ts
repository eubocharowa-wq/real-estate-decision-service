import { z } from "zod";

import {
  entityIdSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  schemaVersionSchema,
  urlSchema,
  verificationStatusSchema,
} from "../common/schema";

export const expertRequestTypeSchema = z.enum([
  "information_verification",
  "document_review",
  "choice_assistance",
  "property_analysis",
  "consultation",
  "onsite_check",
  "transaction_question",
]);

export const specialistTypeSchema = z.enum([
  "real_estate_expert",
  "lawyer",
  "mortgage_specialist",
  "property_inspector",
  "technical_specialist",
]);

export const expertRequestStatusSchema = z.enum([
  "new",
  "accepted",
  "in_progress",
  "waiting_for_user",
  "waiting_for_source",
  "completed",
  "cancelled",
]);

export const expertRequestSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    request_id: entityIdSchema,
    user_id: entityIdSchema,
    request_type: expertRequestTypeSchema,
    user_request_id: entityIdSchema.nullable(),
    property_ids: z.array(entityIdSchema),
    comparison_id: entityIdSchema.nullable(),
    questions: z.array(nonEmptyStringSchema).min(1),
    priority: z.enum(["urgent", "high", "normal"]),
    status: expertRequestStatusSchema,
    required_specialist: specialistTypeSchema,
    context: z.strictObject({
      match_result_ids: z.array(entityIdSchema),
      purchase_scenario_ids: z.array(entityIdSchema),
      critical_unknowns: z.array(nonEmptyStringSchema),
      conflict_ids: z.array(entityIdSchema),
      evidence_refs: z.array(entityIdSchema),
      source_links: z.array(urlSchema),
    }),
    created_at: isoDateTimeSchema,
  })
  .meta({ title: "ExpertRequest" });

export const expertResultStatusSchema = z.enum([
  "completed",
  "partially_completed",
  "needs_additional_specialist",
  "unable_to_verify",
  "cancelled",
]);

const checkedItemSchema = z.strictObject({
  field: nonEmptyStringSchema,
  status: z.enum([
    "confirmed",
    "not_confirmed",
    "observed_issue",
    "unable_to_check",
    "requires_specialist",
  ]),
  note: nonEmptyStringSchema.nullable(),
});

const confirmedFactSchema = z.strictObject({
  field: nonEmptyStringSchema,
  value: z.json(),
  verification_status: verificationStatusSchema,
  evidence_refs: z.array(entityIdSchema).min(1),
});

export const expertResultSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    expert_result_id: entityIdSchema,
    request_id: entityIdSchema,
    status: expertResultStatusSchema,
    checked_items: z.array(checkedItemSchema),
    not_checked_items: z.array(nonEmptyStringSchema),
    findings: z.array(nonEmptyStringSchema),
    confirmed: z.array(confirmedFactSchema),
    unconfirmed: z.array(nonEmptyStringSchema),
    conflicts: z.array(entityIdSchema),
    risks: z.array(
      z.strictObject({
        category: z.enum([
          "financial",
          "timeline",
          "contractual",
          "legal",
          "data_conflict",
          "unclear_condition",
        ]),
        description: nonEmptyStringSchema,
      }),
    ),
    recommendations: z.array(nonEmptyStringSchema),
    next_actions: z.array(nonEmptyStringSchema),
    evidence: z.array(entityIdSchema),
    specialist: z.strictObject({
      specialist_id: entityIdSchema,
      specialist_type: specialistTypeSchema,
    }),
    completed_at: isoDateTimeSchema.nullable(),
  })
  .meta({ title: "ExpertResult" });

export type ExpertRequest = z.infer<typeof expertRequestSchema>;
export type ExpertResult = z.infer<typeof expertResultSchema>;
