import { describe, expect, it } from "vitest";

import { InMemoryRefreshQueueRepository } from "../../src/data-collection/refresh";
import { makeRefreshRequest, NOW } from "./helpers";

describe("in-memory refresh queue", async () => {
  it("enqueues, peeks, claims, completes, fails, retries and cancels", async () => {
    const queue = new InMemoryRefreshQueueRepository();
    const first = (await queue.enqueue(makeRefreshRequest())).task;
    expect((await queue.peek(NOW))?.refresh_task_id).toBe(
      first.refresh_task_id,
    );
    const claimed = (await queue.claim(
      first.refresh_task_id,
      "worker_test",
      NOW,
    ))!;
    expect(claimed.status).toBe("running");
    expect(claimed.attempt_count).toBe(1);
    expect(
      (
        await queue.retry(
          first.refresh_task_id,
          "TIMEOUT",
          "2026-08-23T12:01:00.000Z",
        )
      ).status,
    ).toBe("retry_scheduled");
    expect(await queue.peek(NOW)).toBeNull();
    await queue.claim(
      first.refresh_task_id,
      "worker_test",
      "2026-08-23T12:01:00.000Z",
    );
    expect(
      (
        await queue.complete(
          first.refresh_task_id,
          "succeeded",
          "2026-08-23T12:01:01.000Z",
        )
      ).status,
    ).toBe("succeeded");

    const failed = (
      await queue.enqueue(makeRefreshRequest({ entityId: "offer_fixture_102" }))
    ).task;
    expect(
      (await queue.fail(failed.refresh_task_id, "SOURCE_CHANGED", NOW)).status,
    ).toBe("failed");
    const cancelled = (
      await queue.enqueue(makeRefreshRequest({ entityId: "offer_fixture_103" }))
    ).task;
    expect((await queue.cancel(cancelled.refresh_task_id, NOW)).status).toBe(
      "cancelled",
    );
  });

  it("deduplicates repeated triggers and escalates the existing task", async () => {
    const queue = new InMemoryRefreshQueueRepository();
    const normal = makeRefreshRequest();
    for (let index = 0; index < 10; index += 1) await queue.enqueue(normal);
    expect(await queue.list()).toHaveLength(1);

    const escalated = await queue.enqueue(
      makeRefreshRequest({
        reason: "PRE_DECISION_CHECK",
        journeyStage: "pre_decision",
        requestedBy: "user",
        priorityInput: {
          ...normal.priorityInput,
          reason: "PRE_DECISION_CHECK",
          userRequestPriority: "critical",
          fieldCriticality: "critical",
          journeyStage: "pre_decision",
          explicitUserAction: true,
        },
      }),
    );
    expect(escalated.disposition).toBe("deduplicated");
    expect(await queue.list()).toHaveLength(1);
    expect(escalated.task.priority).toBe("critical");
    expect(escalated.task.reason_history).toEqual(
      expect.arrayContaining(["STALE_FIELD", "PRE_DECISION_CHECK"]),
    );
  });

  it("supersedes a narrower queued task when a new task fully covers it", async () => {
    const queue = new InMemoryRefreshQueueRepository();
    const narrow = (await queue.enqueue(makeRefreshRequest())).task;
    const broad = await queue.enqueue(
      makeRefreshRequest({
        fieldPaths: ["listing_price", "availability"],
        criticalFieldPaths: ["availability"],
      }),
    );
    expect(broad.disposition).toBe("superseding");
    expect(broad.supersededTaskIds).toEqual([narrow.refresh_task_id]);
    expect(await queue.get(narrow.refresh_task_id)).toMatchObject({
      status: "superseded",
      superseded_by_task_id: broad.task.refresh_task_id,
    });
  });
});
