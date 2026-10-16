CREATE TABLE evidence_artifact_retention_state (
  artifact_id text PRIMARY KEY
    REFERENCES evidence_artifacts (artifact_id) ON DELETE RESTRICT,
  effective_retain_until timestamptz,
  legal_hold_active boolean NOT NULL,
  blob_state text NOT NULL CHECK (
    blob_state IN ('present', 'deletion_pending', 'deleted')
  ),
  updated_at timestamptz NOT NULL
);

CREATE TABLE evidence_artifact_retention_events (
  event_id text PRIMARY KEY,
  artifact_id text NOT NULL
    REFERENCES evidence_artifacts (artifact_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (
    event_type IN (
      'retention_initialized', 'retention_extended', 'legal_hold_placed',
      'legal_hold_released', 'deletion_claimed', 'blob_deleted'
    )
  ),
  actor_type text NOT NULL CHECK (actor_type IN ('system', 'operator')),
  actor_ref text,
  occurred_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION reds_enforce_evidence_artifact_retention_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'EVIDENCE_ARTIFACT_RETENTION_DELETE_FORBIDDEN'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.artifact_id IS DISTINCT FROM OLD.artifact_id THEN
    RAISE EXCEPTION 'EVIDENCE_ARTIFACT_RETENTION_ID_IMMUTABLE'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (
    OLD.effective_retain_until IS NULL
    AND NEW.effective_retain_until IS NOT NULL
  ) OR (
    OLD.effective_retain_until IS NOT NULL
    AND (
      NEW.effective_retain_until IS NULL
      OR NEW.effective_retain_until < OLD.effective_retain_until
    )
  ) THEN
    RAISE EXCEPTION 'EVIDENCE_ARTIFACT_RETENTION_MUST_EXTEND_FORWARD'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.blob_state IS DISTINCT FROM OLD.blob_state AND NOT (
    (OLD.blob_state = 'present' AND NEW.blob_state = 'deletion_pending')
    OR (OLD.blob_state = 'deletion_pending' AND NEW.blob_state = 'deleted')
  ) THEN
    RAISE EXCEPTION 'EVIDENCE_ARTIFACT_BLOB_STATE_INVALID_TRANSITION'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'EVIDENCE_ARTIFACT_RETENTION_TIME_REVERSED'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER evidence_artifact_retention_state_guard
  BEFORE UPDATE OR DELETE ON evidence_artifact_retention_state
  FOR EACH ROW EXECUTE FUNCTION reds_enforce_evidence_artifact_retention_mutation();

CREATE INDEX evidence_artifact_retention_events_artifact_idx
  ON evidence_artifact_retention_events (artifact_id, occurred_at, event_id);

CREATE TRIGGER evidence_artifact_retention_events_are_append_only
  BEFORE UPDATE OR DELETE ON evidence_artifact_retention_events
  FOR EACH ROW EXECUTE FUNCTION reds_reject_mutation();

INSERT INTO evidence_artifact_retention_state (
  artifact_id, effective_retain_until, legal_hold_active, blob_state, updated_at
)
SELECT artifact_id, retain_until, retention_policy = 'legal_hold', 'present', created_at
FROM evidence_artifacts;

INSERT INTO evidence_artifact_retention_events (
  event_id, artifact_id, event_type, actor_type, actor_ref, occurred_at
)
SELECT 'retention_init_' || artifact_id, artifact_id, 'retention_initialized',
  'system', NULL, created_at
FROM evidence_artifacts;

CREATE OR REPLACE FUNCTION reds_initialize_evidence_artifact_retention()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO evidence_artifact_retention_state (
    artifact_id, effective_retain_until, legal_hold_active, blob_state, updated_at
  ) VALUES (
    NEW.artifact_id, NEW.retain_until, NEW.retention_policy = 'legal_hold',
    'present', NEW.created_at
  );
  INSERT INTO evidence_artifact_retention_events (
    event_id, artifact_id, event_type, actor_type, actor_ref, occurred_at
  ) VALUES (
    'retention_init_' || NEW.artifact_id, NEW.artifact_id,
    'retention_initialized', 'system', NULL, NEW.created_at
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER evidence_artifact_retention_initialize
  AFTER INSERT ON evidence_artifacts
  FOR EACH ROW EXECUTE FUNCTION reds_initialize_evidence_artifact_retention();
