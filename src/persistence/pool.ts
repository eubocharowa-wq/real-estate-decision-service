import { Pool } from "pg";

import { requireDatabaseConfig, type DatabaseConfig } from "./config";

/**
 * Connection pool.
 *
 * Pinned to `globalThis` for the same reason the buyer journey runtime is: a
 * module-scoped variable is re-created on every hot reload in development,
 * which leaks a pool per reload until the connection limit is reached. The
 * symbol keeps one pool per process.
 *
 * One process, one pool — not one pool for the deployment. Multiple instances
 * still open their own, which is what an external pooler (PgBouncer, or the
 * provider's own) is for.
 */
const POOL_KEY = Symbol.for("reds.database-pool");

type PoolGlobal = typeof globalThis & {
  [POOL_KEY]?: Pool;
};

const poolGlobal = globalThis as PoolGlobal;

const createPool = (config: DatabaseConfig): Pool =>
  new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: config.idleTimeoutMs,
  });

/**
 * Returns the process-wide pool, creating it on first use.
 *
 * Throws when DATABASE_URL is missing or malformed — callers that can run
 * without a database should check `readDatabaseConfig` first rather than
 * catching this.
 */
export const getDatabasePool = (config?: DatabaseConfig): Pool =>
  (poolGlobal[POOL_KEY] ??= createPool(config ?? requireDatabaseConfig()));

/** Closes and forgets the pool. For tests and graceful shutdown. */
export const closeDatabasePool = async (): Promise<void> => {
  const pool = poolGlobal[POOL_KEY];
  if (!pool) return;
  delete poolGlobal[POOL_KEY];
  await pool.end();
};
