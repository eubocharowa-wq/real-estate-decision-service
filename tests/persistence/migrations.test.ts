import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  listApplied,
  migrateDown,
  migrateUp,
  migrationStatus,
} from "../../src/persistence";
import {
  createTestDatabase,
  dropTestDatabase,
  isDatabaseAvailable,
  listTables,
  PHASE_ONE_TABLES,
  type TestDatabase,
} from "./helpers";

/**
 * Runs the real DDL against a real PostgreSQL.
 *
 * Skipped unless DATABASE_URL is set, so the default suite stays offline; CI
 * supplies a service container.
 */
describe.skipIf(!isDatabaseAvailable)("schema migrations", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase("test_migrations");
  });

  afterAll(async () => {
    await dropTestDatabase(database);
  });

  it("applies to a clean database", async () => {
    const executed = await migrateUp(database.pool);

    expect(executed.map((migration) => migration.version)).toEqual([
      "0001",
      "0002",
      "0003",
      "0004",
      "0005",
      "0006",
    ]);
    const tables = await listTables(database);
    for (const table of PHASE_ONE_TABLES) expect(tables).toContain(table);
    expect(tables).toContain("schema_migrations");
  });

  it("records what it applied and reports status", async () => {
    expect(
      (await listApplied(database.pool)).map((row) => row.version),
    ).toEqual(["0001", "0002", "0003", "0004", "0005", "0006"]);
    expect(await migrationStatus(database.pool)).toEqual([
      { version: "0001", name: "user_state", applied: true },
      { version: "0002", name: "ingestion_source_mode", applied: true },
      {
        version: "0003",
        name: "matching_bundle_dataset_type",
        applied: true,
      },
      {
        version: "0004",
        name: "expert_terminal_status",
        applied: true,
      },
      {
        version: "0005",
        name: "evidence_artifacts",
        applied: true,
      },
      {
        version: "0006",
        name: "evidence_artifact_retention",
        applied: true,
      },
    ]);
  });

  it("is a no-op when everything is already applied", async () => {
    expect(await migrateUp(database.pool)).toEqual([]);
  });

  it("keeps the catalogue out of phase one", async () => {
    const tables = await listTables(database);

    for (const catalogueTable of [
      "properties",
      "offers",
      "financing_programs",
      "purchase_scenarios",
      "sources",
      "source_conflicts",
    ])
      expect(tables).not.toContain(catalogueTable);
  });

  it("rolls migration 0006 down and re-applies it", async () => {
    const reverted = await migrateDown(database.pool, { steps: 1 });
    expect(reverted.map((migration) => migration.version)).toEqual(["0006"]);
    expect(await listTables(database)).not.toContain(
      "evidence_artifact_retention_state",
    );
    await database.pool.query(
      `INSERT INTO evidence_artifacts (
        artifact_id, schema_version, artifact_kind, source_id, source_url,
        source_reference, collected_at, mime_type, byte_size, sha256,
        storage_key, state, access_scope, retention_policy, retain_until,
        created_at
      ) VALUES (
        'artifact_backfill', '1.0', 'source_snapshot', 'source_backfill',
        'https://source.invalid/backfill', NULL, NOW(), 'text/html', 1,
        $1, 'evidence/artifact_backfill/content', 'quarantine',
        'restricted_internal', 'legal_hold', NULL, NOW()
      )`,
      ["a".repeat(64)],
    );

    const reapplied = await migrateUp(database.pool);
    expect(reapplied.map((migration) => migration.version)).toEqual(["0006"]);
    expect(await listTables(database)).toContain(
      "evidence_artifact_retention_state",
    );
    const backfilled = await database.pool.query<{
      legal_hold_active: boolean;
      blob_state: string;
    }>(
      `SELECT legal_hold_active, blob_state
       FROM evidence_artifact_retention_state
       WHERE artifact_id = 'artifact_backfill'`,
    );
    expect(backfilled.rows).toEqual([
      { legal_hold_active: true, blob_state: "present" },
    ]);
  });

  it("rolls back cleanly and can be re-applied", async () => {
    // Newest first, so each constraint fix comes off before the tables it
    // altered.
    const reverted = await migrateDown(database.pool, { steps: 6 });
    expect(reverted.map((migration) => migration.version)).toEqual([
      "0006",
      "0005",
      "0004",
      "0003",
      "0002",
      "0001",
    ]);

    const afterDown = await listTables(database);
    for (const table of PHASE_ONE_TABLES)
      expect(afterDown).not.toContain(table);
    // The bookkeeping table survives a rollback; only the migration's own
    // objects go away.
    expect(afterDown).toContain("schema_migrations");
    expect(await listApplied(database.pool)).toEqual([]);

    const reapplied = await migrateUp(database.pool);
    expect(reapplied.map((migration) => migration.version)).toEqual([
      "0001",
      "0002",
      "0003",
      "0004",
      "0005",
      "0006",
    ]);
    expect(await listTables(database)).toContain("buyer_journeys");
  });
});
