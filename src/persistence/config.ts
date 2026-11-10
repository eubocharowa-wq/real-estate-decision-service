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
 * An empty or whitespace-only pool/timeout variable counts as unset and
 * falls back to its default, the same way resolveDatabaseUrlSource treats
 * an empty connection string as unset — a platform (Vercel among them) can
 * set a variable to an empty string rather than omitting it, and that must
 * not read as an explicit, invalid "0". A present, non-empty, invalid value
 * (e.g. "abc" or "0") still fails validation.
 */
const orDefault = (
  value: string | undefined,
  fallback: number,
): string | number =>
  value === undefined || value.trim() === "" ? fallback : value;

/**
 * Only the variables below are read, so a plain record is enough. Typing this
 * as NodeJS.ProcessEnv would drag in Next's required NODE_ENV and force test
 * fixtures to carry unrelated values.
 */
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type DatabaseUrlVariable = "REDS_DATABASE_URL" | "DATABASE_URL";

export interface DatabaseUrlSource {
  /** The raw string from whichever variable won, exactly as set. */
  readonly value: string | undefined;
  /** Which variable it came from, or null when neither is set. */
  readonly variable: DatabaseUrlVariable | null;
}

const isSetVariable = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== "";

/**
 * Picks which environment variable supplies the database connection string.
 * REDS_DATABASE_URL wins when set; DATABASE_URL is used otherwise; neither
 * set means no database is configured. An empty or whitespace-only value
 * counts the same as unset, matching the previous DATABASE_URL-only check.
 *
 * REDS_DATABASE_URL exists because DATABASE_URL is the name Vercel's own
 * first-party Postgres/Neon integration sets automatically on every
 * environment it's attached to (including preview) — this app needs its own
 * variable to opt in explicitly rather than inherit that wiring by accident.
 */
export const resolveDatabaseUrlSource = (
  env: EnvironmentSource = process.env,
): DatabaseUrlSource => {
  if (isSetVariable(env.REDS_DATABASE_URL))
    return { value: env.REDS_DATABASE_URL, variable: "REDS_DATABASE_URL" };
  if (isSetVariable(env.DATABASE_URL))
    return { value: env.DATABASE_URL, variable: "DATABASE_URL" };
  return { value: undefined, variable: null };
};

export type DatabaseConfigResult =
  | { readonly success: true; readonly config: DatabaseConfig }
  | {
      readonly success: false;
      readonly errors: readonly string[];
      /** The config field names (connectionString, maxConnections, …) that failed validation. */
      readonly invalidFields: readonly string[];
    };

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
    connectionString: resolveDatabaseUrlSource(env).value ?? "",
    // Serverless runtimes open many short-lived pools, so the per-instance
    // ceiling stays low and an external pooler does the real multiplexing.
    maxConnections: orDefault(env.DATABASE_POOL_MAX, 10),
    connectionTimeoutMs: orDefault(env.DATABASE_CONNECTION_TIMEOUT_MS, 10_000),
    idleTimeoutMs: orDefault(env.DATABASE_IDLE_TIMEOUT_MS, 30_000),
  });
  if (parsed.success) return { success: true, config: parsed.data };
  return {
    success: false,
    errors: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "config"}: ${issue.message}`,
    ),
    invalidFields: [
      ...new Set(
        parsed.error.issues.map((issue) => issue.path.join(".") || "config"),
      ),
    ],
  };
};

/**
 * Builds the error requireDatabaseConfig/createRepositorySet throw for an
 * invalid config, with the failing field names attached as `invalidFields`
 * — read by scripts/vercel-prebuild.ts's diagnosis (INVALID_CONFIG) without
 * parsing the message text.
 */
export const invalidDatabaseConfigError = (
  result: Extract<DatabaseConfigResult, { success: false }>,
): Error =>
  Object.assign(
    new Error(`INVALID_DATABASE_CONFIG: ${result.errors.join("; ")}`),
    { invalidFields: result.invalidFields },
  );

/** Reads the configuration, throwing when it is absent or malformed. */
export const requireDatabaseConfig = (
  env: EnvironmentSource = process.env,
): DatabaseConfig => {
  const result = readDatabaseConfig(env);
  if (!result.success) throw invalidDatabaseConfigError(result);
  return result.config;
};
