import type {
  CollectionPlan,
  RegistryCollectionMethod,
} from "../source-registry";
import {
  refreshRawResultSchema,
  refreshResultSchema,
  type RefreshCollectionAdapter,
  type RefreshErrorCode,
  type RefreshEvidencePipeline,
  type RefreshExecutionContext,
  type RefreshPolicyGateway,
  type RefreshRecomputeHook,
  type RefreshResult,
  type RefreshTask,
} from "./contracts";
import { createCollectionRunIdentity } from "./dedup";
import { InMemorySourceOperationalTracker } from "./operational";
import {
  EMPTY_AFFECTED_ENTITIES,
  EMPTY_RECOMPUTE_DIRECTIVE,
} from "./propagation";
import type { RefreshQueueRepository } from "./queue";
import { decideRefreshRetry } from "./retry";
import { InMemoryRefreshTelemetry } from "./telemetry";

const executableMethods = new Set<RegistryCollectionMethod>([
  "api",
  "partner_feed",
  "xml_feed",
  "http",
  "fixture_mock",
]);

const adapterKey = (sourceId: string, method: RegistryCollectionMethod) =>
  `${sourceId}:${method}`;

const sortedUnique = (values: readonly string[]): string[] =>
  [...new Set(values)].sort();

export class RefreshAdapterFailure extends Error {
  constructor(
    readonly code: RefreshErrorCode,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
    this.name = "RefreshAdapterFailure";
  }
}

export interface RefreshExecutorDependencies {
  readonly queue: RefreshQueueRepository;
  readonly policy: RefreshPolicyGateway;
  readonly adapters: readonly RefreshCollectionAdapter[];
  readonly evidencePipeline: RefreshEvidencePipeline;
  readonly recomputeHook: RefreshRecomputeHook;
  readonly operational?: InMemorySourceOperationalTracker;
  readonly telemetry?: InMemoryRefreshTelemetry;
  readonly monotonicNow?: () => number;
}

export class RefreshExecutor {
  private readonly adapters: ReadonlyMap<string, RefreshCollectionAdapter>;
  private readonly operational: InMemorySourceOperationalTracker;
  private readonly telemetry: InMemoryRefreshTelemetry;
  private readonly monotonicNow: () => number;
  private readonly completedRuns = new Map<string, RefreshResult>();

  constructor(private readonly dependencies: RefreshExecutorDependencies) {
    this.adapters = new Map(
      dependencies.adapters.map((adapter) => [
        adapterKey(adapter.sourceId, adapter.method),
        adapter,
      ]),
    );
    this.operational =
      dependencies.operational ?? new InMemorySourceOperationalTracker();
    this.telemetry = dependencies.telemetry ?? new InMemoryRefreshTelemetry();
    this.monotonicNow = dependencies.monotonicNow ?? (() => Date.now());
  }

  async processNextRefreshTask(
    context: RefreshExecutionContext,
  ): Promise<RefreshResult | null> {
    const next = this.dependencies.queue.peek(context.now);
    if (!next) return null;
    const task = this.dependencies.queue.claim(
      next.refresh_task_id,
      context.workerId,
      context.now,
    );
    if (!task) return null;
    const started = this.monotonicNow();
    const plan = this.dependencies.policy.resolveCollectionPlan({
      sourceId: task.source_id,
      operation: "targeted_refresh",
      environment: context.environment,
      entityType: task.entity_type,
      targetField: task.field_paths.length === 1 ? task.field_paths[0] : null,
      targetUrls: task.target_urls,
      requestedFields: task.field_paths,
      discovery: false,
      followLinks: false,
      pagination: false,
      sitemap: false,
      authentication: false,
      challengeAction: "stop",
      satisfiedConditions: context.satisfiedConditions,
      decidedAt: context.now,
    });
    this.dependencies.queue.recordPolicyVersions(
      task.refresh_task_id,
      plan.policyVersion,
      plan.registryVersion,
    );
    if (!plan.allowed || !plan.preferredMethod)
      return this.finishWithoutAdapter({
        task,
        plan,
        context,
        started,
        status: "blocked",
        errorCode: "POLICY_DENIED",
      });
    if (!executableMethods.has(plan.preferredMethod))
      return this.finishWithoutAdapter({
        task,
        plan,
        context,
        started,
        status: "blocked",
        errorCode: "POLICY_DENIED",
      });
    if (task.deadline && Date.parse(context.now) > Date.parse(task.deadline))
      return this.finishWithoutAdapter({
        task,
        plan,
        context,
        started,
        status: "failed",
        errorCode: "DEADLINE_EXCEEDED",
      });

    const runtime = this.dependencies.policy.getSourceRuntime(task.source_id);
    const operational = this.operational.check({
      sourceId: task.source_id,
      runtime,
      priority: task.priority,
      now: context.now,
    });
    if (!operational.allowed) {
      const code: RefreshErrorCode =
        operational.reason === "source_blocked"
          ? "POLICY_DENIED"
          : operational.reason === "source_changed"
            ? "SOURCE_CHANGED"
            : operational.reason === "auth_required"
              ? "AUTH_REQUIRED"
              : operational.reason === "source_health_failing" ||
                  operational.reason === "source_health_degraded"
                ? "SOURCE_HEALTH_DEGRADED"
                : "RATE_LIMITED";
      return this.finishFailure({
        task,
        plan,
        context,
        started,
        errorCode: code,
        retryAfterSeconds: operational.retryAfterSeconds,
      });
    }

    const adapter = this.adapters.get(
      adapterKey(task.source_id, plan.preferredMethod),
    );
    if (!adapter)
      return this.finishFailure({
        task,
        plan,
        context,
        started,
        errorCode: "ADAPTER_UNAVAILABLE",
        retryAfterSeconds: null,
      });

    const identity = createCollectionRunIdentity(task);
    const completed = this.completedRuns.get(identity.idempotencyKey);
    if (completed) return structuredClone(completed);

    this.operational.start(task.source_id, context.now);
    try {
      const rawResult = refreshRawResultSchema.parse(
        await adapter.collect({
          task,
          plan,
          collectionRunId: identity.collectionRunId,
          idempotencyKey: identity.idempotencyKey,
          observedAt: context.now,
        }),
      );
      this.assertRawResultScope(task, rawResult);
      if (rawResult.status === "failed" || rawResult.error_code)
        return this.finishFailure({
          task,
          plan,
          context,
          started,
          errorCode: rawResult.error_code ?? "INVALID_RESULT",
          retryAfterSeconds: rawResult.retry_after_seconds,
          adapterVersion: adapter.version,
          collectionRunId: identity.collectionRunId,
          idempotencyKey: identity.idempotencyKey,
          sourceHealthEffect: rawResult.source_health_effect,
        });

      const ingestion = await this.dependencies.evidencePipeline.ingest({
        rawResult,
        task,
        plan,
        idempotencyKey: identity.idempotencyKey,
      });
      this.assertIngestionScope(task, ingestion);
      const recompute = await this.dependencies.recomputeHook.recompute({
        task,
        affectedEntities: ingestion.affectedEntities,
        changedFields: ingestion.changedFields,
        evidenceIds: ingestion.evidenceIds,
      });
      const partial =
        rawResult.status === "partial" || ingestion.missingFields.length > 0;
      const criticalMissing = ingestion.missingFields.some((field) =>
        task.critical_field_paths.includes(field),
      );
      let retry: RefreshResult["retry"] = null;
      if (partial && criticalMissing) {
        const retryDecision = decideRefreshRetry({
          task,
          errorCode: "PARTIAL_CRITICAL_MISSING",
          now: context.now,
        });
        retry = {
          retryable: retryDecision.retryable,
          attempt: task.attempt_count,
          max_attempts: task.max_attempts,
          not_before: retryDecision.notBefore,
        };
        if (retryDecision.retryable && retryDecision.notBefore)
          this.dependencies.queue.retry(
            task.refresh_task_id,
            "PARTIAL_CRITICAL_MISSING",
            retryDecision.notBefore,
          );
        else
          this.dependencies.queue.complete(
            task.refresh_task_id,
            "partial",
            context.now,
          );
      } else {
        this.dependencies.queue.complete(
          task.refresh_task_id,
          partial ? "partial" : "succeeded",
          context.now,
        );
      }
      const result = refreshResultSchema.parse({
        schema_version: "1.0",
        refresh_task_id: task.refresh_task_id,
        collection_run_id: identity.collectionRunId,
        idempotency_key: identity.idempotencyKey,
        source_id: task.source_id,
        status: partial ? "partial" : "succeeded",
        selected_method: plan.preferredMethod,
        adapter_version: adapter.version,
        policy_version: plan.policyVersion,
        source_registry_version: plan.registryVersion,
        started_at: context.now,
        completed_at: context.now,
        changed_fields: sortedUnique(ingestion.changedFields),
        unchanged_fields: sortedUnique(ingestion.unchangedFields),
        missing_fields: sortedUnique(ingestion.missingFields),
        new_conflict_ids: sortedUnique(ingestion.newConflictIds),
        resolved_conflict_ids: sortedUnique(ingestion.resolvedConflictIds),
        evidence_ids: sortedUnique(ingestion.evidenceIds),
        source_health_effect: rawResult.source_health_effect,
        affected_entities: ingestion.affectedEntities,
        recompute,
        error_code:
          partial && criticalMissing ? "PARTIAL_CRITICAL_MISSING" : null,
        retry,
      });
      this.completedRuns.set(identity.idempotencyKey, result);
      this.recordTelemetry(task, result, started);
      return structuredClone(result);
    } catch (error) {
      const failure =
        error instanceof RefreshAdapterFailure
          ? error
          : new RefreshAdapterFailure("INVALID_RESULT");
      return this.finishFailure({
        task,
        plan,
        context,
        started,
        errorCode: failure.code,
        retryAfterSeconds: failure.retryAfterSeconds,
        adapterVersion: adapter.version,
        collectionRunId: identity.collectionRunId,
        idempotencyKey: identity.idempotencyKey,
      });
    } finally {
      this.operational.finish(task.source_id, context.now);
    }
  }

  getTelemetry(): InMemoryRefreshTelemetry {
    return this.telemetry;
  }

  private finishFailure(input: {
    readonly task: RefreshTask;
    readonly plan: CollectionPlan;
    readonly context: RefreshExecutionContext;
    readonly started: number;
    readonly errorCode: RefreshErrorCode;
    readonly retryAfterSeconds: number | null;
    readonly adapterVersion?: string | null;
    readonly collectionRunId?: string;
    readonly idempotencyKey?: string;
    readonly sourceHealthEffect?: RefreshResult["source_health_effect"];
  }): RefreshResult {
    if (input.errorCode === "POLICY_DENIED")
      return this.finishWithoutAdapter({
        ...input,
        status: "blocked",
      });
    const retryDecision = decideRefreshRetry({
      task: input.task,
      errorCode: input.errorCode,
      now: input.context.now,
      retryAfterSeconds: input.retryAfterSeconds,
    });
    if (retryDecision.retryable && retryDecision.notBefore)
      this.dependencies.queue.retry(
        input.task.refresh_task_id,
        input.errorCode,
        retryDecision.notBefore,
      );
    else
      this.dependencies.queue.fail(
        input.task.refresh_task_id,
        input.errorCode,
        input.context.now,
      );
    const identity = createCollectionRunIdentity(input.task);
    const result = refreshResultSchema.parse({
      schema_version: "1.0",
      refresh_task_id: input.task.refresh_task_id,
      collection_run_id: input.collectionRunId ?? identity.collectionRunId,
      idempotency_key: input.idempotencyKey ?? identity.idempotencyKey,
      source_id: input.task.source_id,
      status: retryDecision.retryable ? "retry_scheduled" : "failed",
      selected_method: input.plan.preferredMethod,
      adapter_version: input.adapterVersion ?? null,
      policy_version: input.plan.policyVersion,
      source_registry_version: input.plan.registryVersion,
      started_at: input.context.now,
      completed_at: input.context.now,
      changed_fields: [],
      unchanged_fields: [],
      missing_fields: input.task.field_paths,
      new_conflict_ids: [],
      resolved_conflict_ids: [],
      evidence_ids: [],
      source_health_effect: input.sourceHealthEffect ?? "degraded",
      affected_entities: EMPTY_AFFECTED_ENTITIES,
      recompute: EMPTY_RECOMPUTE_DIRECTIVE,
      error_code: input.errorCode,
      retry: {
        retryable: retryDecision.retryable,
        attempt: input.task.attempt_count,
        max_attempts: input.task.max_attempts,
        not_before: retryDecision.notBefore,
      },
    });
    this.recordTelemetry(input.task, result, input.started);
    return result;
  }

  private finishWithoutAdapter(input: {
    readonly task: RefreshTask;
    readonly plan: CollectionPlan;
    readonly context: RefreshExecutionContext;
    readonly started: number;
    readonly status: "blocked" | "failed";
    readonly errorCode: RefreshErrorCode;
  }): RefreshResult {
    if (input.status === "blocked")
      this.dependencies.queue.block(
        input.task.refresh_task_id,
        input.errorCode,
        input.context.now,
      );
    else
      this.dependencies.queue.fail(
        input.task.refresh_task_id,
        input.errorCode,
        input.context.now,
      );
    const identity = createCollectionRunIdentity(input.task);
    const result = refreshResultSchema.parse({
      schema_version: "1.0",
      refresh_task_id: input.task.refresh_task_id,
      collection_run_id: identity.collectionRunId,
      idempotency_key: identity.idempotencyKey,
      source_id: input.task.source_id,
      status: input.status,
      selected_method: null,
      adapter_version: null,
      policy_version: input.plan.policyVersion,
      source_registry_version: input.plan.registryVersion,
      started_at: input.context.now,
      completed_at: input.context.now,
      changed_fields: [],
      unchanged_fields: [],
      missing_fields: input.task.field_paths,
      new_conflict_ids: [],
      resolved_conflict_ids: [],
      evidence_ids: [],
      source_health_effect: "none",
      affected_entities: EMPTY_AFFECTED_ENTITIES,
      recompute: EMPTY_RECOMPUTE_DIRECTIVE,
      error_code: input.errorCode,
      retry: {
        retryable: false,
        attempt: input.task.attempt_count,
        max_attempts: input.task.max_attempts,
        not_before: null,
      },
    });
    this.recordTelemetry(input.task, result, input.started);
    return result;
  }

  private assertRawResultScope(
    task: RefreshTask,
    rawResult: ReturnType<typeof refreshRawResultSchema.parse>,
  ): void {
    if (
      rawResult.refresh_task_id !== task.refresh_task_id ||
      rawResult.source_id !== task.source_id ||
      rawResult.raw_payload_reference !== null
    )
      throw new RefreshAdapterFailure("INVALID_RESULT");
    const returnedFields = [
      ...rawResult.observed_fields.map((field) => field.field_path),
      ...rawResult.missing_fields,
    ];
    if (returnedFields.some((field) => !task.field_paths.includes(field)))
      throw new RefreshAdapterFailure("INVALID_RESULT");
  }

  private assertIngestionScope(
    task: RefreshTask,
    ingestion: Awaited<ReturnType<RefreshEvidencePipeline["ingest"]>>,
  ): void {
    const fields = [
      ...ingestion.changedFields,
      ...ingestion.unchangedFields,
      ...ingestion.missingFields,
    ];
    if (fields.some((field) => !task.field_paths.includes(field)))
      throw new RefreshAdapterFailure("INVALID_RESULT");
  }

  private recordTelemetry(
    task: RefreshTask,
    result: RefreshResult,
    started: number,
  ): void {
    this.telemetry.record({
      refresh_task_id: task.refresh_task_id,
      entity_id: task.entity_id,
      source_id: task.source_id,
      reason: task.reason,
      priority: task.priority,
      status: result.status,
      attempt: task.attempt_count,
      adapter_version: result.adapter_version,
      policy_version: result.policy_version,
      duration_ms: Math.max(0, this.monotonicNow() - started),
      changed_field_count: result.changed_fields.length,
      error_code: result.error_code,
      retry_scheduled: result.retry?.retryable ?? false,
    });
  }
}
