import type { ComparisonSelection } from "../comparison/selection";
import type { FieldEvidence, UserRequest } from "../domain";
import type {
  ExpertContextPackage,
  ExpertRequest,
  ExpertResult,
} from "../expert";
import type {
  DataQualityEngineResult,
  MatchingEngineResult,
} from "../matching";
import type { NormalizedUserUrlCandidate } from "../user-url-ingestion";
import type { UserRequestParserResult } from "../user-request-parser";

export const BUYER_JOURNEY_SCHEMA_VERSION = "buyer-journey-v1" as const;
export const CONFIRMED_REQUEST_RECORD_VERSION =
  "confirmed-request-record-v1" as const;
export const MATCHING_BUNDLE_SCHEMA_VERSION = "matching-bundle-v1" as const;
export const COMPARISON_STATE_SCHEMA_VERSION = "comparison-state-v1" as const;
export const DECISION_UPDATE_SCHEMA_VERSION = "decision-update-v1" as const;
export const JOURNEY_INSTRUMENTATION_VERSION =
  "buyer-journey-instrumentation-v1" as const;

export type BuyerJourneyStage =
  | "request_entry"
  | "request_confirmation"
  | "matching"
  | "shortlist"
  | "property_detail"
  | "comparison"
  | "expert_request"
  | "expert_in_progress"
  | "expert_result"
  | "updated_decision";

export interface ShortlistState {
  readonly status:
    "not_started" | "recompute_required" | "ready" | "no_eligible" | "failed";
  readonly matching_bundle_id: string | null;
  readonly property_ids: readonly string[];
  readonly update_available: boolean;
}

export interface BuyerJourney {
  readonly schema_version: typeof BUYER_JOURNEY_SCHEMA_VERSION;
  readonly journey_id: string;
  readonly session_id: string;
  readonly raw_request_text: string;
  readonly parsed_request_ref: string | null;
  readonly confirmed_user_request_id: string | null;
  readonly confirmed_user_request_version: number | null;
  readonly shortlist_state: ShortlistState;
  readonly selected_property_id: string | null;
  readonly selected_offer_id: string | null;
  readonly selected_purchase_scenario_id: string | null;
  readonly comparison_id: string | null;
  readonly comparison_property_ids: readonly string[];
  /**
   * What the buyer has ticked on the shortlist but not yet compared.
   *
   * This used to live in sessionStorage, which meant a closed tab lost it.
   * It is journey state like everything else: distinct from
   * comparison_property_ids, which describes a comparison that already exists.
   */
  readonly comparison_selection: ComparisonSelection | null;
  readonly expert_request_ids: readonly string[];
  readonly active_expert_request_id: string | null;
  readonly last_recompute_at: string | null;
  readonly current_stage: BuyerJourneyStage;
  readonly latest_decision_update_id: string | null;
  readonly recoverable_error: JourneyErrorCode | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ConfirmedRequestRecord {
  readonly record_version: typeof CONFIRMED_REQUEST_RECORD_VERSION;
  readonly user_request_id: string;
  readonly user_request_version: number;
  readonly request: UserRequest;
  readonly confirmed_at: string;
  readonly supersedes_version: number | null;
}

/** Explicit provenance prevents synthetic and supplied records looking live. */
export type MatchingCandidateOrigin =
  | "synthetic"
  | "manual_curated"
  | "approved_live_source"
  | "user_supplied"
  | "expert_supplied";

export interface MatchingBundleEntry {
  readonly property_id: string;
  readonly selected_offer_id: string | null;
  readonly selected_purchase_scenario_id: string | null;
  readonly origin: MatchingCandidateOrigin;
  readonly match: MatchingEngineResult;
  readonly data_quality: DataQualityEngineResult | null;
}

export interface MatchingBundle {
  readonly schema_version: typeof MATCHING_BUNDLE_SCHEMA_VERSION;
  readonly matching_bundle_id: string;
  readonly user_request_id: string;
  readonly user_request_version: number;
  readonly generated_at: string;
  readonly entries: readonly MatchingBundleEntry[];
  readonly matching_algorithm_version: string;
  readonly confidence_algorithm_version: string;
  readonly criteria_registry_version: string;
  readonly dataset_snapshot: {
    readonly dataset_id: string;
    readonly dataset_version: string;
    readonly dataset_type:
      | "synthetic_pilot"
      /** Real objects entered by hand from an approved source. */
      | "manual_curated_pilot"
      | "mixed_explicit"
      | "user_supplied_only"
      | "empty_pilot";
  };
  readonly imported_candidate_ids: readonly string[];
  readonly partial: boolean;
  readonly stale: boolean;
  readonly supersedes_bundle_id: string | null;
}

export interface ComparisonStateItem {
  readonly property_id: string;
  readonly offer_id: string | null;
  readonly purchase_scenario_id: string | null;
  readonly matching_bundle_id: string;
}

export interface ComparisonState {
  readonly schema_version: typeof COMPARISON_STATE_SCHEMA_VERSION;
  readonly comparison_id: string;
  readonly journey_id: string;
  readonly user_request_id: string;
  readonly user_request_version: number;
  readonly version: number;
  readonly items: readonly ComparisonStateItem[];
  readonly status: "active" | "recompute_required" | "superseded";
  readonly created_at: string;
  readonly updated_at: string;
}

export type DecisionUpdateTrigger =
  | "user_request_changed"
  | "expert_result"
  | "refresh_result"
  | "user_url_ingestion"
  | "source_update";

export interface DecisionMetricSnapshot {
  readonly property_id: string;
  readonly match_result_id: string;
  readonly match_result_ref: string;
  readonly match_score: number;
  readonly eligibility_status: string;
  readonly data_quality_id: string | null;
  readonly data_quality_ref: string | null;
  readonly data_confidence_score: number | null;
  readonly data_completeness_score: number | null;
  readonly critical_unknowns: readonly string[];
}

export interface DecisionUpdate {
  readonly schema_version: typeof DECISION_UPDATE_SCHEMA_VERSION;
  readonly update_id: string;
  readonly journey_id: string;
  readonly trigger_type: DecisionUpdateTrigger;
  readonly trigger_ref: string;
  readonly affected_property_ids: readonly string[];
  readonly previous_matching_bundle_id: string | null;
  readonly new_matching_bundle_id: string | null;
  readonly previous_results: readonly DecisionMetricSnapshot[];
  readonly new_results: readonly DecisionMetricSnapshot[];
  readonly resolved_unknowns: readonly string[];
  readonly unresolved_unknowns: readonly string[];
  readonly new_conflicts: readonly string[];
  readonly resolved_conflicts: readonly string[];
  readonly status: "completed" | "pending" | "failed";
  readonly error_code:
    "MATCH_RECOMPUTE_FAILED" | "CONFIDENCE_RECOMPUTE_FAILED" | null;
  readonly created_at: string;
}

export interface CanonicalDecisionOverlay {
  readonly overlay_id: string;
  readonly entity_type:
    | "property"
    | "offer"
    | "purchase_scenario"
    | "property_financing_eligibility";
  readonly entity_id: string;
  readonly field: string;
  readonly value: unknown;
  readonly verification_status: "confirmed" | "claimed" | "conflicting";
  readonly evidence_id: string;
  readonly created_at: string;
}

/**
 * Everything a browser needs to rebuild its screens from a journey id.
 *
 * The client keeps only the session id and the journey id; this is what it
 * reads back with them, so closing a tab loses nothing.
 */
export interface JourneyClientState {
  readonly journey_id: string;
  readonly session_id: string;
  readonly owner_id: string;
  readonly raw_request_text: string;
  readonly current_stage: BuyerJourneyStage;
  readonly parsed_request: UserRequestParserResult | null;
  readonly confirmed_request: UserRequest | null;
  readonly confirmed_request_version: number | null;
  readonly comparison_selection: ComparisonSelection | null;
  readonly imported_candidates: readonly NormalizedUserUrlCandidate[];
}

export interface JourneyExpertSnapshot {
  readonly request: ExpertRequest;
  readonly context: ExpertContextPackage;
  readonly result: ExpertResult | null;
}

export interface JourneyDataSnapshot {
  readonly parsed_request: UserRequestParserResult | null;
  readonly confirmed_request: ConfirmedRequestRecord | null;
  readonly matching_bundle: MatchingBundle | null;
  readonly comparison: ComparisonState | null;
  readonly decision_update: DecisionUpdate | null;
  readonly imported_candidates: readonly NormalizedUserUrlCandidate[];
  readonly expert: JourneyExpertSnapshot | null;
  readonly evidence: readonly FieldEvidence[];
}

export const JOURNEY_ERROR_CODES = [
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
] as const;

export type JourneyErrorCode = (typeof JOURNEY_ERROR_CODES)[number];

export type JourneyAuditEventType =
  | "journey_started"
  | "request_parsed"
  | "request_confirmed"
  | "matching_completed"
  | "shortlist_viewed"
  | "property_opened"
  | "comparison_created"
  | "comparison_updated"
  | "expert_request_created"
  | "expert_result_completed"
  | "refresh_requested"
  | "refresh_completed"
  | "decision_recomputed";

export interface JourneyAuditEvent {
  readonly instrumentation_version: typeof JOURNEY_INSTRUMENTATION_VERSION;
  readonly event_id: string;
  readonly journey_id: string;
  readonly session_id: string;
  readonly event_type: JourneyAuditEventType;
  readonly occurred_at: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}
