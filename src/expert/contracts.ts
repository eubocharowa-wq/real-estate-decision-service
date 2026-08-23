import { z } from "zod";

import {
  entityIdSchema,
  isoDateTimeSchema,
  moneySchema,
  nonEmptyStringSchema,
  scoreSchema,
  verificationStatusSchema,
} from "../domain/common/schema";
import {
  expertRequestTypeSchema,
  specialistTypeSchema,
} from "../domain/expert/schema";

export { expertRequestTypeSchema, specialistTypeSchema };

export const EXPERT_REQUEST_SCHEMA_VERSION = "expert-request-v1" as const;
export const EXPERT_CONTEXT_PACKAGE_VERSION = "expert-context-v1" as const;
export const EXPERT_RESULT_VERSION = "expert-result-v1" as const;
export const EXPERT_ROUTING_VERSION = "expert-routing-v1" as const;
export const EXPERT_PRIORITY_VERSION = "expert-priority-v1" as const;

export const expertTriggerTypeSchema = z.enum([
  "critical_unknown",
  "critical_conflict",
  "user_requested",
  "document_question",
  "comparison_uncertainty",
  "financing_uncertainty",
  "property_analysis",
  "onsite_needed",
  "transaction_question",
]);

export const expertWorkflowStatusSchema = z.enum([
  "draft",
  "submitted",
  "queued",
  "assigned",
  "in_progress",
  "waiting_for_user",
  "waiting_for_external_info",
  "completed",
  "cancelled",
  "unable_to_complete",
]);

export const expertPrioritySchema = z.enum([
  "critical",
  "high",
  "normal",
  "low",
]);

export const expertQuestionCategorySchema = z.enum([
  "general",
  "price",
  "availability",
  "financing",
  "document",
  "legal",
  "physical_condition",
  "structural_engineering",
  "transaction",
  "comparison",
]);

export const requestOwnerSchema = z.strictObject({
  owner_type: z.enum(["session", "anonymous"]),
  owner_id: entityIdSchema,
});

export const structuredQuestionSchema = z.strictObject({
  question_code: entityIdSchema,
  field: nonEmptyStringSchema.nullable(),
  entity_id: entityIdSchema.nullable(),
  reason: nonEmptyStringSchema,
  priority: expertPrioritySchema,
});

const compactCriterionSchema = z.strictObject({
  criterion_id: entityIdSchema,
  field: nonEmptyStringSchema,
  priority: z.enum(["must", "preferred", "avoid", "exclude"]),
  target: z.json(),
  user_expression: nonEmptyStringSchema.nullable(),
});

export const userRequestExpertSummarySchema = z.strictObject({
  user_request_id: entityIdSchema,
  intent: nonEmptyStringSchema,
  goal: nonEmptyStringSchema.nullable(),
  criteria: z.array(compactCriterionSchema),
  financing_constraints: z
    .strictObject({
      purchase_methods: z.array(nonEmptyStringSchema),
      required_program_types: z.array(nonEmptyStringSchema),
      initial_payment_max: moneySchema.nullable(),
      monthly_payment_max: moneySchema.nullable(),
    })
    .nullable(),
  material_timeline: z
    .strictObject({
      purchase_by: z.string().nullable(),
      move_in_by: z.string().nullable(),
      ready_now_required: z.boolean().nullable(),
    })
    .nullable(),
});

export const expertPropertyContextSchema = z.strictObject({
  property_id: entityIdSchema,
  property_type: nonEmptyStringSchema,
  market_type: nonEmptyStringSchema,
  location_label: nonEmptyStringSchema,
  rooms: z.number().int().nonnegative().nullable(),
  total_area_m2: z.number().positive().nullable(),
  floor: z.number().int().nullable(),
  handover_date: z.string().nullable(),
  evidence_refs: z.array(entityIdSchema),
});

export const expertOfferContextSchema = z.strictObject({
  offer_id: entityIdSchema,
  property_id: entityIdSchema,
  listing_price: moneySchema.nullable(),
  price_from: z.boolean().nullable(),
  availability: nonEmptyStringSchema,
  verification_status: verificationStatusSchema,
  freshness_status: nonEmptyStringSchema,
  evidence_refs: z.array(entityIdSchema),
});

export const expertScenarioContextSchema = z.strictObject({
  scenario_id: entityIdSchema,
  property_id: entityIdSchema,
  offer_id: entityIdSchema,
  financing_program_id: entityIdSchema.nullable(),
  entry_cash: moneySchema.nullable(),
  monthly_payment: moneySchema.nullable(),
  total_payment: moneySchema.nullable(),
  terms_compatibility_status: nonEmptyStringSchema,
  verification_status: verificationStatusSchema,
  evidence_refs: z.array(entityIdSchema),
});

export const expertMatchContextSchema = z.strictObject({
  match_result_id: entityIdSchema,
  user_request_id: entityIdSchema,
  property_id: entityIdSchema,
  purchase_scenario_id: entityIdSchema.nullable(),
  eligibility_status: nonEmptyStringSchema,
  match_score: scoreSchema,
  strengths: z.array(nonEmptyStringSchema),
  compromises: z.array(nonEmptyStringSchema),
  unknown_critical: z.array(nonEmptyStringSchema),
  calculated_at: isoDateTimeSchema,
});

export const expertDataQualityContextSchema = z.strictObject({
  property_id: entityIdSchema,
  data_quality_id: entityIdSchema,
  data_confidence_score: scoreSchema,
  data_completeness_score: scoreSchema,
  critical_unknown_count: z.number().int().nonnegative(),
  critical_conflict_count: z.number().int().nonnegative(),
  confidence_status: nonEmptyStringSchema,
  recommended_checks: z.array(
    z.strictObject({
      field: nonEmptyStringSchema,
      priority: nonEmptyStringSchema,
      action: nonEmptyStringSchema,
    }),
  ),
});

export const criticalUnknownContextSchema = z.strictObject({
  entity_id: entityIdSchema,
  field: nonEmptyStringSchema,
  reason: nonEmptyStringSchema,
  must_criterion: z.boolean(),
  evidence_refs: z.array(entityIdSchema),
});

export const expertConflictContextSchema = z.strictObject({
  conflict_id: entityIdSchema,
  entity_id: entityIdSchema,
  field: nonEmptyStringSchema,
  severity: z.enum(["minor", "significant", "critical", "unknown"]),
  status: z.enum(["open", "resolved", "dismissed", "unknown"]),
  evidence_refs: z.array(entityIdSchema).min(2),
});

export const expertRecommendedCheckSchema = z.strictObject({
  check_code: entityIdSchema,
  entity_id: entityIdSchema,
  field: nonEmptyStringSchema,
  reason: nonEmptyStringSchema,
  priority: expertPrioritySchema,
});

export const choiceContextSchema = z.strictObject({
  finalist_property_ids: z.array(entityIdSchema).min(2).max(5),
  trade_offs: z.array(
    z.strictObject({
      statement: nonEmptyStringSchema,
      property_ids: z.array(entityIdSchema).min(1),
    }),
  ),
  decision_drivers: z.array(nonEmptyStringSchema),
});

export const onsiteContextSchema = z.strictObject({
  scope: z.enum(["visual_physical", "structural_engineering"]),
  known_risks: z.array(nonEmptyStringSchema),
  items_to_check: z.array(nonEmptyStringSchema).min(1),
  boundary_notice: nonEmptyStringSchema,
});

export const expertContextPackageSchema = z
  .strictObject({
    package_version: z.literal(EXPERT_CONTEXT_PACKAGE_VERSION),
    context_package_id: entityIdSchema,
    expert_request_id: entityIdSchema,
    user_request_ref: entityIdSchema,
    user_request_summary: userRequestExpertSummarySchema,
    properties: z.array(expertPropertyContextSchema).min(1),
    selected_offers: z.array(expertOfferContextSchema),
    selected_purchase_scenarios: z.array(expertScenarioContextSchema),
    match_results: z.array(expertMatchContextSchema),
    data_quality: z.array(expertDataQualityContextSchema),
    critical_unknowns: z.array(criticalUnknownContextSchema),
    conflicts: z.array(expertConflictContextSchema),
    recommended_checks: z.array(expertRecommendedCheckSchema),
    source_evidence_refs: z.array(entityIdSchema),
    user_question: nonEmptyStringSchema,
    structured_questions: z.array(structuredQuestionSchema),
    choice_context: choiceContextSchema.nullable(),
    document_refs: z.array(entityIdSchema),
    onsite_context: onsiteContextSchema.nullable(),
    created_at: isoDateTimeSchema,
    latest_source_data_at: isoDateTimeSchema.nullable(),
    stale: z.boolean(),
  })
  .superRefine((contextPackage, context) => {
    const propertyIds = new Set(
      contextPackage.properties.map((property) => property.property_id),
    );
    for (const offer of contextPackage.selected_offers)
      if (!propertyIds.has(offer.property_id))
        context.addIssue({
          code: "custom",
          path: ["selected_offers"],
          message: "Selected Offer must belong to a contextual Property",
        });
    for (const scenario of contextPackage.selected_purchase_scenarios)
      if (!propertyIds.has(scenario.property_id))
        context.addIssue({
          code: "custom",
          path: ["selected_purchase_scenarios"],
          message: "PurchaseScenario must belong to a contextual Property",
        });
  });

export const expertRequestSchema = z.strictObject({
  request_schema_version: z.literal(EXPERT_REQUEST_SCHEMA_VERSION),
  request_id: entityIdSchema,
  owner: requestOwnerSchema,
  request_type: expertRequestTypeSchema,
  trigger_type: expertTriggerTypeSchema,
  question_category: expertQuestionCategorySchema,
  user_request_id: entityIdSchema,
  property_ids: z.array(entityIdSchema).min(1).max(5),
  offer_ids: z.array(entityIdSchema),
  purchase_scenario_ids: z.array(entityIdSchema),
  comparison_id: entityIdSchema.nullable(),
  document_refs: z.array(entityIdSchema),
  question: nonEmptyStringSchema,
  structured_questions: z.array(structuredQuestionSchema),
  priority: expertPrioritySchema,
  priority_score: z.number().int().nonnegative(),
  priority_policy_version: z.literal(EXPERT_PRIORITY_VERSION),
  required_specialist: specialistTypeSchema,
  routing_version: z.literal(EXPERT_ROUTING_VERSION),
  status: expertWorkflowStatusSchema,
  context_package_id: entityIdSchema,
  dedup_key: nonEmptyStringSchema,
  assigned_specialist_ref: entityIdSchema.nullable(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export const checkedItemSchema = z.strictObject({
  item_id: entityIdSchema,
  subject: nonEmptyStringSchema,
  method: nonEmptyStringSchema,
  outcome: z.enum([
    "confirmed",
    "unconfirmed",
    "unable_to_verify",
    "conflicting",
  ]),
  evidence_refs: z.array(entityIdSchema),
  note: nonEmptyStringSchema.nullable(),
});

export const expertFindingSchema = z.strictObject({
  finding_id: entityIdSchema,
  category: nonEmptyStringSchema,
  severity: z.enum(["info", "attention", "important", "critical"]),
  statement: nonEmptyStringSchema,
  related_entity_ids: z.array(entityIdSchema),
  related_field: nonEmptyStringSchema.nullable(),
  evidence_refs: z.array(entityIdSchema),
  verification_effect: z.enum([
    "confirmed",
    "unconfirmed",
    "unable_to_verify",
    "conflicting",
    "none",
  ]),
});

export const expertEvidenceCandidateSchema = z.strictObject({
  evidence_candidate_id: entityIdSchema,
  evidence_type: z.literal("manual_expert"),
  entity_type: nonEmptyStringSchema,
  entity_id: entityIdSchema,
  field: nonEmptyStringSchema,
  value: z.json(),
  verification_status: verificationStatusSchema,
  checked_at: isoDateTimeSchema,
  checked_by: entityIdSchema,
  method: nonEmptyStringSchema,
  supporting_reference: nonEmptyStringSchema.nullable(),
  note: nonEmptyStringSchema.nullable(),
});

const confirmedFactSchema = z.strictObject({
  entity_id: entityIdSchema,
  field: nonEmptyStringSchema,
  value: z.json(),
  evidence_refs: z.array(entityIdSchema).min(1),
});

const unresolvedFactSchema = z.strictObject({
  entity_id: entityIdSchema,
  field: nonEmptyStringSchema,
  outcome: z.enum(["unconfirmed", "unable_to_verify"]),
  reason: nonEmptyStringSchema,
  evidence_refs: z.array(entityIdSchema),
});

const conflictResultSchema = z.strictObject({
  conflict_id: entityIdSchema,
  field: nonEmptyStringSchema,
  outcome: z.enum(["remains_open", "resolution_requested"]),
  reason: nonEmptyStringSchema,
  resolved_value: z.json(),
  evidence_refs: z.array(entityIdSchema).min(1),
});

export const choiceAssistanceResultSchema = z.strictObject({
  status: z.enum([
    "clear",
    "conditional",
    "near_tie",
    "insufficient_data",
    "no_valid_option",
  ]),
  preferred_property_id: entityIdSchema.nullable(),
  conditions: z.array(nonEmptyStringSchema),
  unresolved_questions: z.array(nonEmptyStringSchema),
});

export const expertResultSchema = z
  .strictObject({
    result_version: z.literal(EXPERT_RESULT_VERSION),
    expert_result_id: entityIdSchema,
    request_id: entityIdSchema,
    status: z.enum(["completed", "partially_completed", "unable_to_verify"]),
    checked_items: z.array(checkedItemSchema).min(1),
    findings: z.array(expertFindingSchema),
    confirmed: z.array(confirmedFactSchema),
    unconfirmed: z.array(unresolvedFactSchema),
    conflicts: z.array(conflictResultSchema),
    risks: z.array(
      z.strictObject({
        category: nonEmptyStringSchema,
        severity: z.enum(["info", "attention", "important", "critical"]),
        description: nonEmptyStringSchema,
      }),
    ),
    recommendations: z.array(nonEmptyStringSchema),
    next_actions: z.array(nonEmptyStringSchema),
    evidence_refs: z.array(entityIdSchema),
    evidence_candidates: z.array(expertEvidenceCandidateSchema),
    specialist: z.strictObject({
      specialist_ref: entityIdSchema,
      specialist_type: specialistTypeSchema,
    }),
    choice_assistance: choiceAssistanceResultSchema.nullable(),
    disclaimer: nonEmptyStringSchema.nullable(),
    completed_at: isoDateTimeSchema,
  })
  .superRefine((result, context) => {
    const availableEvidence = new Set([
      ...result.evidence_refs,
      ...result.evidence_candidates.map(
        (candidate) => candidate.evidence_candidate_id,
      ),
    ]);
    for (const checkedItem of result.checked_items)
      for (const evidenceRef of checkedItem.evidence_refs)
        if (!availableEvidence.has(evidenceRef))
          context.addIssue({
            code: "custom",
            path: ["checked_items"],
            message: "Checked item references undeclared evidence",
          });
    const referencedEvidence = [
      ...result.findings.flatMap((finding) => finding.evidence_refs),
      ...result.confirmed.flatMap((fact) => fact.evidence_refs),
      ...result.unconfirmed.flatMap((fact) => fact.evidence_refs),
      ...result.conflicts.flatMap((conflict) => conflict.evidence_refs),
    ];
    for (const evidenceRef of referencedEvidence)
      if (!availableEvidence.has(evidenceRef))
        context.addIssue({
          code: "custom",
          path: ["evidence_refs"],
          message: "Result references undeclared evidence",
        });
    if (result.status === "unable_to_verify" && result.confirmed.length > 0)
      context.addIssue({
        code: "custom",
        path: ["confirmed"],
        message: "Unable-to-verify result cannot contain confirmed facts",
      });
  });

export const expertAuditEventSchema = z.strictObject({
  event_id: entityIdSchema,
  request_id: entityIdSchema,
  event_type: z.enum([
    "request_created",
    "request_submitted",
    "request_queued",
    "request_assigned",
    "status_changed",
    "context_refreshed",
    "result_saved",
    "evidence_created",
    "canonical_update_requested",
    "recompute_requested",
  ]),
  actor_type: z.enum(["user", "system", "expert", "admin"]),
  actor_ref: entityIdSchema.nullable(),
  created_at: isoDateTimeSchema,
  metadata: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
});

export type ExpertTriggerType = z.infer<typeof expertTriggerTypeSchema>;
export type ExpertWorkflowStatus = z.infer<typeof expertWorkflowStatusSchema>;
export type ExpertPriority = z.infer<typeof expertPrioritySchema>;
export type ExpertQuestionCategory = z.infer<
  typeof expertQuestionCategorySchema
>;
export type RequestOwner = z.infer<typeof requestOwnerSchema>;
export type StructuredQuestion = z.infer<typeof structuredQuestionSchema>;
export type ExpertContextPackage = z.infer<typeof expertContextPackageSchema>;
export type ExpertRequest = z.infer<typeof expertRequestSchema>;
export type ExpertResult = z.infer<typeof expertResultSchema>;
export type ExpertAuditEvent = z.infer<typeof expertAuditEventSchema>;
export type ExpertEvidenceCandidate = z.infer<
  typeof expertEvidenceCandidateSchema
>;
export type ExpertRequestType = z.infer<typeof expertRequestTypeSchema>;
export type SpecialistType = z.infer<typeof specialistTypeSchema>;
