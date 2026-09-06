/**
 * Driver errors become domain errors.
 *
 * A bare `pg` error carries a constraint name and a five-character SQLSTATE,
 * neither of which the domain knows. Every repository call goes through
 * `mapDatabaseError`, so what leaves this layer is the same error the
 * in-memory repositories throw for the same violation — the conformance suite
 * asserts exactly that.
 */

/** Raised when the database itself cannot be reached. */
export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("STORAGE_UNAVAILABLE");
    this.name = "StorageUnavailableError";
    this.cause = cause;
  }
}

interface PostgresErrorShape {
  readonly code?: string;
  readonly constraint?: string;
  readonly message?: string;
}

/**
 * Only errors that actually came from the driver are translated. A plain Error
 * thrown by our own code — a domain rule inside a transaction callback, or a
 * failed read guard — passes through untouched; wrapping it would hide the
 * real reason behind a storage error.
 */
const asPostgresError = (error: unknown): PostgresErrorShape | null => {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as PostgresErrorShape & { severity?: unknown };
  const hasDriverShape =
    typeof candidate.code === "string" ||
    typeof candidate.severity === "string" ||
    typeof candidate.constraint === "string";
  return hasDriverShape ? candidate : null;
};

/**
 * SQLSTATE classes that mean "the storage layer is not available", as opposed
 * to "the write was rejected". Connection failures, admin shutdown, operator
 * intervention and the client-side codes node-postgres raises when it cannot
 * open a socket.
 */
const UNAVAILABLE_SQLSTATE = new Set([
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08007", // transaction_resolution_unknown
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "53300", // too_many_connections
  "53400", // configuration_limit_exceeded
]);

const UNAVAILABLE_SYSTEM_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
]);

/**
 * Constraint and trigger violations mapped to the codes the domain already
 * uses. The left side is what the schema is named; the right side is what the
 * in-memory repositories throw.
 */
const CONSTRAINT_ERRORS: ReadonlyMap<string, string> = new Map([
  ["expert_requests_active_dedup_key", "EXPERT_REQUEST_ALREADY_EXISTS"],
  ["expert_requests_pkey", "EXPERT_REQUEST_ALREADY_EXISTS"],
  ["expert_context_packages_pkey", "EXPERT_CONTEXT_ALREADY_EXISTS"],
  ["expert_results_pkey", "COMPLETED_RESULT_IS_IMMUTABLE"],
  ["expert_results_expert_result_id_key", "COMPLETED_RESULT_IS_IMMUTABLE"],
  ["field_evidence_pkey", "EVIDENCE_ID_CONFLICT"],
  ["canonical_decision_overlays_pkey", "CANONICAL_OVERLAY_ID_CONFLICT"],
  [
    "canonical_decision_overlays_evidence_id_fkey",
    "CANONICAL_OVERLAY_REQUIRES_EVIDENCE",
  ],
  [
    "journey_imported_candidates_ingestion_id_fkey",
    "IMPORTED_CANDIDATE_NOT_FOUND",
  ],
  ["refresh_tasks_active_dedup_key", "REFRESH_TASK_ALREADY_ACTIVE"],
]);

/** Messages raised by the append-only triggers, keyed by table. */
const APPEND_ONLY_ERRORS: ReadonlyMap<string, string> = new Map([
  ["field_evidence", "EVIDENCE_ID_CONFLICT"],
  ["expert_results", "COMPLETED_RESULT_IS_IMMUTABLE"],
  ["journey_audit_events", "AUDIT_EVENT_IS_IMMUTABLE"],
  ["expert_audit_events", "AUDIT_EVENT_IS_IMMUTABLE"],
]);

const appendOnlyCode = (message: string): string | null => {
  const match =
    /APPEND_ONLY_TABLE_(?:UPDATE|DELETE): \w+ is not allowed on (\w+)/.exec(
      message,
    );
  if (!match) return null;
  return APPEND_ONLY_ERRORS.get(match[1]!) ?? "APPEND_ONLY_VIOLATION";
};

/**
 * Translates a driver error, or rethrows anything that is already a domain
 * error. Errors thrown by our own code inside a transaction callback pass
 * through untouched.
 */
export const mapDatabaseError = (error: unknown): Error => {
  if (error instanceof StorageUnavailableError) return error;

  const pgError = asPostgresError(error);
  if (!pgError)
    return error instanceof Error ? error : new Error(String(error));

  const code = pgError.code;
  if (
    (code && UNAVAILABLE_SQLSTATE.has(code)) ||
    (code && UNAVAILABLE_SYSTEM_CODES.has(code))
  )
    return new StorageUnavailableError(error);

  const message = pgError.message ?? "";
  const appendOnly = appendOnlyCode(message);
  if (appendOnly) return new Error(appendOnly);

  if (pgError.constraint) {
    const mapped = CONSTRAINT_ERRORS.get(pgError.constraint);
    if (mapped) return new Error(mapped);
    // Unmapped but recognised: still a constraint rejection, and the
    // constraint name says which rule. Never the raw driver text.
    if (code === "23505")
      return new Error(`UNIQUE_VIOLATION:${pgError.constraint}`);
    if (code === "23503")
      return new Error(`FOREIGN_KEY_VIOLATION:${pgError.constraint}`);
    if (code === "23514")
      return new Error(`CHECK_VIOLATION:${pgError.constraint}`);
    if (code === "23502")
      return new Error(`NOT_NULL_VIOLATION:${pgError.constraint}`);
  }
  if (code === "23502") return new Error("NOT_NULL_VIOLATION");
  if (code?.startsWith("23")) return new Error(`CONSTRAINT_VIOLATION:${code}`);

  // A driver error with no recognisable code: the connection is the most
  // likely cause, and leaking driver internals into the domain is not an
  // option.
  return new StorageUnavailableError(error);
};

/** Runs a database call, translating whatever it throws. */
export const withMappedErrors = async <T>(
  work: () => Promise<T>,
): Promise<T> => {
  try {
    return await work();
  } catch (error) {
    throw mapDatabaseError(error);
  }
};
