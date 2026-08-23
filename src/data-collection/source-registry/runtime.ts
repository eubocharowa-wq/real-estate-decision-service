import { PILOT_SOURCE_REGISTRY_CONFIG } from "./config/pilot";
import { SourcePolicyEngine } from "./policy-engine";
import { SourceRegistry } from "./registry";
import type { SourceEnvironment } from "./schema";

export const sourceRegistry = new SourceRegistry(PILOT_SOURCE_REGISTRY_CONFIG);
export const sourcePolicyEngine = new SourcePolicyEngine(sourceRegistry);

const environments = new Set<SourceEnvironment>([
  "development",
  "test",
  "pilot",
  "production",
]);

export const resolveRuntimeSourceEnvironment = ({
  configuredEnvironment,
  nodeEnvironment,
}: {
  readonly configuredEnvironment?: string | null;
  readonly nodeEnvironment?: string | null;
} = {}): SourceEnvironment => {
  if (configuredEnvironment) {
    if (environments.has(configuredEnvironment as SourceEnvironment))
      return configuredEnvironment as SourceEnvironment;
    throw new Error(`Invalid SOURCE_POLICY_ENV: ${configuredEnvironment}`);
  }
  if (nodeEnvironment === "test") return "test";
  if (nodeEnvironment === "production") return "production";
  return "development";
};
