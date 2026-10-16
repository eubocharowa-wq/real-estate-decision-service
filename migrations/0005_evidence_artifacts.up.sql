-- Durable metadata for evidence bytes stored behind a provider-neutral blob
-- port. Raw bytes never enter PostgreSQL and no public URL is represented.

CREATE TABLE evidence_artifacts (
  artifact_id text PRIMARY KEY,
  schema_version text NOT NULL CHECK (
    schema_version = '1.0'
  ),
  artifact_kind text NOT NULL CHECK (
    artifact_kind IN ('source_snapshot', 'user_document', 'manual_evidence')
  ),
  source_id text NOT NULL,
  source_url text,
  source_reference text,
  collected_at timestamptz NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  storage_key text NOT NULL UNIQUE CHECK (
    storage_key ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
  ),
  state text NOT NULL CHECK (
    state IN ('quarantine', 'staged', 'approved')
  ),
  access_scope text NOT NULL CHECK (
    access_scope IN ('private_owner', 'restricted_internal')
  ),
  retention_policy text NOT NULL CHECK (
    retention_policy IN ('transient', 'standard', 'user_document', 'legal_hold')
  ),
  retain_until timestamptz,
  created_at timestamptz NOT NULL,
  CONSTRAINT evidence_artifacts_source_reference_required CHECK (
    source_url IS NOT NULL OR source_reference IS NOT NULL
  ),
  CONSTRAINT evidence_artifacts_user_document_private CHECK (
    artifact_kind <> 'user_document' OR access_scope = 'private_owner'
  )
);

CREATE INDEX evidence_artifacts_source_idx
  ON evidence_artifacts (source_id, collected_at);

-- Only the state may change, and only along the forward lifecycle. The
-- repository writes the matching audit event in the same transaction.
CREATE OR REPLACE FUNCTION reds_enforce_evidence_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'quarantine' THEN
      RAISE EXCEPTION 'EVIDENCE_ARTIFACT_MUST_START_IN_QUARANTINE'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'EVIDENCE_ARTIFACT_DELETE_FORBIDDEN'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF ROW(
    NEW.artifact_id, NEW.schema_version, NEW.artifact_kind, NEW.source_id,
    NEW.source_url, NEW.source_reference, NEW.collected_at, NEW.mime_type,
    NEW.byte_size, NEW.sha256, NEW.storage_key, NEW.access_scope,
    NEW.retention_policy, NEW.retain_until, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.artifact_id, OLD.schema_version, OLD.artifact_kind, OLD.source_id,
    OLD.source_url, OLD.source_reference, OLD.collected_at, OLD.mime_type,
    OLD.byte_size, OLD.sha256, OLD.storage_key, OLD.access_scope,
    OLD.retention_policy, OLD.retain_until, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'EVIDENCE_ARTIFACT_IMMUTABLE_METADATA'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT (
    (OLD.state = 'quarantine' AND NEW.state = 'staged')
    OR (OLD.state = 'staged' AND NEW.state = 'approved')
  ) THEN
    RAISE EXCEPTION 'EVIDENCE_ARTIFACT_INVALID_TRANSITION:%->%',
      OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER evidence_artifacts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON evidence_artifacts
  FOR EACH ROW EXECUTE FUNCTION reds_enforce_evidence_artifact_mutation();

CREATE TABLE evidence_artifact_links (
  artifact_id text NOT NULL
    REFERENCES evidence_artifacts (artifact_id) ON DELETE RESTRICT,
  subject_type text NOT NULL CHECK (
    subject_type IN ('field_evidence', 'source_snapshot')
  ),
  subject_id text NOT NULL,
  relation text NOT NULL CHECK (
    relation IN ('supports', 'captures', 'derived_from')
  ),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (artifact_id, subject_type, subject_id, relation)
);

CREATE INDEX evidence_artifact_links_subject_idx
  ON evidence_artifact_links (subject_type, subject_id);

CREATE TABLE evidence_artifact_events (
  event_id text PRIMARY KEY,
  artifact_id text NOT NULL
    REFERENCES evidence_artifacts (artifact_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (
    event_type IN ('artifact_created', 'state_transitioned')
  ),
  from_state text CHECK (
    from_state IS NULL OR from_state IN ('quarantine', 'staged', 'approved')
  ),
  to_state text NOT NULL CHECK (
    to_state IN ('quarantine', 'staged', 'approved')
  ),
  actor_type text NOT NULL CHECK (
    actor_type IN ('system', 'service', 'user', 'expert', 'operator')
  ),
  actor_ref text,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{"reason_code": null}'::jsonb,
  CONSTRAINT evidence_artifact_events_safe_metadata CHECK (
    jsonb_typeof(metadata) = 'object'
    AND metadata ? 'reason_code'
    AND metadata - 'reason_code' = '{}'::jsonb
    AND (
      metadata->'reason_code' = 'null'::jsonb
      OR metadata->>'reason_code' IN (
        'checksum_validated', 'content_validated', 'evidence_reviewed',
        'manual_approval', 'retention_review'
      )
    )
  ),
  CONSTRAINT evidence_artifact_events_shape CHECK (
    (
      event_type = 'artifact_created'
      AND from_state IS NULL
      AND to_state = 'quarantine'
    )
    OR (
      event_type = 'state_transitioned'
      AND from_state IS NOT NULL
      AND (
        (from_state = 'quarantine' AND to_state = 'staged')
        OR (from_state = 'staged' AND to_state = 'approved')
      )
    )
  )
);

CREATE INDEX evidence_artifact_events_artifact_idx
  ON evidence_artifact_events (artifact_id, occurred_at, event_id);

CREATE TRIGGER evidence_artifact_events_are_append_only
  BEFORE UPDATE OR DELETE ON evidence_artifact_events
  FOR EACH ROW EXECUTE FUNCTION reds_reject_mutation();
