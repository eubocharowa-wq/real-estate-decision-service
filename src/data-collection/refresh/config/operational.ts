import type { RefreshPriority, SourceRuntimePolicy } from "../contracts";

export const REFRESH_OPERATIONAL_CONFIG = {
  version: "refresh-operational-v1",
  defaultClaimLeaseSeconds: 60,
  concurrencyRetrySeconds: 30,
  sourceHealthRetrySeconds: 300,
  degradedDeferredPriorities: [
    "low",
    "normal",
  ] satisfies readonly RefreshPriority[],
  blockedSourceStatuses: [
    "blocked",
    "paused",
    "deprecated",
  ] satisfies readonly SourceRuntimePolicy["status"][],
} as const;
