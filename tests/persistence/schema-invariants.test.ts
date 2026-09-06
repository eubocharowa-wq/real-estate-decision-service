import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateUp } from "../../src/persistence";
import {
  createTestDatabase,
  dropTestDatabase,
  isDatabaseAvailable,
  type TestDatabase,
} from "./helpers";

/**
 * The invariants are supposed to live in the database, not in TypeScript.
 * These tests prove that by trying to violate each one through raw SQL, which
 * is exactly what a second application instance would do.
 *
 * Skipped without DATABASE_URL; CI provides a service container.
 */
const NOW = "2026-08-15T00:00:00.000Z";

describe.skipIf(!isDatabaseAvailable)("schema invariants", () => {
  let database: TestDatabase;
  let pool: Pool;

  beforeAll(async () => {
    database = await createTestDatabase("test_invariants");
    pool = database.pool;
    await migrateUp(pool);

    await pool.query(
      `INSERT INTO field_evidence (
         evidence_id, schema_version, entity_type, entity_id, field, value,
         raw_value, source_id, collected_at, verification_status,
         freshness_status, evidence_type, document
       ) VALUES (
         'ev_1', '1.0', 'property', 'prop_1', 'financing.family_mortgage',
         'true'::jsonb, 'true'::jsonb, 'src_manual', $1, 'confirmed', 'fresh',
         'manual_expert', '{}'::jsonb
       )`,
      [NOW],
    );
  });

  afterAll(async () => {
    await dropTestDatabase(database);
  });

  const insertJourney = (journeyId: string, stage = "request_entry") =>
    pool.query(
      `INSERT INTO buyer_journeys (
         journey_id, schema_version, session_id, raw_request_text,
         current_stage, shortlist_status, document, created_at, updated_at
       ) VALUES ($1, 'buyer-journey-v1', 'session_1', 'текст запроса', $2,
         'not_started', '{}'::jsonb, $3, $3)`,
      [journeyId, stage, NOW],
    );

  const insertExpertRequest = (
    requestId: string,
    dedupKey: string,
    status: string,
  ) =>
    pool.query(
      `INSERT INTO expert_requests (
         request_id, request_schema_version, owner_type, owner_id,
         request_type, trigger_type, question_category, user_request_id,
         question, priority, priority_score, priority_policy_version,
         required_specialist, routing_version, status, context_package_id,
         dedup_key, document, created_at, updated_at
       ) VALUES ($1, 'expert-request-v1', 'session', 'owner_1',
         'information_verification', 'critical_unknown', 'financing', 'ur_1',
         'Подтвердите применимость программы.', 'high', 10.5, 'p-v1',
         'mortgage_specialist', 'r-v1', $3, 'ctx_1', $2, '{}'::jsonb, $4, $4)`,
      [requestId, dedupKey, status, NOW],
    );

  describe("unknown is not false", () => {
    it("accepts 'unknown' as a first-class verification status", async () => {
      await expect(
        pool.query(
          `INSERT INTO field_evidence (
             evidence_id, schema_version, entity_type, entity_id, field, value,
             raw_value, source_id, collected_at, verification_status,
             freshness_status, evidence_type, document
           ) VALUES ('ev_unknown', '1.0', 'property', 'prop_1', 'utilities.gas',
             'null'::jsonb, 'null'::jsonb, 'src_manual', $1, 'unknown',
             'unknown', 'derived', '{}'::jsonb)`,
          [NOW],
        ),
      ).resolves.toBeDefined();
    });

    it("rejects a status outside the enumerated set", async () => {
      await expect(
        pool.query(
          `INSERT INTO field_evidence (
             evidence_id, schema_version, entity_type, entity_id, field, value,
             raw_value, source_id, collected_at, verification_status,
             freshness_status, evidence_type, document
           ) VALUES ('ev_bad', '1.0', 'property', 'prop_1', 'x', 'null'::jsonb,
             'null'::jsonb, 'src_manual', $1, 'probably', 'fresh', 'derived',
             '{}'::jsonb)`,
          [NOW],
        ),
      ).rejects.toThrow(/verification_status/);
    });

    it("rejects a NULL status, which would erase the distinction", async () => {
      await expect(
        pool.query(
          `INSERT INTO field_evidence (
             evidence_id, schema_version, entity_type, entity_id, field, value,
             raw_value, source_id, collected_at, verification_status,
             freshness_status, evidence_type, document
           ) VALUES ('ev_null', '1.0', 'property', 'prop_1', 'x', 'null'::jsonb,
             'null'::jsonb, 'src_manual', $1, NULL, 'fresh', 'derived',
             '{}'::jsonb)`,
          [NOW],
        ),
      ).rejects.toThrow(/verification_status/);
    });
  });

  describe("append-only tables", () => {
    it("refuses to update evidence", async () => {
      await expect(
        pool.query(
          `UPDATE field_evidence SET verification_status = 'claimed'
            WHERE evidence_id = 'ev_1'`,
        ),
      ).rejects.toThrow(/APPEND_ONLY_TABLE_UPDATE/);
    });

    it("refuses to delete evidence", async () => {
      await expect(
        pool.query(`DELETE FROM field_evidence WHERE evidence_id = 'ev_1'`),
      ).rejects.toThrow(/APPEND_ONLY_TABLE_DELETE/);
    });

    it("refuses to rewrite a completed expert result", async () => {
      await pool.query(
        `INSERT INTO expert_context_packages (
           context_package_id, package_version, expert_request_id,
           user_request_ref, document
         ) VALUES ('ctx_1', 'expert-context-v1', 'req_1', 'ur_1', '{}'::jsonb)`,
      );
      await insertExpertRequest("req_1", "dedup_result", "completed");
      await pool.query(
        `INSERT INTO expert_results (
           request_id, expert_result_id, result_version, status,
           specialist_ref, specialist_type, document, completed_at
         ) VALUES ('req_1', 'res_1', 'expert-result-v1', 'completed',
           'spec_1', 'mortgage_specialist', '{}'::jsonb, $1)`,
        [NOW],
      );

      await expect(
        pool.query(
          `UPDATE expert_results SET status = 'unable_to_verify'
            WHERE request_id = 'req_1'`,
        ),
      ).rejects.toThrow(/APPEND_ONLY_TABLE_UPDATE/);
    });

    it("refuses to rewrite a journey audit event", async () => {
      await insertJourney("journey_audit");
      await pool.query(
        `INSERT INTO journey_audit_events (
           event_id, instrumentation_version, journey_id, session_id,
           event_type, occurred_at
         ) VALUES ('evt_1', 'buyer-journey-instrumentation-v1',
           'journey_audit', 'session_1', 'journey_started', $1)`,
        [NOW],
      );

      await expect(
        pool.query(`DELETE FROM journey_audit_events WHERE event_id = 'evt_1'`),
      ).rejects.toThrow(/APPEND_ONLY_TABLE_DELETE/);
    });
  });

  describe("provenance", () => {
    it("refuses a canonical overlay without evidence", async () => {
      await expect(
        pool.query(
          `INSERT INTO canonical_decision_overlays (
             overlay_id, entity_type, entity_id, field, value,
             verification_status, evidence_id, created_at
           ) VALUES ('ov_missing', 'property', 'prop_1', 'x', 'true'::jsonb,
             'confirmed', 'ev_does_not_exist', $1)`,
          [NOW],
        ),
      ).rejects.toThrow(/foreign key|evidence_id/i);
    });

    it("refuses a NULL evidence reference", async () => {
      await expect(
        pool.query(
          `INSERT INTO canonical_decision_overlays (
             overlay_id, entity_type, entity_id, field, value,
             verification_status, evidence_id, created_at
           ) VALUES ('ov_null', 'property', 'prop_1', 'x', 'true'::jsonb,
             'confirmed', NULL, $1)`,
          [NOW],
        ),
      ).rejects.toThrow(/evidence_id/);
    });

    it("keeps claimed separate from confirmed and rejects anything else", async () => {
      await expect(
        pool.query(
          `INSERT INTO canonical_decision_overlays (
             overlay_id, entity_type, entity_id, field, value,
             verification_status, evidence_id, created_at
           ) VALUES ('ov_claimed', 'offer', 'offer_1', 'price', '1'::jsonb,
             'claimed', 'ev_1', $1)`,
          [NOW],
        ),
      ).resolves.toBeDefined();

      await expect(
        pool.query(
          `INSERT INTO canonical_decision_overlays (
             overlay_id, entity_type, entity_id, field, value,
             verification_status, evidence_id, created_at
           ) VALUES ('ov_unconfirmed', 'offer', 'offer_1', 'price', '1'::jsonb,
             'unconfirmed', 'ev_1', $1)`,
          [NOW],
        ),
      ).rejects.toThrow(/verification_status/);
    });
  });

  describe("match score and data confidence", () => {
    const seedBundle = async () => {
      await pool.query(
        `INSERT INTO confirmed_requests (
           user_request_id, user_request_version, record_version, confirmed_at,
           document
         ) VALUES ('ur_scores', 1, 'confirmed-request-record-v1', $1,
           '{}'::jsonb)`,
        [NOW],
      );
      await pool.query(
        `INSERT INTO matching_bundles (
           matching_bundle_id, schema_version, user_request_id,
           user_request_version, generated_at, matching_algorithm_version,
           confidence_algorithm_version, criteria_registry_version, dataset_id,
           dataset_version, dataset_type, partial, document
         ) VALUES ('mb_1', 'matching-bundle-v1', 'ur_scores', 1, $1, 'm-v1',
           'c-v1', 'cr-v1', 'ds', 'ds-v1', 'synthetic_pilot', false,
           '{}'::jsonb)`,
        [NOW],
      );
    };

    it("stores an entry whose confidence was never computed", async () => {
      await seedBundle();

      await expect(
        pool.query(
          `INSERT INTO matching_bundle_entries (
             matching_bundle_id, property_id, origin, eligibility_status,
             match_result_id, match_score, match_document
           ) VALUES ('mb_1', 'prop_no_quality', 'synthetic',
             'eligible_with_unknowns', 'mr_1', 88.5, '{}'::jsonb)`,
        ),
      ).resolves.toBeDefined();

      const row = await pool.query<{
        match_score: string;
        data_confidence_score: string | null;
      }>(
        `SELECT match_score, data_confidence_score FROM matching_bundle_entries
          WHERE property_id = 'prop_no_quality'`,
      );
      // A missing confidence stays NULL and is never coerced to zero.
      expect(row.rows[0]?.data_confidence_score).toBeNull();
      expect(Number(row.rows[0]?.match_score)).toBe(88.5);
    });

    it("refuses a confidence score with no DataQuality behind it", async () => {
      await expect(
        pool.query(
          `INSERT INTO matching_bundle_entries (
             matching_bundle_id, property_id, origin, eligibility_status,
             match_result_id, match_score, data_confidence_score,
             match_document
           ) VALUES ('mb_1', 'prop_orphan_score', 'synthetic', 'eligible',
             'mr_2', 90, 70, '{}'::jsonb)`,
        ),
      ).rejects.toThrow(/scores_need_quality/);
    });

    it("refuses a match score outside its range", async () => {
      await expect(
        pool.query(
          `INSERT INTO matching_bundle_entries (
             matching_bundle_id, property_id, origin, eligibility_status,
             match_result_id, match_score, match_document
           ) VALUES ('mb_1', 'prop_bad_score', 'synthetic', 'eligible', 'mr_3',
             140, '{}'::jsonb)`,
        ),
      ).rejects.toThrow(/match_score/);
    });

    it("has no combined score column", async () => {
      const columns = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'matching_bundle_entries'`,
        [database.schema],
      );
      const names = columns.rows.map((row) => row.column_name);

      expect(names).toContain("match_score");
      expect(names).toContain("data_confidence_score");
      expect(
        names.some((name) => /overall|combined|total_score/.test(name)),
      ).toBe(false);
    });
  });

  describe("expert request deduplication", () => {
    it("rejects a second active request with the same dedup key", async () => {
      await pool.query(
        `INSERT INTO expert_context_packages (
           context_package_id, package_version, expert_request_id,
           user_request_ref, document
         ) VALUES ('ctx_1', 'expert-context-v1', 'req_dup_1', 'ur_1',
           '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
      );
      await insertExpertRequest("req_dup_1", "dedup_shared", "queued");

      await expect(
        insertExpertRequest("req_dup_2", "dedup_shared", "queued"),
      ).rejects.toThrow(/expert_requests_active_dedup_key/);
    });

    it("allows the key to be reused once the earlier request is final", async () => {
      await insertExpertRequest("req_dup_3", "dedup_recycled", "queued");
      await pool.query(
        `UPDATE expert_requests SET status = 'completed'
          WHERE request_id = 'req_dup_3'`,
      );

      await expect(
        insertExpertRequest("req_dup_4", "dedup_recycled", "queued"),
      ).resolves.toBeDefined();
    });
  });

  describe("confirmed request versioning", () => {
    it("keeps every version addressable by the composite key", async () => {
      await pool.query(
        `INSERT INTO confirmed_requests (
           user_request_id, user_request_version, record_version, confirmed_at,
           document
         ) VALUES ('ur_versioned', 1, 'confirmed-request-record-v1', $1,
           '{}'::jsonb)`,
        [NOW],
      );
      await pool.query(
        `INSERT INTO confirmed_requests (
           user_request_id, user_request_version, record_version,
           supersedes_version, confirmed_at, document
         ) VALUES ('ur_versioned', 2, 'confirmed-request-record-v1', 1, $1,
           '{}'::jsonb)`,
        [NOW],
      );

      const rows = await pool.query(
        `SELECT user_request_version FROM confirmed_requests
          WHERE user_request_id = 'ur_versioned' ORDER BY user_request_version`,
      );
      expect(rows.rowCount).toBe(2);
    });

    it("refuses a version that supersedes a later one", async () => {
      await expect(
        pool.query(
          `INSERT INTO confirmed_requests (
             user_request_id, user_request_version, record_version,
             supersedes_version, confirmed_at, document
           ) VALUES ('ur_backwards', 1, 'confirmed-request-record-v1', 5, $1,
             '{}'::jsonb)`,
          [NOW],
        ),
      ).rejects.toThrow(/supersedes_is_earlier/);
    });
  });

  describe("refresh queue", () => {
    it("rejects a second active task with the same dedup key", async () => {
      const insert = (taskId: string, status: string) =>
        pool.query(
          `INSERT INTO refresh_tasks (
             refresh_task_id, schema_version, refresh_policy_version, operation,
             entity_type, entity_id, source_id, reason, priority,
             priority_score, journey_stage, status, max_attempts, dedup_key,
             requested_at, requested_by, not_before
           ) VALUES ($1, '1.0', 'refresh-policy-v1', 'targeted_refresh',
             'offer', 'offer_1', 'src_1', 'PRE_DECISION_CHECK', 'high', 9.5,
             'pre_decision', $2, 3, 'refresh_dedup', $3, 'user', $3)`,
          [taskId, status, NOW],
        );

      await insert("task_1", "queued");
      await expect(insert("task_2", "running")).rejects.toThrow(
        /refresh_tasks_active_dedup_key/,
      );
    });
  });
});
