import {
  BUYER_JOURNEY_SCHEMA_VERSION,
  COMPARISON_STATE_SCHEMA_VERSION,
  CONFIRMED_REQUEST_RECORD_VERSION,
  DECISION_UPDATE_SCHEMA_VERSION,
  MATCHING_BUNDLE_SCHEMA_VERSION,
  type BuyerJourney,
  type CanonicalDecisionOverlay,
  type ComparisonState,
  type ConfirmedRequestRecord,
  type DecisionUpdate,
  type MatchingBundle,
} from "../../../src/buyer-journey/contracts";
import { fieldEvidenceSchema, type FieldEvidence } from "../../../src/domain";
import { loadPilotDataset } from "../../../src/pilot-dataset";

/**
 * Fixtures for the conformance suite.
 *
 * Built from the pilot dataset so the documents are real domain values that
 * pass the same zod schemas the PostgreSQL repositories apply on read.
 */
export const NOW = "2026-08-15T00:00:00.000Z";

const dataset = loadPilotDataset();

export const sampleUserRequest = dataset.userRequests[0]!;

export const makeJourney = (
  overrides: Partial<BuyerJourney> = {},
): BuyerJourney => ({
  schema_version: BUYER_JOURNEY_SCHEMA_VERSION,
  journey_id: "journey_conformance_1",
  session_id: "session_conformance",
  raw_request_text: "Найди квартиру до 5 млн, семейная ипотека обязательна.",
  parsed_request_ref: null,
  confirmed_user_request_id: null,
  confirmed_user_request_version: null,
  shortlist_state: {
    status: "not_started",
    matching_bundle_id: null,
    property_ids: [],
    update_available: false,
  },
  selected_property_id: null,
  selected_offer_id: null,
  selected_purchase_scenario_id: null,
  comparison_id: null,
  comparison_property_ids: [],
  expert_request_ids: [],
  active_expert_request_id: null,
  last_recompute_at: null,
  current_stage: "request_entry",
  latest_decision_update_id: null,
  recoverable_error: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

export const makeConfirmedRequest = (
  version = 1,
  overrides: Partial<ConfirmedRequestRecord> = {},
): ConfirmedRequestRecord => ({
  record_version: CONFIRMED_REQUEST_RECORD_VERSION,
  user_request_id: sampleUserRequest.user_request_id,
  user_request_version: version,
  request: sampleUserRequest,
  confirmed_at: NOW,
  supersedes_version: version > 1 ? version - 1 : null,
  ...overrides,
});

export const makeEvidence = (
  overrides: Partial<FieldEvidence> = {},
): FieldEvidence =>
  fieldEvidenceSchema.parse({
    schema_version: "1.0",
    evidence_id: "evidence_conformance_1",
    entity_type: "property",
    entity_id: "prop_nb_002",
    field: "financing.family_mortgage",
    value: true,
    raw_value: true,
    source_id: "source_manual_expert_journey",
    snapshot_id: null,
    source_url: null,
    collected_at: NOW,
    verification_status: "confirmed",
    freshness_status: "fresh",
    extraction_confidence: null,
    evidence_type: "manual_expert",
    evidence_text: "Подтверждено экспертом",
    evidence_reference: null,
    ...overrides,
  });

export const makeOverlay = (
  overrides: Partial<CanonicalDecisionOverlay> = {},
): CanonicalDecisionOverlay => ({
  overlay_id: "overlay_conformance_1",
  entity_type: "property",
  entity_id: "prop_nb_002",
  field: "financing.family_mortgage",
  value: true,
  verification_status: "confirmed",
  evidence_id: "evidence_conformance_1",
  created_at: NOW,
  ...overrides,
});

/**
 * A bundle with one entry that has no DataQuality, so the "confidence was
 * never computed" case is covered on both backends.
 */
export const makeBundle = (
  match: MatchingBundle["entries"][number]["match"],
  overrides: Partial<MatchingBundle> = {},
): MatchingBundle => ({
  schema_version: MATCHING_BUNDLE_SCHEMA_VERSION,
  matching_bundle_id: "bundle_conformance_1",
  user_request_id: sampleUserRequest.user_request_id,
  user_request_version: 1,
  generated_at: NOW,
  entries: [
    {
      property_id: match.match_result.property_id,
      selected_offer_id: match.selected_offer_id,
      selected_purchase_scenario_id: match.match_result.purchase_scenario_id,
      origin: "synthetic",
      match,
      data_quality: null,
    },
  ],
  matching_algorithm_version: "matching-v1",
  confidence_algorithm_version: "confidence-v1",
  criteria_registry_version: "criteria-v1",
  dataset_snapshot: {
    dataset_id: dataset.metadata.dataset_id,
    dataset_version: dataset.metadata.dataset_version,
    dataset_type: "synthetic_pilot",
  },
  imported_candidate_ids: [],
  partial: false,
  stale: false,
  supersedes_bundle_id: null,
  ...overrides,
});

export const makeComparison = (
  propertyIds: readonly string[],
  overrides: Partial<ComparisonState> = {},
): ComparisonState => ({
  schema_version: COMPARISON_STATE_SCHEMA_VERSION,
  comparison_id: "comparison_conformance_1",
  journey_id: "journey_conformance_1",
  user_request_id: sampleUserRequest.user_request_id,
  user_request_version: 1,
  version: 1,
  items: propertyIds.map((propertyId) => ({
    property_id: propertyId,
    offer_id: null,
    purchase_scenario_id: null,
    matching_bundle_id: "bundle_conformance_1",
  })),
  status: "active",
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

export const makeDecisionUpdate = (
  overrides: Partial<DecisionUpdate> = {},
): DecisionUpdate => ({
  schema_version: DECISION_UPDATE_SCHEMA_VERSION,
  update_id: "update_conformance_1",
  journey_id: "journey_conformance_1",
  trigger_type: "expert_result",
  trigger_ref: "expert_result_1",
  affected_property_ids: ["prop_nb_002"],
  previous_matching_bundle_id: "bundle_conformance_1",
  new_matching_bundle_id: null,
  previous_results: [
    {
      property_id: "prop_nb_002",
      match_result_id: "match_1",
      match_result_ref: "match_1@v1",
      match_score: 81.5,
      eligibility_status: "eligible_with_unknowns",
      data_quality_id: null,
      data_quality_ref: null,
      data_confidence_score: null,
      data_completeness_score: null,
      critical_unknowns: ["financing.family_mortgage"],
    },
  ],
  new_results: [
    {
      property_id: "prop_nb_002",
      match_result_id: "match_2",
      match_result_ref: "match_2@v1",
      match_score: 88,
      eligibility_status: "eligible",
      data_quality_id: "quality_1",
      data_quality_ref: "quality_1@v1",
      data_confidence_score: 74.25,
      data_completeness_score: 69,
      critical_unknowns: [],
    },
  ],
  resolved_unknowns: ["financing.family_mortgage"],
  unresolved_unknowns: [],
  new_conflicts: [],
  resolved_conflicts: [],
  status: "completed",
  error_code: null,
  created_at: NOW,
  ...overrides,
});
