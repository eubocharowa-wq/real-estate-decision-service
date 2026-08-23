import { describe, expect, it } from "vitest";

import {
  classifyRefreshError,
  decideRefreshRetry,
  InMemoryRefreshQueueRepository,
  InMemorySourceOperationalTracker,
} from "../../src/data-collection/refresh";
import { HEALTHY_RUNTIME, makeRefreshRequest, NOW } from "./helpers";

const claimedTask = (maxAttempts = 3) => {
  const queue = new InMemoryRefreshQueueRepository();
  const task = queue.enqueue(makeRefreshRequest({ maxAttempts })).task;
  return queue.claim(task.refresh_task_id, "worker_test", NOW)!;
};

describe("centralized retry and operational policies", () => {
  it.each([
    "TIMEOUT",
    "TEMPORARY_5XX",
    "RATE_LIMITED",
    "TRANSIENT_NETWORK_ERROR",
    "SOURCE_HEALTH_DEGRADED",
  ] as const)("classifies %s as retryable", (code) => {
    expect(classifyRefreshError(code)).toBe(true);
  });

  it.each([
    "SOURCE_CHANGED",
    "POLICY_DENIED",
    "PERMISSION_REQUIRED",
    "INVALID_STRUCTURE",
  ] as const)("classifies %s as non-retryable", (code) => {
    expect(classifyRefreshError(code)).toBe(false);
  });

  it("does not retry AUTH_REQUIRED without approved credentials", () => {
    expect(classifyRefreshError("AUTH_REQUIRED", false)).toBe(false);
    expect(classifyRefreshError("AUTH_REQUIRED", true)).toBe(true);
  });

  it("uses deterministic controlled backoff and honors retry-after", () => {
    const task = claimedTask();
    const timeout = decideRefreshRetry({
      task,
      errorCode: "TIMEOUT",
      now: NOW,
    });
    const limited = decideRefreshRetry({
      task,
      errorCode: "RATE_LIMITED",
      now: NOW,
      retryAfterSeconds: 600,
    });
    expect(timeout.notBefore).toBe("2026-08-23T12:00:30.000Z");
    expect(
      decideRefreshRetry({
        task,
        errorCode: "TEMPORARY_5XX",
        now: NOW,
      }).notBefore,
    ).toBe("2026-08-23T12:01:00.000Z");
    expect(limited.notBefore).toBe("2026-08-23T12:10:00.000Z");
  });

  it("stops at max attempts and does not schedule beyond a deadline", () => {
    expect(
      decideRefreshRetry({
        task: claimedTask(1),
        errorCode: "TIMEOUT",
        now: NOW,
      }),
    ).toMatchObject({ retryable: false, reason: "attempts_exhausted" });
    const withDeadline = claimedTask();
    expect(
      decideRefreshRetry({
        task: {
          ...withDeadline,
          deadline: "2026-08-23T12:00:10.000Z",
        },
        errorCode: "TIMEOUT",
        now: NOW,
      }),
    ).toMatchObject({ retryable: false, reason: "deadline_would_be_missed" });
  });

  it("enforces concurrency, minimum interval and daily budget hooks", () => {
    const tracker = new InMemorySourceOperationalTracker();
    const runtime = {
      ...HEALTHY_RUNTIME,
      operational: {
        minimum_interval_seconds: 60,
        maximum_concurrency: 1,
        daily_budget: 1,
      },
    };
    expect(
      tracker.check({
        sourceId: "fixture_refresh",
        runtime,
        priority: "normal",
        now: NOW,
      }).allowed,
    ).toBe(true);
    tracker.start("fixture_refresh", NOW);
    expect(
      tracker.check({
        sourceId: "fixture_refresh",
        runtime,
        priority: "normal",
        now: NOW,
      }).reason,
    ).toBe("maximum_concurrency");
    tracker.finish("fixture_refresh", NOW);
    expect(
      tracker.check({
        sourceId: "fixture_refresh",
        runtime: {
          ...runtime,
          operational: { ...runtime.operational, daily_budget: null },
        },
        priority: "normal",
        now: "2026-08-23T12:00:30.000Z",
      }).reason,
    ).toBe("minimum_interval");
    expect(
      tracker.check({
        sourceId: "fixture_refresh",
        runtime,
        priority: "normal",
        now: "2026-08-23T12:01:00.000Z",
      }).reason,
    ).toBe("daily_budget");
  });

  it("defers low/normal work for degraded health but preserves critical eligibility", () => {
    const tracker = new InMemorySourceOperationalTracker();
    const runtime = {
      ...HEALTHY_RUNTIME,
      health: { ...HEALTHY_RUNTIME.health, status: "degraded" as const },
    };
    expect(
      tracker.check({
        sourceId: "fixture_refresh",
        runtime,
        priority: "normal",
        now: NOW,
      }).reason,
    ).toBe("source_health_degraded");
    expect(
      tracker.check({
        sourceId: "fixture_refresh",
        runtime,
        priority: "critical",
        now: NOW,
      }).allowed,
    ).toBe(true);
  });

  it("blocks paused sources fail-closed", () => {
    const tracker = new InMemorySourceOperationalTracker();
    expect(
      tracker.check({
        sourceId: "fixture_refresh",
        runtime: { ...HEALTHY_RUNTIME, status: "paused" },
        priority: "critical",
        now: NOW,
      }),
    ).toMatchObject({ allowed: false, reason: "source_blocked" });
  });

  it.each([
    [{ source_changed: true }, "source_changed"],
    [{ auth_issue: true }, "auth_required"],
    [{ rate_limited: true }, "source_rate_limited"],
  ] as const)("maps source-health flags to %s", (healthOverride, reason) => {
    const tracker = new InMemorySourceOperationalTracker();
    expect(
      tracker.check({
        sourceId: "fixture_refresh",
        runtime: {
          ...HEALTHY_RUNTIME,
          health: { ...HEALTHY_RUNTIME.health, ...healthOverride },
        },
        priority: "critical",
        now: NOW,
      }).reason,
    ).toBe(reason);
  });
});
