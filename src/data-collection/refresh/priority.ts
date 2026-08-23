import type { RefreshPriority, RefreshPriorityInput } from "./contracts";
import { REFRESH_PRIORITY_CONFIG } from "./config/priorities";

export interface CalculatedRefreshPriority {
  readonly priority: RefreshPriority;
  readonly score: number;
  readonly policyVersion: typeof REFRESH_PRIORITY_CONFIG.version;
}

export const calculateRefreshPriority = (
  input: RefreshPriorityInput,
): CalculatedRefreshPriority => {
  const score =
    REFRESH_PRIORITY_CONFIG.userRequestPriority[input.userRequestPriority] +
    REFRESH_PRIORITY_CONFIG.fieldCriticality[input.fieldCriticality] +
    REFRESH_PRIORITY_CONFIG.freshness[input.freshness] +
    REFRESH_PRIORITY_CONFIG.conflict[input.conflict] +
    REFRESH_PRIORITY_CONFIG.journeyStage[input.journeyStage] +
    REFRESH_PRIORITY_CONFIG.sourceHealth[input.sourceHealth] +
    REFRESH_PRIORITY_CONFIG.volatility[input.volatility] +
    REFRESH_PRIORITY_CONFIG.reason[input.reason] +
    (input.explicitUserAction ? REFRESH_PRIORITY_CONFIG.explicitUserAction : 0);
  const priority = REFRESH_PRIORITY_CONFIG.semanticThresholds.find(
    (threshold) => score >= threshold.minimumScore,
  )!.priority;
  return {
    priority,
    score,
    policyVersion: REFRESH_PRIORITY_CONFIG.version,
  };
};
