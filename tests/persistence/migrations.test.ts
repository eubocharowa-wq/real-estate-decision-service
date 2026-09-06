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

    expect(executed.map((migration) => migration.version)).toEqual(["0001"]);
    const tables = await listTables(database);
    for (const table of PHASE_ONE_TABLES) expect(tables).toContain(table);
    expect(tables).toContain("schema_migrations");
  });

  it("records what it applied and reports status", async () => {
    expect(
      (await listApplied(database.pool)).map((row) => row.version),
    ).toEqual(["0001"]);
    expect(await migrationStatus(database.pool)).toEqual([
      { version: "0001", name: "user_state", applied: true },
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

  it("rolls back cleanly and can be re-applied", async () => {
    const reverted = await migrateDown(database.pool);
    expect(reverted.map((migration) => migration.version)).toEqual(["0001"]);

    const afterDown = await listTables(database);
    for (const table of PHASE_ONE_TABLES)
      expect(afterDown).not.toContain(table);
    // The bookkeeping table survives a rollback; only the migration's own
    // objects go away.
    expect(afterDown).toContain("schema_migrations");
    expect(await listApplied(database.pool)).toEqual([]);

    const reapplied = await migrateUp(database.pool);
    expect(reapplied.map((migration) => migration.version)).toEqual(["0001"]);
    expect(await listTables(database)).toContain("buyer_journeys");
  });
});
