import {
  sourcePolicyEngine,
  sourceRegistry,
  type ResolveCollectionPlanInput,
} from "../source-registry";
import type { RefreshPolicyGateway, SourceRuntimePolicy } from "./contracts";

const unknownRuntime: SourceRuntimePolicy = {
  status: "unknown",
  operational: {
    minimum_interval_seconds: null,
    maximum_concurrency: null,
    daily_budget: null,
  },
  health: {
    status: "unknown",
    recent_success_rate: null,
    recent_error_rate: null,
    last_successful_run_at: null,
    source_changed: false,
    auth_issue: false,
    rate_limited: false,
    reason_codes: ["NO_RUNTIME_DATA"],
  },
};

export class RegistryRefreshPolicyGateway implements RefreshPolicyGateway {
  resolveCollectionPlan(input: ResolveCollectionPlanInput) {
    return sourcePolicyEngine.resolveCollectionPlan(input);
  }

  getSourceRuntime(sourceId: string): SourceRuntimePolicy {
    const source = sourceRegistry.get(sourceId);
    return source
      ? {
          status: source.status,
          operational: source.operational,
          health: source.health,
        }
      : unknownRuntime;
  }
}
