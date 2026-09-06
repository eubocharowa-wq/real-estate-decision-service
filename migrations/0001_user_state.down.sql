-- Reverses 0001_user_state.up.sql.
--
-- Dropped in reverse dependency order. The append-only triggers block UPDATE
-- and DELETE on their rows, not DROP TABLE, so the tables come away cleanly.

DROP TABLE IF EXISTS refresh_tasks;
DROP TABLE IF EXISTS application_errors;
DROP TABLE IF EXISTS journey_feedback;
DROP TABLE IF EXISTS expert_result_drafts;
DROP TABLE IF EXISTS expert_audit_events;
DROP TABLE IF EXISTS expert_results;
DROP TABLE IF EXISTS expert_requests;
DROP TABLE IF EXISTS expert_context_packages;
DROP TABLE IF EXISTS journey_audit_events;
DROP TABLE IF EXISTS canonical_decision_overlays;
DROP TABLE IF EXISTS journey_imported_candidates;
DROP TABLE IF EXISTS imported_candidates;
DROP TABLE IF EXISTS decision_metric_snapshots;
DROP TABLE IF EXISTS decision_updates;
DROP TABLE IF EXISTS comparison_items;
DROP TABLE IF EXISTS comparisons;
DROP TABLE IF EXISTS matching_bundle_entries;
DROP TABLE IF EXISTS matching_bundles;
DROP TABLE IF EXISTS confirmed_requests;
DROP TABLE IF EXISTS parsed_requests;
DROP TABLE IF EXISTS buyer_journeys;
DROP TABLE IF EXISTS field_evidence;

DROP FUNCTION IF EXISTS reds_reject_mutation();
