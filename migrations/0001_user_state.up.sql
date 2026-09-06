-- Phase 1 user state: buyer journeys, expert workflow, pilot records.
--
-- The catalogue (properties, offers, financing programs, sources) is still
-- loaded from fixtures and is deliberately absent here.
--
-- Shape: typed columns for identifiers, foreign keys, statuses and anything
-- queried or constrained; a jsonb `document` for the rest of the aggregate,
-- re-validated with the existing zod schemas on read.
--
-- Two rules run through the whole file:
--   * A tri-state domain value is `text NOT NULL CHECK (... IN (...))` with
--     'unknown' inside the list. NULL means "no such field"; 'unknown' means
--     "we do not know". A nullable boolean would collapse the two and turn an
--     unknown into a false.
--   * Match and confidence are separate columns. There is no combined or
--     generated score anywhere.

-- ---------------------------------------------------------------------------
-- Append-only guard
-- ---------------------------------------------------------------------------

-- Evidence, completed expert results and audit trails are immutable. The
-- in-memory repositories enforce this in TypeScript; in SQL the database
-- refuses the write, so a second application instance cannot bypass it.
CREATE OR REPLACE FUNCTION reds_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY_TABLE_%: % is not allowed on %',
    TG_OP, TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- ---------------------------------------------------------------------------
-- Field evidence (written by the journey: expert results create evidence)
-- ---------------------------------------------------------------------------

-- Not catalogue data: BuyerJourneyRepository.appendEvidence writes these rows
-- when an expert confirms a fact. canonical_decision_overlays references them,
-- so provenance is a foreign key rather than a convention.
CREATE TABLE field_evidence (
  evidence_id text PRIMARY KEY,
  schema_version text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  field text NOT NULL,
  value jsonb NOT NULL,
  raw_value jsonb NOT NULL,
  source_id text NOT NULL,
  snapshot_id text,
  source_url text,
  collected_at timestamptz NOT NULL,
  verification_status text NOT NULL CHECK (
    verification_status IN (
      'confirmed', 'claimed', 'unconfirmed', 'conflicting', 'stale', 'unknown'
    )
  ),
  freshness_status text NOT NULL CHECK (
    freshness_status IN ('fresh', 'recent', 'stale', 'expired', 'unknown')
  ),
  extraction_confidence numeric(5, 4) CHECK (
    extraction_confidence IS NULL
    OR (extraction_confidence >= 0 AND extraction_confidence <= 1)
  ),
  evidence_type text NOT NULL CHECK (
    evidence_type IN (
      'primary_source', 'secondary_source', 'document', 'manual_expert',
      'user_provided', 'derived', 'extraction'
    )
  ),
  evidence_text text,
  evidence_reference text,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX field_evidence_entity_idx
  ON field_evidence (entity_type, entity_id, field);

CREATE TRIGGER field_evidence_is_append_only
  BEFORE UPDATE OR DELETE ON field_evidence
  FOR EACH ROW EXECUTE FUNCTION reds_reject_mutation();

-- ---------------------------------------------------------------------------
-- Buyer journey
-- ---------------------------------------------------------------------------

CREATE TABLE buyer_journeys (
  journey_id text PRIMARY KEY,
  schema_version text NOT NULL,
  session_id text NOT NULL,
  raw_request_text text NOT NULL,
  parsed_request_ref text,
  confirmed_user_request_id text,
  confirmed_user_request_version integer CHECK (
    confirmed_user_request_version IS NULL
    OR confirmed_user_request_version > 0
  ),
  current_stage text NOT NULL CHECK (
    current_stage IN (
      'request_entry', 'request_confirmation', 'matching', 'shortlist',
      'property_detail', 'comparison', 'expert_request', 'expert_in_progress',
      'expert_result', 'updated_decision'
    )
  ),
  shortlist_status text NOT NULL CHECK (
    shortlist_status IN (
      'not_started', 'recompute_required', 'ready', 'no_eligible', 'failed'
    )
  ),
  shortlist_matching_bundle_id text,
  selected_property_id text,
  selected_offer_id text,
  selected_purchase_scenario_id text,
  comparison_id text,
  active_expert_request_id text,
  latest_decision_update_id text,
  -- Recoverable errors are a closed set; STORAGE_UNAVAILABLE is included so a
  -- storage failure can be recorded once storage exists.
  recoverable_error text CHECK (
    recoverable_error IS NULL
    OR recoverable_error IN (
      'MISSING_JOURNEY_CONTEXT', 'INVALID_TRANSITION', 'STALE_REQUEST_VERSION',
      'MATCH_RECOMPUTE_FAILED', 'CONFIDENCE_RECOMPUTE_FAILED',
      'EXPERT_CONTEXT_STALE', 'INGESTION_FAILED', 'REFRESH_PENDING',
      'SOURCE_POLICY_BLOCKED', 'FEATURE_DISABLED', 'ENTITY_NOT_FOUND',
      'STORAGE_UNAVAILABLE'
    )
  ),
  last_recompute_at timestamptz,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT buyer_journeys_confirmed_pair CHECK (
    (confirmed_user_request_id IS NULL)
    = (confirmed_user_request_version IS NULL)
  )
);

CREATE INDEX buyer_journeys_session_idx ON buyer_journeys (session_id);

CREATE TABLE parsed_requests (
  parsed_request_ref text PRIMARY KEY,
  journey_id text REFERENCES buyer_journeys (journey_id) ON DELETE CASCADE,
  parser_version text NOT NULL,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX parsed_requests_journey_idx ON parsed_requests (journey_id);

-- Confirmed requests are versioned: the composite key is the contract, and a
-- superseded version stays readable so old bundles remain explainable.
CREATE TABLE confirmed_requests (
  user_request_id text NOT NULL,
  user_request_version integer NOT NULL CHECK (user_request_version > 0),
  record_version text NOT NULL,
  supersedes_version integer CHECK (
    supersedes_version IS NULL OR supersedes_version > 0
  ),
  confirmed_at timestamptz NOT NULL,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_request_id, user_request_version),
  CONSTRAINT confirmed_requests_supersedes_is_earlier CHECK (
    supersedes_version IS NULL OR supersedes_version < user_request_version
  )
);

-- ---------------------------------------------------------------------------
-- Matching
-- ---------------------------------------------------------------------------

CREATE TABLE matching_bundles (
  matching_bundle_id text PRIMARY KEY,
  schema_version text NOT NULL,
  user_request_id text NOT NULL,
  user_request_version integer NOT NULL CHECK (user_request_version > 0),
  generated_at timestamptz NOT NULL,
  matching_algorithm_version text NOT NULL,
  confidence_algorithm_version text NOT NULL,
  criteria_registry_version text NOT NULL,
  dataset_id text NOT NULL,
  dataset_version text NOT NULL,
  dataset_type text NOT NULL CHECK (
    dataset_type IN (
      'synthetic_pilot', 'mixed_explicit', 'user_supplied_only', 'empty_pilot'
    )
  ),
  partial boolean NOT NULL,
  stale boolean NOT NULL DEFAULT false,
  supersedes_bundle_id text REFERENCES matching_bundles (matching_bundle_id),
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_request_id, user_request_version)
    REFERENCES confirmed_requests (user_request_id, user_request_version)
);

CREATE INDEX matching_bundles_request_idx
  ON matching_bundles (user_request_id, user_request_version);

-- Match and confidence live in separate columns and are never combined.
-- data_confidence_score / data_completeness_score are nullable on purpose:
-- NULL means the confidence engine did not produce a result, which is not the
-- same as a score of zero.
CREATE TABLE matching_bundle_entries (
  matching_bundle_id text NOT NULL
    REFERENCES matching_bundles (matching_bundle_id) ON DELETE CASCADE,
  property_id text NOT NULL,
  selected_offer_id text,
  selected_purchase_scenario_id text,
  origin text NOT NULL CHECK (
    origin IN (
      'synthetic', 'manual_curated', 'approved_live_source', 'user_supplied',
      'expert_supplied'
    )
  ),
  eligibility_status text NOT NULL CHECK (
    eligibility_status IN (
      'eligible', 'eligible_with_unknowns', 'possible_match', 'hard_fail',
      'insufficient_data', 'unavailable'
    )
  ),
  match_result_id text NOT NULL,
  match_score numeric(6, 3) NOT NULL CHECK (
    match_score >= 0 AND match_score <= 100
  ),
  data_quality_id text,
  data_confidence_score numeric(6, 3) CHECK (
    data_confidence_score IS NULL
    OR (data_confidence_score >= 0 AND data_confidence_score <= 100)
  ),
  data_completeness_score numeric(6, 3) CHECK (
    data_completeness_score IS NULL
    OR (data_completeness_score >= 0 AND data_completeness_score <= 100)
  ),
  critical_unknown_count integer NOT NULL DEFAULT 0
    CHECK (critical_unknown_count >= 0),
  match_document jsonb NOT NULL,
  data_quality_document jsonb,
  PRIMARY KEY (matching_bundle_id, property_id),
  -- A confidence score cannot appear without the DataQuality record it came
  -- from, and vice versa.
  CONSTRAINT matching_bundle_entries_quality_is_whole CHECK (
    (data_quality_id IS NULL)
    = (data_quality_document IS NULL)
  ),
  CONSTRAINT matching_bundle_entries_scores_need_quality CHECK (
    data_quality_id IS NOT NULL
    OR (data_confidence_score IS NULL AND data_completeness_score IS NULL)
  )
);

CREATE INDEX matching_bundle_entries_property_idx
  ON matching_bundle_entries (property_id);

-- ---------------------------------------------------------------------------
-- Comparison
-- ---------------------------------------------------------------------------

CREATE TABLE comparisons (
  comparison_id text PRIMARY KEY,
  schema_version text NOT NULL,
  journey_id text NOT NULL
    REFERENCES buyer_journeys (journey_id) ON DELETE CASCADE,
  user_request_id text NOT NULL,
  user_request_version integer NOT NULL CHECK (user_request_version > 0),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (
    status IN ('active', 'recompute_required', 'superseded')
  ),
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (user_request_id, user_request_version)
    REFERENCES confirmed_requests (user_request_id, user_request_version)
);

CREATE INDEX comparisons_journey_idx ON comparisons (journey_id);

CREATE TABLE comparison_items (
  comparison_id text NOT NULL
    REFERENCES comparisons (comparison_id) ON DELETE CASCADE,
  property_id text NOT NULL,
  offer_id text,
  purchase_scenario_id text,
  matching_bundle_id text NOT NULL
    REFERENCES matching_bundles (matching_bundle_id),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (comparison_id, property_id),
  UNIQUE (comparison_id, position)
);

-- ---------------------------------------------------------------------------
-- Decision updates
-- ---------------------------------------------------------------------------

CREATE TABLE decision_updates (
  update_id text PRIMARY KEY,
  schema_version text NOT NULL,
  journey_id text NOT NULL
    REFERENCES buyer_journeys (journey_id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (
    trigger_type IN (
      'user_request_changed', 'expert_result', 'refresh_result',
      'user_url_ingestion', 'source_update'
    )
  ),
  trigger_ref text NOT NULL,
  previous_matching_bundle_id text
    REFERENCES matching_bundles (matching_bundle_id),
  new_matching_bundle_id text REFERENCES matching_bundles (matching_bundle_id),
  status text NOT NULL CHECK (status IN ('completed', 'pending', 'failed')),
  error_code text CHECK (
    error_code IS NULL
    OR error_code IN ('MATCH_RECOMPUTE_FAILED', 'CONFIDENCE_RECOMPUTE_FAILED')
  ),
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT decision_updates_error_matches_status CHECK (
    (status = 'failed') OR error_code IS NULL
  )
);

CREATE INDEX decision_updates_journey_idx ON decision_updates (journey_id);

-- The before/after metrics of one decision update. Match and confidence stay
-- in separate columns here too.
CREATE TABLE decision_metric_snapshots (
  update_id text NOT NULL
    REFERENCES decision_updates (update_id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('previous', 'new')),
  property_id text NOT NULL,
  match_result_id text NOT NULL,
  match_result_ref text NOT NULL,
  match_score numeric(6, 3) NOT NULL CHECK (
    match_score >= 0 AND match_score <= 100
  ),
  eligibility_status text NOT NULL,
  data_quality_id text,
  data_quality_ref text,
  data_confidence_score numeric(6, 3) CHECK (
    data_confidence_score IS NULL
    OR (data_confidence_score >= 0 AND data_confidence_score <= 100)
  ),
  data_completeness_score numeric(6, 3) CHECK (
    data_completeness_score IS NULL
    OR (data_completeness_score >= 0 AND data_completeness_score <= 100)
  ),
  critical_unknowns text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (update_id, phase, property_id)
);

-- ---------------------------------------------------------------------------
-- User-supplied candidates
-- ---------------------------------------------------------------------------

CREATE TABLE imported_candidates (
  ingestion_id text PRIMARY KEY,
  property_id text NOT NULL,
  offer_id text,
  source_id text NOT NULL,
  source_mode text NOT NULL CHECK (
    source_mode IN ('automatic_allowed', 'manual_only', 'unknown')
  ),
  matching_readiness text NOT NULL CHECK (
    matching_readiness IN ('ready', 'ready_with_unknowns', 'not_ready')
  ),
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A candidate exists on its own and is attached to journeys separately, which
-- is exactly what attachImportedCandidate does.
CREATE TABLE journey_imported_candidates (
  journey_id text NOT NULL
    REFERENCES buyer_journeys (journey_id) ON DELETE CASCADE,
  ingestion_id text NOT NULL
    REFERENCES imported_candidates (ingestion_id) ON DELETE CASCADE,
  attached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (journey_id, ingestion_id)
);

-- ---------------------------------------------------------------------------
-- Canonical overlays
-- ---------------------------------------------------------------------------

-- Provenance is not a convention here: evidence_id is NOT NULL and a foreign
-- key, so a canonical value without evidence cannot be inserted at all.
-- verification_status excludes 'unconfirmed'/'unknown': an overlay is only
-- written for a value that was actually established.
CREATE TABLE canonical_decision_overlays (
  overlay_id text PRIMARY KEY,
  entity_type text NOT NULL CHECK (
    entity_type IN (
      'property', 'offer', 'purchase_scenario',
      'property_financing_eligibility'
    )
  ),
  entity_id text NOT NULL,
  field text NOT NULL,
  value jsonb NOT NULL,
  verification_status text NOT NULL CHECK (
    verification_status IN ('confirmed', 'claimed', 'conflicting')
  ),
  evidence_id text NOT NULL REFERENCES field_evidence (evidence_id),
  created_at timestamptz NOT NULL
);

CREATE INDEX canonical_decision_overlays_entity_idx
  ON canonical_decision_overlays (entity_type, entity_id, field);

-- ---------------------------------------------------------------------------
-- Journey audit
-- ---------------------------------------------------------------------------

CREATE TABLE journey_audit_events (
  event_id text PRIMARY KEY,
  instrumentation_version text NOT NULL,
  journey_id text NOT NULL
    REFERENCES buyer_journeys (journey_id) ON DELETE CASCADE,
  session_id text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'journey_started', 'request_parsed', 'request_confirmed',
      'matching_completed', 'shortlist_viewed', 'property_opened',
      'comparison_created', 'comparison_updated', 'expert_request_created',
      'expert_result_completed', 'refresh_requested', 'refresh_completed',
      'decision_recomputed'
    )
  ),
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX journey_audit_events_journey_idx
  ON journey_audit_events (journey_id, occurred_at);

CREATE TRIGGER journey_audit_events_is_append_only
  BEFORE UPDATE OR DELETE ON journey_audit_events
  FOR EACH ROW EXECUTE FUNCTION reds_reject_mutation();

-- ---------------------------------------------------------------------------
-- Expert workflow
-- ---------------------------------------------------------------------------

CREATE TABLE expert_context_packages (
  context_package_id text PRIMARY KEY,
  package_version text NOT NULL,
  expert_request_id text NOT NULL,
  user_request_ref text NOT NULL,
  journey_id text,
  user_request_version integer CHECK (
    user_request_version IS NULL OR user_request_version > 0
  ),
  matching_bundle_id text,
  comparison_id text,
  comparison_version integer,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expert_requests (
  request_id text PRIMARY KEY,
  request_schema_version text NOT NULL,
  owner_type text NOT NULL CHECK (owner_type IN ('session', 'anonymous')),
  owner_id text NOT NULL,
  request_type text NOT NULL CHECK (
    request_type IN (
      'information_verification', 'document_review', 'choice_assistance',
      'property_review', 'onsite_check', 'transaction_question'
    )
  ),
  trigger_type text NOT NULL,
  question_category text NOT NULL,
  user_request_id text NOT NULL,
  comparison_id text,
  question text NOT NULL,
  priority text NOT NULL CHECK (
    priority IN ('critical', 'high', 'normal', 'low')
  ),
  priority_score numeric(10, 4) NOT NULL,
  priority_policy_version text NOT NULL,
  required_specialist text NOT NULL CHECK (
    required_specialist IN (
      'real_estate_expert', 'lawyer', 'mortgage_specialist',
      'property_inspector', 'technical_specialist'
    )
  ),
  routing_version text NOT NULL,
  status text NOT NULL CHECK (
    status IN (
      'draft', 'submitted', 'queued', 'assigned', 'in_progress',
      'waiting_for_user', 'waiting_for_external_info', 'completed',
      'cancelled', 'rejected'
    )
  ),
  context_package_id text NOT NULL
    REFERENCES expert_context_packages (context_package_id),
  dedup_key text NOT NULL,
  assigned_specialist_ref text,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

-- The in-memory repository deduplicates with findActiveByDedupKey followed by
-- an insert. That check-then-write races once more than one instance runs; a
-- partial unique index makes the database reject the second active request
-- instead.
CREATE UNIQUE INDEX expert_requests_active_dedup_key
  ON expert_requests (dedup_key)
  WHERE status IN (
    'draft', 'submitted', 'queued', 'assigned', 'in_progress',
    'waiting_for_user', 'waiting_for_external_info'
  );

CREATE INDEX expert_requests_queue_idx
  ON expert_requests (status, priority_score DESC, created_at);

-- One completed result per request: the primary key is the request id, and the
-- trigger blocks any later rewrite.
CREATE TABLE expert_results (
  request_id text PRIMARY KEY REFERENCES expert_requests (request_id),
  expert_result_id text NOT NULL UNIQUE,
  result_version text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('completed', 'partially_completed', 'unable_to_verify')
  ),
  specialist_ref text NOT NULL,
  specialist_type text NOT NULL,
  document jsonb NOT NULL,
  completed_at timestamptz NOT NULL
);

CREATE TRIGGER expert_results_is_append_only
  BEFORE UPDATE OR DELETE ON expert_results
  FOR EACH ROW EXECUTE FUNCTION reds_reject_mutation();

CREATE TABLE expert_audit_events (
  event_id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES expert_requests (request_id),
  event_type text NOT NULL,
  actor_type text NOT NULL CHECK (
    actor_type IN ('user', 'system', 'expert', 'admin')
  ),
  actor_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE INDEX expert_audit_events_request_idx
  ON expert_audit_events (request_id, created_at);

CREATE TRIGGER expert_audit_events_is_append_only
  BEFORE UPDATE OR DELETE ON expert_audit_events
  FOR EACH ROW EXECUTE FUNCTION reds_reject_mutation();

-- Drafts are working state and stay mutable, unlike the completed result.
CREATE TABLE expert_result_drafts (
  request_id text PRIMARY KEY REFERENCES expert_requests (request_id)
    ON DELETE CASCADE,
  draft_version text NOT NULL,
  specialist_ref text NOT NULL,
  specialist_type text NOT NULL,
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);

-- ---------------------------------------------------------------------------
-- Pilot records
-- ---------------------------------------------------------------------------

CREATE TABLE journey_feedback (
  feedback_id text PRIMARY KEY,
  journey_id text NOT NULL
    REFERENCES buyer_journeys (journey_id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (
    stage IN ('shortlist', 'comparison', 'expert_result', 'journey_end')
  ),
  question_code text NOT NULL,
  -- 'not_sure' is a real answer, not a missing one: the buyer said they do not
  -- know. NULL would mean the question was never asked.
  answer text NOT NULL CHECK (answer IN ('yes', 'partly', 'no', 'not_sure')),
  optional_comment text CHECK (
    optional_comment IS NULL OR length(optional_comment) <= 2000
  ),
  created_at timestamptz NOT NULL
);

CREATE INDEX journey_feedback_journey_idx ON journey_feedback (journey_id);

CREATE TABLE application_errors (
  error_id text PRIMARY KEY,
  error_code text NOT NULL,
  layer text NOT NULL,
  journey_id text REFERENCES buyer_journeys (journey_id) ON DELETE SET NULL,
  stage text,
  recoverable boolean NOT NULL,
  user_visible boolean NOT NULL,
  occurred_at timestamptz NOT NULL,
  recovered_at timestamptz,
  context_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  app_version text NOT NULL,
  CONSTRAINT application_errors_recovery_is_later CHECK (
    recovered_at IS NULL OR recovered_at >= occurred_at
  )
);

CREATE INDEX application_errors_journey_idx ON application_errors (journey_id);

-- ---------------------------------------------------------------------------
-- Refresh queue
-- ---------------------------------------------------------------------------

CREATE TABLE refresh_tasks (
  refresh_task_id text PRIMARY KEY,
  schema_version text NOT NULL,
  refresh_policy_version text NOT NULL,
  operation text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  source_id text NOT NULL,
  target_urls text[] NOT NULL DEFAULT '{}',
  field_paths text[] NOT NULL DEFAULT '{}',
  critical_field_paths text[] NOT NULL DEFAULT '{}',
  reason text NOT NULL,
  reason_history text[] NOT NULL DEFAULT '{}',
  priority text NOT NULL CHECK (
    priority IN ('critical', 'high', 'normal', 'low')
  ),
  priority_score numeric(10, 4) NOT NULL,
  journey_stage text NOT NULL,
  status text NOT NULL CHECK (
    status IN (
      'queued', 'ready', 'running', 'retry_scheduled', 'succeeded', 'partial',
      'failed', 'blocked', 'cancelled', 'superseded'
    )
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL CHECK (max_attempts > 0),
  dedup_key text NOT NULL,
  policy_version text,
  source_registry_version text,
  supersedes_task_ids text[] NOT NULL DEFAULT '{}',
  superseded_by_task_id text REFERENCES refresh_tasks (refresh_task_id),
  requested_at timestamptz NOT NULL,
  requested_by text NOT NULL,
  not_before timestamptz NOT NULL,
  deadline timestamptz,
  claimed_by text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  CONSTRAINT refresh_tasks_claim_is_whole CHECK (
    (claimed_by IS NULL) = (claimed_at IS NULL)
  )
);

-- Same race as the expert dedup key: only one active task per dedup key.
CREATE UNIQUE INDEX refresh_tasks_active_dedup_key
  ON refresh_tasks (dedup_key)
  WHERE status IN ('queued', 'ready', 'running', 'retry_scheduled');

-- Supports the claim path (`FOR UPDATE SKIP LOCKED` over ready work).
CREATE INDEX refresh_tasks_claimable_idx
  ON refresh_tasks (status, not_before, priority_score DESC, requested_at);
