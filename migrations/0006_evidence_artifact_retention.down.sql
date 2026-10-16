DROP TRIGGER IF EXISTS evidence_artifact_retention_initialize
  ON evidence_artifacts;
DROP FUNCTION IF EXISTS reds_initialize_evidence_artifact_retention();
DROP TRIGGER IF EXISTS evidence_artifact_retention_events_are_append_only
  ON evidence_artifact_retention_events;
DROP TRIGGER IF EXISTS evidence_artifact_retention_state_guard
  ON evidence_artifact_retention_state;
DROP FUNCTION IF EXISTS reds_enforce_evidence_artifact_retention_mutation();
DROP TABLE IF EXISTS evidence_artifact_retention_events;
DROP TABLE IF EXISTS evidence_artifact_retention_state;
