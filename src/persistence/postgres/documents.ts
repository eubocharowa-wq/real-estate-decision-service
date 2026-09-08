import { z } from "zod";

import {
  BUYER_JOURNEY_SCHEMA_VERSION,
  COMPARISON_STATE_SCHEMA_VERSION,
  CONFIRMED_REQUEST_RECORD_VERSION,
  DECISION_UPDATE_SCHEMA_VERSION,
  JOURNEY_INSTRUMENTATION_VERSION,
  MATCHING_BUNDLE_SCHEMA_VERSION,
} from "../../buyer-journey/contracts";
import { comparisonSelectionSchema } from "../../comparison/selection";
import {
  dataQualitySchema,
  matchResultSchema,
  userRequestSchema,
} from "../../domain";

/**
 * Read guards for jsonb columns.
 *
 * A row that does not parse throws instead of flowing into the domain as a
 * half-built aggregate — a corrupted or foreign row has to fail where it is
 * read, not three layers later.
 *
 * Where the domain already publishes a zod schema (field evidence, expert
 * request, expert result, refresh task, parser result, user request, match
 * result, data quality) that schema is used directly and nothing is redefined
 * here. The schemas below exist only for aggregates the domain declares as
 * TypeScript interfaces.
 *
 * Deliberate limit: the matching and confidence engine payloads
 * (MatchingEngineResult, DataQualityEngineResult) are deep structures with no
 * published schema. Their envelope is checked — including the nested
 * match_result and data_quality through the domain's own schemas — and the
 * engine internals pass through as they are. Inventing a second description of
 * them here would create a source of truth that drifts from the engine.
 */

const isoDateTime = z.string().min(1);
const entityId = z.string().min(1);

export const shortlistStateSchema = z.object({
  status: z.enum([
    "not_started",
    "recompute_required",
    "ready",
    "no_eligible",
    "failed",
  ]),
  matching_bundle_id: entityId.nullable(),
  property_ids: z.array(entityId),
  update_available: z.boolean(),
});

export const buyerJourneyDocumentSchema = z.object({
  schema_version: z.literal(BUYER_JOURNEY_SCHEMA_VERSION),
  journey_id: entityId,
  session_id: entityId,
  raw_request_text: z.string(),
  parsed_request_ref: entityId.nullable(),
  confirmed_user_request_id: entityId.nullable(),
  confirmed_user_request_version: z.number().int().positive().nullable(),
  shortlist_state: shortlistStateSchema,
  selected_property_id: entityId.nullable(),
  selected_offer_id: entityId.nullable(),
  selected_purchase_scenario_id: entityId.nullable(),
  comparison_id: entityId.nullable(),
  comparison_property_ids: z.array(entityId),
  comparison_selection: comparisonSelectionSchema.nullable(),
  expert_request_ids: z.array(entityId),
  active_expert_request_id: entityId.nullable(),
  last_recompute_at: isoDateTime.nullable(),
  current_stage: z.enum([
    "request_entry",
    "request_confirmation",
    "matching",
    "shortlist",
    "property_detail",
    "comparison",
    "expert_request",
    "expert_in_progress",
    "expert_result",
    "updated_decision",
  ]),
  latest_decision_update_id: entityId.nullable(),
  recoverable_error: z
    .enum([
      "MISSING_JOURNEY_CONTEXT",
      "INVALID_TRANSITION",
      "STALE_REQUEST_VERSION",
      "MATCH_RECOMPUTE_FAILED",
      "CONFIDENCE_RECOMPUTE_FAILED",
      "EXPERT_CONTEXT_STALE",
      "INGESTION_FAILED",
      "REFRESH_PENDING",
      "SOURCE_POLICY_BLOCKED",
      "FEATURE_DISABLED",
      "ENTITY_NOT_FOUND",
      "STORAGE_UNAVAILABLE",
    ])
    .nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});

export const confirmedRequestDocumentSchema = z.object({
  record_version: z.literal(CONFIRMED_REQUEST_RECORD_VERSION),
  user_request_id: entityId,
  user_request_version: z.number().int().positive(),
  request: userRequestSchema,
  confirmed_at: isoDateTime,
  supersedes_version: z.number().int().positive().nullable(),
});

/** MatchingEngineResult envelope; the score details stay as the engine wrote them. */
export const matchingEngineResultSchema = z.looseObject({
  match_result: matchResultSchema,
  selected_offer_id: entityId.nullable(),
});

/** DataQualityEngineResult envelope, same reasoning. */
export const dataQualityEngineResultSchema = z.looseObject({
  data_quality: dataQualitySchema,
  match_result: matchResultSchema,
});

export const matchingBundleEntrySchema = z.object({
  property_id: entityId,
  selected_offer_id: entityId.nullable(),
  selected_purchase_scenario_id: entityId.nullable(),
  origin: z.enum([
    "synthetic",
    "manual_curated",
    "approved_live_source",
    "user_supplied",
    "expert_supplied",
  ]),
  match: matchingEngineResultSchema,
  data_quality: dataQualityEngineResultSchema.nullable(),
});

/** The bundle without its entries: those are rows in matching_bundle_entries. */
export const matchingBundleDocumentSchema = z.object({
  schema_version: z.literal(MATCHING_BUNDLE_SCHEMA_VERSION),
  matching_bundle_id: entityId,
  user_request_id: entityId,
  user_request_version: z.number().int().positive(),
  generated_at: isoDateTime,
  matching_algorithm_version: z.string().min(1),
  confidence_algorithm_version: z.string().min(1),
  criteria_registry_version: z.string().min(1),
  dataset_snapshot: z.object({
    dataset_id: z.string().min(1),
    dataset_version: z.string().min(1),
    dataset_type: z.enum([
      "synthetic_pilot",
      "mixed_explicit",
      "user_supplied_only",
      "empty_pilot",
    ]),
  }),
  imported_candidate_ids: z.array(entityId),
  partial: z.boolean(),
  stale: z.boolean(),
  supersedes_bundle_id: entityId.nullable(),
});

export const comparisonItemSchema = z.object({
  property_id: entityId,
  offer_id: entityId.nullable(),
  purchase_scenario_id: entityId.nullable(),
  matching_bundle_id: entityId,
});

/** The comparison without its items: those are rows in comparison_items. */
export const comparisonDocumentSchema = z.object({
  schema_version: z.literal(COMPARISON_STATE_SCHEMA_VERSION),
  comparison_id: entityId,
  journey_id: entityId,
  user_request_id: entityId,
  user_request_version: z.number().int().positive(),
  version: z.number().int().positive(),
  status: z.enum(["active", "recompute_required", "superseded"]),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});

export const decisionMetricSnapshotSchema = z.object({
  property_id: entityId,
  match_result_id: entityId,
  match_result_ref: z.string().min(1),
  match_score: z.number(),
  eligibility_status: z.string().min(1),
  data_quality_id: entityId.nullable(),
  data_quality_ref: z.string().min(1).nullable(),
  data_confidence_score: z.number().nullable(),
  data_completeness_score: z.number().nullable(),
  critical_unknowns: z.array(z.string()),
});

/** The update without its metric snapshots: those are child rows. */
export const decisionUpdateDocumentSchema = z.object({
  schema_version: z.literal(DECISION_UPDATE_SCHEMA_VERSION),
  update_id: entityId,
  journey_id: entityId,
  trigger_type: z.enum([
    "user_request_changed",
    "expert_result",
    "refresh_result",
    "user_url_ingestion",
    "source_update",
  ]),
  trigger_ref: z.string().min(1),
  affected_property_ids: z.array(entityId),
  previous_matching_bundle_id: entityId.nullable(),
  new_matching_bundle_id: entityId.nullable(),
  resolved_unknowns: z.array(z.string()),
  unresolved_unknowns: z.array(z.string()),
  new_conflicts: z.array(z.string()),
  resolved_conflicts: z.array(z.string()),
  status: z.enum(["completed", "pending", "failed"]),
  error_code: z
    .enum(["MATCH_RECOMPUTE_FAILED", "CONFIDENCE_RECOMPUTE_FAILED"])
    .nullable(),
  created_at: isoDateTime,
});

export const canonicalOverlayDocumentSchema = z.object({
  overlay_id: entityId,
  entity_type: z.enum([
    "property",
    "offer",
    "purchase_scenario",
    "property_financing_eligibility",
  ]),
  entity_id: entityId,
  field: z.string().min(1),
  value: z.unknown(),
  verification_status: z.enum(["confirmed", "claimed", "conflicting"]),
  evidence_id: entityId,
  created_at: isoDateTime,
});

export const journeyAuditEventSchema = z.object({
  instrumentation_version: z.literal(JOURNEY_INSTRUMENTATION_VERSION),
  event_id: entityId,
  journey_id: entityId,
  session_id: entityId,
  event_type: z.enum([
    "journey_started",
    "request_parsed",
    "request_confirmed",
    "matching_completed",
    "shortlist_viewed",
    "property_opened",
    "comparison_created",
    "comparison_updated",
    "expert_request_created",
    "expert_result_completed",
    "refresh_requested",
    "refresh_completed",
    "decision_recomputed",
  ]),
  occurred_at: isoDateTime,
  metadata: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
});

export const journeyFeedbackDocumentSchema = z.object({
  feedback_id: entityId,
  journey_id: entityId,
  stage: z.enum(["shortlist", "comparison", "expert_result", "journey_end"]),
  question_code: z.string().min(1),
  answer: z.enum(["yes", "partly", "no", "not_sure"]),
  optional_comment: z.string().nullable(),
  created_at: isoDateTime,
});

export const applicationErrorDocumentSchema = z.object({
  error_id: entityId,
  error_code: z.string().min(1),
  layer: z.string().min(1),
  journey_id: entityId.nullable(),
  stage: z.string().nullable(),
  recoverable: z.boolean(),
  user_visible: z.boolean(),
  occurred_at: isoDateTime,
  recovered_at: isoDateTime.nullable(),
  context_ids: z.record(z.string(), z.string()),
  app_version: z.string(),
});

/**
 * Parses a stored document, failing loudly with the table and key that carried
 * the bad row.
 */
export const parseStored = <T>(
  schema: z.ZodType<T>,
  value: unknown,
  location: string,
): T => {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error(
    `CORRUPTED_STORED_DOCUMENT:${location}:${parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`)
      .join("; ")}`,
  );
};
