import type { ColumnType, Generated } from "kysely";

/**
 * Kysely table types for the phase-one schema.
 *
 * These mirror migrations/0001_user_state.up.sql. They are hand-written rather
 * than generated so the file can carry the reasoning: typed columns exist for
 * identifiers, foreign keys, statuses and anything queried or constrained; the
 * rest of the aggregate lives in a `document` jsonb column and is re-validated
 * on read.
 */

/** A jsonb column: any JSON goes in, unknown comes out and must be parsed. */
type Json = ColumnType<unknown, unknown, unknown>;

type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface FieldEvidenceTable {
  evidence_id: string;
  schema_version: string;
  entity_type: string;
  entity_id: string;
  field: string;
  value: Json;
  raw_value: Json;
  source_id: string;
  snapshot_id: string | null;
  source_url: string | null;
  collected_at: Timestamp;
  verification_status: string;
  freshness_status: string;
  extraction_confidence: ColumnType<
    string | null,
    number | null,
    number | null
  >;
  evidence_type: string;
  evidence_text: string | null;
  evidence_reference: string | null;
  document: Json;
  created_at: Generated<Timestamp>;
}

export interface BuyerJourneyTable {
  journey_id: string;
  schema_version: string;
  session_id: string;
  raw_request_text: string;
  parsed_request_ref: string | null;
  confirmed_user_request_id: string | null;
  confirmed_user_request_version: number | null;
  current_stage: string;
  shortlist_status: string;
  shortlist_matching_bundle_id: string | null;
  selected_property_id: string | null;
  selected_offer_id: string | null;
  selected_purchase_scenario_id: string | null;
  comparison_id: string | null;
  active_expert_request_id: string | null;
  latest_decision_update_id: string | null;
  recoverable_error: string | null;
  last_recompute_at: Timestamp | null;
  document: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ParsedRequestTable {
  parsed_request_ref: string;
  journey_id: string | null;
  parser_version: string;
  document: Json;
  created_at: Generated<Timestamp>;
}

export interface ConfirmedRequestTable {
  user_request_id: string;
  user_request_version: number;
  record_version: string;
  supersedes_version: number | null;
  confirmed_at: Timestamp;
  document: Json;
  created_at: Generated<Timestamp>;
}

export interface MatchingBundleTable {
  matching_bundle_id: string;
  schema_version: string;
  user_request_id: string;
  user_request_version: number;
  generated_at: Timestamp;
  matching_algorithm_version: string;
  confidence_algorithm_version: string;
  criteria_registry_version: string;
  dataset_id: string;
  dataset_version: string;
  dataset_type: string;
  partial: boolean;
  stale: Generated<boolean>;
  supersedes_bundle_id: string | null;
  document: Json;
  created_at: Generated<Timestamp>;
}

export interface MatchingBundleEntryTable {
  matching_bundle_id: string;
  property_id: string;
  selected_offer_id: string | null;
  selected_purchase_scenario_id: string | null;
  origin: string;
  eligibility_status: string;
  match_result_id: string;
  match_score: ColumnType<string, number, number>;
  data_quality_id: string | null;
  data_confidence_score: ColumnType<
    string | null,
    number | null,
    number | null
  >;
  data_completeness_score: ColumnType<
    string | null,
    number | null,
    number | null
  >;
  critical_unknown_count: Generated<number>;
  match_document: Json;
  data_quality_document: Json | null;
}

export interface ComparisonTable {
  comparison_id: string;
  schema_version: string;
  journey_id: string;
  user_request_id: string;
  user_request_version: number;
  version: number;
  status: string;
  document: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ComparisonItemTable {
  comparison_id: string;
  property_id: string;
  offer_id: string | null;
  purchase_scenario_id: string | null;
  matching_bundle_id: string;
  position: number;
}

export interface DecisionUpdateTable {
  update_id: string;
  schema_version: string;
  journey_id: string;
  trigger_type: string;
  trigger_ref: string;
  previous_matching_bundle_id: string | null;
  new_matching_bundle_id: string | null;
  status: string;
  error_code: string | null;
  document: Json;
  created_at: Timestamp;
}

export interface DecisionMetricSnapshotTable {
  update_id: string;
  phase: string;
  property_id: string;
  match_result_id: string;
  match_result_ref: string;
  match_score: ColumnType<string, number, number>;
  eligibility_status: string;
  data_quality_id: string | null;
  data_quality_ref: string | null;
  data_confidence_score: ColumnType<
    string | null,
    number | null,
    number | null
  >;
  data_completeness_score: ColumnType<
    string | null,
    number | null,
    number | null
  >;
  critical_unknowns: Generated<string[]>;
}

export interface ImportedCandidateTable {
  ingestion_id: string;
  property_id: string;
  offer_id: string | null;
  source_id: string;
  source_mode: string;
  matching_readiness: string;
  document: Json;
  created_at: Generated<Timestamp>;
}

export interface JourneyImportedCandidateTable {
  journey_id: string;
  ingestion_id: string;
  attached_at: Generated<Timestamp>;
}

export interface CanonicalDecisionOverlayTable {
  overlay_id: string;
  entity_type: string;
  entity_id: string;
  field: string;
  value: Json;
  verification_status: string;
  evidence_id: string;
  created_at: Timestamp;
}

export interface JourneyAuditEventTable {
  event_id: string;
  instrumentation_version: string;
  journey_id: string;
  session_id: string;
  event_type: string;
  occurred_at: Timestamp;
  metadata: Json;
}

export interface ExpertContextPackageTable {
  context_package_id: string;
  package_version: string;
  expert_request_id: string;
  user_request_ref: string;
  journey_id: string | null;
  user_request_version: number | null;
  matching_bundle_id: string | null;
  comparison_id: string | null;
  comparison_version: number | null;
  document: Json;
  created_at: Generated<Timestamp>;
}

export interface ExpertRequestTable {
  request_id: string;
  request_schema_version: string;
  owner_type: string;
  owner_id: string;
  request_type: string;
  trigger_type: string;
  question_category: string;
  user_request_id: string;
  comparison_id: string | null;
  question: string;
  priority: string;
  priority_score: ColumnType<string, number, number>;
  priority_policy_version: string;
  required_specialist: string;
  routing_version: string;
  status: string;
  context_package_id: string;
  dedup_key: string;
  assigned_specialist_ref: string | null;
  document: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ExpertResultTable {
  request_id: string;
  expert_result_id: string;
  result_version: string;
  status: string;
  specialist_ref: string;
  specialist_type: string;
  document: Json;
  completed_at: Timestamp;
}

export interface ExpertAuditEventTable {
  event_id: string;
  request_id: string;
  event_type: string;
  actor_type: string;
  actor_ref: string | null;
  metadata: Json;
  created_at: Timestamp;
}

export interface ExpertResultDraftTable {
  request_id: string;
  draft_version: string;
  specialist_ref: string;
  specialist_type: string;
  document: Json;
  updated_at: Timestamp;
}

export interface JourneyFeedbackTable {
  feedback_id: string;
  journey_id: string;
  stage: string;
  question_code: string;
  answer: string;
  optional_comment: string | null;
  created_at: Timestamp;
}

export interface ApplicationErrorTable {
  error_id: string;
  error_code: string;
  layer: string;
  journey_id: string | null;
  stage: string | null;
  recoverable: boolean;
  user_visible: boolean;
  occurred_at: Timestamp;
  recovered_at: Timestamp | null;
  context_ids: Json;
  app_version: string;
}

export interface RefreshTaskTable {
  refresh_task_id: string;
  schema_version: string;
  refresh_policy_version: string;
  operation: string;
  entity_type: string;
  entity_id: string;
  source_id: string;
  target_urls: Generated<string[]>;
  field_paths: Generated<string[]>;
  critical_field_paths: Generated<string[]>;
  reason: string;
  reason_history: Generated<string[]>;
  priority: string;
  priority_score: ColumnType<string, number, number>;
  journey_stage: string;
  status: string;
  attempt_count: Generated<number>;
  max_attempts: number;
  dedup_key: string;
  policy_version: string | null;
  source_registry_version: string | null;
  supersedes_task_ids: Generated<string[]>;
  superseded_by_task_id: string | null;
  requested_at: Timestamp;
  requested_by: string;
  not_before: Timestamp;
  deadline: Timestamp | null;
  claimed_by: string | null;
  claimed_at: Timestamp | null;
  lease_expires_at: Timestamp | null;
  completed_at: Timestamp | null;
  last_error_code: string | null;
}

export interface Database {
  application_errors: ApplicationErrorTable;
  buyer_journeys: BuyerJourneyTable;
  canonical_decision_overlays: CanonicalDecisionOverlayTable;
  comparison_items: ComparisonItemTable;
  comparisons: ComparisonTable;
  confirmed_requests: ConfirmedRequestTable;
  decision_metric_snapshots: DecisionMetricSnapshotTable;
  decision_updates: DecisionUpdateTable;
  expert_audit_events: ExpertAuditEventTable;
  expert_context_packages: ExpertContextPackageTable;
  expert_requests: ExpertRequestTable;
  expert_result_drafts: ExpertResultDraftTable;
  expert_results: ExpertResultTable;
  field_evidence: FieldEvidenceTable;
  imported_candidates: ImportedCandidateTable;
  journey_audit_events: JourneyAuditEventTable;
  journey_feedback: JourneyFeedbackTable;
  journey_imported_candidates: JourneyImportedCandidateTable;
  matching_bundle_entries: MatchingBundleEntryTable;
  matching_bundles: MatchingBundleTable;
  parsed_requests: ParsedRequestTable;
  refresh_tasks: RefreshTaskTable;
}
