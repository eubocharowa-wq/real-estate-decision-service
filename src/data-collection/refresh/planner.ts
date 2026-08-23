import type { FreshnessPolicy, SourceRegistryEntry } from "../source-registry";
import type {
  FieldConflictState,
  FieldCriticality,
  FieldFreshness,
  RefreshReason,
  RefreshTaskRequest,
  UserJourneyStage,
  UserRequestPriority,
  VolatilityClass,
} from "./contracts";
import { createRefreshDedupKey } from "./dedup";

export type RefreshPlanningMode =
  | "scheduled"
  | "pre_shortlist"
  | "pre_comparison"
  | "pre_decision"
  | "user_requested";

export interface RefreshFieldCandidate {
  readonly entityType: RefreshTaskRequest["entityType"];
  readonly entityId: string;
  readonly sourceId: string;
  readonly targetUrl: string;
  readonly fieldPath: string;
  readonly observedAt: string | null;
  readonly validUntil: string | null;
  readonly freshnessStatus?: FieldFreshness;
  readonly verificationStatus:
    | "confirmed"
    | "claimed"
    | "unconfirmed"
    | "conflicting"
    | "stale"
    | "unknown";
  readonly criticality: FieldCriticality;
  readonly conflict: FieldConflictState;
  readonly volatility: VolatilityClass;
  readonly freshnessPolicy: FreshnessPolicy | null;
  readonly sourceHealth: SourceRegistryEntry["health"]["status"];
  readonly userRequestPriority: UserRequestPriority;
  readonly journeyStage: UserJourneyStage;
  readonly requestedBy: RefreshTaskRequest["requestedBy"];
  readonly automaticRefreshAvailable: boolean;
  readonly deadline?: string | null;
}

export interface RefreshPlanOutcome {
  readonly action:
    | "enqueue_refresh"
    | "manual_review_required"
    | "deactivate_or_verify"
    | "none";
  readonly reason: RefreshReason | null;
  readonly fieldPath: string;
  readonly request: RefreshTaskRequest | null;
  readonly dedupKey: string | null;
  readonly explanation: string;
}

const hoursSince = (now: string, then: string): number =>
  Math.max(0, Date.parse(now) - Date.parse(then)) / 3_600_000;

export const resolveFieldFreshness = (
  now: string,
  candidate: RefreshFieldCandidate,
): FieldFreshness => {
  if (
    candidate.validUntil &&
    Date.parse(candidate.validUntil) <= Date.parse(now)
  )
    return "expired";
  if (candidate.freshnessStatus) return candidate.freshnessStatus;
  if (!candidate.observedAt) return "unknown";
  const policy = candidate.freshnessPolicy;
  if (!policy) return "unknown";
  const ageHours = hoursSince(now, candidate.observedAt);
  if (
    policy.critical_after_hours !== null &&
    ageHours >= policy.critical_after_hours
  )
    return "stale";
  if (policy.stale_after_hours !== null && ageHours >= policy.stale_after_hours)
    return "stale";
  if (policy.target_ttl_hours !== null && ageHours >= policy.target_ttl_hours)
    return "aging";
  return "fresh";
};

const modeReason: Record<
  Exclude<RefreshPlanningMode, "scheduled">,
  RefreshReason
> = {
  pre_shortlist: "PRE_SHORTLIST_CHECK",
  pre_comparison: "PRE_COMPARISON_CHECK",
  pre_decision: "PRE_DECISION_CHECK",
  user_requested: "USER_REQUESTED",
};

const shouldRefreshForMode = (
  mode: RefreshPlanningMode,
  candidate: RefreshFieldCandidate,
  freshness: FieldFreshness,
): boolean => {
  if (mode === "user_requested") return true;
  if (mode === "pre_decision")
    return (
      freshness !== "fresh" ||
      candidate.verificationStatus !== "confirmed" ||
      candidate.conflict !== "none"
    );
  if (mode === "pre_comparison")
    return (
      freshness === "aging" ||
      freshness === "stale" ||
      candidate.verificationStatus === "unknown" ||
      candidate.conflict !== "none"
    );
  if (mode === "pre_shortlist")
    return (
      candidate.criticality === "critical" &&
      (freshness !== "fresh" ||
        candidate.verificationStatus === "unknown" ||
        candidate.conflict !== "none")
    );
  return false;
};

const scheduledReason = (
  candidate: RefreshFieldCandidate,
  freshness: FieldFreshness,
): RefreshReason | null => {
  if (freshness === "expired") return "EXPIRED_FIELD";
  if (candidate.conflict !== "none") return "SOURCE_CONFLICT";
  if (
    candidate.criticality === "critical" &&
    candidate.verificationStatus === "unknown"
  )
    return "CRITICAL_UNKNOWN";
  if (freshness === "stale") return "STALE_FIELD";
  if (freshness === "aging" && candidate.criticality !== "optional")
    return "SCHEDULED_REFRESH";
  return null;
};

const createRequest = (
  now: string,
  mode: RefreshPlanningMode,
  candidate: RefreshFieldCandidate,
  freshness: FieldFreshness,
  reason: RefreshReason,
): RefreshTaskRequest => ({
  entityType: candidate.entityType,
  entityId: candidate.entityId,
  sourceId: candidate.sourceId,
  targetUrls: [candidate.targetUrl],
  fieldPaths: [candidate.fieldPath],
  criticalFieldPaths:
    candidate.criticality === "critical" ? [candidate.fieldPath] : [],
  reason,
  priorityInput: {
    reason,
    userRequestPriority: candidate.userRequestPriority,
    fieldCriticality: candidate.criticality,
    freshness,
    conflict: candidate.conflict,
    journeyStage: candidate.journeyStage,
    sourceHealth: candidate.sourceHealth,
    volatility: candidate.volatility,
    explicitUserAction: mode === "user_requested",
  },
  journeyStage: candidate.journeyStage,
  requestedAt: now,
  requestedBy: candidate.requestedBy,
  deadline: candidate.deadline ?? null,
});

export const planScheduledRefreshes = ({
  now,
  candidates,
  mode = "scheduled",
  activeDedupKeys = [],
}: {
  readonly now: string;
  readonly candidates: readonly RefreshFieldCandidate[];
  readonly mode?: RefreshPlanningMode;
  readonly activeDedupKeys?: readonly string[];
}): readonly RefreshPlanOutcome[] => {
  const active = new Set(activeDedupKeys);
  return [...candidates]
    .sort(
      (left, right) =>
        left.entityId.localeCompare(right.entityId) ||
        left.fieldPath.localeCompare(right.fieldPath),
    )
    .map((candidate): RefreshPlanOutcome => {
      const freshness = resolveFieldFreshness(now, candidate);
      const reason =
        freshness === "expired"
          ? "EXPIRED_FIELD"
          : candidate.conflict !== "none"
            ? "SOURCE_CONFLICT"
            : mode === "scheduled"
              ? scheduledReason(candidate, freshness)
              : shouldRefreshForMode(mode, candidate, freshness)
                ? modeReason[mode]
                : null;

      if (!reason)
        return {
          action: "none",
          reason: null,
          fieldPath: candidate.fieldPath,
          request: null,
          dedupKey: null,
          explanation: "Field does not currently require refresh.",
        };

      if (!candidate.automaticRefreshAvailable) {
        return {
          action: "manual_review_required",
          reason: "MANUAL_REVIEW_REQUEST",
          fieldPath: candidate.fieldPath,
          request: null,
          dedupKey: null,
          explanation:
            "No policy-approved automatic source is available; conflict or uncertainty remains unresolved.",
        };
      }

      const request = createRequest(now, mode, candidate, freshness, reason);
      const dedupKey = createRefreshDedupKey(request);
      if (active.has(dedupKey))
        return {
          action: "none",
          reason,
          fieldPath: candidate.fieldPath,
          request: null,
          dedupKey,
          explanation: "An active task already covers this targeted field.",
        };
      return {
        action:
          freshness === "expired" ? "deactivate_or_verify" : "enqueue_refresh",
        reason,
        fieldPath: candidate.fieldPath,
        request,
        dedupKey,
        explanation:
          freshness === "expired"
            ? "Explicit valid_until has passed; deactivate or verify a replacement without endless polling."
            : "A minimal targeted refresh is required.",
      };
    });
};
