import { z } from "zod";

import type {
  FieldEvidence,
  Offer,
  Property,
  SourceConflict,
} from "../../domain";
import {
  entityIdSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  ratioSchema,
  urlSchema,
} from "../../domain/common/schema";
import type { CollectionPlan, SourceEnvironment } from "../source-registry";

export const COLLECTION_TASK_SCHEMA_VERSION = "1.0" as const;
export const RAW_COLLECTION_RESULT_SCHEMA_VERSION = "1.0" as const;
export const CANONICAL_CANDIDATE_SCHEMA_VERSION = "1.0" as const;

export const collectionTaskSchema = z.strictObject({
  schema_version: z.literal(COLLECTION_TASK_SCHEMA_VERSION),
  task_id: entityIdSchema,
  source_id: entityIdSchema,
  mode: z.literal("collect"),
  target_urls: z.array(urlSchema).min(1),
  requested_fields: z.array(nonEmptyStringSchema).min(1),
  entity_type: z.enum(["property", "offer"]),
  freshness_requirement: z.enum(["current_observation", "best_effort"]),
  priority: z.enum(["low", "normal", "high"]),
  created_at: isoDateTimeSchema,
});

export const rawCollectionFieldSchema = z.strictObject({
  field: nonEmptyStringSchema,
  raw_value: z.json(),
  semantics: z.enum(["exact", "lower_bound", "source_claim", "unknown"]),
  extraction_confidence: ratioSchema.nullable(),
  evidence_reference: nonEmptyStringSchema,
});

export const collectionResultStatusSchema = z.enum([
  "success",
  "partial",
  "blocked",
  "source_changed",
  "unavailable",
  "failed",
]);

export const collectionErrorCodeSchema = z.enum([
  "POLICY_DENIED",
  "SOURCE_CHANGED",
  "FETCH_FAILED",
  "TIMEOUT",
  "UNEXPECTED_CONTENT_TYPE",
  "PARSE_FAILED",
  "VALIDATION_FAILED",
  "NORMALIZATION_FAILED",
  "RATE_LIMITED",
  "AUTH_REQUIRED",
]);

/**
 * This contract deliberately cannot carry HTML. The selected source policy
 * permits only a transient response body during extraction.
 */
export const rawCollectionResultSchema = z.strictObject({
  schema_version: z.literal(RAW_COLLECTION_RESULT_SCHEMA_VERSION),
  collection_run_id: entityIdSchema,
  task_id: entityIdSchema,
  source_id: entityIdSchema,
  source_url: urlSchema,
  canonical_url: urlSchema,
  collected_at: isoDateTimeSchema,
  http_status: z.number().int().min(100).max(599).nullable(),
  content_type: nonEmptyStringSchema.nullable(),
  raw_payload_reference: z.null(),
  external_record_id: nonEmptyStringSchema.nullable(),
  extracted_fields: z.array(rawCollectionFieldSchema),
  missing_fields: z.array(nonEmptyStringSchema),
  warnings: z.array(nonEmptyStringSchema),
  adapter_version: nonEmptyStringSchema,
  parser_version: nonEmptyStringSchema,
  collector_version: nonEmptyStringSchema,
  status: collectionResultStatusSchema,
  error_code: collectionErrorCodeSchema.nullable(),
});

export type CollectionTask = z.infer<typeof collectionTaskSchema>;
export type RawCollectionField = z.infer<typeof rawCollectionFieldSchema>;
export type RawCollectionResult = z.infer<typeof rawCollectionResultSchema>;
export type CollectionResultStatus = z.infer<
  typeof collectionResultStatusSchema
>;
export type CollectionErrorCode = z.infer<typeof collectionErrorCodeSchema>;

export interface HttpCollectionResponse {
  readonly status: number;
  readonly finalUrl: string;
  readonly contentType: string | null;
  readonly body: string;
}

export interface HttpCollector {
  readonly version: string;
  get(url: string): Promise<HttpCollectionResponse>;
}

export interface SourceAdapterContext {
  readonly collectionRunId: string;
  readonly observedAt: string;
  readonly plan: CollectionPlan;
}

export interface SourceAdapter {
  readonly sourceId: string;
  readonly method: "http";
  readonly version: string;
  canHandle(task: CollectionTask): boolean;
  collect(
    task: CollectionTask,
    context: SourceAdapterContext,
  ): Promise<RawCollectionResult>;
}

export interface MatchingReadiness {
  readonly ready: boolean;
  readonly status: "ready" | "ready_with_unknowns" | "not_ready";
  readonly missingCriticalFields: readonly string[];
  readonly warnings: readonly string[];
}

export interface DuplicateDecision {
  readonly status:
    "new_property" | "reuse_property_new_offer" | "reuse_property_update_offer";
  readonly propertyId: string;
  readonly offerId: string;
  readonly identityKey: string;
  readonly reasonCodes: readonly string[];
  readonly hookVersion: string;
}

export interface TransientNormalizedCandidate {
  readonly property: Property;
  readonly offer: Offer;
  readonly evidence: readonly FieldEvidence[];
  readonly unresolvedFields: readonly string[];
  readonly warnings: readonly string[];
  readonly matchingReadiness: MatchingReadiness;
}

export interface CanonicalCandidate {
  readonly schemaVersion: typeof CANONICAL_CANDIDATE_SCHEMA_VERSION;
  readonly normalizationVersion: string;
  readonly persistence: "transient_only";
  readonly propertyCandidate: Property;
  readonly offerCandidate: Offer;
  readonly evidence: readonly FieldEvidence[];
  readonly snapshot: null;
  readonly attribution: {
    readonly label: "ВНЕШСТРОЙ";
    readonly sourceUrl: string;
  };
  readonly duplicateDecision: DuplicateDecision;
  readonly conflicts: readonly SourceConflict[];
  readonly matchingReadiness: MatchingReadiness;
  readonly unresolvedFields: readonly string[];
  readonly warnings: readonly string[];
}

export interface CanonicalState {
  readonly properties: readonly Property[];
  readonly offers: readonly Offer[];
  readonly evidence: readonly FieldEvidence[];
}

export interface DuplicateHook {
  readonly version: string;
  evaluate(
    candidate: TransientNormalizedCandidate,
    state: CanonicalState,
  ): {
    readonly decision: DuplicateDecision;
    readonly conflicts: readonly SourceConflict[];
  };
}

export interface CollectionLog {
  readonly collectionRunId: string;
  readonly sourceId: string;
  readonly taskId: string;
  readonly method: "http";
  readonly status: CollectionResultStatus;
  readonly durationMs: number;
  readonly recordsProcessed: number;
  readonly fieldsExtracted: number;
  readonly warnings: readonly string[];
  readonly errorCode: CollectionErrorCode | null;
}

export interface CollectionMetrics {
  readonly attempts: number;
  readonly successes: number;
  readonly partials: number;
  readonly failures: number;
  readonly sourceChanged: number;
  readonly durationMs: number;
}

export interface PolicyAudit {
  readonly registryVersion: string;
  readonly policyVersion: string;
  readonly operation: "scheduled_collect";
  readonly allowedMethod: "http" | null;
  readonly validatedTargetUrls: readonly string[];
  readonly validatedRequestedFields: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly decidedAt: string;
}

export interface CollectionExecutionInput {
  readonly task: CollectionTask;
  readonly environment: SourceEnvironment;
  readonly satisfiedConditions: readonly string[];
  readonly observedAt: string;
  readonly canonicalState?: CanonicalState;
}

export interface CollectionExecutionResult {
  readonly schemaVersion: "1.0";
  readonly collectionRunId: string;
  readonly status: CollectionResultStatus;
  readonly errorCode: CollectionErrorCode | null;
  readonly policyAudit: PolicyAudit;
  readonly rawResult: RawCollectionResult;
  readonly candidate: CanonicalCandidate | null;
  readonly log: CollectionLog;
  readonly metrics: CollectionMetrics;
}
