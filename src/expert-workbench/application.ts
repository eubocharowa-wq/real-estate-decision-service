import {
  expertAuditEventSchema,
  type CompleteExpertRequestOutcome,
  type ExpertAuditEvent,
  type ExpertCompletionService,
  type ExpertIdFactory,
  type ExpertRequest,
  type ExpertRequestRepository,
  type ExpertRequestService,
} from "../expert";
import {
  EXPERT_WORKBENCH_MODEL_VERSION,
  expertFindingDraftSchema,
  expertResultDraftSchema,
  type ExpertCheckItemDraft,
  type ExpertFindingDraft,
  type ExpertQueueViewModel,
  type ExpertResultDraft,
  type ExpertResultReviewInput,
  type ExpertWorkbenchActor,
  type ExpertWorkbenchInput,
  type RecomputePresentation,
  validateExpertResultReviewInput,
  validateExpertWorkbenchInput,
} from "./contracts";
import {
  addFindingToDraft,
  buildFinalExpertResult,
  buildInitialExpertResultDraft,
  type ExpertResultDraftRepository,
} from "./draft";
import type { ExpertWorkbenchPermissionPolicy } from "./permissions";

const ACTIVE_QUEUE_STATUSES = [
  "queued",
  "assigned",
  "in_progress",
  "waiting_for_user",
  "waiting_for_external_info",
] as const;

const priorityRank = Object.freeze({
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
});

const shortQuestion = (question: string): string =>
  question.length <= 96 ? question : `${question.slice(0, 93).trimEnd()}…`;

const contextLabel = (request: ExpertRequest): string =>
  request.comparison_id
    ? `Сравнение ${request.comparison_id} · ${request.property_ids.length} объекта`
    : request.property_ids.length === 1
      ? `Объект ${request.property_ids[0]}`
      : `${request.property_ids.length} объекта`;

const unique = (values: readonly string[]): string[] => [...new Set(values)];

export class ExpertWorkbenchApplicationService {
  private readonly recomputeByRequest = new Map<
    string,
    RecomputePresentation
  >();

  constructor(
    private readonly repository: ExpertRequestRepository,
    private readonly drafts: ExpertResultDraftRepository,
    private readonly requestService: ExpertRequestService,
    private readonly completionService: ExpertCompletionService,
    private readonly permissions: ExpertWorkbenchPermissionPolicy,
    private readonly createId: ExpertIdFactory,
    private readonly clock: () => string,
  ) {}

  async listActiveQueue(
    actor: ExpertWorkbenchActor,
  ): Promise<ExpertQueueViewModel> {
    if (actor.actor_type !== "expert")
      throw new Error("EXPERT_QUEUE_ACCESS_DENIED");
    const visible = (await this.repository.listAll())
      .filter((request) =>
        ACTIVE_QUEUE_STATUSES.includes(request.status as never),
      )
      .filter((request) =>
        this.permissions.canViewExpertRequest(actor, request),
      );
    const items = (
      await Promise.all(
        visible.map(async (request) => {
          const submittedAt =
            (await this.repository.listAudit(request.request_id)).find(
              (event) => event.event_type === "request_submitted",
            )?.created_at ?? request.created_at;
          return {
            request,
            submittedAt,
            shortQuestion: shortQuestion(request.question),
            contextLabel: contextLabel(request),
          };
        }),
      )
    ).sort(
      (left, right) =>
        priorityRank[right.request.priority] -
          priorityRank[left.request.priority] ||
        left.submittedAt.localeCompare(right.submittedAt) ||
        left.request.request_id.localeCompare(right.request.request_id),
    );
    return { items, activeStatuses: ACTIVE_QUEUE_STATUSES };
  }

  async claimRequest(
    actor: ExpertWorkbenchActor,
    requestId: string,
  ): Promise<ExpertRequest> {
    const request = await this.requireRequest(requestId);
    if (
      actor.actor_type !== "expert" ||
      request.status !== "queued" ||
      !this.permissions.canViewExpertRequest(actor, request)
    )
      throw new Error("EXPERT_REQUEST_ASSIGNMENT_DENIED");
    return this.requestService.assignExpertRequest({
      requestId,
      specialistRef: actor.actor_ref,
      specialistType: actor.specialist_type,
    });
  }

  async openWorkbench(
    actor: ExpertWorkbenchActor,
    requestId: string,
  ): Promise<ExpertWorkbenchInput> {
    const request = await this.requireRequest(requestId);
    if (
      actor.actor_type !== "expert" ||
      !this.permissions.canViewExpertRequest(actor, request)
    )
      throw new Error("EXPERT_WORKBENCH_ACCESS_DENIED");
    const contextPackage = await this.repository.getContext(
      request.context_package_id,
    );
    if (!contextPackage) throw new Error("EXPERT_CONTEXT_NOT_FOUND");
    const storedDraft = await this.drafts.get(requestId);
    const currentResultDraft =
      storedDraft ??
      buildInitialExpertResultDraft({
        request,
        context: contextPackage,
        specialistRef: request.assigned_specialist_ref ?? actor.actor_ref,
        updatedAt: this.clock(),
      });
    if (!storedDraft) await this.drafts.save(currentResultDraft);
    await this.appendActivity(requestId, {
      event_type: "expert_workbench_opened",
      actor_type: "expert",
      actor_ref: actor.actor_ref,
      metadata: { status: request.status },
    });
    return validateExpertWorkbenchInput({
      modelVersion: EXPERT_WORKBENCH_MODEL_VERSION,
      expertRequest: request,
      contextPackage,
      currentResultDraft,
      auditEvents: await this.repository.listAudit(requestId),
      canEdit: this.permissions.canEditExpertRequest(actor, request),
      canComplete: this.permissions.canCompleteExpertRequest(actor, request),
    });
  }

  async updateCheckItem(input: {
    readonly actor: ExpertWorkbenchActor;
    readonly requestId: string;
    readonly item: ExpertCheckItemDraft;
  }): Promise<ExpertResultDraft> {
    const request = await this.requireEditable(input.actor, input.requestId);
    const draft = await this.requireDraft(request);
    const index = draft.check_items.findIndex(
      (item) => item.item_id === input.item.item_id,
    );
    if (index < 0) throw new Error("EXPERT_CHECK_ITEM_NOT_FOUND");
    const original = draft.check_items[index]!;
    if (
      input.item.subject !== original.subject ||
      input.item.related_entity_id !== original.related_entity_id ||
      input.item.related_field !== original.related_field
    )
      throw new Error("EXPERT_CHECK_PLAN_IS_IMMUTABLE");
    const checkItems = [...draft.check_items];
    checkItems[index] = input.item;
    const updated = await this.drafts.save({
      ...draft,
      check_items: checkItems,
      updated_at: this.clock(),
    });
    await this.appendActivity(request.request_id, {
      event_type: "check_item_updated",
      actor_type: "expert",
      actor_ref:
        input.actor.actor_type === "expert" ? input.actor.actor_ref : null,
      metadata: {
        item_id: input.item.item_id,
        status: input.item.status,
      },
    });
    return updated;
  }

  async addFinding(input: {
    readonly actor: ExpertWorkbenchActor;
    readonly requestId: string;
    readonly finding: ExpertFindingDraft;
  }): Promise<ExpertResultDraft> {
    const request = await this.requireEditable(input.actor, input.requestId);
    const context = await this.repository.getContext(
      request.context_package_id,
    );
    if (!context) throw new Error("EXPERT_CONTEXT_NOT_FOUND");
    const finding = expertFindingDraftSchema.parse(input.finding);
    const contextualIds = new Set([
      ...request.property_ids,
      ...request.offer_ids,
      ...request.purchase_scenario_ids,
    ]);
    if (finding.related_entity_ids.some((id) => !contextualIds.has(id)))
      throw new Error("FINDING_ENTITY_OUTSIDE_CONTEXT");
    const updated = await this.drafts.save(
      addFindingToDraft(
        await this.requireDraft(request),
        finding,
        this.clock(),
      ),
    );
    await this.appendActivity(request.request_id, {
      event_type: "finding_added",
      actor_type: "expert",
      actor_ref:
        input.actor.actor_type === "expert" ? input.actor.actor_ref : null,
      metadata: {
        finding_id: finding.finding_id,
        category: finding.category,
        severity: finding.severity,
      },
    });
    return updated;
  }

  async saveDraft(input: {
    readonly actor: ExpertWorkbenchActor;
    readonly requestId: string;
    readonly draft: ExpertResultDraft;
  }): Promise<ExpertResultDraft> {
    const request = await this.requireEditable(input.actor, input.requestId);
    const draft = expertResultDraftSchema.parse(input.draft);
    if (
      draft.request_id !== request.request_id ||
      draft.specialist_ref !== request.assigned_specialist_ref ||
      draft.specialist_type !== request.required_specialist
    )
      throw new Error("EXPERT_DRAFT_ASSIGNMENT_MISMATCH");
    const original = await this.requireDraft(request);
    const originalChecks = new Map(
      original.check_items.map((item) => [item.item_id, item]),
    );
    if (
      draft.check_items.length !== original.check_items.length ||
      draft.check_items.some((item) => {
        const expected = originalChecks.get(item.item_id);
        return (
          !expected ||
          item.subject !== expected.subject ||
          item.related_entity_id !== expected.related_entity_id ||
          item.related_field !== expected.related_field
        );
      })
    )
      throw new Error("EXPERT_CHECK_PLAN_IS_IMMUTABLE");
    const contextualIds = new Set([
      ...request.property_ids,
      ...request.offer_ids,
      ...request.purchase_scenario_ids,
    ]);
    const referencedEntityIds = [
      ...draft.findings.flatMap((finding) => finding.related_entity_ids),
      ...draft.confirmed.map((fact) => fact.entity_id),
      ...draft.unconfirmed.map((fact) => fact.entity_id),
    ];
    if (referencedEntityIds.some((id) => !contextualIds.has(id)))
      throw new Error("EXPERT_DRAFT_ENTITY_OUTSIDE_CONTEXT");
    const context = await this.repository.getContext(
      request.context_package_id,
    );
    if (!context) throw new Error("EXPERT_CONTEXT_NOT_FOUND");
    const contextualConflicts = new Map(
      context.conflicts.map((conflict) => [conflict.conflict_id, conflict]),
    );
    if (
      context.conflicts.some(
        (conflict) =>
          !draft.conflicts.some(
            (candidate) =>
              candidate.conflict_id === conflict.conflict_id &&
              candidate.field === conflict.field,
          ),
      ) ||
      draft.conflicts.some((conflict) => {
        if (conflict.outcome !== "resolution_requested") return false;
        const expected = contextualConflicts.get(conflict.conflict_id);
        return !expected || expected.field !== conflict.field;
      })
    )
      throw new Error("EXPERT_CONFLICT_OUTSIDE_SAVED_CONTEXT");
    return this.drafts.save({ ...draft, updated_at: this.clock() });
  }

  async transition(input: {
    readonly actor: ExpertWorkbenchActor;
    readonly requestId: string;
    readonly status:
      "in_progress" | "waiting_for_user" | "waiting_for_external_info";
    readonly reasonCode: string;
  }): Promise<ExpertRequest> {
    const request = await this.requireRequest(input.requestId);
    if (
      actorRef(input.actor) !== request.assigned_specialist_ref ||
      !this.permissions.canEditExpertRequest(input.actor, request)
    )
      throw new Error("EXPERT_REQUEST_EDIT_DENIED");
    return this.requestService.transition({
      requestId: input.requestId,
      status: input.status,
      actorType: "expert",
      actorRef: actorRef(input.actor),
      reasonCode: input.reasonCode,
    });
  }

  async complete(input: {
    readonly actor: ExpertWorkbenchActor;
    readonly requestId: string;
  }): Promise<CompleteExpertRequestOutcome> {
    const request = await this.requireRequest(input.requestId);
    if (!this.permissions.canCompleteExpertRequest(input.actor, request))
      throw new Error("EXPERT_REQUEST_COMPLETION_DENIED");
    const context = await this.repository.getContext(
      request.context_package_id,
    );
    if (!context) throw new Error("EXPERT_CONTEXT_NOT_FOUND");
    const oldMatch = context.match_results[0]?.match_score ?? null;
    const oldConfidence =
      context.data_quality[0]?.data_confidence_score ?? null;
    const result = buildFinalExpertResult({
      request,
      draft: mergeEvidenceRefs(await this.requireDraft(request)),
      expertResultId: this.createId("result"),
      completedAt: this.clock(),
    });
    const outcome = await this.completionService.complete(result);
    const recompute: RecomputePresentation =
      outcome.recomputeStatus === "failed"
        ? {
            status: "failed",
            old_match_score: oldMatch,
            new_match_score: null,
            old_data_confidence_score: oldConfidence,
            new_data_confidence_score: null,
            message: "Проверка сохранена, но пересчёт данных пока не выполнен.",
          }
        : outcome.recomputeStatus === "completed"
          ? {
              status: "pending",
              old_match_score: oldMatch,
              new_match_score: null,
              old_data_confidence_score: oldConfidence,
              new_data_confidence_score: null,
              message:
                "Проверка сохранена. Пересчёт соответствия и качества данных запрошен.",
            }
          : {
              status: "not_required",
              old_match_score: oldMatch,
              new_match_score: null,
              old_data_confidence_score: oldConfidence,
              new_data_confidence_score: null,
              message:
                "Проверка не создала фактических изменений для пересчёта.",
            };
    this.recomputeByRequest.set(request.request_id, recompute);
    return outcome;
  }

  async openResultReview(
    actor: ExpertWorkbenchActor,
    requestId: string,
  ): Promise<ExpertResultReviewInput> {
    const request = await this.requireRequest(requestId);
    if (
      actor.actor_type !== "owner" ||
      !this.permissions.canViewExpertRequest(actor, request)
    )
      throw new Error("EXPERT_RESULT_ACCESS_DENIED");
    const contextPackage = await this.repository.getContext(
      request.context_package_id,
    );
    if (!contextPackage) throw new Error("EXPERT_CONTEXT_NOT_FOUND");
    await this.appendActivity(requestId, {
      event_type: "result_viewed_by_user",
      actor_type: "user",
      actor_ref: actor.actor_ref,
      metadata: { status: request.status },
    });
    return validateExpertResultReviewInput({
      request,
      contextPackage,
      result: await this.repository.getResult(requestId),
      auditEvents: await this.repository.listAudit(requestId),
      recompute:
        this.recomputeByRequest.get(requestId) ??
        defaultRecomputePresentation(contextPackage),
    });
  }

  buildTechnicalEscalationHref(input: ExpertResultReviewInput): string | null {
    if (
      !input.result?.findings.some(
        (finding) =>
          finding.category === "property_condition" &&
          finding.severity === "critical",
      )
    )
      return null;
    const params = new URLSearchParams({
      type: "onsite_check",
      onsite_scope: "structural_engineering",
      property: input.request.property_ids[0] ?? "",
      request: input.request.user_request_id,
      check: "technical_specialist_escalation",
    });
    return `/expert/request?${params.toString()}`;
  }

  private async requireRequest(requestId: string): Promise<ExpertRequest> {
    const request = await this.repository.get(requestId);
    if (!request) throw new Error("EXPERT_REQUEST_NOT_FOUND");
    return request;
  }

  private async requireEditable(
    actor: ExpertWorkbenchActor,
    requestId: string,
  ): Promise<ExpertRequest> {
    const request = await this.requireRequest(requestId);
    if (!this.permissions.canEditExpertRequest(actor, request))
      throw new Error("EXPERT_REQUEST_EDIT_DENIED");
    return request;
  }

  private async requireDraft(
    request: ExpertRequest,
  ): Promise<ExpertResultDraft> {
    const draft = await this.drafts.get(request.request_id);
    if (!draft) throw new Error("EXPERT_RESULT_DRAFT_NOT_FOUND");
    return draft;
  }

  private async appendActivity(
    requestId: string,
    input: Omit<ExpertAuditEvent, "event_id" | "request_id" | "created_at">,
  ): Promise<void> {
    await this.repository.appendAudit(
      expertAuditEventSchema.parse({
        event_id: this.createId("audit"),
        request_id: requestId,
        created_at: this.clock(),
        ...input,
      }),
    );
  }
}

const actorRef = (actor: ExpertWorkbenchActor): string | null =>
  actor.actor_type === "unknown" ? null : actor.actor_ref;

const defaultRecomputePresentation = (
  context: ExpertResultReviewInput["contextPackage"],
): RecomputePresentation => ({
  status: "not_required",
  old_match_score: context.match_results[0]?.match_score ?? null,
  new_match_score: null,
  old_data_confidence_score:
    context.data_quality[0]?.data_confidence_score ?? null,
  new_data_confidence_score: null,
  message: "Новых подтверждённых данных для пересчёта пока нет.",
});

export const mergeEvidenceRefs = (
  draft: ExpertResultDraft,
): ExpertResultDraft =>
  expertResultDraftSchema.parse({
    ...draft,
    evidence_refs: unique([
      ...draft.evidence_refs,
      ...draft.check_items.flatMap((item) => item.evidence_refs),
      ...draft.findings.flatMap((finding) => finding.evidence_refs),
      ...draft.confirmed.flatMap((fact) => fact.evidence_refs),
      ...draft.unconfirmed.flatMap((fact) => fact.evidence_refs),
      ...draft.conflicts.flatMap((conflict) => conflict.evidence_refs),
    ]),
  });
