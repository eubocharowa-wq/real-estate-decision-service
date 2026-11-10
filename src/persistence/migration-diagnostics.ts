/**
 * Turns a migration failure into a safe, categorized diagnosis for build
 * and CI logs — scripts/vercel-prebuild.ts (which applies migrations) and
 * scripts/production-db-check.ts (a read-only status check) both share it,
 * so both report the same vocabulary. The raw error — its message, stack,
 * and any property not explicitly read below — is never surfaced: a pg
 * connection or auth error routinely carries the host, user, password, or
 * database name in exactly those places, and both scripts' logs are not a
 * secret (a GitHub Actions log in particular is visible to anyone with
 * read access to the repository).
 */

export type MigrationFailureCategory =
  | "INVALID_CONFIG"
  | "DNS"
  | "CONNECTION"
  | "TLS"
  | "AUTH"
  | "DATABASE_MISSING"
  | "MIGRATION_SQL"
  | "UNKNOWN";

export interface MigrationFailureDiagnosis {
  readonly category: MigrationFailureCategory;
  /** err.code (a Node system error code or a PostgreSQL SQLSTATE), if any. */
  readonly errorCode: string | null;
  /** Set only for MIGRATION_SQL — see migrateUp in ./migrator. */
  readonly migrationVersion: string | null;
  readonly migrationName: string | null;
  /** Set only for INVALID_CONFIG — see invalidDatabaseConfigError in ./config. */
  readonly invalidFields: readonly string[];
}

const DNS_CODES = new Set(["ENOTFOUND", "EAI_AGAIN"]);
const CONNECTION_CODES = new Set(["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET"]);
const TLS_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "EPROTO",
]);
const AUTH_CODES = new Set(["28P01", "28000"]);
const DATABASE_MISSING_CODE = "3D000";

const readStringProp = (error: unknown, key: string): string | null => {
  if (typeof error !== "object" || error === null) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
};

const readStringArrayProp = (
  error: unknown,
  key: string,
): readonly string[] => {
  if (typeof error !== "object" || error === null) return [];
  const value = (error as Record<string, unknown>)[key];
  return Array.isArray(value) &&
    value.every((item): item is string => typeof item === "string")
    ? value
    : [];
};

/**
 * Only used internally to recognize a TLS failure that pg or Node's tls
 * module reports without one of the known TLS error codes (e.g. a plain
 * "server does not support SSL" message) — never printed.
 */
const looksLikeTlsFailure = (message: string): boolean =>
  /\b(ssl|tls|certificate)\b/i.test(message);

export const diagnoseMigrationFailure = (
  error: unknown,
): MigrationFailureDiagnosis => {
  const message = error instanceof Error ? error.message : String(error);
  const code = readStringProp(error, "code");
  const migrationVersion = readStringProp(error, "migrationVersion");
  const migrationName = readStringProp(error, "migrationName");
  const none = {
    migrationVersion: null,
    migrationName: null,
    invalidFields: [],
  };

  if (message.startsWith("INVALID_DATABASE_CONFIG"))
    return {
      category: "INVALID_CONFIG",
      errorCode: code,
      migrationVersion: null,
      migrationName: null,
      invalidFields: readStringArrayProp(error, "invalidFields"),
    };
  if (code !== null && DNS_CODES.has(code))
    return { category: "DNS", errorCode: code, ...none };
  if (code !== null && CONNECTION_CODES.has(code))
    return { category: "CONNECTION", errorCode: code, ...none };
  if ((code !== null && TLS_CODES.has(code)) || looksLikeTlsFailure(message))
    return { category: "TLS", errorCode: code, ...none };
  if (code !== null && AUTH_CODES.has(code))
    return { category: "AUTH", errorCode: code, ...none };
  if (code === DATABASE_MISSING_CODE)
    return { category: "DATABASE_MISSING", errorCode: code, ...none };
  if (migrationVersion !== null)
    return {
      category: "MIGRATION_SQL",
      errorCode: code,
      migrationVersion,
      migrationName,
      invalidFields: [],
    };
  return { category: "UNKNOWN", errorCode: code, ...none };
};

/** The query string's parameter NAMES only — never their values. */
export const queryParameterNames = (
  connectionString: string,
): readonly string[] => {
  try {
    return [...new Set(new URL(connectionString).searchParams.keys())];
  } catch {
    return [];
  }
};

/** The connection string's protocol only (e.g. "postgresql:") — never its host or anything else. */
export const connectionStringProtocol = (
  connectionString: string,
): string | null => {
  try {
    return new URL(connectionString).protocol;
  } catch {
    return null;
  }
};

/** Which environment variable a config field (other than connectionString) is read from. */
const FIELD_ENV_VARS: Readonly<Record<string, string>> = {
  maxConnections: "DATABASE_POOL_MAX",
  connectionTimeoutMs: "DATABASE_CONNECTION_TIMEOUT_MS",
  idleTimeoutMs: "DATABASE_IDLE_TIMEOUT_MS",
};

/**
 * One "invalid field: ..." line per INVALID_CONFIG field — shared by every
 * caller that reports this diagnosis, so the field→environment-variable
 * mapping and the connectionString protocol-only rule live in exactly one
 * place.
 */
const invalidFieldLines = (
  diagnosis: MigrationFailureDiagnosis,
  sourceVariable: "REDS_DATABASE_URL" | "DATABASE_URL" | null,
  connectionStringProtocolValue: string | null,
  prefix: string,
): readonly string[] =>
  diagnosis.category === "INVALID_CONFIG"
    ? diagnosis.invalidFields.map((field) => {
        const envVar =
          field === "connectionString"
            ? (sourceVariable ?? "none")
            : (FIELD_ENV_VARS[field] ?? "unknown");
        const protocolSuffix =
          field === "connectionString" && connectionStringProtocolValue
            ? `, protocol: ${connectionStringProtocolValue}`
            : "";
        return `${prefix}: invalid field: ${field} (env: ${envVar}${protocolSuffix})`;
      })
    : [];

/**
 * The exact lines scripts/vercel-prebuild.ts prints on a migration failure.
 * A pure function so the no-leak guarantee is testable directly, without
 * running the script or a real database connection.
 */
export const formatMigrationFailureReport = (
  diagnosis: MigrationFailureDiagnosis,
  sourceVariable: "REDS_DATABASE_URL" | "DATABASE_URL" | null,
  queryParamNames: readonly string[],
  connectionStringProtocolValue: string | null = null,
): readonly string[] => [
  `vercel-prebuild: migration failed (category=${diagnosis.category})`,
  ...invalidFieldLines(
    diagnosis,
    sourceVariable,
    connectionStringProtocolValue,
    "vercel-prebuild",
  ),
  ...(diagnosis.category === "MIGRATION_SQL"
    ? [
        `vercel-prebuild: failing migration: ${diagnosis.migrationVersion}_${diagnosis.migrationName}`,
        `vercel-prebuild: SQLSTATE: ${diagnosis.errorCode ?? "unknown"}`,
      ]
    : []),
  ...(diagnosis.category === "UNKNOWN" && diagnosis.errorCode
    ? [`vercel-prebuild: error code: ${diagnosis.errorCode}`]
    : []),
  `vercel-prebuild: connection string source: ${sourceVariable ?? "none"}`,
  `vercel-prebuild: connection string query parameters: ${
    queryParamNames.length > 0 ? queryParamNames.join(", ") : "none"
  }`,
  "vercel-prebuild: aborting the build so the old schema is never published with new code.",
];

/**
 * The exact lines scripts/production-db-check.ts prints when it cannot even
 * connect. Unlike formatMigrationFailureReport, this never applies a
 * migration and never claims to be aborting a build — it's a read-only
 * status check (see production-db-check.yml's own comment on why running
 * migrations from two places at once is avoided).
 */
export const formatProductionDbCheckFailure = (
  diagnosis: MigrationFailureDiagnosis,
  sourceVariable: "REDS_DATABASE_URL" | "DATABASE_URL" | null,
  queryParamNames: readonly string[],
  connectionStringProtocolValue: string | null = null,
): readonly string[] => [
  `production-db-check: connection failed (category=${diagnosis.category})`,
  ...invalidFieldLines(
    diagnosis,
    sourceVariable,
    connectionStringProtocolValue,
    "production-db-check",
  ),
  ...(diagnosis.category === "UNKNOWN" && diagnosis.errorCode
    ? [`production-db-check: error code: ${diagnosis.errorCode}`]
    : []),
  `production-db-check: connection string source: ${sourceVariable ?? "none"}`,
  `production-db-check: connection string query parameters: ${
    queryParamNames.length > 0 ? queryParamNames.join(", ") : "none"
  }`,
];

/**
 * The status report scripts/production-db-check.ts prints once it can
 * connect — migration counts and versions only, which identify schema
 * drift without naming any data the database holds.
 */
export const formatProductionDbCheckStatus = (readiness: {
  readonly reachable: boolean;
  readonly schemaCompatible: boolean;
  readonly expectedMigrationCount: number;
  readonly appliedMigrationCount: number;
  readonly pendingVersions: readonly string[];
  readonly unexpectedVersions: readonly string[];
  readonly mismatchedVersions: readonly string[];
}): readonly string[] => {
  const versions = (label: string, values: readonly string[]): string =>
    `production-db-check: ${label}=${values.length > 0 ? values.join(", ") : "none"}`;
  return [
    `production-db-check: reachable=${readiness.reachable}`,
    `production-db-check: schema_compatible=${readiness.schemaCompatible}`,
    `production-db-check: expected_migrations=${readiness.expectedMigrationCount}`,
    `production-db-check: applied_migrations=${readiness.appliedMigrationCount}`,
    versions("pending_versions", readiness.pendingVersions),
    versions("unexpected_versions", readiness.unexpectedVersions),
    versions("mismatched_versions", readiness.mismatchedVersions),
  ];
};
