import type { SourceOperation } from "../data-collection/source-registry";

export const PILOT_HARDENING_POLICY_VERSION = "pilot-hardening-policy-v1";
export const PILOT_APP_VERSION = "0.1.0-task-019";

export const PILOT_APPLICATION_MODES = ["demo", "pilot", "production"] as const;
export type PilotApplicationMode = (typeof PILOT_APPLICATION_MODES)[number];

export const PILOT_DATA_ORIGINS = [
  "synthetic",
  "manual_curated",
  "approved_live_source",
  "user_supplied",
  "expert_supplied",
] as const;
export type PilotDataOrigin = (typeof PILOT_DATA_ORIGINS)[number];

export const PILOT_FEATURE_NAMES = [
  "user_url_ingestion",
  "live_source_poc",
  "refresh",
  "expert_requests",
  "expert_workbench",
  "manual_import",
  "openclaw_collection",
] as const;
export type PilotFeatureName = (typeof PILOT_FEATURE_NAMES)[number];

export const PILOT_KILL_SWITCH_NAMES = [
  "live_source_adapter",
  "openclaw_execution",
  "user_url_automatic_ingestion",
  "refresh_execution",
] as const;
export type PilotKillSwitchName = (typeof PILOT_KILL_SWITCH_NAMES)[number];

export type PilotCapability =
  | "buyer_journey"
  | "fixture_dataset"
  | "manual_dataset"
  | "live_collection"
  | "user_url"
  | "refresh"
  | "expert_workflow"
  | "openclaw_boundary";

export const PILOT_COHORTS = [
  "internal_test",
  "friendly_pilot",
  "real_buyer_pilot",
] as const;
export type PilotCohort = (typeof PILOT_COHORTS)[number];

export interface PilotModePolicy {
  readonly mode: PilotApplicationMode;
  readonly allowedOrigins: readonly PilotDataOrigin[];
  readonly allowedSourceOperations: readonly SourceOperation[];
  readonly enabledCapabilities: readonly PilotCapability[];
  readonly fixtureBacked: readonly string[];
  readonly manualFlows: readonly string[];
  readonly forbiddenLiveIntegrations: readonly string[];
}

export const PILOT_MODE_POLICIES: Readonly<
  Record<PilotApplicationMode, PilotModePolicy>
> = Object.freeze({
  demo: {
    mode: "demo",
    allowedOrigins: [
      "synthetic",
      "manual_curated",
      "user_supplied",
      "expert_supplied",
    ],
    allowedSourceOperations: [
      "identify",
      "display",
      "manual_import",
      "user_url_ingest",
      "expert_verification",
    ],
    enabledCapabilities: [
      "buyer_journey",
      "fixture_dataset",
      "manual_dataset",
      "user_url",
      "expert_workflow",
      "openclaw_boundary",
    ],
    fixtureBacked: ["matching dataset", "user URL adapter", "refresh executor"],
    manualFlows: ["manual import", "expert verification"],
    forbiddenLiveIntegrations: [
      "live source collection",
      "OpenClaw execution",
      "automatic refresh",
    ],
  },
  pilot: {
    mode: "pilot",
    allowedOrigins: [
      "manual_curated",
      "approved_live_source",
      "user_supplied",
      "expert_supplied",
    ],
    allowedSourceOperations: [
      "identify",
      "display",
      "store",
      "manual_import",
      "user_url_ingest",
      "expert_verification",
      "scheduled_collect",
      "targeted_refresh",
    ],
    enabledCapabilities: [
      "buyer_journey",
      "manual_dataset",
      "live_collection",
      "user_url",
      "refresh",
      "expert_workflow",
      "openclaw_boundary",
    ],
    fixtureBacked: ["CI collection", "CI refresh", "CI OpenClaw boundary"],
    manualFlows: ["manual source import", "expert verification"],
    forbiddenLiveIntegrations: [
      "unapproved source collection",
      "unscoped crawling",
      "browser/OpenClaw without policy approval",
    ],
  },
  production: {
    mode: "production",
    allowedOrigins: [
      "approved_live_source",
      "user_supplied",
      "expert_supplied",
    ],
    allowedSourceOperations: [
      "identify",
      "display",
      "store",
      "user_url_ingest",
      "expert_verification",
      "targeted_refresh",
    ],
    enabledCapabilities: [
      "buyer_journey",
      "live_collection",
      "user_url",
      "refresh",
      "expert_workflow",
      "openclaw_boundary",
    ],
    fixtureBacked: [],
    manualFlows: ["expert verification"],
    forbiddenLiveIntegrations: [
      "demo fixtures",
      "manual sources without production approval",
      "any unapproved automatic collection",
    ],
  },
});

export interface PilotRuntimeConfig {
  readonly policyVersion: typeof PILOT_HARDENING_POLICY_VERSION;
  readonly appVersion: string;
  readonly mode: PilotApplicationMode;
  readonly cohort: PilotCohort;
  readonly modePolicy: PilotModePolicy;
  readonly features: Readonly<Record<PilotFeatureName, boolean>>;
  /** true means execution is stopped; audit/evidence remain intact. */
  readonly killSwitches: Readonly<Record<PilotKillSwitchName, boolean>>;
}

const DEFAULT_FEATURES: Readonly<Record<PilotFeatureName, boolean>> = {
  user_url_ingestion: true,
  live_source_poc: false,
  refresh: false,
  expert_requests: true,
  expert_workbench: true,
  manual_import: true,
  openclaw_collection: false,
};

const DEFAULT_KILL_SWITCHES: Readonly<Record<PilotKillSwitchName, boolean>> = {
  live_source_adapter: true,
  openclaw_execution: true,
  user_url_automatic_ingestion: true,
  refresh_execution: true,
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value.trim().toLowerCase() === "true";

const parseMode = (value: string | undefined): PilotApplicationMode => {
  if (!value) return "demo";
  if (PILOT_APPLICATION_MODES.includes(value as PilotApplicationMode))
    return value as PilotApplicationMode;
  throw new Error(`INVALID_PILOT_APPLICATION_MODE:${value}`);
};

export const createPilotRuntimeConfig = (
  input: {
    readonly mode?: PilotApplicationMode;
    readonly cohort?: PilotCohort;
    readonly appVersion?: string;
    readonly features?: Partial<Record<PilotFeatureName, boolean>>;
    readonly killSwitches?: Partial<Record<PilotKillSwitchName, boolean>>;
  } = {},
): PilotRuntimeConfig => {
  const mode = input.mode ?? "demo";
  return Object.freeze({
    policyVersion: PILOT_HARDENING_POLICY_VERSION,
    appVersion: input.appVersion ?? PILOT_APP_VERSION,
    mode,
    cohort: input.cohort ?? "internal_test",
    modePolicy: PILOT_MODE_POLICIES[mode],
    features: Object.freeze({ ...DEFAULT_FEATURES, ...input.features }),
    killSwitches: Object.freeze({
      ...DEFAULT_KILL_SWITCHES,
      ...input.killSwitches,
    }),
  });
};

/** The only module allowed to translate process environment into pilot mode. */
export const resolvePilotRuntimeConfig = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PilotRuntimeConfig =>
  createPilotRuntimeConfig({
    mode: parseMode(environment.REDS_APPLICATION_MODE),
    cohort: environment.REDS_PILOT_COHORT
      ? PILOT_COHORTS.includes(environment.REDS_PILOT_COHORT as PilotCohort)
        ? (environment.REDS_PILOT_COHORT as PilotCohort)
        : (() => {
            throw new Error(
              `INVALID_PILOT_COHORT:${environment.REDS_PILOT_COHORT}`,
            );
          })()
      : "internal_test",
    appVersion: environment.REDS_APP_VERSION ?? PILOT_APP_VERSION,
    features: Object.fromEntries(
      PILOT_FEATURE_NAMES.map((name) => [
        name,
        parseBoolean(
          environment[`REDS_FEATURE_${name.toUpperCase()}`],
          DEFAULT_FEATURES[name],
        ),
      ]),
    ) as Record<PilotFeatureName, boolean>,
    killSwitches: Object.fromEntries(
      PILOT_KILL_SWITCH_NAMES.map((name) => [
        name,
        parseBoolean(
          environment[`REDS_KILL_${name.toUpperCase()}`],
          DEFAULT_KILL_SWITCHES[name],
        ),
      ]),
    ) as Record<PilotKillSwitchName, boolean>,
  });

export const isFeatureOperational = (
  config: PilotRuntimeConfig,
  feature: PilotFeatureName,
  killSwitch?: PilotKillSwitchName,
): boolean =>
  config.features[feature] && (!killSwitch || !config.killSwitches[killSwitch]);
