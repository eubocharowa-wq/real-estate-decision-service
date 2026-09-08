-- Corrects the imported_candidates.source_mode check.
--
-- 0001 constrained the column to ('automatic_allowed', 'manual_only',
-- 'unknown'), which are not the values the domain produces: the ingestion
-- policy resolves a source to automatic_allowed, fixture_mock,
-- manual_confirmation, unsupported or blocked. Any real candidate written
-- through the PostgreSQL repository therefore failed the check. The
-- constraint follows the domain, not the other way round.

ALTER TABLE imported_candidates
  DROP CONSTRAINT IF EXISTS imported_candidates_source_mode_check;

ALTER TABLE imported_candidates
  ADD CONSTRAINT imported_candidates_source_mode_check CHECK (
    source_mode IN (
      'automatic_allowed',
      'fixture_mock',
      'manual_confirmation',
      'unsupported',
      'blocked'
    )
  );
