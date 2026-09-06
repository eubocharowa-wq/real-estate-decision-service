import {
  runInMemoryTransaction,
  type TransactionalRepository,
} from "../../persistence";
import {
  REFRESH_POLICY_VERSION,
  refreshTaskSchema,
  type RefreshErrorCode,
  type RefreshTask,
  type RefreshTaskRequest,
  type RefreshTaskStatus,
} from "./contracts";
import { REFRESH_OPERATIONAL_CONFIG } from "./config/operational";
import { REFRESH_RETRY_CONFIG } from "./config/retries";
import {
  createRefreshDedupKey,
  createRefreshTaskId,
  fieldSetCovers,
  normalizeRefreshFields,
} from "./dedup";
import { calculateRefreshPriority } from "./priority";

const activeStatuses = new Set<RefreshTaskStatus>([
  "queued",
  "ready",
  "running",
  "retry_scheduled",
]);

const clone = <T>(value: T): T => structuredClone(value);

const taskSort = (left: RefreshTask, right: RefreshTask): number =>
  right.priority_score - left.priority_score ||
  (left.deadline ?? "9999").localeCompare(right.deadline ?? "9999") ||
  left.requested_at.localeCompare(right.requested_at) ||
  left.refresh_task_id.localeCompare(right.refresh_task_id);

const buildTask = (request: RefreshTaskRequest): RefreshTask => {
  const calculated = calculateRefreshPriority(request.priorityInput);
  const dedupKey = createRefreshDedupKey(request);
  const fieldPaths = normalizeRefreshFields(request.fieldPaths);
  const criticalFieldPaths = normalizeRefreshFields(
    request.criticalFieldPaths,
  ).filter((field) => fieldPaths.includes(field));
  return refreshTaskSchema.parse({
    schema_version: "1.0",
    refresh_policy_version: REFRESH_POLICY_VERSION,
    refresh_task_id: createRefreshTaskId(dedupKey, request.requestedAt),
    operation: "targeted_refresh",
    entity_type: request.entityType,
    entity_id: request.entityId,
    source_id: request.sourceId,
    target_urls: [...new Set(request.targetUrls)].sort(),
    field_paths: fieldPaths,
    critical_field_paths: criticalFieldPaths,
    reason: request.reason,
    reason_history: [request.reason],
    priority: calculated.priority,
    priority_score: calculated.score,
    journey_stage: request.journeyStage,
    requested_at: request.requestedAt,
    requested_by: request.requestedBy,
    not_before: request.notBefore ?? request.requestedAt,
    deadline: request.deadline ?? null,
    status: "queued",
    attempt_count: 0,
    max_attempts:
      request.maxAttempts ??
      REFRESH_RETRY_CONFIG.defaultMaxAttempts[calculated.priority],
    dedup_key: dedupKey,
    policy_version: null,
    source_registry_version: null,
    supersedes_task_ids: [],
    superseded_by_task_id: null,
    claimed_by: null,
    claimed_at: null,
    lease_expires_at: null,
    completed_at: null,
    last_error_code: null,
  });
};

export interface RefreshEnqueueResult {
  readonly task: RefreshTask;
  readonly disposition: "created" | "deduplicated" | "superseding";
  readonly supersededTaskIds: readonly string[];
}

export interface RefreshQueueMetrics {
  readonly queueDepth: number;
  readonly oldestTaskAgeMs: number;
}

export interface RefreshQueueRepository extends TransactionalRepository {
  enqueue(request: RefreshTaskRequest): Promise<RefreshEnqueueResult>;
  peek(now: string): Promise<RefreshTask | null>;
  claim(
    taskId: string,
    workerId: string,
    now: string,
    leaseSeconds?: number,
  ): Promise<RefreshTask | null>;
  complete(
    taskId: string,
    status: "succeeded" | "partial",
    completedAt: string,
  ): Promise<RefreshTask>;
  fail(
    taskId: string,
    errorCode: RefreshErrorCode,
    completedAt: string,
  ): Promise<RefreshTask>;
  retry(
    taskId: string,
    errorCode: RefreshErrorCode,
    notBefore: string,
  ): Promise<RefreshTask>;
  block(
    taskId: string,
    errorCode: RefreshErrorCode,
    completedAt: string,
  ): Promise<RefreshTask>;
  cancel(taskId: string, completedAt: string): Promise<RefreshTask>;
  recordPolicyVersions(
    taskId: string,
    policyVersion: string,
    registryVersion: string,
  ): Promise<RefreshTask>;
  findActiveDuplicate(dedupKey: string): Promise<RefreshTask | null>;
  get(taskId: string): Promise<RefreshTask | null>;
  list(): Promise<readonly RefreshTask[]>;
  metrics(now: string): Promise<RefreshQueueMetrics>;
}

export class InMemoryRefreshQueueRepository implements RefreshQueueRepository {
  private readonly tasks = new Map<string, RefreshTask>();

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return runInMemoryTransaction(work);
  }

  async enqueue(request: RefreshTaskRequest): Promise<RefreshEnqueueResult> {
    const candidate = buildTask(request);
    const exact = await this.findActiveDuplicate(candidate.dedup_key);
    if (exact)
      return {
        task: this.mergeEscalation(exact, candidate),
        disposition: "deduplicated",
        supersededTaskIds: [],
      };

    const related = [...this.tasks.values()].filter(
      (task) =>
        activeStatuses.has(task.status) &&
        task.entity_type === candidate.entity_type &&
        task.entity_id === candidate.entity_id &&
        task.source_id === candidate.source_id &&
        task.operation === candidate.operation,
    );
    const covering = related.find((task) =>
      fieldSetCovers(task.field_paths, candidate.field_paths),
    );
    if (covering)
      return {
        task: this.mergeEscalation(covering, candidate),
        disposition: "deduplicated",
        supersededTaskIds: [],
      };

    const superseded = related.filter(
      (task) =>
        task.status !== "running" &&
        fieldSetCovers(candidate.field_paths, task.field_paths),
    );
    const created = refreshTaskSchema.parse({
      ...candidate,
      supersedes_task_ids: superseded.map((task) => task.refresh_task_id),
    });
    this.tasks.set(created.refresh_task_id, created);
    for (const oldTask of superseded) {
      this.tasks.set(
        oldTask.refresh_task_id,
        refreshTaskSchema.parse({
          ...oldTask,
          status: "superseded",
          superseded_by_task_id: created.refresh_task_id,
          completed_at: request.requestedAt,
        }),
      );
    }
    return {
      task: clone(created),
      disposition: superseded.length > 0 ? "superseding" : "created",
      supersededTaskIds: superseded.map((task) => task.refresh_task_id),
    };
  }

  async peek(now: string): Promise<RefreshTask | null> {
    const nowMs = Date.parse(now);
    const next = [...this.tasks.values()]
      .filter(
        (task) =>
          ["queued", "ready", "retry_scheduled"].includes(task.status) &&
          Date.parse(task.not_before) <= nowMs,
      )
      .sort(taskSort)[0];
    return next ? clone(next) : null;
  }

  async claim(
    taskId: string,
    workerId: string,
    now: string,
    leaseSeconds = REFRESH_OPERATIONAL_CONFIG.defaultClaimLeaseSeconds,
  ): Promise<RefreshTask | null> {
    const current = this.tasks.get(taskId);
    if (
      !current ||
      !["queued", "ready", "retry_scheduled"].includes(current.status) ||
      Date.parse(current.not_before) > Date.parse(now)
    )
      return null;
    const claimed = refreshTaskSchema.parse({
      ...current,
      status: "running",
      attempt_count: current.attempt_count + 1,
      claimed_by: workerId,
      claimed_at: now,
      lease_expires_at: new Date(
        Date.parse(now) + leaseSeconds * 1000,
      ).toISOString(),
    });
    this.tasks.set(taskId, claimed);
    return clone(claimed);
  }

  async complete(
    taskId: string,
    status: "succeeded" | "partial",
    completedAt: string,
  ): Promise<RefreshTask> {
    return this.updateTerminal(taskId, status, null, completedAt);
  }

  async fail(
    taskId: string,
    errorCode: RefreshErrorCode,
    completedAt: string,
  ): Promise<RefreshTask> {
    return this.updateTerminal(taskId, "failed", errorCode, completedAt);
  }

  async retry(
    taskId: string,
    errorCode: RefreshErrorCode,
    notBefore: string,
  ): Promise<RefreshTask> {
    const current = this.require(taskId);
    if (current.attempt_count >= current.max_attempts)
      return await this.fail(taskId, errorCode, notBefore);
    return this.store({
      ...current,
      status: "retry_scheduled",
      reason: "INGESTION_RETRY",
      reason_history: [
        ...new Set([...current.reason_history, "INGESTION_RETRY"]),
      ],
      not_before: notBefore,
      claimed_by: null,
      claimed_at: null,
      lease_expires_at: null,
      last_error_code: errorCode,
    });
  }

  async block(
    taskId: string,
    errorCode: RefreshErrorCode,
    completedAt: string,
  ): Promise<RefreshTask> {
    return this.updateTerminal(taskId, "blocked", errorCode, completedAt);
  }

  async cancel(taskId: string, completedAt: string): Promise<RefreshTask> {
    return this.updateTerminal(taskId, "cancelled", null, completedAt);
  }

  async recordPolicyVersions(
    taskId: string,
    policyVersion: string,
    registryVersion: string,
  ): Promise<RefreshTask> {
    const current = this.require(taskId);
    return this.store({
      ...current,
      policy_version: policyVersion,
      source_registry_version: registryVersion,
    });
  }

  async findActiveDuplicate(dedupKey: string): Promise<RefreshTask | null> {
    const task = [...this.tasks.values()].find(
      (candidate) =>
        candidate.dedup_key === dedupKey &&
        activeStatuses.has(candidate.status),
    );
    return task ? clone(task) : null;
  }

  async get(taskId: string): Promise<RefreshTask | null> {
    const task = this.tasks.get(taskId);
    return task ? clone(task) : null;
  }

  async list(): Promise<readonly RefreshTask[]> {
    return [...this.tasks.values()].sort(taskSort).map(clone);
  }

  async metrics(now: string): Promise<RefreshQueueMetrics> {
    const active = [...this.tasks.values()].filter((task) =>
      activeStatuses.has(task.status),
    );
    const oldest = active.reduce(
      (minimum, task) => Math.min(minimum, Date.parse(task.requested_at)),
      Number.POSITIVE_INFINITY,
    );
    return {
      queueDepth: active.length,
      oldestTaskAgeMs: Number.isFinite(oldest)
        ? Math.max(0, Date.parse(now) - oldest)
        : 0,
    };
  }

  private mergeEscalation(
    current: RefreshTask,
    candidate: RefreshTask,
  ): RefreshTask {
    const candidateIsHigher = candidate.priority_score > current.priority_score;
    const merged = this.store({
      ...current,
      reason: candidateIsHigher ? candidate.reason : current.reason,
      reason_history: [
        ...new Set([...current.reason_history, candidate.reason]),
      ],
      priority: candidateIsHigher ? candidate.priority : current.priority,
      priority_score: Math.max(
        current.priority_score,
        candidate.priority_score,
      ),
      journey_stage: candidateIsHigher
        ? candidate.journey_stage
        : current.journey_stage,
      deadline:
        [current.deadline, candidate.deadline]
          .filter((value): value is string => value !== null)
          .sort()[0] ?? null,
      critical_field_paths: normalizeRefreshFields([
        ...current.critical_field_paths,
        ...candidate.critical_field_paths,
      ]),
      max_attempts: Math.max(current.max_attempts, candidate.max_attempts),
    });
    return clone(merged);
  }

  private updateTerminal(
    taskId: string,
    status: Extract<
      RefreshTaskStatus,
      "succeeded" | "partial" | "failed" | "blocked" | "cancelled"
    >,
    errorCode: RefreshErrorCode | null,
    completedAt: string,
  ): RefreshTask {
    const current = this.require(taskId);
    return this.store({
      ...current,
      status,
      completed_at: completedAt,
      claimed_by: null,
      claimed_at: null,
      lease_expires_at: null,
      last_error_code: errorCode,
    });
  }

  private require(taskId: string): RefreshTask {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown refresh task: ${taskId}`);
    return task;
  }

  private store(input: unknown): RefreshTask {
    const task = refreshTaskSchema.parse(input);
    this.tasks.set(task.refresh_task_id, task);
    return clone(task);
  }
}
