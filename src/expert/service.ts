import {
  EXPERT_REQUEST_SCHEMA_VERSION,
  expertAuditEventSchema,
  expertRequestSchema,
  type ExpertAuditEvent,
  type ExpertQuestionCategory,
  type ExpertRequest,
  type ExpertRequestType,
  type ExpertTriggerType,
  type ExpertWorkflowStatus,
  type RequestOwner,
  type SpecialistType,
  type StructuredQuestion,
} from "./contracts";
import {
  buildExpertContextPackage,
  type ExpertContextBuildInput,
} from "./context-builder";
import { createExpertRequestDedupKey } from "./dedup";
import { calculateExpertPriority, type ExpertPriorityInput } from "./priority";
import type { ExpertRequestRepository } from "./repository";
import { routeExpertRequest, validateSpecialistRoute } from "./routing";

export type ExpertIdKind =
  "request" | "context" | "audit" | "result" | "canonical_update" | "recompute";

export type ExpertIdFactory = (kind: ExpertIdKind) => string;
export type ExpertClock = () => string;

export const createSequentialExpertIdFactory = (
  namespace = "expert",
): ExpertIdFactory => {
  let sequence = 0;
  return (kind) => `${namespace}_${kind}_${++sequence}`;
};

export interface ExpertContextAccessPolicy {
  canAccess(input: {
    readonly owner: RequestOwner;
    readonly entityType:
      | "user_request"
      | "property"
      | "offer"
      | "purchase_scenario"
      | "comparison"
      | "document";
    readonly entityId: string;
  }): boolean;
}

export interface ExpertAssignmentHook {
  onAssigned(input: {
    readonly requestId: string;
    readonly specialistRef: string;
    readonly specialistType: SpecialistType;
    readonly assignedAt: string;
  }): void | Promise<void>;
}

type ContextPayload = Omit<
  ExpertContextBuildInput,
  | "contextPackageId"
  | "expertRequestId"
  | "requestType"
  | "questionCategory"
  | "userQuestion"
  | "structuredQuestions"
  | "createdAt"
>;

export interface CreateExpertRequestInput {
  readonly owner: RequestOwner;
  readonly requestType: ExpertRequestType;
  readonly triggerType: ExpertTriggerType;
  readonly questionCategory: ExpertQuestionCategory;
  readonly comparisonId: string | null;
  readonly question: string;
  readonly structuredQuestions: readonly StructuredQuestion[];
  readonly priority: Omit<ExpertPriorityInput, "calculatedAt">;
  readonly context: ContextPayload;
}

export interface CreateExpertRequestOutcome {
  readonly request: ExpertRequest;
  readonly created: boolean;
}

const assertMeaningfulQuestion = (question: string): void => {
  const normalized = question.trim().toLocaleLowerCase("ru-RU");
  if (normalized.length < 10 || normalized.split(/\s+/).length < 2)
    throw new Error("EXPERT_QUESTION_REQUIRED");
  if (["свяжитесь со мной", "позвоните мне", "contact me"].includes(normalized))
    throw new Error("EMPTY_EXPERT_LEAD_NOT_ALLOWED");
};

const auditMetadata = (
  values: Readonly<Record<string, string | number | boolean | null>>,
) => values;

export class ExpertRequestService {
  constructor(
    private readonly repository: ExpertRequestRepository,
    private readonly accessPolicy: ExpertContextAccessPolicy,
    private readonly assignmentHook: ExpertAssignmentHook,
    private readonly createId: ExpertIdFactory,
    private readonly clock: ExpertClock,
  ) {}

  createDraft(input: CreateExpertRequestInput): CreateExpertRequestOutcome {
    assertMeaningfulQuestion(input.question);
    const createdAt = this.clock();
    const requestId = this.createId("request");
    const contextPackageId = this.createId("context");
    const propertyIds = input.context.properties.map(
      (property) => property.identity.property_id,
    );
    const offerIds = input.context.selectedOffers.map(
      (offer) => offer.offer_id,
    );
    const scenarioIds = input.context.selectedPurchaseScenarios.map(
      (scenario) => scenario.scenario_id,
    );
    this.validateReferences(input, propertyIds, offerIds, scenarioIds);
    const routing = routeExpertRequest({
      requestType: input.requestType,
      triggerType: input.triggerType,
      questionCategory: input.questionCategory,
    });
    const priority = calculateExpertPriority({
      ...input.priority,
      calculatedAt: createdAt,
    });
    const dedupKey = createExpertRequestDedupKey({
      owner: input.owner,
      requestType: input.requestType,
      propertyIds,
      offerIds,
      purchaseScenarioIds: scenarioIds,
      comparisonId: input.comparisonId,
      question: input.question,
      structuredQuestions: input.structuredQuestions,
    });
    const request = expertRequestSchema.parse({
      request_schema_version: EXPERT_REQUEST_SCHEMA_VERSION,
      request_id: requestId,
      owner: input.owner,
      request_type: input.requestType,
      trigger_type: input.triggerType,
      question_category: input.questionCategory,
      user_request_id: input.context.userRequest.user_request_id,
      property_ids: propertyIds,
      offer_ids: offerIds,
      purchase_scenario_ids: scenarioIds,
      comparison_id: input.comparisonId,
      document_refs: input.context.documentRefs,
      question: input.question,
      structured_questions: input.structuredQuestions,
      priority: priority.priority,
      priority_score: priority.score,
      priority_policy_version: priority.policyVersion,
      required_specialist: routing.specialistType,
      routing_version: routing.routingVersion,
      status: "draft",
      context_package_id: contextPackageId,
      dedup_key: dedupKey,
      assigned_specialist_ref: null,
      created_at: createdAt,
      updated_at: createdAt,
    });
    const contextPackage = buildExpertContextPackage({
      ...input.context,
      contextPackageId,
      expertRequestId: requestId,
      requestType: input.requestType,
      questionCategory: input.questionCategory,
      userQuestion: input.question,
      structuredQuestions: input.structuredQuestions,
      createdAt,
    });
    const outcome = this.repository.create(request, contextPackage);
    if (outcome.created)
      this.appendAudit(outcome.request.request_id, {
        event_type: "request_created",
        actor_type: "user",
        actor_ref: input.owner.owner_id,
        metadata: auditMetadata({
          request_type: input.requestType,
          trigger_type: input.triggerType,
          required_specialist: routing.specialistType,
          priority: priority.priority,
        }),
      });
    return outcome;
  }

  submit(requestId: string, owner: RequestOwner): ExpertRequest {
    const current = this.requireOwnedRequest(requestId, owner);
    if (!this.repository.getContext(current.context_package_id))
      throw new Error("EXPERT_CONTEXT_NOT_FOUND");
    const submittedAt = this.clock();
    const submitted = this.repository.updateStatus(
      requestId,
      "submitted",
      submittedAt,
    );
    this.appendAudit(requestId, {
      event_type: "request_submitted",
      actor_type: "user",
      actor_ref: owner.owner_id,
      metadata: auditMetadata({ status: submitted.status }),
    });
    const queuedAt = this.clock();
    const queued = this.repository.updateStatus(requestId, "queued", queuedAt);
    this.appendAudit(requestId, {
      event_type: "request_queued",
      actor_type: "system",
      actor_ref: null,
      metadata: auditMetadata({ priority: queued.priority }),
    });
    return queued;
  }

  async assignExpertRequest(input: {
    readonly requestId: string;
    readonly specialistRef: string;
    readonly specialistType: SpecialistType;
  }): Promise<ExpertRequest> {
    const request = this.requireRequest(input.requestId);
    validateSpecialistRoute(request.request_type, input.specialistType);
    if (request.required_specialist !== input.specialistType)
      throw new Error("ASSIGNED_SPECIALIST_DOES_NOT_MATCH_ROUTE");
    const assignedAt = this.clock();
    const assigned = this.repository.assign(
      input.requestId,
      input.specialistRef,
      assignedAt,
    );
    await this.assignmentHook.onAssigned({
      requestId: input.requestId,
      specialistRef: input.specialistRef,
      specialistType: input.specialistType,
      assignedAt,
    });
    this.appendAudit(input.requestId, {
      event_type: "request_assigned",
      actor_type: "system",
      actor_ref: null,
      metadata: auditMetadata({
        specialist_type: input.specialistType,
        specialist_ref: input.specialistRef,
      }),
    });
    return assigned;
  }

  transition(input: {
    readonly requestId: string;
    readonly status: ExpertWorkflowStatus;
    readonly actorType: "user" | "system" | "expert" | "admin";
    readonly actorRef: string | null;
    readonly reasonCode: string;
  }): ExpertRequest {
    const updated = this.repository.updateStatus(
      input.requestId,
      input.status,
      this.clock(),
    );
    this.appendAudit(input.requestId, {
      event_type: "status_changed",
      actor_type: input.actorType,
      actor_ref: input.actorRef,
      metadata: auditMetadata({
        status: input.status,
        reason_code: input.reasonCode,
      }),
    });
    return updated;
  }

  cancel(requestId: string, owner: RequestOwner): ExpertRequest {
    this.requireOwnedRequest(requestId, owner);
    return this.transition({
      requestId,
      status: "cancelled",
      actorType: "user",
      actorRef: owner.owner_id,
      reasonCode: "USER_CANCELLED",
    });
  }

  private validateReferences(
    input: CreateExpertRequestInput,
    propertyIds: readonly string[],
    offerIds: readonly string[],
    scenarioIds: readonly string[],
  ): void {
    if (new Set(propertyIds).size !== propertyIds.length)
      throw new Error("DUPLICATE_PROPERTY_REFERENCE");
    if (input.requestType === "choice_assistance" && !input.comparisonId)
      throw new Error("CHOICE_ASSISTANCE_REQUIRES_COMPARISON");
    const propertySet = new Set(propertyIds);
    const offerSet = new Set(offerIds);
    const scenarioSet = new Set(scenarioIds);
    for (const offer of input.context.selectedOffers)
      if (!propertySet.has(offer.property_id))
        throw new Error("OFFER_PROPERTY_REFERENCE_NOT_FOUND");
    for (const scenario of input.context.selectedPurchaseScenarios)
      if (
        !propertySet.has(scenario.property_id) ||
        !offerSet.has(scenario.offer_id)
      )
        throw new Error("SCENARIO_REFERENCE_NOT_FOUND");
    for (const matchResult of input.context.matchResults)
      if (
        !propertySet.has(matchResult.property_id) ||
        matchResult.user_request_id !==
          input.context.userRequest.user_request_id ||
        (matchResult.purchase_scenario_id !== null &&
          !scenarioSet.has(matchResult.purchase_scenario_id))
      )
        throw new Error("MATCH_RESULT_REFERENCE_NOT_FOUND");
    for (const dataQuality of input.context.dataQuality)
      if (!propertySet.has(dataQuality.propertyId))
        throw new Error("DATA_QUALITY_REFERENCE_NOT_FOUND");
    const contextualEntityIds = new Set([
      ...propertySet,
      ...offerSet,
      ...scenarioSet,
    ]);
    for (const item of [
      ...input.context.criticalUnknowns,
      ...input.context.recommendedChecks,
      ...input.context.conflicts.map((conflict) => ({
        entityId: conflict.entity_id,
      })),
    ])
      if (!contextualEntityIds.has(item.entityId))
        throw new Error("CONTEXT_ITEM_REFERENCE_NOT_FOUND");
    for (const question of input.structuredQuestions)
      if (
        question.entity_id !== null &&
        !contextualEntityIds.has(question.entity_id)
      )
        throw new Error("STRUCTURED_QUESTION_REFERENCE_NOT_FOUND");
    const refs: Array<{
      entityType:
        | "user_request"
        | "property"
        | "offer"
        | "purchase_scenario"
        | "comparison"
        | "document";
      entityId: string;
    }> = [
      {
        entityType: "user_request",
        entityId: input.context.userRequest.user_request_id,
      },
      ...propertyIds.map((entityId) => ({
        entityType: "property" as const,
        entityId,
      })),
      ...offerIds.map((entityId) => ({
        entityType: "offer" as const,
        entityId,
      })),
      ...scenarioIds.map((entityId) => ({
        entityType: "purchase_scenario" as const,
        entityId,
      })),
      ...input.context.documentRefs.map((entityId) => ({
        entityType: "document" as const,
        entityId,
      })),
    ];
    if (input.comparisonId)
      refs.push({ entityType: "comparison", entityId: input.comparisonId });
    for (const ref of refs)
      if (!this.accessPolicy.canAccess({ owner: input.owner, ...ref }))
        throw new Error(`CONTEXT_ACCESS_DENIED:${ref.entityType}`);
  }

  private requireRequest(requestId: string): ExpertRequest {
    const request = this.repository.get(requestId);
    if (!request) throw new Error("EXPERT_REQUEST_NOT_FOUND");
    return request;
  }

  private requireOwnedRequest(
    requestId: string,
    owner: RequestOwner,
  ): ExpertRequest {
    const request = this.requireRequest(requestId);
    if (
      request.owner.owner_type !== owner.owner_type ||
      request.owner.owner_id !== owner.owner_id
    )
      throw new Error("EXPERT_REQUEST_ACCESS_DENIED");
    return request;
  }

  private appendAudit(
    requestId: string,
    input: Omit<ExpertAuditEvent, "event_id" | "request_id" | "created_at">,
  ): void {
    this.repository.appendAudit(
      expertAuditEventSchema.parse({
        event_id: this.createId("audit"),
        request_id: requestId,
        created_at: this.clock(),
        ...input,
      }),
    );
  }
}
