import type { Pool } from "pg";

import {
  defaultMigrationsDirectory,
  MIGRATIONS_TABLE,
  readMigrations,
} from "./migrator";

export interface DatabaseMigrationReadiness {
  readonly reachable: boolean;
  readonly schemaCompatible: boolean;
  readonly expectedMigrationCount: number;
  readonly appliedMigrationCount: number;
  readonly pendingVersions: readonly string[];
  readonly unexpectedVersions: readonly string[];
  readonly mismatchedVersions: readonly string[];
}

const unavailable = (): DatabaseMigrationReadiness => ({
  reachable: false,
  schemaCompatible: false,
  expectedMigrationCount: 0,
  appliedMigrationCount: 0,
  pendingVersions: [],
  unexpectedVersions: [],
  mismatchedVersions: [],
});

/**
 * Read-only staging database probe.
 *
 * Unlike listApplied/migrationStatus, this function never creates the
 * migration table. A health request must not silently mutate an empty or
 * misconfigured database and then report that the database is usable.
 */
export const inspectDatabaseMigrationReadiness = async (
  pool: Pick<Pool, "query">,
  migrationsDirectory = defaultMigrationsDirectory(),
): Promise<DatabaseMigrationReadiness> => {
  try {
    const expected = readMigrations(migrationsDirectory);
    await pool.query("SELECT 1 AS readiness_probe");
    if (expected.length === 0)
      return {
        reachable: true,
        schemaCompatible: false,
        expectedMigrationCount: 0,
        appliedMigrationCount: 0,
        pendingVersions: [],
        unexpectedVersions: [],
        mismatchedVersions: [],
      };
    const table = await pool.query<{ table_name: string | null }>(
      "SELECT to_regclass($1) AS table_name",
      [MIGRATIONS_TABLE],
    );
    if (table.rows[0]?.table_name === null || table.rows.length === 0)
      return {
        reachable: true,
        schemaCompatible: false,
        expectedMigrationCount: expected.length,
        appliedMigrationCount: 0,
        pendingVersions: expected.map((migration) => migration.version),
        unexpectedVersions: [],
        mismatchedVersions: [],
      };

    const appliedResult = await pool.query<{
      version: string;
      name: string;
    }>(`SELECT version, name FROM ${MIGRATIONS_TABLE} ORDER BY version`);
    const expectedByVersion = new Map(
      expected.map((migration) => [migration.version, migration.name]),
    );
    const appliedByVersion = new Map(
      appliedResult.rows.map((migration) => [
        migration.version,
        migration.name,
      ]),
    );
    const pendingVersions = expected
      .filter((migration) => !appliedByVersion.has(migration.version))
      .map((migration) => migration.version);
    const unexpectedVersions = appliedResult.rows
      .filter((migration) => !expectedByVersion.has(migration.version))
      .map((migration) => migration.version);
    const mismatchedVersions = appliedResult.rows
      .filter(
        (migration) =>
          expectedByVersion.has(migration.version) &&
          expectedByVersion.get(migration.version) !== migration.name,
      )
      .map((migration) => migration.version);

    return {
      reachable: true,
      schemaCompatible:
        pendingVersions.length === 0 &&
        unexpectedVersions.length === 0 &&
        mismatchedVersions.length === 0,
      expectedMigrationCount: expected.length,
      appliedMigrationCount: appliedResult.rows.length,
      pendingVersions,
      unexpectedVersions,
      mismatchedVersions,
    };
  } catch {
    // Error text from PostgreSQL can contain host, database or query details.
    // The public readiness contract intentionally collapses all of it.
    return unavailable();
  }
};
