import {
  runInMemoryTransaction,
  type TransactionalRepository,
} from "../persistence";
import {
  EXPERT_RESULT_VERSION,
  expertResultSchema,
  type ExpertContextPackage,
  type ExpertRequest,
  type ExpertResult,
} from "../expert";
import {
  EXPERT_RESULT_DRAFT_VERSION,
  expertResultDraftSchema,
  type ExpertCheckStatus,
  type ExpertFindingDraft,
  type ExpertResultDraft,
} from "./contracts";

export interface ExpertResultDraftRepository extends TransactionalRepository {
  get(requestId: string): Promise<ExpertResultDraft | null>;
  save(draft: ExpertResultDraft): Promise<ExpertResultDraft>;
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryExpertResultDraftRepository implements ExpertResultDraftRepository {
  private readonly drafts = new Map<string, ExpertResultDraft>();

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return runInMemoryTransaction(work);
  }

  async get(requestId: string): Promise<ExpertResultDraft | null> {
    const draft = this.drafts.get(requestId);
    return draft ? clone(draft) : null;
  }

  async save(draft: ExpertResultDraft): Promise<ExpertResultDraft> {
    const parsed = expertResultDraftSchema.parse(draft);
    this.drafts.set(parsed.request_id, clone(parsed));
    return clone(parsed);
  }
}

const idPart = (value: string): string =>
  value
    .toLocaleLowerCase("en-US")
    .replaceAll(/[^a-z0-9:_-]+/g, "_")
    .replaceAll(/^_+|_+$/g, "") || "item";

export const buildInitialExpertResultDraft = (input: {
  readonly request: ExpertRequest;
  readonly context: ExpertContextPackage;
  readonly specialistRef: string;
  readonly updatedAt: string;
}): ExpertResultDraft => {
  const items = [
    ...input.context.structured_questions.map((question) => ({
      item_id: `check_question_${idPart(question.question_code)}`,
      subject: question.reason,
      related_entity_id: question.entity_id,
      related_field: question.field,
    })),
    ...input.context.recommended_checks.map((check) => ({
      item_id: `check_recommended_${idPart(check.check_code)}`,
      subject: check.reason,
      related_entity_id: check.entity_id,
      related_field: check.field,
    })),
    ...input.context.critical_unknowns.map((unknown, index) => ({
      item_id: `check_unknown_${index + 1}`,
      subject: unknown.reason,
      related_entity_id: unknown.entity_id,
      related_field: unknown.field,
    })),
    ...input.context.conflicts.map((conflict) => ({
      item_id: `check_conflict_${idPart(conflict.conflict_id)}`,
      subject: `Разрешить расхождение по полю ${conflict.field}`,
      related_entity_id: conflict.entity_id,
      related_field: conflict.field,
    })),
    ...(input.context.onsite_context?.items_to_check ?? []).map(
      (subject, index) => ({
        item_id: `check_onsite_${index + 1}`,
        subject,
        related_entity_id: input.request.property_ids[0] ?? null,
        related_field: null,
      }),
    ),
  ];
  const uniqueItems = [
    ...new Map(items.map((item) => [item.item_id, item])).values(),
  ];
  if (uniqueItems.length === 0)
    uniqueItems.push({
      item_id: "check_user_question",
      subject: input.context.user_question,
      related_entity_id: input.request.property_ids[0] ?? null,
      related_field: null,
    });

  return expertResultDraftSchema.parse({
    draft_version: EXPERT_RESULT_DRAFT_VERSION,
    request_id: input.request.request_id,
    check_items: uniqueItems.map((item) => ({
      ...item,
      status: null,
      verification_method: null,
      evidence_refs: [],
      note: null,
    })),
    findings: [],
    confirmed: [],
    unconfirmed: [],
    conflicts: input.context.conflicts.map((conflict) => ({
      conflict_id: conflict.conflict_id,
      field: conflict.field,
      outcome: "remains_open",
      reason: "Расхождение ещё не разрешено экспертной проверкой",
      resolved_value: null,
      evidence_refs: conflict.evidence_refs,
    })),
    risks: [],
    recommendation: null,
    next_actions: [],
    evidence_refs: [],
    evidence_candidates: [],
    choice_assistance: null,
    disclaimer:
      input.request.request_type === "document_review" ||
      input.request.request_type === "transaction_question"
        ? "Экспертный разбор в сервисе не заменяет официальное юридическое заключение, если оно требуется."
        : null,
    unable_to_complete_reason: null,
    specialist_ref: input.specialistRef,
    specialist_type: input.request.required_specialist,
    updated_at: input.updatedAt,
  });
};

export interface CompletionValidationOutcome {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const requiresEvidence = (status: ExpertCheckStatus): boolean =>
  status === "checked_confirmed" || status === "checked_conflicting";

export const validateExpertResultDraftForCompletion = (
  draft: ExpertResultDraft,
): CompletionValidationOutcome => {
  const errors: string[] = [];
  for (const item of draft.check_items) {
    if (item.status === null)
      errors.push(`CHECK_STATUS_REQUIRED:${item.item_id}`);
    if (item.status !== "not_required" && item.verification_method === null)
      errors.push(`VERIFICATION_METHOD_REQUIRED:${item.item_id}`);
    if (
      item.status !== null &&
      requiresEvidence(item.status) &&
      item.evidence_refs.length === 0
    )
      errors.push(`CHECK_EVIDENCE_REQUIRED:${item.item_id}`);
  }
  for (const finding of draft.findings)
    if (
      ["confirmed", "conflicting"].includes(finding.verification_effect) &&
      finding.evidence_refs.length === 0
    )
      errors.push(`FINDING_EVIDENCE_REQUIRED:${finding.finding_id}`);
  for (const conflict of draft.conflicts)
    if (
      conflict.outcome === "resolution_requested" &&
      conflict.resolved_value === null
    )
      errors.push(`CONFLICT_RESOLUTION_VALUE_REQUIRED:${conflict.conflict_id}`);
  if (draft.unable_to_complete_reason !== null && draft.confirmed.length > 0)
    errors.push("UNABLE_RESULT_CANNOT_CONFIRM_FACTS");
  if (
    draft.choice_assistance?.status === "conditional" &&
    draft.choice_assistance.conditions.length === 0
  )
    errors.push("CONDITIONAL_CHOICE_REQUIRES_CONDITION");
  return { valid: errors.length === 0, errors };
};

const resultOutcome = (
  status: ExpertCheckStatus,
):
  | "confirmed"
  | "unconfirmed"
  | "unable_to_verify"
  | "conflicting"
  | "not_required" => {
  if (status === "checked_confirmed") return "confirmed";
  if (status === "checked_not_confirmed") return "unconfirmed";
  if (status === "checked_conflicting") return "conflicting";
  if (status === "unable_to_check") return "unable_to_verify";
  return "not_required";
};

export const buildFinalExpertResult = (input: {
  readonly request: ExpertRequest;
  readonly draft: ExpertResultDraft;
  readonly expertResultId: string;
  readonly completedAt: string;
}): ExpertResult => {
  const validation = validateExpertResultDraftForCompletion(input.draft);
  if (!validation.valid)
    throw new Error(
      `INVALID_EXPERT_RESULT_DRAFT:${validation.errors.join(",")}`,
    );
  if (
    input.request.request_type === "choice_assistance" &&
    input.draft.choice_assistance === null
  )
    throw new Error("CHOICE_ASSISTANCE_RESULT_REQUIRED");
  if (
    input.request.request_type !== "choice_assistance" &&
    input.draft.choice_assistance !== null
  )
    throw new Error("CHOICE_RESULT_NOT_ALLOWED_FOR_REQUEST_TYPE");
  const choice = input.draft.choice_assistance;
  if (
    choice?.preferred_property_id &&
    !input.request.property_ids.includes(choice.preferred_property_id)
  )
    throw new Error("CHOICE_PREFERENCE_OUTSIDE_FINALISTS");
  if (choice?.status === "clear" && choice.preferred_property_id === null)
    throw new Error("CLEAR_CHOICE_REQUIRES_PREFERRED_PROPERTY");
  if (
    choice &&
    ["near_tie", "insufficient_data", "no_valid_option"].includes(
      choice.status,
    ) &&
    choice.preferred_property_id !== null
  )
    throw new Error("NON_WINNER_CHOICE_CANNOT_FORCE_PREFERRED_PROPERTY");
  const unable = input.draft.unable_to_complete_reason !== null;
  const partial = input.draft.check_items.some(
    (item) =>
      item.status === "unable_to_check" ||
      item.status === "checked_not_confirmed" ||
      item.status === "checked_conflicting",
  );
  const unconfirmed =
    unable &&
    !input.draft.unconfirmed.some((fact) => fact.outcome === "unable_to_verify")
      ? [
          ...input.draft.unconfirmed,
          {
            entity_id: input.request.property_ids[0]!,
            field: "expert_request",
            outcome: "unable_to_verify" as const,
            reason: input.draft.unable_to_complete_reason!,
            evidence_refs: [],
          },
        ]
      : input.draft.unconfirmed;
  return expertResultSchema.parse({
    result_version: EXPERT_RESULT_VERSION,
    expert_result_id: input.expertResultId,
    request_id: input.request.request_id,
    status: unable
      ? "unable_to_verify"
      : partial
        ? "partially_completed"
        : "completed",
    checked_items: input.draft.check_items.map((item) => ({
      item_id: item.item_id,
      subject: item.subject,
      method: item.verification_method ?? "other",
      outcome: resultOutcome(item.status!),
      evidence_refs: item.evidence_refs,
      note: item.note,
    })),
    findings: input.draft.findings.map((finding) => ({
      finding_id: finding.finding_id,
      category: finding.category,
      severity: finding.severity,
      statement: finding.statement,
      related_entity_ids: finding.related_entity_ids,
      related_field: finding.related_field,
      evidence_refs: finding.evidence_refs,
      verification_effect: finding.verification_effect,
    })),
    confirmed: unable ? [] : input.draft.confirmed,
    unconfirmed,
    conflicts: input.draft.conflicts,
    risks: input.draft.risks,
    recommendations: input.draft.recommendation
      ? [
          input.draft.recommendation.statement,
          ...input.draft.recommendation.conditions,
        ]
      : [],
    next_actions: input.draft.next_actions,
    evidence_refs: input.draft.evidence_refs,
    evidence_candidates: input.draft.evidence_candidates,
    specialist: {
      specialist_ref: input.draft.specialist_ref,
      specialist_type: input.draft.specialist_type,
    },
    choice_assistance: input.draft.choice_assistance,
    disclaimer: input.draft.disclaimer,
    completed_at: input.completedAt,
  });
};

export const addFindingToDraft = (
  draft: ExpertResultDraft,
  finding: ExpertFindingDraft,
  updatedAt: string,
): ExpertResultDraft =>
  expertResultDraftSchema.parse({
    ...draft,
    findings: [...draft.findings, finding],
    updated_at: updatedAt,
  });
