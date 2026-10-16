DROP TRIGGER IF EXISTS evidence_artifact_events_are_append_only
  ON evidence_artifact_events;
DROP TABLE IF EXISTS evidence_artifact_events;
DROP TABLE IF EXISTS evidence_artifact_links;
DROP TRIGGER IF EXISTS evidence_artifacts_guard ON evidence_artifacts;
DROP TABLE IF EXISTS evidence_artifacts;
DROP FUNCTION IF EXISTS reds_enforce_evidence_artifact_mutation();
