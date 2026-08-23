import type { RefreshErrorCode, RefreshPriority } from "../contracts";

export const REFRESH_RETRY_CONFIG = {
  version: "refresh-retry-v1",
  defaultMaxAttempts: {
    critical: 4,
    high: 3,
    normal: 2,
    low: 1,
  } satisfies Record<RefreshPriority, number>,
  retryableErrors: [
    "TIMEOUT",
    "TEMPORARY_5XX",
    "RATE_LIMITED",
    "TRANSIENT_NETWORK_ERROR",
    "SOURCE_HEALTH_DEGRADED",
    "PARTIAL_CRITICAL_MISSING",
  ] satisfies readonly RefreshErrorCode[],
  nonRetryableErrors: [
    "POLICY_DENIED",
    "SOURCE_CHANGED",
    "INVALID_STRUCTURE",
    "AUTH_REQUIRED",
    "PERMISSION_REQUIRED",
    "ADAPTER_UNAVAILABLE",
    "DEADLINE_EXCEEDED",
    "INVALID_RESULT",
  ] satisfies readonly RefreshErrorCode[],
  baseDelaySeconds: {
    TIMEOUT: 30,
    TEMPORARY_5XX: 60,
    RATE_LIMITED: 120,
    TRANSIENT_NETWORK_ERROR: 30,
    SOURCE_HEALTH_DEGRADED: 300,
    PARTIAL_CRITICAL_MISSING: 60,
  } satisfies Partial<Record<RefreshErrorCode, number>>,
  multiplier: 2,
  maximumDelaySeconds: 3600,
} as const;
