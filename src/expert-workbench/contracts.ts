import { z } from "zod";

import {
  entityIdSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  scoreSchema,
  verificationStatusSchema,
} from "../domain/common/schema";
import {
  choiceAssistanceResultSchema,
  expertAuditEventSchema,
  expertContextPackageSchema,
  expertEvidenceCandidateSchema,
  expertRequestSchema,
  expertResultSchema,
  requestOwnerSchema,
  specialistTypeSchema,
  type ExpertAuditEvent,
  type ExpertContextPackage,
  type ExpertRequest,
  type ExpertResult,
  type ExpertWorkflowStatus,
  type SpecialistType,
} from "../expert";

export const EXPERT_RESULT_DRAFT_VERSION = "expert-result-draft-v1" as const;
export const EXPERT_WORKBENCH_MODEL_VERSION = "expert-workbench-v1" as const;

export const expertCheckStatusSchema = z.enum([
  "checked_confirmed",
  "checked_not_confirmed",
  "checked_conflicting",
  "unable_to_check",
  "not_required",
]);

export const expertVerificationMethodSchema = z.enum([
  "source_review",
  "document_review",
  "bank_confirmation",
  "developer_confirmation",
  "seller_confirmation",
  "registry_check",
  "visual_onsite",
  "measurement",
  "expert_analysis",
  "other",
]);

export const expertFindingCategorySchema = z.enum([
  "fact",
  "financing",
  "document",
  "property_condition",
  "infrastructure",
  "transaction",
  "risk",
  "conflict",
  "other",
]);

export const expertFindingSeveritySchema = z.enum([
  "info",
  "attention",
  "important",
  "critical",
]);

export const expertVerificationEffectSchema = z.enum([
  "confirmed",
  "unconfirmed",
  "unable_to_verify",
  "conflicting",
  "none",
]);

export const expertNextActionSchema = z.enum([
  "verify_again",
  "request_document",
  "request_bank_confirmation",
  "request_developer_confirmation",
  "technical_inspection",
  "onsite_check",
  "compare_again",
  "recalculate_match",
  "no_action",
]);

export const expertWorkbenchActorSchema = z.discriminatedUnion("actor_type", [
  z.strictObject({
    actor_type: z.literal("expert"),
    actor_ref: entityIdSchema,
    specialist_type: specialistTypeSchema,
  }),
  z.strictObject({
    actor_type: z.literal("owner"),
    actor_ref: entityIdSchema,
    owner: requestOwnerSchema,
  }),
  z.strictObject({
    actor_type: z.literal("unknown"),
    actor_ref: z.null(),
  }),
]);

export const expertCheckItemDraftSchema = z.strictObject({
  item_id: entityIdSchema,
  subject: nonEmptyStringSchema,
  related_entity_id: entityIdSchema.nullable(),
  related_field: nonEmptyStringSchema.nullable(),
  status: expertCheckStatusSchema.nullable(),
  verification_method: expertVerificationMethodSchema.nullable(),
  evidence_refs: z.array(entityIdSchema),
  note: nonEmptyStringSchema.nullable(),
});

export const expertFindingDraftSchema = z.strictObject({
  finding_id: entityIdSchema,
  category: expertFindingCategorySchema,
  severity: expertFindingSeveritySchema,
  statement: nonEmptyStringSchema,
  related_entity_ids: z.array(entityIdSchema).min(1),
  related_field: nonEmptyStringSchema.nullable(),
  evidence_refs: z.array(entityIdSchema),
  verification_effect: expertVerificationEffectSchema,
  requires_technical_specialist: z.boolean(),
});

const confirmedDraftFactSchema = z.strictObject({
  entity_id: entityIdSchema,
  field: nonEmptyStringSchema,
  value: z.json(),
  evidence_refs: z.array(entityIdSchema).min(1),
});

const unresolvedDraftFactSchema = z.strictObject({
  entity_id: entityIdSchema,
  field: nonEmptyStringSchema,
  outcome: z.enum(["unconfirmed", "unable_to_verify"]),
  reason: nonEmptyStringSchema,
  evidence_refs: z.array(entityIdSchema),
});

const conflictDraftSchema = z.strictObject({
  conflict_id: entityIdSchema,
  field: nonEmptyStringSchema,
  outcome: z.enum(["remains_open", "resolution_requested"]),
  reason: nonEmptyStringSchema,
  resolved_value: z.json(),
  evidence_refs: z.array(entityIdSchema).min(1),
});

const riskDraftSchema = z.strictObject({
  category: expertFindingCategorySchema,
  severity: expertFindingSeveritySchema,
  description: nonEmptyStringSchema,
});

export const expertRecommendationDraftSchema = z.strictObject({
  statement: nonEmptyStringSchema,
  conditions: z.array(nonEmptyStringSchema),
  related_property_ids: z.array(entityIdSchema),
});

export const expertResultDraftSchema = z.strictObject({
  draft_version: z.literal(EXPERT_RESULT_DRAFT_VERSION),
  request_id: entityIdSchema,
  check_items: z.array(expertCheckItemDraftSchema).min(1),
  findings: z.array(expertFindingDraftSchema),
  confirmed: z.array(confirmedDraftFactSchema),
  unconfirmed: z.array(unresolvedDraftFactSchema),
  conflicts: z.array(conflictDraftSchema),
  risks: z.array(riskDraftSchema),
  recommendation: expertRecommendationDraftSchema.nullable(),
  next_actions: z.array(expertNextActionSchema),
  evidence_refs: z.array(entityIdSchema),
  evidence_candidates: z.array(expertEvidenceCandidateSchema),
  choice_assistance: choiceAssistanceResultSchema.nullable(),
  disclaimer: nonEmptyStringSchema.nullable(),
  unable_to_complete_reason: nonEmptyStringSchema.nullable(),
  specialist_ref: entityIdSchema,
  specialist_type: specialistTypeSchema,
  updated_at: isoDateTimeSchema,
});

export const recomputePresentationSchema = z.strictObject({
  status: z.enum(["not_required", "pending", "completed", "failed"]),
  old_match_score: scoreSchema.nullable(),
  new_match_score: scoreSchema.nullable(),
  old_data_confidence_score: scoreSchema.nullable(),
  new_data_confidence_score: scoreSchema.nullable(),
  message: nonEmptyStringSchema,
});

export interface ExpertQueueItem {
  readonly request: ExpertRequest;
  readonly submittedAt: string;
  readonly shortQuestion: string;
  readonly contextLabel: string;
}

export interface ExpertQueueViewModel {
  readonly items: readonly ExpertQueueItem[];
  readonly activeStatuses: readonly ExpertWorkflowStatus[];
}

export interface ExpertWorkbenchInput {
  readonly modelVersion: typeof EXPERT_WORKBENCH_MODEL_VERSION;
  readonly expertRequest: ExpertRequest;
  readonly contextPackage: ExpertContextPackage;
  readonly currentResultDraft: ExpertResultDraft;
  readonly auditEvents: readonly ExpertAuditEvent[];
  readonly canEdit: boolean;
  readonly canComplete: boolean;
}

export interface ExpertResultReviewInput {
  readonly request: ExpertRequest;
  readonly contextPackage: ExpertContextPackage;
  readonly result: ExpertResult | null;
  readonly auditEvents: readonly ExpertAuditEvent[];
  readonly recompute: RecomputePresentation;
}

export const validateExpertWorkbenchInput = (
  input: ExpertWorkbenchInput,
): ExpertWorkbenchInput => ({
  modelVersion: z
    .literal(EXPERT_WORKBENCH_MODEL_VERSION)
    .parse(input.modelVersion),
  expertRequest: expertRequestSchema.parse(input.expertRequest),
  contextPackage: expertContextPackageSchema.parse(input.contextPackage),
  currentResultDraft: expertResultDraftSchema.parse(input.currentResultDraft),
  auditEvents: input.auditEvents.map((event) =>
    expertAuditEventSchema.parse(event),
  ),
  canEdit: z.boolean().parse(input.canEdit),
  canComplete: z.boolean().parse(input.canComplete),
});

export const validateExpertResultReviewInput = (
  input: ExpertResultReviewInput,
): ExpertResultReviewInput => ({
  request: expertRequestSchema.parse(input.request),
  contextPackage: expertContextPackageSchema.parse(input.contextPackage),
  result: input.result ? expertResultSchema.parse(input.result) : null,
  auditEvents: input.auditEvents.map((event) =>
    expertAuditEventSchema.parse(event),
  ),
  recompute: recomputePresentationSchema.parse(input.recompute),
});

export type ExpertWorkbenchActor = z.infer<typeof expertWorkbenchActorSchema>;
export type ExpertCheckStatus = z.infer<typeof expertCheckStatusSchema>;
export type ExpertVerificationMethod = z.infer<
  typeof expertVerificationMethodSchema
>;
export type ExpertFindingCategory = z.infer<typeof expertFindingCategorySchema>;
export type ExpertFindingSeverity = z.infer<typeof expertFindingSeveritySchema>;
export type ExpertVerificationEffect = z.infer<
  typeof expertVerificationEffectSchema
>;
export type ExpertNextAction = z.infer<typeof expertNextActionSchema>;
export type ExpertCheckItemDraft = z.infer<typeof expertCheckItemDraftSchema>;
export type ExpertFindingDraft = z.infer<typeof expertFindingDraftSchema>;
export type ExpertResultDraft = z.infer<typeof expertResultDraftSchema>;
export type RecomputePresentation = z.infer<typeof recomputePresentationSchema>;
export type { ExpertWorkflowStatus, SpecialistType };

export const verificationStatusForCheck = (
  status: ExpertCheckStatus,
): z.infer<typeof verificationStatusSchema> | null => {
  if (status === "checked_confirmed") return "confirmed";
  if (status === "checked_not_confirmed") return "unconfirmed";
  if (status === "checked_conflicting") return "conflicting";
  return null;
};
