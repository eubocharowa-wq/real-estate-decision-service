import type { FieldEvidence, Offer, Property, Source } from "../domain";
import type { CollectionTask } from "../data-collection/source-adapters";
import type {
  CollectionPlan,
  RegistryCollectionMethod,
  SourceEnvironment,
  SourceOperation,
} from "../data-collection/source-registry";
import type { BuyerJourneyStage } from "../buyer-journey/contracts";
import type {
  PilotApplicationMode,
  PilotCohort,
  PilotDataOrigin,
} from "./config";

export const PILOT_CANDIDATE_SCHEMA_VERSION = "pilot-candidate-v1" as const;
export const PILOT_TELEMETRY_VERSION = "pilot-telemetry-v1" as const;
export const PILOT_RELEASE_GATE_VERSION = "pilot-release-gate-v1" as const;
export const REAL_PILOT_DATASET_MANIFEST_VERSION =
  "real-pilot-dataset-manifest-v1" as const;
export const REAL_PILOT_DATASET_CANDIDATE_VERSION =
  "real-pilot-dataset-candidate-v1" as const;
export const REAL_PILOT_MANUAL_SELECTION_SOURCE_VERSION =
  "real-pilot-manual-selection-source-v1" as const;

export interface PilotFinancingClaim {
  readonly field: string;
  readonly verification_status:
    | "confirmed"
    | "claimed"
    | "unconfirmed"
    | "conflicting"
    | "stale"
    | "unknown";
  readonly evidence_refs: readonly string[];
}

export interface PilotCandidate {
  readonly schema_version: typeof PILOT_CANDIDATE_SCHEMA_VERSION;
  readonly origin: PilotDataOrigin;
  readonly property: Property;
  readonly offer: Offer;
  /** Primary offer source; additional evidence sources are explicit below. */
  readonly source: Source;
  readonly sources: readonly Source[];
  readonly evidence: readonly FieldEvidence[];
  readonly financing_claims: readonly PilotFinancingClaim[];
  readonly observed_at: string;
  readonly environment: SourceEnvironment;
}

export interface PilotCandidateValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly property_id: string | null;
  readonly offer_id: string | null;
  readonly origin: PilotDataOrigin | null;
  readonly policy_version: string;
}

export type RealPilotDataOrigin =
  "user_supplied" | "manual_curated" | "approved_live_source";

export interface RealPilotObservedFact {
  readonly field: string;
  readonly value: unknown;
  readonly verification_status:
    | "confirmed"
    | "claimed"
    | "unconfirmed"
    | "conflicting"
    | "stale"
    | "unknown";
  readonly evidence_refs: readonly string[];
}

export interface RealPilotDatasetCandidate {
  readonly schema_version: typeof REAL_PILOT_DATASET_CANDIDATE_VERSION;
  readonly candidate_id: string;
  readonly origin: RealPilotDataOrigin;
  readonly source_url: string;
  readonly observed_facts: readonly RealPilotObservedFact[];
  readonly explicit_unknown_fields: readonly string[];
  readonly evidence_refs: readonly string[];
  readonly observed_at: string;
  readonly freshness_status:
    "fresh" | "aging" | "stale" | "expired" | "unknown";
  readonly collection_mode:
    "manual_fallback" | "manual_curated" | "approved_live_source";
  readonly automated_fetch_performed: boolean;
  readonly candidate: PilotCandidate;
}

export interface RealPilotManualSelectionSource {
  readonly schema_version: typeof REAL_PILOT_MANUAL_SELECTION_SOURCE_VERSION;
  readonly seed_id: string;
  readonly origin: "user_supplied";
  readonly source_url: string;
  readonly status: "manual_selection_required";
  readonly explicit_unknown_fields: readonly string[];
  readonly observed_at: string;
  readonly freshness_status: "unknown";
  readonly automated_fetch_performed: false;
  readonly reason: string;
}

export interface RealPilotDatasetManifest {
  readonly schema_version: typeof REAL_PILOT_DATASET_MANIFEST_VERSION;
  readonly manifest_id: string;
  readonly dataset_version: string;
  readonly environment: "pilot";
  readonly created_at: string;
  readonly candidates: readonly RealPilotDatasetCandidate[];
  readonly manual_selection_sources: readonly RealPilotManualSelectionSource[];
}

export interface RealPilotDatasetValidationResult {
  readonly schema_version: "real-pilot-dataset-validation-v1";
  readonly valid: boolean;
  readonly configured: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly candidate_count: number;
  readonly valid_candidate_count: number;
  readonly manual_selection_source_count: number;
  readonly candidate_results: readonly PilotCandidateValidationResult[];
  readonly manifest_version: string | null;
}

export interface RealPilotDatasetRuntime {
  readonly manifest: RealPilotDatasetManifest | null;
  readonly validation: RealPilotDatasetValidationResult;
  readonly candidates: readonly PilotCandidate[];
}

export interface SourcePilotReadiness {
  readonly source_id: string;
  readonly ready: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly approved_operations: readonly SourceOperation[];
  readonly approved_environment: SourceEnvironment | null;
  readonly policy_version: string;
}

export type OpenClawControlledMode =
  "targeted_refresh" | "verify" | "user_url_ingestion" | "monitor_changes";

export interface OpenClawCollectionRequest {
  readonly request_id: string;
  readonly controlled_mode: OpenClawControlledMode;
  readonly environment: SourceEnvironment;
  readonly collection_task: CollectionTask;
  readonly satisfied_conditions: readonly string[];
  readonly requested_at: string;
}

export interface OpenClawExtractedFact {
  readonly field: string;
  readonly value: unknown;
  readonly verification_status: "claimed" | "unconfirmed" | "unknown";
  /** Mirrors the staged subset of FieldEvidence without creating canonical evidence. */
  readonly evidence: {
    readonly source_id: string;
    readonly source_url: string;
    readonly observed_at: string;
    readonly evidence_type: "extraction";
    readonly evidence_reference: string;
    readonly raw_value: unknown;
    readonly extraction_confidence: number | null;
  };
}

export interface OpenClawStagedResult {
  readonly schema_version: "openclaw-staged-result-v2";
  readonly request_id: string;
  readonly collection_run_id: string;
  readonly source_id: string;
  readonly source_url: string;
  readonly observed_at: string;
  readonly identity_hints: {
    readonly property_external_id: string | null;
    readonly offer_external_id: string | null;
  };
  readonly status: "partial" | "complete" | "source_changed" | "failed";
  readonly facts: readonly OpenClawExtractedFact[];
  readonly missing_fields: readonly string[];
  readonly raw_content_reference: null;
  readonly warnings: readonly string[];
}

export interface OpenClawExecutor {
  execute(input: {
    readonly request: OpenClawCollectionRequest;
    readonly plan: CollectionPlan;
  }): Promise<OpenClawStagedResult>;
}

export interface OpenClawExecutionOutcome {
  readonly status: "blocked" | "staged" | "failed";
  readonly blocker_code:
    | "APPLICATION_MODE_DENIED"
    | "SOURCE_POLICY_DENIED"
    | "SOURCE_NOT_PILOT_READY"
    | "FEATURE_DISABLED"
    | "KILL_SWITCH_ACTIVE"
    | "COLLECTION_PLAN_DENIED"
    | "GATEWAY_ENDPOINT_DISABLED"
    | "GATEWAY_AUTH_DENIED"
    | "GATEWAY_REQUEST_REJECTED"
    | "GATEWAY_REDIRECT_BLOCKED"
    | "GATEWAY_AGENT_MODEL_MISMATCH"
    | "GATEWAY_TIMEOUT"
    | "GATEWAY_TRANSPORT_ERROR"
    | "MALFORMED_GATEWAY_RESPONSE"
    | "EXECUTION_FAILED"
    | null;
  readonly executor_invoked: boolean;
  readonly policy_version: string;
  readonly collection_method: RegistryCollectionMethod | null;
  readonly readiness: SourcePilotReadiness;
  readonly plan: CollectionPlan | null;
  readonly staged_result: OpenClawStagedResult | null;
}

export interface CoverageSummary {
  readonly schema_version: "coverage-summary-v1";
  readonly geography: readonly string[];
  readonly property_types: readonly string[];
  readonly active_sources: readonly string[];
  readonly unavailable_sources: readonly string[];
  readonly blocked_sources: readonly string[];
  readonly stale_sources: readonly string[];
  readonly object_count: number;
  readonly coverage_gaps: readonly string[];
  readonly confidence: "high" | "medium" | "low" | "unknown";
  readonly empty_result_kind:
    | "not_empty"
    | "no_eligible_in_available_data"
    | "insufficient_data_coverage";
  readonly user_message: string;
  readonly generated_at: string;
}

export const PILOT_TELEMETRY_EVENTS = [
  "buyer_journey_started",
  "request_submitted",
  "request_parsed",
  "request_confirmation_viewed",
  "request_confirmed",
  "request_edited",
  "matching_started",
  "matching_completed",
  "shortlist_viewed",
  "property_opened",
  "comparison_created",
  "comparison_item_added",
  "comparison_viewed",
  "user_url_ingestion_started",
  "user_url_ingestion_completed",
  "expert_request_created",
  "expert_result_viewed",
  "decision_recomputed",
  "journey_feedback_submitted",
] as const;
export type PilotTelemetryEventName = (typeof PILOT_TELEMETRY_EVENTS)[number];

export interface PilotTelemetryEvent {
  readonly schema_version: typeof PILOT_TELEMETRY_VERSION;
  readonly event_id: string;
  readonly event_name: PilotTelemetryEventName;
  readonly journey_id: string;
  readonly session_id: string;
  readonly stage: BuyerJourneyStage;
  readonly occurred_at: string;
  readonly app_version: string;
  readonly environment: PilotApplicationMode;
  readonly cohort: PilotCohort;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export type PilotFeedbackStage =
  "shortlist" | "comparison" | "expert_result" | "journey_end";

export interface JourneyFeedback {
  readonly feedback_id: string;
  readonly journey_id: string;
  readonly stage: PilotFeedbackStage;
  readonly question_code: string;
  readonly answer: "yes" | "partly" | "no" | "not_sure";
  /** Potentially sensitive: stored separately and never copied to telemetry. */
  readonly optional_comment: string | null;
  readonly created_at: string;
}

export type ApplicationErrorLayer =
  | "parser"
  | "matching"
  | "confidence"
  | "shortlist"
  | "comparison"
  | "user_url_ingestion"
  | "source_policy"
  | "adapter_openclaw"
  | "refresh"
  | "expert_workflow"
  | "recompute";

export interface ApplicationErrorRecord {
  readonly error_id: string;
  readonly error_code: string;
  readonly layer: ApplicationErrorLayer;
  readonly journey_id: string | null;
  readonly stage: BuyerJourneyStage | null;
  readonly recoverable: boolean;
  readonly user_visible: boolean;
  readonly occurred_at: string;
  readonly context_ids: Readonly<Record<string, string>>;
  readonly app_version: string;
  readonly recovered_at: string | null;
}

export interface JourneyDiagnosticReport {
  readonly schema_version: "journey-diagnostic-v1";
  readonly journey_id: string;
  readonly session_id: string;
  readonly stage: BuyerJourneyStage;
  readonly timeline: readonly {
    readonly event_id: string;
    readonly event_name: string;
    readonly occurred_at: string;
  }[];
  readonly active_request: {
    readonly request_id: string | null;
    readonly version: number | null;
  };
  readonly matching: {
    readonly bundle_id: string | null;
    readonly algorithm_version: string | null;
  };
  readonly selected_property_ids: readonly string[];
  readonly comparison_id: string | null;
  readonly expert_request_ids: readonly string[];
  readonly refresh_task_ids: readonly string[];
  readonly collection_run_ids: readonly string[];
  readonly openclaw_request_ids: readonly string[];
  readonly error_ids: readonly string[];
  readonly decision_update_ids: readonly string[];
  readonly generated_at: string;
}

export interface PilotTimingMeasurement {
  readonly operation:
    | "parser"
    | "matching"
    | "confidence"
    | "shortlist"
    | "comparison"
    | "expert_context";
  readonly duration_ms: number;
  readonly candidate_count: number | null;
  readonly recorded_at: string;
}

export interface PilotReleaseCheck {
  readonly check_id: string;
  readonly status: "pass" | "fail" | "warning";
  readonly hard_blocker: boolean;
  readonly details: readonly string[];
}

export interface PilotReleaseGate {
  readonly schema_version: typeof PILOT_RELEASE_GATE_VERSION;
  readonly ready: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly checks: readonly PilotReleaseCheck[];
  readonly evaluated_at: string;
  readonly app_version: string;
}
