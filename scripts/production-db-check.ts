import { Pool } from "pg";

import {
  connectionStringProtocol,
  diagnoseMigrationFailure,
  formatProductionDbCheckFailure,
  formatProductionDbCheckStatus,
  inspectDatabaseMigrationReadiness,
  queryParameterNames,
  requireDatabaseConfig,
} from "../src/persistence";

/**
 * Read-only production database status check (see
 * .github/workflows/production-db-check.yml). It never applies a
 * migration: Vercel's own production build already owns that (see
 * src/persistence/vercel-build.ts), and running the migrator from two
 * places at once could race on the same schema change. This only reports
 * what it finds, through the same safe, categorized diagnosis
 * scripts/vercel-prebuild.ts uses on failure — never the connection
 * string, host, user, password, or database name, all of which routinely
 * appear in a pg connection error and would otherwise land in a GitHub
 * Actions log (visible to anyone with read access to the repository).
 *
 * The connection string comes only from the REDS_DATABASE_URL repository
 * secret — not DATABASE_URL, which this script never reads, so a
 * Vercel/Neon integration variable that happens to exist elsewhere can
 * never be picked up here by accident.
 */
const SECRET_VARIABLE = "REDS_DATABASE_URL";

const write = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const connectionString = process.env[SECRET_VARIABLE];
if (connectionString === undefined || connectionString.trim() === "") {
  write(`production-db-check: secret ${SECRET_VARIABLE} not set — skipping.`);
  process.exit(0);
}

let pool: Pool | undefined;
try {
  const config = requireDatabaseConfig({
    [SECRET_VARIABLE]: connectionString,
  });
  pool = new Pool({
    connectionString: config.connectionString,
    max: 1,
    connectionTimeoutMillis: config.connectionTimeoutMs,
  });
  // A direct probe first, outside inspectDatabaseMigrationReadiness: that
  // function swallows its own connection error (by design, for the public
  // /api/readiness endpoint — see src/persistence/readiness.ts), and this
  // script needs the real error to categorize.
  await pool.query("SELECT 1 AS production_db_check_probe");

  const readiness = await inspectDatabaseMigrationReadiness(pool);
  for (const line of formatProductionDbCheckStatus(readiness)) write(line);
  await pool.end();

  if (!readiness.reachable || !readiness.schemaCompatible) {
    write(
      "production-db-check: schema is not fully up to date — see the versions reported above.",
    );
    process.exit(1);
  }
  write("production-db-check: schema is reachable and up to date.");
} catch (error) {
  const diagnosis = diagnoseMigrationFailure(error);
  const queryParams = queryParameterNames(connectionString);
  const protocol = connectionStringProtocol(connectionString);
  for (const line of formatProductionDbCheckFailure(
    diagnosis,
    SECRET_VARIABLE,
    queryParams,
    protocol,
  ))
    write(line);
  await pool?.end();
  process.exit(1);
}
