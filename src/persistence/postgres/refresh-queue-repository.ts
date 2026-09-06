import { REFRESH_OPERATIONAL_CONFIG } from "../../data-collection/refresh/config/operational";
import {
  refreshTaskSchema,
  type RefreshErrorCode,
  type RefreshTask,
  type RefreshTaskRequest,
  type RefreshTaskStatus,
} from "../../data-collection/refresh/contracts";
import {
  fieldSetCovers,
  normalizeRefreshFields,
} from "../../data-collection/refresh/dedup";
import {
  activeRefreshStatuses,
  buildTask,
  taskSort,
  type RefreshEnqueueResult,
  type RefreshQueueMetrics,
  type RefreshQueueRepository,
} from "../../data-collection/refresh/queue";
import { toIsoString } from "./buyer-journey-repository";
import type { PostgresContext } from "./context";
import { parseStored } from "./documents";
import { withMappedErrors } from "./errors";

const CLAIMABLE: readonly RefreshTaskStatus[] = [
  "queued",
  "ready",
  "retry_scheduled",
];

type RefreshTaskRow = {
  [K in keyof RefreshTask]: unknown;
} & { refresh_task_id: string };

/**
 * PostgreSQL RefreshQueueRepository.
 *
 * refresh_tasks is fully typed rather than document-backed, because the queue
 * is queried by status, priority and time rather than read whole. The pure
 * rules — how a task is built, how the queue is ordered, which statuses count
 * as active — are imported from the in-memory module so the two
 * implementations cannot drift apart on the parts that are not about storage.
 */
export class PostgresRefreshQueueRepository implements RefreshQueueRepository {
  constructor(private readonly context: PostgresContext) {}

  private get db() {
    return this.context.executor;
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return withMappedErrors(() => this.context.transaction(work));
  }

  private toTask(row: RefreshTaskRow): RefreshTask {
    return parseStored(
      refreshTaskSchema,
      {
        ...row,
        priority_score: Number(row.priority_score),
        requested_at: toIsoString(row.requested_at as Date | string),
        not_before: toIsoString(row.not_before as Date | string),
        deadline: row.deadline
          ? toIsoString(row.deadline as Date | string)
          : null,
        claimed_at: row.claimed_at
          ? toIsoString(row.claimed_at as Date | string)
          : null,
        lease_expires_at: row.lease_expires_at
          ? toIsoString(row.lease_expires_at as Date | string)
          : null,
        completed_at: row.completed_at
          ? toIsoString(row.completed_at as Date | string)
          : null,
      },
      `refresh_tasks:${row.refresh_task_id}`,
    );
  }

  private toRow(task: RefreshTask) {
    return {
      refresh_task_id: task.refresh_task_id,
      schema_version: task.schema_version,
      refresh_policy_version: task.refresh_policy_version,
      operation: task.operation,
      entity_type: task.entity_type,
      entity_id: task.entity_id,
      source_id: task.source_id,
      target_urls: [...task.target_urls],
      field_paths: [...task.field_paths],
      critical_field_paths: [...task.critical_field_paths],
      reason: task.reason,
      reason_history: [...task.reason_history],
      priority: task.priority,
      priority_score: task.priority_score,
      journey_stage: task.journey_stage,
      status: task.status,
      attempt_count: task.attempt_count,
      max_attempts: task.max_attempts,
      dedup_key: task.dedup_key,
      policy_version: task.policy_version,
      source_registry_version: task.source_registry_version,
      supersedes_task_ids: [...task.supersedes_task_ids],
      superseded_by_task_id: task.superseded_by_task_id,
      requested_at: task.requested_at,
      requested_by: task.requested_by,
      not_before: task.not_before,
      deadline: task.deadline,
      claimed_by: task.claimed_by,
      claimed_at: task.claimed_at,
      lease_expires_at: task.lease_expires_at,
      completed_at: task.completed_at,
      last_error_code: task.last_error_code,
    };
  }

  private async store(input: unknown): Promise<RefreshTask> {
    const task = refreshTaskSchema.parse(input);
    const row = this.toRow(task);
    await this.db
      .insertInto("refresh_tasks")
      .values(row)
      .onConflict((conflict) =>
        conflict.column("refresh_task_id").doUpdateSet(row),
      )
      .execute();
    return task;
  }

  private async require(taskId: string): Promise<RefreshTask> {
    const task = await this.get(taskId);
    if (!task) throw new Error(`Unknown refresh task: ${taskId}`);
    return task;
  }

  enqueue(request: RefreshTaskRequest): Promise<RefreshEnqueueResult> {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const candidate = buildTask(request);
        const exact = await this.findActiveDuplicate(candidate.dedup_key);
        if (exact)
          return {
            task: await this.mergeEscalation(exact, candidate),
            disposition: "deduplicated" as const,
            supersededTaskIds: [],
          };

        const relatedRows = await this.db
          .selectFrom("refresh_tasks")
          .selectAll()
          .where("status", "in", [...activeRefreshStatuses])
          .where("entity_type", "=", candidate.entity_type)
          .where("entity_id", "=", candidate.entity_id)
          .where("source_id", "=", candidate.source_id)
          .where("operation", "=", candidate.operation)
          .execute();
        const related = relatedRows.map((row) =>
          this.toTask(row as unknown as RefreshTaskRow),
        );

        const covering = related.find((task) =>
          fieldSetCovers(task.field_paths, candidate.field_paths),
        );
        if (covering)
          return {
            task: await this.mergeEscalation(covering, candidate),
            disposition: "deduplicated" as const,
            supersededTaskIds: [],
          };

        const superseded = related.filter(
          (task) =>
            task.status !== "running" &&
            fieldSetCovers(candidate.field_paths, task.field_paths),
        );
        const created = await this.store({
          ...candidate,
          supersedes_task_ids: superseded.map((task) => task.refresh_task_id),
        });
        for (const oldTask of superseded)
          await this.store({
            ...oldTask,
            status: "superseded",
            superseded_by_task_id: created.refresh_task_id,
            completed_at: request.requestedAt,
          });
        return {
          task: created,
          disposition:
            superseded.length > 0
              ? ("superseding" as const)
              : ("created" as const),
          supersededTaskIds: superseded.map((task) => task.refresh_task_id),
        };
      }),
    );
  }

  peek(now: string): Promise<RefreshTask | null> {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("refresh_tasks")
        .selectAll()
        .where("status", "in", CLAIMABLE)
        .where("not_before", "<=", new Date(now))
        .execute();
      const tasks = rows
        .map((row) => this.toTask(row as unknown as RefreshTaskRow))
        .sort(taskSort);
      return tasks[0] ?? null;
    });
  }

  claim(
    taskId: string,
    workerId: string,
    now: string,
    leaseSeconds = REFRESH_OPERATIONAL_CONFIG.defaultClaimLeaseSeconds,
  ): Promise<RefreshTask | null> {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const current = await this.get(taskId);
        if (
          !current ||
          !CLAIMABLE.includes(current.status) ||
          Date.parse(current.not_before) > Date.parse(now)
        )
          return null;
        return this.store({
          ...current,
          status: "running",
          attempt_count: current.attempt_count + 1,
          claimed_by: workerId,
          claimed_at: now,
          lease_expires_at: new Date(
            Date.parse(now) + leaseSeconds * 1000,
          ).toISOString(),
        });
      }),
    );
  }

  complete(
    taskId: string,
    status: "succeeded" | "partial",
    completedAt: string,
  ): Promise<RefreshTask> {
    return this.updateTerminal(taskId, status, null, completedAt);
  }

  fail(
    taskId: string,
    errorCode: RefreshErrorCode,
    completedAt: string,
  ): Promise<RefreshTask> {
    return this.updateTerminal(taskId, "failed", errorCode, completedAt);
  }

  retry(
    taskId: string,
    errorCode: RefreshErrorCode,
    notBefore: string,
  ): Promise<RefreshTask> {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const current = await this.require(taskId);
        if (current.attempt_count >= current.max_attempts)
          return this.fail(taskId, errorCode, notBefore);
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
      }),
    );
  }

  block(
    taskId: string,
    errorCode: RefreshErrorCode,
    completedAt: string,
  ): Promise<RefreshTask> {
    return this.updateTerminal(taskId, "blocked", errorCode, completedAt);
  }

  cancel(taskId: string, completedAt: string): Promise<RefreshTask> {
    return this.updateTerminal(taskId, "cancelled", null, completedAt);
  }

  recordPolicyVersions(
    taskId: string,
    policyVersion: string,
    registryVersion: string,
  ): Promise<RefreshTask> {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const current = await this.require(taskId);
        return this.store({
          ...current,
          policy_version: policyVersion,
          source_registry_version: registryVersion,
        });
      }),
    );
  }

  findActiveDuplicate(dedupKey: string): Promise<RefreshTask | null> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("refresh_tasks")
        .selectAll()
        .where("dedup_key", "=", dedupKey)
        .where("status", "in", [...activeRefreshStatuses])
        .executeTakeFirst();
      return row ? this.toTask(row as unknown as RefreshTaskRow) : null;
    });
  }

  get(taskId: string): Promise<RefreshTask | null> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("refresh_tasks")
        .selectAll()
        .where("refresh_task_id", "=", taskId)
        .executeTakeFirst();
      return row ? this.toTask(row as unknown as RefreshTaskRow) : null;
    });
  }

  list(): Promise<readonly RefreshTask[]> {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("refresh_tasks")
        .selectAll()
        .execute();
      return rows
        .map((row) => this.toTask(row as unknown as RefreshTaskRow))
        .sort(taskSort);
    });
  }

  metrics(now: string): Promise<RefreshQueueMetrics> {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("refresh_tasks")
        .select("requested_at")
        .where("status", "in", [...activeRefreshStatuses])
        .execute();
      const oldest = rows.reduce(
        (minimum, row) =>
          Math.min(minimum, Date.parse(toIsoString(row.requested_at))),
        Number.POSITIVE_INFINITY,
      );
      return {
        queueDepth: rows.length,
        oldestTaskAgeMs: Number.isFinite(oldest)
          ? Math.max(0, Date.parse(now) - oldest)
          : 0,
      };
    });
  }

  private updateTerminal(
    taskId: string,
    status: Extract<
      RefreshTaskStatus,
      "succeeded" | "partial" | "failed" | "blocked" | "cancelled"
    >,
    errorCode: RefreshErrorCode | null,
    completedAt: string,
  ): Promise<RefreshTask> {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const current = await this.require(taskId);
        return this.store({
          ...current,
          status,
          completed_at: completedAt,
          claimed_by: null,
          claimed_at: null,
          lease_expires_at: null,
          last_error_code: errorCode,
        });
      }),
    );
  }

  private async mergeEscalation(
    current: RefreshTask,
    candidate: RefreshTask,
  ): Promise<RefreshTask> {
    const candidateIsHigher = candidate.priority_score > current.priority_score;
    return this.store({
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
  }
}
