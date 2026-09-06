import { Pool } from "pg";

import { readDatabaseConfig } from "../../src/persistence";

/**
 * Test databases.
 *
 * Vitest runs test files in parallel, so two files pointing at the same
 * database would drop each other's schema mid-run. Each file gets its own
 * PostgreSQL schema instead, pinned through the connection's search_path, and
 * the migrations land inside it.
 */
export const databaseConfig = readDatabaseConfig();

export const isDatabaseAvailable = databaseConfig.success;

export interface TestDatabase {
  readonly pool: Pool;
  readonly schema: string;
}

/** Opens a pool bound to a freshly created, empty schema. */
export const createTestDatabase = async (
  schema: string,
): Promise<TestDatabase> => {
  if (!databaseConfig.success)
    throw new Error("DATABASE_URL is required for database tests");

  const admin = new Pool({
    connectionString: databaseConfig.config.connectionString,
    max: 1,
  });
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({
    connectionString: databaseConfig.config.connectionString,
    max: 2,
    options: `-c search_path=${schema}`,
  });
  return { pool, schema };
};

/** Lists the base tables inside the test schema. */
export const listTables = async (
  database: TestDatabase,
): Promise<readonly string[]> => {
  const result = await database.pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
    [database.schema],
  );
  return result.rows.map((row) => row.table_name);
};

export const dropTestDatabase = async (
  database: TestDatabase | undefined,
): Promise<void> => {
  if (!database) return;
  await database.pool.end();
  if (!databaseConfig.success) return;
  const admin = new Pool({
    connectionString: databaseConfig.config.connectionString,
    max: 1,
  });
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${database.schema} CASCADE`);
  } finally {
    await admin.end();
  }
};

/** Every table the phase-one migration is expected to create. */
export const PHASE_ONE_TABLES = [
  "application_errors",
  "buyer_journeys",
  "canonical_decision_overlays",
  "comparison_items",
  "comparisons",
  "confirmed_requests",
  "decision_metric_snapshots",
  "decision_updates",
  "expert_audit_events",
  "expert_context_packages",
  "expert_requests",
  "expert_result_drafts",
  "expert_results",
  "field_evidence",
  "imported_candidates",
  "journey_audit_events",
  "journey_feedback",
  "journey_imported_candidates",
  "matching_bundle_entries",
  "matching_bundles",
  "parsed_requests",
  "refresh_tasks",
] as const;
