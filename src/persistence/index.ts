/**
 * Storage-facing contracts shared by every repository.
 *
 * Repository methods are asynchronous so that a durable implementation
 * (PostgreSQL) can satisfy the same contracts as the in-memory one. The
 * in-memory implementations resolve immediately; they gain nothing from being
 * async, but the boundary has to be shaped for the storage that is coming.
 */

/**
 * Explicit unit of work. Multi-step flows must run inside `transaction` so a
 * durable implementation can make them atomic without another signature
 * change.
 *
 * The in-memory implementations simply invoke the callback: their mutations
 * cannot fail halfway. A PostgreSQL implementation will open a transaction,
 * commit on resolve and roll back on throw.
 *
 * Note for the PostgreSQL phase: a flow that writes through two repositories
 * (applyExpertResultToJourney touches the journey and the expert repository)
 * is only atomic when both enlist in the same connection. Until then the
 * journey repository owns the outer boundary, and cross-repository atomicity
 * is a task of its own.
 */
export interface TransactionalRepository {
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

/** Pass-through unit of work for in-memory repositories. */
export const runInMemoryTransaction = async <T>(
  work: () => Promise<T>,
): Promise<T> => work();

export {
  readDatabaseConfig,
  requireDatabaseConfig,
  type DatabaseConfig,
  type DatabaseConfigResult,
  type EnvironmentSource,
} from "./config";
export { closeDatabasePool, getDatabasePool } from "./pool";
export {
  defaultMigrationsDirectory,
  listApplied,
  migrateDown,
  migrateUp,
  migrationStatus,
  readMigrations,
  MIGRATIONS_TABLE,
  type AppliedMigration,
  type Migration,
  type MigrationStatus,
} from "./migrator";
export {
  createInMemoryRepositorySet,
  createRepositorySet,
  type RepositorySet,
} from "./repositories";
export {
  createPostgresContext,
  createPostgresRepositories,
  mapDatabaseError,
  PostgresContext,
  StorageUnavailableError,
  type Database,
  type PostgresRepositories,
} from "./postgres";
