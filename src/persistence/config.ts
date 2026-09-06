import { z } from "zod";

/**
 * Database configuration.
 *
 * DATABASE_URL is validated rather than trusted: a malformed or non-postgres
 * URL fails loudly here instead of surfacing as a connection error deep inside
 * a request.
 */
const databaseUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "postgres:" || url.protocol === "postgresql:";
      } catch {
        return false;
      }
    },
    { message: "DATABASE_URL must be a postgres:// or postgresql:// URL" },
  );

const poolSizeSchema = z.coerce.number().int().min(1).max(100);

export interface DatabaseConfig {
  readonly connectionString: string;
  readonly maxConnections: number;
  readonly connectionTimeoutMs: number;
  readonly idleTimeoutMs: number;
}

const configSchema = z.object({
  connectionString: databaseUrlSchema,
  maxConnections: poolSizeSchema,
  connectionTimeoutMs: z.coerce.number().int().min(100).max(60_000),
  idleTimeoutMs: z.coerce.number().int().min(0).max(600_000),
});

/**
 * Only the variables below are read, so a plain record is enough. Typing this
 * as NodeJS.ProcessEnv would drag in Next's required NODE_ENV and force test
 * fixtures to carry unrelated values.
 */
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type DatabaseConfigResult =
  | { readonly success: true; readonly config: DatabaseConfig }
  | { readonly success: false; readonly errors: readonly string[] };

/**
 * Reads the database configuration from the environment.
 *
 * Returns a result rather than throwing so a caller can decide whether a
 * missing database is fatal: the pilot still runs on the in-memory
 * repositories, and only the PostgreSQL implementations require this.
 */
export const readDatabaseConfig = (
  env: EnvironmentSource = process.env,
): DatabaseConfigResult => {
  const parsed = configSchema.safeParse({
    connectionString: env.DATABASE_URL ?? "",
    // Serverless runtimes open many short-lived pools, so the per-instance
    // ceiling stays low and an external pooler does the real multiplexing.
    maxConnections: env.DATABASE_POOL_MAX ?? 10,
    connectionTimeoutMs: env.DATABASE_CONNECTION_TIMEOUT_MS ?? 10_000,
    idleTimeoutMs: env.DATABASE_IDLE_TIMEOUT_MS ?? 30_000,
  });
  if (parsed.success) return { success: true, config: parsed.data };
  return {
    success: false,
    errors: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "config"}: ${issue.message}`,
    ),
  };
};

/** Reads the configuration, throwing when it is absent or malformed. */
export const requireDatabaseConfig = (
  env: EnvironmentSource = process.env,
): DatabaseConfig => {
  const result = readDatabaseConfig(env);
  if (!result.success)
    throw new Error(`INVALID_DATABASE_CONFIG: ${result.errors.join("; ")}`);
  return result.config;
};
