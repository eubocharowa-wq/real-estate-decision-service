import { describe, expect, it } from "vitest";

import {
  calculateRefreshPriority,
  createCollectionRunIdentity,
  REFRESH_POLICY_VERSION,
  refreshResultSchema,
  refreshTaskSchema,
} from "../../src/data-collection/refresh";
import { InMemoryRefreshQueueRepository } from "../../src/data-collection/refresh";
import { makeRefreshRequest, NOW } from "./helpers";

describe("refresh contracts and priority policy", async () => {
  it("formalizes a versioned RefreshTask with the complete reason taxonomy", async () => {
    const queue = new InMemoryRefreshQueueRepository();
    const task = (await queue.enqueue(makeRefreshRequest())).task;
    expect(refreshTaskSchema.parse(task)).toEqual(task);
    expect(task.schema_version).toBe("1.0");
    expect(task.refresh_policy_version).toBe(REFRESH_POLICY_VERSION);
    expect(task.operation).toBe("targeted_refresh");
  });

  it("ranks pre-decision above discovery for otherwise equal input", () => {
    const base = makeRefreshRequest().priorityInput;
    const discovery = calculateRefreshPriority({
      ...base,
      journeyStage: "discovery",
    });
    const preDecision = calculateRefreshPriority({
      ...base,
      journeyStage: "pre_decision",
    });
    expect(preDecision.score).toBeGreaterThan(discovery.score);
  });

  it("rejects malformed result contracts rather than hiding missing fields", () => {
    expect(() =>
      refreshResultSchema.parse({
        schema_version: "1.0",
        refresh_task_id: "refresh_task_test",
        completed_at: NOW,
      }),
    ).toThrow();
  });

  it("uses a deterministic execution idempotency boundary per attempt", async () => {
    const queue = new InMemoryRefreshQueueRepository();
    const task = (await queue.enqueue(makeRefreshRequest())).task;
    const first = createCollectionRunIdentity({ ...task, attempt_count: 1 });
    expect(createCollectionRunIdentity({ ...task, attempt_count: 1 })).toEqual(
      first,
    );
    expect(
      createCollectionRunIdentity({ ...task, attempt_count: 2 }),
    ).not.toEqual(first);
  });
});
