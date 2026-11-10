import { Pool } from "pg";

import {
  connectionStringProtocol,
  diagnoseMigrationFailure,
  formatMigrationFailureReport,
  migrateUp,
  queryParameterNames,
  requireDatabaseConfig,
  resolveDatabaseUrlSource,
  shouldRunMigrationsBeforeBuild,
} from "../src/persistence";

/**
 * Runs before `next build` on every build (see package.json's "build"
 * script). Only applies pending migrations when this is a production
 * Vercel build with a database configured — never on preview or a local
 * build (shouldRunMigrationsBeforeBuild in src/persistence/vercel-build.ts).
 *
 * A failed migration fails this script, which fails the `&&`-chained
 * `next build` after it: the old schema is never published alongside new
 * code. On failure, only a safe, categorized diagnosis is printed — never
 * the connection string, host, user, password, database name, or the raw
 * error text, all of which routinely appear in a pg connection error and
 * would otherwise land in Vercel's public build log — see
 * src/persistence/migration-diagnostics.ts.
 */
const write = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

if (!shouldRunMigrationsBeforeBuild()) {
  write(
    process.env.VERCEL_ENV === "production"
      ? "vercel-prebuild: production build, but no database is configured — skipping migrations."
      : "vercel-prebuild: not a production Vercel build — skipping migrations.",
  );
  process.exit(0);
}

write(
  "vercel-prebuild: production build with a database configured — applying pending migrations.",
);

const source = resolveDatabaseUrlSource();
let pool: Pool | undefined;
try {
  const config = requireDatabaseConfig();
  // A dedicated, single-connection pool, the same way scripts/migrate.ts
  // uses one: this runs once and exits, rather than sharing the
  // process-wide pool getDatabasePool pins to globalThis.
  pool = new Pool({
    connectionString: config.connectionString,
    max: 1,
    connectionTimeoutMillis: config.connectionTimeoutMs,
  });
  await migrateUp(pool);
  write("vercel-prebuild: migrations applied — continuing to next build.");
  await pool.end();
} catch (error) {
  const diagnosis = diagnoseMigrationFailure(error);
  const queryParams = source.value ? queryParameterNames(source.value) : [];
  const protocol = source.value ? connectionStringProtocol(source.value) : null;
  const lines = formatMigrationFailureReport(
    diagnosis,
    source.variable,
    queryParams,
    protocol,
  );
  process.stderr.write(lines.map((line) => `${line}\n`).join(""));
  await pool?.end();
  process.exit(1);
}
