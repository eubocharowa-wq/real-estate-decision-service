import {
  AVITO_SOURCE_ID,
  CIAN_SOURCE_ID,
  sourcePolicyEngine,
} from "../source-registry";
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
  readonly environment: "development" | "test" | "pilot" | "production";
  readonly observedAt: string;
  readonly canonicalState?: CanonicalState;
}

/**
 * Runtime composition for single-card marketplace collection. Approval flags
 * are trusted deployment configuration, not user input; absent flags deny the
 * request before the collector can run.
 */
export const createMarketplaceCardRuntime = ({
  env = process.env,
  collector = new SecureHttpCollector(),
}: {
  readonly env?: MarketplaceRuntimeEnvironment;
  readonly collector?: HttpCollector;
} = {}) => {
  const pipeline = createSourceCollectionPipeline({
    policyEngine: sourcePolicyEngine,
    adapters: [
      createCianHttpAdapter(collector),
      createAvitoHttpAdapter(collector),
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
        satisfiedConditions: conditions,
      });
    },
  };
};
