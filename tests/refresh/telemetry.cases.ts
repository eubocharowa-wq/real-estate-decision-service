import { describe, expect, it } from "vitest";

import { InMemoryRefreshTelemetry } from "../../src/data-collection/refresh";

describe("refresh observability", () => {
  it("reports structured queue and execution metrics without user content", () => {
    const telemetry = new InMemoryRefreshTelemetry();
    telemetry.record({
      refresh_task_id: "refresh_task_one",
      entity_id: "offer_one",
      source_id: "source_one",
      reason: "PRE_DECISION_CHECK",
      priority: "critical",
      status: "succeeded",
      attempt: 1,
      adapter_version: "fixture-v1",
      policy_version: "fixture-policy-v1",
      duration_ms: 40,
      changed_field_count: 1,
      error_code: null,
      retry_scheduled: false,
    });
    telemetry.record({
      refresh_task_id: "refresh_task_two",
      entity_id: "offer_two",
      source_id: "source_one",
      reason: "STALE_FIELD",
      priority: "normal",
      status: "blocked",
      attempt: 1,
      adapter_version: null,
      policy_version: "fixture-policy-v2",
      duration_ms: 20,
      changed_field_count: 0,
      error_code: "POLICY_DENIED",
      retry_scheduled: false,
    });
    expect(
      telemetry.metrics({ queueDepth: 3, oldestTaskAgeMs: 120_000 }),
    ).toEqual({
      queue_depth: 3,
      oldest_task_age_ms: 120_000,
      attempts: 2,
      success_rate: 0.5,
      partial_rate: 0,
      retry_rate: 0,
      policy_block_rate: 0.5,
      source_changed_rate: 0,
      average_duration_ms: 30,
      critical_refresh_latency_ms: 40,
    });
    expect(JSON.stringify(telemetry.logs())).not.toContain("free-form");
  });
});
