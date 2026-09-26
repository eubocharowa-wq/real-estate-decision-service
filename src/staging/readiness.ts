import type { Pool } from "pg";

import {
  getDatabasePool,
  inspectDatabaseMigrationReadiness,
  readDatabaseConfig,
  type EnvironmentSource,
} from "../persistence";
import {
  loadCuratedPilotDataset,
  resolvePilotRuntimeConfig,
  type PilotApplicationMode,
} from "../pilot-hardening";
import { resolveSiteUrl } from "../public-site";

export const STAGING_READINESS_VERSION = "staging-readiness-v1" as const;

export interface StagingReadiness {
  readonly schema_version: typeof STAGING_READINESS_VERSION;
  readonly status: "ready" | "not_ready";
  readonly checked_at: string;
  readonly checks: {
    readonly application: {
      readonly running: true;
      readonly runtime: "nextjs_dynamic_nodejs";
      readonly mode: PilotApplicationMode | "invalid";
      readonly expected_mode: "pilot";
      readonly mode_ready: boolean;
    };
    readonly dataset: {
      readonly expected_type:
        | "synthetic_pilot"
        | "manual_curated_pilot"
        | "approved_live_source_only"
        | "unknown";
      readonly configured: boolean;
      readonly candidate_count: number;
      readonly synthetic_and_real_mixed: false;
    };
    readonly database: {
      readonly configured: boolean;
      readonly configuration_valid: boolean;
      readonly reachable: boolean;
      readonly schema_compatible: boolean;
      readonly expected_migration_count: number;
      readonly applied_migration_count: number;
      readonly pending_versions: readonly string[];
      readonly unexpected_versions: readonly string[];
      readonly mismatched_versions: readonly string[];
    };
    readonly public_origin: {
      readonly configured: boolean;
      readonly matches_request_origin: boolean;
    };
  };
}

export interface StagingReadinessDependencies {
  readonly environment?: EnvironmentSource;
  readonly requestUrl: string;
  readonly database?: Pick<Pool, "query">;
  readonly migrationsDirectory?: string;
  readonly now?: () => string;
  readonly curatedPilotDirectory?: string;
}

const requestOrigin = (requestUrl: string): string | null => {
  try {
    const url = new URL(requestUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

const datasetReadiness = (
  mode: PilotApplicationMode | "invalid",
  curatedPilotDirectory?: string,
): StagingReadiness["checks"]["dataset"] => {
  if (mode === "demo")
    return {
      expected_type: "synthetic_pilot",
      configured: true,
      candidate_count: 0,
      synthetic_and_real_mixed: false,
    };
  if (mode === "pilot") {
    try {
      const curated = loadCuratedPilotDataset(curatedPilotDirectory);
      return {
        expected_type: "manual_curated_pilot",
        configured: curated.configured && curated.candidates.length > 0,
        candidate_count: curated.candidates.length,
        synthetic_and_real_mixed: false,
      };
    } catch {
      return {
        expected_type: "manual_curated_pilot",
        configured: false,
        candidate_count: 0,
        synthetic_and_real_mixed: false,
      };
    }
  }
  if (mode === "production")
    return {
      expected_type: "approved_live_source_only",
      configured: false,
      candidate_count: 0,
      synthetic_and_real_mixed: false,
    };
  return {
    expected_type: "unknown",
    configured: false,
    candidate_count: 0,
    synthetic_and_real_mixed: false,
  };
};

/**
 * Safe production-like staging readiness report.
 *
 * The response intentionally contains no connection string, host, database
 * name, environment values or error text. Detailed diagnostics belong in the
 * operator's protected deployment/database logs, never in a public API.
 */
export const evaluateStagingReadiness = async (
  dependencies: StagingReadinessDependencies,
): Promise<StagingReadiness> => {
  const environment = dependencies.environment ?? process.env;
  const configured = Boolean(environment.DATABASE_URL?.trim());
  const databaseConfig = readDatabaseConfig(environment);

  let mode: PilotApplicationMode | "invalid" = "invalid";
  try {
    mode = resolvePilotRuntimeConfig(environment).mode;
  } catch {
    // Fail closed without reflecting the invalid environment value.
  }

  const dataset = datasetReadiness(mode, dependencies.curatedPilotDirectory);
  const siteUrl = resolveSiteUrl(environment);
  const origin = requestOrigin(dependencies.requestUrl);
  const publicOrigin = {
    configured: siteUrl !== null,
    matches_request_origin: siteUrl !== null && siteUrl === origin,
  };

  const migrationReadiness =
    configured && databaseConfig.success
      ? await inspectDatabaseMigrationReadiness(
          dependencies.database ?? getDatabasePool(databaseConfig.config),
          dependencies.migrationsDirectory,
        )
      : {
          reachable: false,
          schemaCompatible: false,
          expectedMigrationCount: 0,
          appliedMigrationCount: 0,
          pendingVersions: [],
          unexpectedVersions: [],
          mismatchedVersions: [],
        };

  const checks: StagingReadiness["checks"] = {
    application: {
      running: true,
      runtime: "nextjs_dynamic_nodejs",
      mode,
      expected_mode: "pilot",
      mode_ready: mode === "pilot",
    },
    dataset,
    database: {
      configured,
      configuration_valid: databaseConfig.success,
      reachable: migrationReadiness.reachable,
      schema_compatible: migrationReadiness.schemaCompatible,
      expected_migration_count: migrationReadiness.expectedMigrationCount,
      applied_migration_count: migrationReadiness.appliedMigrationCount,
      pending_versions: migrationReadiness.pendingVersions,
      unexpected_versions: migrationReadiness.unexpectedVersions,
      mismatched_versions: migrationReadiness.mismatchedVersions,
    },
    public_origin: publicOrigin,
  };
  const ready =
    checks.application.mode_ready &&
    checks.dataset.configured &&
    checks.database.configured &&
    checks.database.configuration_valid &&
    checks.database.reachable &&
    checks.database.schema_compatible &&
    checks.public_origin.configured &&
    checks.public_origin.matches_request_origin;

  return {
    schema_version: STAGING_READINESS_VERSION,
    status: ready ? "ready" : "not_ready",
    checked_at: dependencies.now?.() ?? new Date().toISOString(),
    checks,
  };
};
