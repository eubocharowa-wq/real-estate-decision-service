import type {
  ExpertAuditEvent,
  ExpertContextPackage,
  ExpertPriority,
  ExpertRequest,
  ExpertResult,
  ExpertWorkflowStatus,
} from "./contracts";
import { assertExpertRequestTransition } from "./state-machine";

export interface RepositoryCreateExpertRequestOutcome {
  readonly request: ExpertRequest;
  readonly created: boolean;
}

export interface ExpertRequestRepository {
  create(
    request: ExpertRequest,
    contextPackage: ExpertContextPackage,
  ): RepositoryCreateExpertRequestOutcome;
  get(requestId: string): ExpertRequest | null;
  getContext(contextPackageId: string): ExpertContextPackage | null;
  findActiveByDedupKey(dedupKey: string): ExpertRequest | null;
  listAll(): readonly ExpertRequest[];
  listQueued(): readonly ExpertRequest[];
  updateStatus(
    requestId: string,
    status: ExpertWorkflowStatus,
    updatedAt: string,
  ): ExpertRequest;
  assign(
    requestId: string,
    specialistRef: string,
    updatedAt: string,
  ): ExpertRequest;
  replaceContext(
    requestId: string,
    contextPackage: ExpertContextPackage,
    updatedAt: string,
  ): ExpertRequest;
  saveResult(result: ExpertResult): void;
  getResult(requestId: string): ExpertResult | null;
  appendAudit(event: ExpertAuditEvent): void;
  listAudit(requestId: string): readonly ExpertAuditEvent[];
}

const activeStatuses: ReadonlySet<ExpertWorkflowStatus> = new Set([
  "draft",
  "submitted",
  "queued",
  "assigned",
  "in_progress",
  "waiting_for_user",
  "waiting_for_external_info",
]);

const priorityRank: Readonly<Record<ExpertPriority, number>> = Object.freeze({
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
});

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryExpertRequestRepository implements ExpertRequestRepository {
  private readonly requests = new Map<string, ExpertRequest>();
  private readonly contexts = new Map<string, ExpertContextPackage>();
  private readonly results = new Map<string, ExpertResult>();
  private readonly audit = new Map<string, ExpertAuditEvent[]>();

  create(
    request: ExpertRequest,
    contextPackage: ExpertContextPackage,
  ): RepositoryCreateExpertRequestOutcome {
    const duplicate = this.findActiveByDedupKey(request.dedup_key);
    if (duplicate) return { request: duplicate, created: false };
    if (this.requests.has(request.request_id))
      throw new Error("EXPERT_REQUEST_ALREADY_EXISTS");
    if (this.contexts.has(contextPackage.context_package_id))
      throw new Error("EXPERT_CONTEXT_ALREADY_EXISTS");
    this.requests.set(request.request_id, clone(request));
    this.contexts.set(contextPackage.context_package_id, clone(contextPackage));
    return { request: clone(request), created: true };
  }

  get(requestId: string): ExpertRequest | null {
    const request = this.requests.get(requestId);
    return request ? clone(request) : null;
  }

  getContext(contextPackageId: string): ExpertContextPackage | null {
    const contextPackage = this.contexts.get(contextPackageId);
    return contextPackage ? clone(contextPackage) : null;
  }

  findActiveByDedupKey(dedupKey: string): ExpertRequest | null {
    const request = [...this.requests.values()].find(
      (candidate) =>
        candidate.dedup_key === dedupKey &&
        activeStatuses.has(candidate.status),
    );
    return request ? clone(request) : null;
  }

  listAll(): readonly ExpertRequest[] {
    return [...this.requests.values()].map(clone);
  }

  listQueued(): readonly ExpertRequest[] {
    return [...this.requests.values()]
      .filter((request) => request.status === "queued")
      .sort(
        (left, right) =>
          priorityRank[right.priority] - priorityRank[left.priority] ||
          right.priority_score - left.priority_score ||
          left.created_at.localeCompare(right.created_at) ||
          left.request_id.localeCompare(right.request_id),
      )
      .map(clone);
  }

  updateStatus(
    requestId: string,
    status: ExpertWorkflowStatus,
    updatedAt: string,
  ): ExpertRequest {
    const request = this.requireRequest(requestId);
    assertExpertRequestTransition(request.status, status);
    const updated = { ...request, status, updated_at: updatedAt };
    this.requests.set(requestId, updated);
    return clone(updated);
  }

  assign(
    requestId: string,
    specialistRef: string,
    updatedAt: string,
  ): ExpertRequest {
    const request = this.requireRequest(requestId);
    assertExpertRequestTransition(request.status, "assigned");
    const updated: ExpertRequest = {
      ...request,
      status: "assigned",
      assigned_specialist_ref: specialistRef,
      updated_at: updatedAt,
    };
    this.requests.set(requestId, updated);
    return clone(updated);
  }

  replaceContext(
    requestId: string,
    contextPackage: ExpertContextPackage,
    updatedAt: string,
  ): ExpertRequest {
    const request = this.requireRequest(requestId);
    if (
      ["in_progress", "waiting_for_user", "waiting_for_external_info"].includes(
        request.status,
      )
    )
      throw new Error("CONTEXT_SNAPSHOT_LOCKED_AFTER_WORK_START");
    if (activeStatuses.has(request.status) === false)
      throw new Error("FINAL_REQUEST_IS_IMMUTABLE");
    this.contexts.set(contextPackage.context_package_id, clone(contextPackage));
    const updated = {
      ...request,
      context_package_id: contextPackage.context_package_id,
      updated_at: updatedAt,
    };
    this.requests.set(requestId, updated);
    return clone(updated);
  }

  saveResult(result: ExpertResult): void {
    if (this.results.has(result.request_id))
      throw new Error("COMPLETED_RESULT_IS_IMMUTABLE");
    this.results.set(result.request_id, clone(result));
  }

  getResult(requestId: string): ExpertResult | null {
    const result = this.results.get(requestId);
    return result ? clone(result) : null;
  }

  appendAudit(event: ExpertAuditEvent): void {
    const events = this.audit.get(event.request_id) ?? [];
    events.push(clone(event));
    this.audit.set(event.request_id, events);
  }

  listAudit(requestId: string): readonly ExpertAuditEvent[] {
    return (this.audit.get(requestId) ?? []).map(clone);
  }

  private requireRequest(requestId: string): ExpertRequest {
    const request = this.requests.get(requestId);
    if (!request) throw new Error("EXPERT_REQUEST_NOT_FOUND");
    return request;
  }
}
