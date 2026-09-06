import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Pool, PoolClient } from "pg";

/**
 * Migration runner over plain SQL files.
 *
 * The DDL is raw SQL on purpose: partial unique indexes, CHECK constraints and
 * the append-only triggers are what hold the domain invariants, and they read
 * far better as SQL than through a schema DSL. The runner only needs to apply
 * files in order, record them, and be able to walk back.
 *
 * Each migration is a pair of files:
 *   migrations/<version>_<name>.up.sql
 *   migrations/<version>_<name>.down.sql
 */

export const MIGRATIONS_TABLE = "schema_migrations";

export interface Migration {
  readonly version: string;
  readonly name: string;
  readonly upPath: string;
  readonly downPath: string;
}

export interface AppliedMigration {
  readonly version: string;
  readonly name: string;
  readonly appliedAt: Date;
}

const FILE_PATTERN = /^(\d+)_([a-z0-9_]+)\.(up|down)\.sql$/;

export const defaultMigrationsDirectory = (): string =>
  path.resolve(process.cwd(), "migrations");

/** Lists migrations on disk, ordered by version, rejecting an unpaired file. */
export const readMigrations = (directory: string): readonly Migration[] => {
  const files = readdirSync(directory).filter((file) =>
    FILE_PATTERN.test(file),
  );
  const byVersion = new Map<
    string,
    { name: string; up?: string; down?: string }
  >();
  for (const file of files) {
    const [, version, name, direction] = FILE_PATTERN.exec(file)!;
    const entry = byVersion.get(version!) ?? { name: name! };
    if (entry.name !== name)
      throw new Error(
        `MIGRATION_NAME_MISMATCH: version ${version} has both "${entry.name}" and "${name}"`,
      );
    if (direction === "up") entry.up = path.join(directory, file);
    else entry.down = path.join(directory, file);
    byVersion.set(version!, entry);
  }

  return [...byVersion.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([version, entry]) => {
      if (!entry.up)
        throw new Error(`MIGRATION_MISSING_UP: ${version}_${entry.name}`);
      if (!entry.down)
        throw new Error(`MIGRATION_MISSING_DOWN: ${version}_${entry.name}`);
      return {
        version,
        name: entry.name,
        upPath: entry.up,
        downPath: entry.down,
      };
    });
};

const ensureMigrationsTable = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version text PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

export const listApplied = async (
  pool: Pool,
): Promise<readonly AppliedMigration[]> => {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const result = await client.query<{
      version: string;
      name: string;
      applied_at: Date;
    }>(
      `SELECT version, name, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY version`,
    );
    return result.rows.map((row) => ({
      version: row.version,
      name: row.name,
      appliedAt: row.applied_at,
    }));
  } finally {
    client.release();
  }
};

/**
 * Applies every pending migration.
 *
 * Each migration runs inside its own transaction, so a failing file leaves the
 * schema exactly as it was before that file — PostgreSQL supports
 * transactional DDL, which is the whole reason this is safe.
 */
export const migrateUp = async (
  pool: Pool,
  directory = defaultMigrationsDirectory(),
): Promise<readonly Migration[]> => {
  const migrations = readMigrations(directory);
  const applied = new Set((await listApplied(pool)).map((row) => row.version));
  const executed: Migration[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(readFileSync(migration.upPath, "utf8"));
      await client.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (version, name) VALUES ($1, $2)`,
        [migration.version, migration.name],
      );
      await client.query("COMMIT");
      executed.push(migration);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return executed;
};

/** Rolls back the most recently applied migrations, newest first. */
export const migrateDown = async (
  pool: Pool,
  options: { readonly steps?: number; readonly directory?: string } = {},
): Promise<readonly Migration[]> => {
  const directory = options.directory ?? defaultMigrationsDirectory();
  const migrations = new Map(
    readMigrations(directory).map((migration) => [
      migration.version,
      migration,
    ]),
  );
  const applied = [...(await listApplied(pool))].reverse();
  const steps = options.steps ?? 1;
  const reverted: Migration[] = [];

  for (const row of applied.slice(0, steps)) {
    const migration = migrations.get(row.version);
    if (!migration)
      throw new Error(
        `MIGRATION_FILE_MISSING_FOR_APPLIED_VERSION: ${row.version}`,
      );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(readFileSync(migration.downPath, "utf8"));
      await client.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE version = $1`, [
        migration.version,
      ]);
      await client.query("COMMIT");
      reverted.push(migration);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return reverted;
};

export interface MigrationStatus {
  readonly version: string;
  readonly name: string;
  readonly applied: boolean;
}

export const migrationStatus = async (
  pool: Pool,
  directory = defaultMigrationsDirectory(),
): Promise<readonly MigrationStatus[]> => {
  const applied = new Set((await listApplied(pool)).map((row) => row.version));
  return readMigrations(directory).map((migration) => ({
    version: migration.version,
    name: migration.name,
    applied: applied.has(migration.version),
  }));
};
