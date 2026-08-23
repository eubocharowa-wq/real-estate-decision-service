import { z } from "zod";

import {
  entityIdSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  urlSchema,
} from "../../domain/common/schema";
import type {
  CollectionPlan,
  RegistryCollectionMethod,
  ResolveCollectionPlanInput,
  SourceEnvironment,
  SourceRegistryEntry,
} from "../source-registry";

export const REFRESH_TASK_SCHEMA_VERSION = "1.0" as const;
export const REFRESH_RESULT_SCHEMA_VERSION = "1.0" as const;
export const REFRESH_RAW_RESULT_SCHEMA_VERSION = "1.0" as const;
export const REFRESH_POLICY_VERSION = "refresh-policy-v1" as const;

export const refreshEntityTypeSchema = z.enum([
  "property",
  "offer",
  "purchase_scenario",
  "financing_program",
  "financing_offer",
  "promotion",
  "source_snapshot",
  "field_evidence",
]);

export const refreshReasonSchema = z.enum([
  "STALE_FIELD",
  "EXPIRED_FIELD",
  "CRITICAL_UNKNOWN",
  "SOURCE_CONFLICT",
  "USER_REQUESTED",
  "PRE_SHORTLIST_CHECK",
  "PRE_COMPARISON_CHECK",
  "PRE_DECISION_CHECK",
  "SCHEDULED_REFRESH",
  "SOURCE_HEALTH_RECOVERY",
  "INGESTION_RETRY",
  "MANUAL_REVIEW_REQUEST",
]);

export const refreshPrioritySchema = z.enum([
  "critical",
  "high",
  "normal",
  "low",
]);

export const refreshTaskStatusSchema = z.enum([
  "queued",
  "blocked",
  "ready",
  "running",
  "succeeded",
  "partial",
  "failed",
  "retry_scheduled",
  "cancelled",
  "superseded",
]);

export const refreshErrorCodeSchema = z.enum([
  "POLICY_DENIED",
  "SOURCE_CHANGED",
  "INVALID_STRUCTURE",
  "AUTH_REQUIRED",
  "PERMISSION_REQUIRED",
  "TIMEOUT",
  "TEMPORARY_5XX",
  "RATE_LIMITED",
  "TRANSIENT_NETWORK_ERROR",
  "SOURCE_HEALTH_DEGRADED",
  "ADAPTER_UNAVAILABLE",
  "DEADLINE_EXCEEDED",
  "INVALID_RESULT",
  "PARTIAL_CRITICAL_MISSING",
]);

export const userJourneyStageSchema = z.enum([
  "discovery",
  "shortlist",
  "comparison",
  "pre_decision",
]);

export const refreshRequestActorSchema = z.enum([
  "system",
  "user",
  "application",
  "expert",
]);

export const refreshTaskSchema = z
  .strictObject({
    schema_version: z.literal(REFRESH_TASK_SCHEMA_VERSION),
    refresh_policy_version: z.literal(REFRESH_POLICY_VERSION),
    refresh_task_id: entityIdSchema,
    operation: z.literal("targeted_refresh"),
    entity_type: refreshEntityTypeSchema,
    entity_id: entityIdSchema,
    source_id: entityIdSchema,
    target_urls: z.array(urlSchema).min(1),
    field_paths: z.array(nonEmptyStringSchema).min(1),
    critical_field_paths: z.array(nonEmptyStringSchema),
    reason: refreshReasonSchema,
    reason_history: z.array(refreshReasonSchema).min(1),
    priority: refreshPrioritySchema,
    priority_score: z.number().int(),
    journey_stage: userJourneyStageSchema,
    requested_at: isoDateTimeSchema,
    requested_by: refreshRequestActorSchema,
    not_before: isoDateTimeSchema,
    deadline: isoDateTimeSchema.nullable(),
    status: refreshTaskStatusSchema,
    attempt_count: z.number().int().nonnegative(),
    max_attempts: z.number().int().positive(),
    dedup_key: nonEmptyStringSchema,
    policy_version: nonEmptyStringSchema.nullable(),
    source_registry_version: nonEmptyStringSchema.nullable(),
    supersedes_task_ids: z.array(entityIdSchema),
    superseded_by_task_id: entityIdSchema.nullable(),
    claimed_by: nonEmptyStringSchema.nullable(),
    claimed_at: isoDateTimeSchema.nullable(),
    lease_expires_at: isoDateTimeSchema.nullable(),
    completed_at: isoDateTimeSchema.nullable(),
    last_error_code: refreshErrorCodeSchema.nullable(),
  })
  .superRefine((task, context) => {
    for (const criticalField of task.critical_field_paths)
      if (!task.field_paths.includes(criticalField))
        context.addIssue({
          code: "custom",
          path: ["critical_field_paths"],
          message: "Critical fields must be part of the targeted field set",
        });
    if (!task.reason_history.includes(task.reason))
      context.addIssue({
        code: "custom",
        path: ["reason_history"],
        message: "Reason history must include the active reason",
      });
    if (task.attempt_count > task.max_attempts)
      context.addIssue({
        code: "custom",
        path: ["attempt_count"],
        message: "Attempt count must not exceed max attempts",
      });
    if (
      task.deadline &&
      Date.parse(task.not_before) > Date.parse(task.deadline)
    )
      context.addIssue({
        code: "custom",
        path: ["not_before"],
        message: "not_before must not be after deadline",
      });
  });

export const affectedEntitiesSchema = z.strictObject({
  affected_property_ids: z.array(entityIdSchema),
  affected_offer_ids: z.array(entityIdSchema),
  affected_scenario_ids: z.array(entityIdSchema),
  affected_user_request_ids: z.array(entityIdSchema),
});

export const recomputeDirectiveSchema = z.strictObject({
  data_confidence_entity_ids: z.array(entityIdSchema),
  data_completeness_entity_ids: z.array(entityIdSchema),
  match_result_pairs: z.array(
    z.strictObject({
      user_request_id: entityIdSchema,
      property_id: entityIdSchema,
    }),
  ),
});

export const refreshRawFieldSchema = z.strictObject({
  field_path: nonEmptyStringSchema,
  observation_fingerprint: nonEmptyStringSchema,
  evidence_candidate_id: entityIdSchema,
});

/** Adapter output deliberately contains no canonical mutation or raw payload. */
export const refreshRawResultSchema = z.strictObject({
  schema_version: z.literal(REFRESH_RAW_RESULT_SCHEMA_VERSION),
  collection_run_id: entityIdSchema,
  refresh_task_id: entityIdSchema,
  source_id: entityIdSchema,
  source_url: urlSchema,
  observed_at: isoDateTimeSchema,
  raw_payload_reference: z.null(),
  status: z.enum(["success", "partial", "failed"]),
  observed_fields: z.array(refreshRawFieldSchema),
  missing_fields: z.array(nonEmptyStringSchema),
  adapter_version: nonEmptyStringSchema,
  error_code: refreshErrorCodeSchema.nullable(),
  retry_after_seconds: z.number().int().nonnegative().nullable(),
  source_health_effect: z.enum([
    "none",
    "success",
    "degraded",
    "failing",
    "source_changed",
  ]),
});

export const refreshResultSchema = z
  .strictObject({
    schema_version: z.literal(REFRESH_RESULT_SCHEMA_VERSION),
    refresh_task_id: entityIdSchema,
    collection_run_id: entityIdSchema,
    idempotency_key: nonEmptyStringSchema,
    source_id: entityIdSchema,
    status: z.enum([
      "blocked",
      "succeeded",
      "partial",
      "failed",
      "retry_scheduled",
    ]),
    selected_method: z.string().nullable(),
    adapter_version: nonEmptyStringSchema.nullable(),
    policy_version: nonEmptyStringSchema,
    source_registry_version: nonEmptyStringSchema,
    started_at: isoDateTimeSchema,
    completed_at: isoDateTimeSchema,
    changed_fields: z.array(nonEmptyStringSchema),
    unchanged_fields: z.array(nonEmptyStringSchema),
    missing_fields: z.array(nonEmptyStringSchema),
    new_conflict_ids: z.array(entityIdSchema),
    resolved_conflict_ids: z.array(entityIdSchema),
    evidence_ids: z.array(entityIdSchema),
    source_health_effect: z.enum([
      "none",
      "success",
      "degraded",
      "failing",
      "source_changed",
    ]),
    affected_entities: affectedEntitiesSchema,
    recompute: recomputeDirectiveSchema,
    error_code: refreshErrorCodeSchema.nullable(),
    retry: z
      .strictObject({
        retryable: z.boolean(),
        attempt: z.number().int().positive(),
        max_attempts: z.number().int().positive(),
        not_before: isoDateTimeSchema.nullable(),
      })
      .nullable(),
  })
  .superRefine((result, context) => {
    const classifications = [
      ...result.changed_fields.map((field) => [field, "changed"] as const),
      ...result.unchanged_fields.map((field) => [field, "unchanged"] as const),
      ...result.missing_fields.map((field) => [field, "missing"] as const),
    ];
    const seen = new Map<string, string>();
    for (const [field, classification] of classifications) {
      const previous = seen.get(field);
      if (previous && previous !== classification)
        context.addIssue({
          code: "custom",
          path: [`${classification}_fields`],
          message: `Field ${field} has contradictory refresh classifications`,
        });
      seen.set(field, classification);
    }
    if (result.status === "succeeded" && result.error_code !== null)
      context.addIssue({
        code: "custom",
        path: ["error_code"],
        message: "A succeeded refresh cannot carry an error code",
      });
  });

export type RefreshEntityType = z.infer<typeof refreshEntityTypeSchema>;
export type RefreshReason = z.infer<typeof refreshReasonSchema>;
export type RefreshPriority = z.infer<typeof refreshPrioritySchema>;
export type RefreshTaskStatus = z.infer<typeof refreshTaskStatusSchema>;
export type RefreshErrorCode = z.infer<typeof refreshErrorCodeSchema>;
export type UserJourneyStage = z.infer<typeof userJourneyStageSchema>;
export type RefreshRequestActor = z.infer<typeof refreshRequestActorSchema>;
export type RefreshTask = z.infer<typeof refreshTaskSchema>;
export type RefreshRawResult = z.infer<typeof refreshRawResultSchema>;
export type RefreshResult = z.infer<typeof refreshResultSchema>;
export type AffectedEntities = z.infer<typeof affectedEntitiesSchema>;
export type RecomputeDirective = z.infer<typeof recomputeDirectiveSchema>;

export type FieldCriticality = "optional" | "important" | "critical";
export type FieldConflictState = "none" | "noncritical" | "critical";
export type FieldFreshness =
  "fresh" | "aging" | "stale" | "expired" | "unknown";
export type UserRequestPriority = "low" | "normal" | "high" | "critical";
export type VolatilityClass = "V1" | "V2" | "V3" | "V4";

export interface RefreshPriorityInput {
  readonly reason: RefreshReason;
  readonly userRequestPriority: UserRequestPriority;
  readonly fieldCriticality: FieldCriticality;
  readonly freshness: FieldFreshness;
  readonly conflict: FieldConflictState;
  readonly journeyStage: UserJourneyStage;
  readonly sourceHealth: SourceRegistryEntry["health"]["status"];
  readonly volatility: VolatilityClass;
  readonly explicitUserAction: boolean;
}

export interface RefreshTaskRequest {
  readonly entityType: RefreshEntityType;
  readonly entityId: string;
  readonly sourceId: string;
  readonly targetUrls: readonly string[];
  readonly fieldPaths: readonly string[];
  readonly criticalFieldPaths: readonly string[];
  readonly reason: RefreshReason;
  readonly priorityInput: RefreshPriorityInput;
  readonly journeyStage: UserJourneyStage;
  readonly requestedAt: string;
  readonly requestedBy: RefreshRequestActor;
  readonly notBefore?: string;
  readonly deadline?: string | null;
  readonly maxAttempts?: number;
}

export interface RefreshCollectionAdapter {
  readonly sourceId: string;
  readonly method: RegistryCollectionMethod;
  readonly version: string;
  collect(input: {
    readonly task: RefreshTask;
    readonly plan: CollectionPlan;
    readonly collectionRunId: string;
    readonly idempotencyKey: string;
    readonly observedAt: string;
  }): Promise<RefreshRawResult>;
}

export interface RefreshIngestionOutcome {
  readonly changedFields: readonly string[];
  readonly unchangedFields: readonly string[];
  readonly missingFields: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly newConflictIds: readonly string[];
  readonly resolvedConflictIds: readonly string[];
  readonly affectedEntities: AffectedEntities;
}

/** This is the only port allowed to turn adapter observations into evidence/canonical updates. */
export interface RefreshEvidencePipeline {
  readonly version: string;
  ingest(input: {
    readonly rawResult: RefreshRawResult;
    readonly task: RefreshTask;
    readonly plan: CollectionPlan;
    readonly idempotencyKey: string;
  }): Promise<RefreshIngestionOutcome>;
}

export interface RefreshRecomputeHook {
  readonly version: string;
  recompute(input: {
    readonly task: RefreshTask;
    readonly affectedEntities: AffectedEntities;
    readonly changedFields: readonly string[];
    readonly evidenceIds: readonly string[];
  }): Promise<RecomputeDirective>;
}

export interface SourceRuntimePolicy {
  readonly status: SourceRegistryEntry["status"] | "unknown";
  readonly operational: SourceRegistryEntry["operational"];
  readonly health: SourceRegistryEntry["health"];
}

export interface RefreshPolicyGateway {
  resolveCollectionPlan(input: ResolveCollectionPlanInput): CollectionPlan;
  getSourceRuntime(sourceId: string): SourceRuntimePolicy;
}

export interface RefreshExecutionContext {
  readonly environment: SourceEnvironment;
  readonly satisfiedConditions: readonly string[];
  readonly workerId: string;
  readonly now: string;
}
