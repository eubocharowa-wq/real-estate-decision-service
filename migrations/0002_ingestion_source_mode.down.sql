-- Reverses 0002_ingestion_source_mode.up.sql, restoring the 0001 check.
--
-- Rows carrying a mode 0001 never allowed are removed first: the old
-- constraint cannot be re-added while they exist, and they are candidates
-- 0001's schema had no way to store.

DELETE FROM imported_candidates
  WHERE source_mode NOT IN ('automatic_allowed', 'manual_only', 'unknown');

ALTER TABLE imported_candidates
  DROP CONSTRAINT IF EXISTS imported_candidates_source_mode_check;

ALTER TABLE imported_candidates
  ADD CONSTRAINT imported_candidates_source_mode_check CHECK (
    source_mode IN ('automatic_allowed', 'manual_only', 'unknown')
  );
