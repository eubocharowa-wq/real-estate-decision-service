import type {
  FieldConflictState,
  FieldCriticality,
  FieldFreshness,
  RefreshPriority,
  RefreshReason,
  SourceRuntimePolicy,
  UserJourneyStage,
  UserRequestPriority,
  VolatilityClass,
} from "../contracts";

export const REFRESH_PRIORITY_CONFIG = {
  version: "refresh-priority-v1",
  userRequestPriority: {
    low: 0,
    normal: 6,
    high: 14,
    critical: 24,
  } satisfies Record<UserRequestPriority, number>,
  fieldCriticality: {
    optional: 0,
    important: 9,
    critical: 22,
  } satisfies Record<FieldCriticality, number>,
  freshness: {
    fresh: 0,
    aging: 5,
    stale: 14,
    expired: 24,
    unknown: 10,
  } satisfies Record<FieldFreshness, number>,
  conflict: {
    none: 0,
    noncritical: 9,
    critical: 24,
  } satisfies Record<FieldConflictState, number>,
  journeyStage: {
    discovery: 0,
    shortlist: 8,
    comparison: 16,
    pre_decision: 28,
  } satisfies Record<UserJourneyStage, number>,
  sourceHealth: {
    healthy: 0,
    unknown: 0,
    degraded: -3,
    failing: -8,
  } satisfies Record<SourceRuntimePolicy["health"]["status"], number>,
  volatility: {
    V1: 10,
    V2: 6,
    V3: 3,
    V4: 0,
  } satisfies Record<VolatilityClass, number>,
  explicitUserAction: 14,
  reason: {
    STALE_FIELD: 5,
    EXPIRED_FIELD: 12,
    CRITICAL_UNKNOWN: 13,
    SOURCE_CONFLICT: 12,
    USER_REQUESTED: 8,
    PRE_SHORTLIST_CHECK: 6,
    PRE_COMPARISON_CHECK: 9,
    PRE_DECISION_CHECK: 14,
    SCHEDULED_REFRESH: 0,
    SOURCE_HEALTH_RECOVERY: 2,
    INGESTION_RETRY: 0,
    MANUAL_REVIEW_REQUEST: 4,
  } satisfies Record<RefreshReason, number>,
  semanticThresholds: [
    { priority: "critical", minimumScore: 80 },
    { priority: "high", minimumScore: 50 },
    { priority: "normal", minimumScore: 25 },
    { priority: "low", minimumScore: Number.NEGATIVE_INFINITY },
  ] satisfies readonly {
    readonly priority: RefreshPriority;
    readonly minimumScore: number;
  }[],
} as const;
