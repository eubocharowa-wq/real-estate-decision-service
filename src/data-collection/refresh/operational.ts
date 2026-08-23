import type { RefreshPriority, SourceRuntimePolicy } from "./contracts";
import { REFRESH_OPERATIONAL_CONFIG } from "./config/operational";

export interface OperationalEligibility {
  readonly allowed: boolean;
  readonly reason:
    | "allowed"
    | "source_blocked"
    | "source_changed"
    | "auth_required"
    | "source_rate_limited"
    | "source_health_failing"
    | "source_health_degraded"
    | "minimum_interval"
    | "maximum_concurrency"
    | "daily_budget";
  readonly retryAfterSeconds: number | null;
}

interface SourceUsage {
  running: number;
  lastStartedAt: string | null;
  day: string;
  dailyStarts: number;
}

export class InMemorySourceOperationalTracker {
  private readonly usage = new Map<string, SourceUsage>();

  check({
    sourceId,
    runtime,
    priority,
    now,
  }: {
    readonly sourceId: string;
    readonly runtime: SourceRuntimePolicy;
    readonly priority: RefreshPriority;
    readonly now: string;
  }): OperationalEligibility {
    if (
      (
        REFRESH_OPERATIONAL_CONFIG.blockedSourceStatuses as readonly string[]
      ).includes(runtime.status)
    )
      return {
        allowed: false,
        reason: "source_blocked",
        retryAfterSeconds: null,
      };
    if (runtime.health.source_changed)
      return {
        allowed: false,
        reason: "source_changed",
        retryAfterSeconds: null,
      };
    if (runtime.health.auth_issue)
      return {
        allowed: false,
        reason: "auth_required",
        retryAfterSeconds: null,
      };
    if (runtime.health.rate_limited)
      return {
        allowed: false,
        reason: "source_rate_limited",
        retryAfterSeconds: REFRESH_OPERATIONAL_CONFIG.sourceHealthRetrySeconds,
      };
    if (runtime.health.status === "failing")
      return {
        allowed: false,
        reason: "source_health_failing",
        retryAfterSeconds: REFRESH_OPERATIONAL_CONFIG.sourceHealthRetrySeconds,
      };
    if (
      runtime.health.status === "degraded" &&
      (
        REFRESH_OPERATIONAL_CONFIG.degradedDeferredPriorities as readonly string[]
      ).includes(priority)
    )
      return {
        allowed: false,
        reason: "source_health_degraded",
        retryAfterSeconds: REFRESH_OPERATIONAL_CONFIG.sourceHealthRetrySeconds,
      };
    const usage = this.currentUsage(sourceId, now);
    const maximumConcurrency = runtime.operational.maximum_concurrency;
    if (maximumConcurrency !== null && usage.running >= maximumConcurrency)
      return {
        allowed: false,
        reason: "maximum_concurrency",
        retryAfterSeconds: REFRESH_OPERATIONAL_CONFIG.concurrencyRetrySeconds,
      };
    const dailyBudget = runtime.operational.daily_budget;
    if (dailyBudget !== null && usage.dailyStarts >= dailyBudget)
      return {
        allowed: false,
        reason: "daily_budget",
        retryAfterSeconds: this.secondsUntilNextUtcDay(now),
      };
    const minimumInterval = runtime.operational.minimum_interval_seconds;
    if (minimumInterval !== null && usage.lastStartedAt) {
      const elapsedSeconds =
        (Date.parse(now) - Date.parse(usage.lastStartedAt)) / 1000;
      if (elapsedSeconds < minimumInterval)
        return {
          allowed: false,
          reason: "minimum_interval",
          retryAfterSeconds: Math.ceil(minimumInterval - elapsedSeconds),
        };
    }
    return { allowed: true, reason: "allowed", retryAfterSeconds: null };
  }

  start(sourceId: string, now: string): void {
    const usage = this.currentUsage(sourceId, now);
    this.usage.set(sourceId, {
      ...usage,
      running: usage.running + 1,
      lastStartedAt: now,
      dailyStarts: usage.dailyStarts + 1,
    });
  }

  finish(sourceId: string, now: string): void {
    const usage = this.currentUsage(sourceId, now);
    this.usage.set(sourceId, {
      ...usage,
      running: Math.max(0, usage.running - 1),
    });
  }

  private currentUsage(sourceId: string, now: string): SourceUsage {
    const day = now.slice(0, 10);
    const current = this.usage.get(sourceId);
    if (!current || current.day !== day)
      return {
        running: current?.running ?? 0,
        lastStartedAt: null,
        day,
        dailyStarts: 0,
      };
    return current;
  }

  private secondsUntilNextUtcDay(now: string): number {
    const date = new Date(now);
    const next = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    );
    return Math.max(1, Math.ceil((next - date.getTime()) / 1000));
  }
}
