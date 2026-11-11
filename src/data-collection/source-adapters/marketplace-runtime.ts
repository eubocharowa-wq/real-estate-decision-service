import {
  AVITO_SOURCE_ID,
  CIAN_SOURCE_ID,
  sourcePolicyEngine,
} from "../source-registry";
import {
  getDatabasePool,
  PostgresMarketplaceRequestStateStore,
  readDatabaseConfig,
} from "../../persistence";
import { createAvitoHttpAdapter } from "./adapters/avito/adapter";
import { AVITO_PROFILE } from "./adapters/avito/profile";
import { createCianHttpAdapter } from "./adapters/cian/adapter";
import { CIAN_PROFILE } from "./adapters/cian/profile";
import type {
  CanonicalState,
  CollectionExecutionResult,
  CollectionTask,
  HttpCollector,
} from "./contracts";
import { SecureHttpCollector } from "./http";
import {
  InMemoryMarketplaceRequestStateStore,
  MarketplaceRequestGuard,
  type MarketplaceRequestStateStore,
  UnavailableMarketplaceRequestStateStore,
} from "./marketplace-request-guard";
import { createSourceCollectionPipeline } from "./orchestrator";

type MarketplaceSourceId = typeof CIAN_SOURCE_ID | typeof AVITO_SOURCE_ID;
export type MarketplaceRuntimeEnvironment = Readonly<
  Record<string, string | undefined>
>;

const SOURCE_CONFIG = {
  [CIAN_SOURCE_ID]: {
    method: "REDS_CIAN_LIVE_METHOD",
    access: "REDS_CIAN_CARD_HTTP_ACCESS_APPROVED",
    use: "REDS_CIAN_NORMALIZED_DATA_USE_APPROVED",
    conditions: [
      "CIAN_CARD_HTTP_ACCESS_APPROVED",
      "CIAN_NORMALIZED_DATA_USE_APPROVED",
    ],
  },
  [AVITO_SOURCE_ID]: {
    method: "REDS_AVITO_LIVE_METHOD",
    access: "REDS_AVITO_CARD_HTTP_ACCESS_APPROVED",
    use: "REDS_AVITO_NORMALIZED_DATA_USE_APPROVED",
    conditions: [
      "AVITO_CARD_HTTP_ACCESS_APPROVED",
      "AVITO_NORMALIZED_DATA_USE_APPROVED",
    ],
  },
} as const;

const enabledConditions = (
  sourceId: MarketplaceSourceId,
  env: MarketplaceRuntimeEnvironment,
): readonly string[] => {
  const config = SOURCE_CONFIG[sourceId];
  const method = env[config.method] ?? "disabled";
  if (method !== "disabled" && method !== "http")
    throw new Error("MARKETPLACE_LIVE_CONFIG_INVALID");
  if (method !== "http") return [];
  return env[config.access] === "true" && env[config.use] === "true"
    ? config.conditions
    : [];
};

export interface MarketplaceCollectionInput {
  readonly task: CollectionTask;
  readonly observedAt: string;
  readonly canonicalState?: CanonicalState;
}

type TrustedMarketplaceRuntimeEnvironment =
  "development" | "test" | "pilot" | "production";

const trustedRuntimeEnvironment = (
  env: MarketplaceRuntimeEnvironment,
): TrustedMarketplaceRuntimeEnvironment => {
  if (env.NODE_ENV === "test") return "test";
  if (env.NODE_ENV === "development") return "development";
  if (env.NODE_ENV === "production")
    return env.REDS_APPLICATION_MODE === "pilot" ? "pilot" : "production";
  // Unknown/missing server mode is never treated as the permissive test mode.
  return "production";
};

const requestStateStore = ({
  env,
  environment,
}: {
  readonly env: MarketplaceRuntimeEnvironment;
  readonly environment: TrustedMarketplaceRuntimeEnvironment;
}): MarketplaceRequestStateStore => {
  const backend = env.REDS_MARKETPLACE_REQUEST_STATE_BACKEND ?? "disabled";
  if (backend === "memory") {
    if (environment !== "development" && environment !== "test")
      return new UnavailableMarketplaceRequestStateStore();
    return new InMemoryMarketplaceRequestStateStore();
  }
  if (backend === "postgres") {
    const database = readDatabaseConfig(env);
    if (!database.success) return new UnavailableMarketplaceRequestStateStore();
    return new PostgresMarketplaceRequestStateStore(
      getDatabasePool(database.config),
    );
  }
  if (backend !== "disabled")
    throw new Error("MARKETPLACE_REQUEST_GUARD_CONFIG_INVALID");
  return new UnavailableMarketplaceRequestStateStore();
};

/**
 * Runtime composition for single-card marketplace collection. Approval flags
 * are trusted deployment configuration, not user input; absent flags deny the
 * request before the collector can run.
 */
export const createMarketplaceCardRuntime = ({
  collector,
}: {
  readonly collector?: HttpCollector;
} = {}) => {
  const env = process.env;
  const environment = trustedRuntimeEnvironment(env);
  if (collector && environment !== "development" && environment !== "test")
    throw new Error("MARKETPLACE_TEST_COLLECTOR_FORBIDDEN");
  const runtimeCollector = collector ?? new SecureHttpCollector();
  const requestGuard = new MarketplaceRequestGuard(
    requestStateStore({ env, environment }),
  );
  const pipeline = createSourceCollectionPipeline({
    policyEngine: sourcePolicyEngine,
    adapters: [
      createCianHttpAdapter(runtimeCollector, requestGuard),
      createAvitoHttpAdapter(runtimeCollector, requestGuard),
    ],
    profiles: [CIAN_PROFILE, AVITO_PROFILE],
  });
  return {
    execute(
      input: MarketplaceCollectionInput,
    ): Promise<CollectionExecutionResult> {
      const sourceId = input.task.source_id;
      const conditions =
        sourceId === CIAN_SOURCE_ID || sourceId === AVITO_SOURCE_ID
          ? enabledConditions(sourceId, env)
          : [];
      return pipeline.execute({
        ...input,
        // The environment is server-owned. A forged runtime property cannot
        // downgrade a production process to the test policy.
        environment,
        satisfiedConditions: conditions,
      });
    },
  };
};
