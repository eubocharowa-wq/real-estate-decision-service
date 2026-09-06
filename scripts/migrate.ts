import { Pool } from "pg";

import { requireDatabaseConfig } from "../src/persistence/config";
import {
  migrateDown,
  migrateUp,
  migrationStatus,
} from "../src/persistence/migrator";

/**
 * Migration CLI.
 *
 * Usage:
 *   npm run db:migrate            apply every pending migration
 *   npm run db:rollback           revert the most recent migration
 *   npm run db:rollback -- 3      revert the three most recent
 *   npm run db:status             show what is applied
 *
 * A dedicated pool is used rather than the shared application one: the CLI
 * ends the process and should not leave a global pool behind.
 */
const command = process.argv[2] ?? "up";
const steps = Number(process.argv[3] ?? "1");

const config = requireDatabaseConfig();
const pool = new Pool({
  connectionString: config.connectionString,
  max: 1,
  connectionTimeoutMillis: config.connectionTimeoutMs,
});

const write = (line: string) => process.stdout.write(`${line}\n`);

try {
  if (command === "up") {
    const executed = await migrateUp(pool);
    write(
      executed.length === 0
        ? "No pending migrations."
        : `Applied ${executed.length} migration(s):\n${executed
            .map((migration) => `  ${migration.version}_${migration.name}`)
            .join("\n")}`,
    );
  } else if (command === "down") {
    if (!Number.isInteger(steps) || steps < 1)
      throw new Error("ROLLBACK_STEPS_MUST_BE_A_POSITIVE_INTEGER");
    const reverted = await migrateDown(pool, { steps });
    write(
      reverted.length === 0
        ? "Nothing to roll back."
        : `Reverted ${reverted.length} migration(s):\n${reverted
            .map((migration) => `  ${migration.version}_${migration.name}`)
            .join("\n")}`,
    );
  } else if (command === "status") {
    const status = await migrationStatus(pool);
    write(
      status
        .map(
          (migration) =>
            `${migration.applied ? "applied" : "pending"}  ${migration.version}_${migration.name}`,
        )
        .join("\n") || "No migrations found.",
    );
  } else {
    throw new Error(`UNKNOWN_MIGRATION_COMMAND: ${command}`);
  }
} finally {
  await pool.end();
}
