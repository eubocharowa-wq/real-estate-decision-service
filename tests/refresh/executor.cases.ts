import { describe, expect, it } from "vitest";

import {
  AffectedOnlyRefreshRecomputeHook,
  InMemoryRefreshQueueRepository,
  RefreshExecutor,
  RefreshTaskService,
  RegistryRefreshPolicyGateway,
  type RefreshEvidencePipeline,
  type RefreshPolicyGateway,
} from "../../src/data-collection/refresh";
import type { CollectionPlan } from "../../src/data-collection/source-registry";
import {
  FixtureEvidencePipeline,
  FixtureRefreshAdapter,
  FixtureRefreshPolicyGateway,
  makeAllowedPlan,
  makeIngestionOutcome,
  makeRefreshRequest,
  NOW,
} from "./helpers";

const context = {
  environment: "test" as const,
  satisfiedConditions: [] as readonly string[],
  workerId: "worker_test",
  now: NOW,
};

const makeExecutor = ({
  queue,
  policy,
  adapters,
  pipeline,
}: {
  queue: InMemoryRefreshQueueRepository;
  policy: RefreshPolicyGateway;
  adapters: ConstructorParameters<typeof RefreshExecutor>[0]["adapters"];
  pipeline: RefreshEvidencePipeline;
}) =>
  new RefreshExecutor({
    queue,
    policy,
    adapters,
    evidencePipeline: pipeline,
    recomputeHook: new AffectedOnlyRefreshRecomputeHook(),
    monotonicNow: (() => {
      let time = 100;
      return () => (time += 5);
    })(),
  });

describe("refresh executor", () => {
  it("runs an approved offline adapter through evidence and affected-only recompute", async () => {
    const queue = new InMemoryRefreshQueueRepository();
    queue.enqueue(makeRefreshRequest());
    const policy = new FixtureRefreshPolicyGateway();
    const adapter = new FixtureRefreshAdapter({});
    const pipeline = new FixtureEvidencePipeline(makeIngestionOutcome());
    const executor = makeExecutor({
      queue,
      policy,
      adapters: [adapter],
      pipeline,
    });
    const result = await executor.processNextRefreshTask(context);
    expect(result).toMatchObject({
      status: "succeeded",
      selected_method: "fixture_mock",
      changed_fields: ["listing_price"],
      evidence_ids: ["evidence_refresh_price_101"],
      recompute: {
        data_confidence_entity_ids: [
          "offer_fixture_101",
          "property_fixture_101",
        ],
        data_completeness_entity_ids: [
          "offer_fixture_101",
          "property_fixture_101",
        ],
        match_result_pairs: [
          {
            user_request_id: "user_request_fixture_101",
            property_id: "property_fixture_101",
          },
        ],
      },
    });
    expect(adapter.calls).toBe(1);
    expect(pipeline.calls).toBe(1);
    expect(queue.list()[0]?.status).toBe("succeeded");
    expect(policy.calls[0]).toMatchObject({
      operation: "targeted_refresh",
      discovery: false,
      followLinks: false,
      pagination: false,
      sitemap: false,
      authentication: false,
      challengeAction: "stop",
    });
    expect(executor.getTelemetry().logs()[0]).toMatchObject({
      status: "succeeded",
      changed_field_count: 1,
    });
  });

  it("rechecks policy after enqueue and blocks without invoking the adapter", async () => {
    const queue = new InMemoryRefreshQueueRepository();
    const policy = new FixtureRefreshPolicyGateway();
    const service = new RefreshTaskService(queue, policy);
    expect(
      service.enqueue(makeRefreshRequest(), {
        environment: "test",
        satisfiedConditions: [],
      }).policyAllowedAtEnqueue,
    ).toBe(true);
    policy.allowed = false;
    const adapter = new FixtureRefreshAdapter({});
    const pipeline = new FixtureEvidencePipeline(makeIngestionOutcome());
    const executor = makeExecutor({
      queue,
      policy,
      adapters: [adapter],
      pipeline,
    });
    const result = await executor.processNextRefreshTask(context);
    expect(policy.calls).toHaveLength(2);
    expect(result).toMatchObject({
      status: "blocked",
      error_code: "POLICY_DENIED",
      selected_method: null,
    });
    expect(queue.list()[0]?.status).toBe("blocked");
    expect(adapter.calls).toBe(0);
    expect(pipeline.calls).toBe(0);
  });

  it.each(["browser", "openclaw"] as const)(
    "does not execute or fall back through %s",
    async (method) => {
      const queue = new InMemoryRefreshQueueRepository();
      queue.enqueue(makeRefreshRequest());
      const policy = new FixtureRefreshPolicyGateway();
      policy.method = method;
      const adapter = new FixtureRefreshAdapter({}, "fixture_refresh", method);
      const pipeline = new FixtureEvidencePipeline(makeIngestionOutcome());
      const executor = makeExecutor({
        queue,
        policy,
        adapters: [adapter],
        pipeline,
      });
      expect(await executor.processNextRefreshTask(context)).toMatchObject({
        status: "blocked",
        error_code: "POLICY_DENIED",
      });
      expect(adapter.calls).toBe(0);
    },
  );

  it("never traverses CollectionPlan fallback methods after an HTTP failure", async () => {
    const queue = new InMemoryRefreshQueueRepository();
    queue.enqueue(makeRefreshRequest());
    const basePolicy = new FixtureRefreshPolicyGateway();
    const policy: RefreshPolicyGateway = {
      resolveCollectionPlan(input): CollectionPlan {
        return {
          ...makeAllowedPlan(input, "http"),
          fallbackMethods: ["browser", "openclaw"],
        };
      },
      getSourceRuntime: () => basePolicy.getSourceRuntime(),
    };
    const http = new FixtureRefreshAdapter(
      { status: "failed", error_code: "TIMEOUT" },
      "fixture_refresh",
      "http",
    );
    const browser = new FixtureRefreshAdapter({}, "fixture_refresh", "browser");
    const openclaw = new FixtureRefreshAdapter(
      {},
      "fixture_refresh",
      "openclaw",
    );
    const executor = makeExecutor({
      queue,
      policy,
      adapters: [http, browser, openclaw],
      pipeline: new FixtureEvidencePipeline(makeIngestionOutcome()),
    });
    expect(await executor.processNextRefreshTask(context)).toMatchObject({
      status: "retry_scheduled",
      error_code: "TIMEOUT",
    });
    expect(http.calls).toBe(1);
    expect(browser.calls).toBe(0);
    expect(openclaw.calls).toBe(0);
  });

  it.each(["SOURCE_CHANGED", "POLICY_DENIED", "AUTH_REQUIRED"] as const)(
    "does not retry %s",
    async (errorCode) => {
      const queue = new InMemoryRefreshQueueRepository();
      queue.enqueue(makeRefreshRequest());
      const adapter = new FixtureRefreshAdapter({
        status: "failed",
        error_code: errorCode,
        source_health_effect:
          errorCode === "SOURCE_CHANGED" ? "source_changed" : "degraded",
      });
      const executor = makeExecutor({
        queue,
        policy: new FixtureRefreshPolicyGateway(),
        adapters: [adapter],
        pipeline: new FixtureEvidencePipeline(makeIngestionOutcome()),
      });
      expect(await executor.processNextRefreshTask(context)).toMatchObject({
        status: errorCode === "POLICY_DENIED" ? "blocked" : "failed",
        error_code: errorCode,
        retry: { retryable: false },
      });
      expect(queue.list()[0]?.status).toBe(
        errorCode === "POLICY_DENIED" ? "blocked" : "failed",
      );
    },
  );

  it("retries a critical partial only within max_attempts", async () => {
    const queue = new InMemoryRefreshQueueRepository();
    queue.enqueue(
      makeRefreshRequest({
        fieldPaths: ["listing_price", "availability"],
        criticalFieldPaths: ["availability"],
        maxAttempts: 1,
      }),
    );
    const adapter = new FixtureRefreshAdapter({
      status: "partial",
      observed_fields: [
        {
          field_path: "listing_price",
          observation_fingerprint: "price:same",
          evidence_candidate_id: "evidence_candidate_price",
        },
      ],
      missing_fields: ["availability"],
    });
    const pipeline = new FixtureEvidencePipeline(
      makeIngestionOutcome({
        changedFields: [],
        unchangedFields: ["listing_price"],
        missingFields: ["availability"],
      }),
    );
    const executor = makeExecutor({
      queue,
      policy: new FixtureRefreshPolicyGateway(),
      adapters: [adapter],
      pipeline,
    });
    expect(await executor.processNextRefreshTask(context)).toMatchObject({
      status: "partial",
      changed_fields: [],
      unchanged_fields: ["listing_price"],
      missing_fields: ["availability"],
      retry: { retryable: false, max_attempts: 1 },
    });
    expect(queue.list()[0]?.status).toBe("partial");
  });

  it("defers a degraded normal-priority source without calling the adapter", async () => {
    const queue = new InMemoryRefreshQueueRepository();
    queue.enqueue(makeRefreshRequest());
    const policy = new FixtureRefreshPolicyGateway();
    policy.runtime = {
      ...policy.runtime,
      health: { ...policy.runtime.health, status: "degraded" },
    };
    const adapter = new FixtureRefreshAdapter({});
    const executor = makeExecutor({
      queue,
      policy,
      adapters: [adapter],
      pipeline: new FixtureEvidencePipeline(makeIngestionOutcome()),
    });
    expect(await executor.processNextRefreshTask(context)).toMatchObject({
      status: "retry_scheduled",
      error_code: "SOURCE_HEALTH_DEGRADED",
    });
    expect(adapter.calls).toBe(0);
  });

  it.each([
    [{ source_changed: true }, "SOURCE_CHANGED", "failed", false],
    [{ auth_issue: true }, "AUTH_REQUIRED", "failed", false],
    [{ rate_limited: true }, "RATE_LIMITED", "retry_scheduled", true],
  ] as const)(
    "honors source-health metadata for %s",
    async (healthOverride, errorCode, status, retryable) => {
      const queue = new InMemoryRefreshQueueRepository();
      queue.enqueue(makeRefreshRequest());
      const policy = new FixtureRefreshPolicyGateway();
      policy.runtime = {
        ...policy.runtime,
        health: { ...policy.runtime.health, ...healthOverride },
      };
      const adapter = new FixtureRefreshAdapter({});
      const executor = makeExecutor({
        queue,
        policy,
        adapters: [adapter],
        pipeline: new FixtureEvidencePipeline(makeIngestionOutcome()),
      });
      expect(await executor.processNextRefreshTask(context)).toMatchObject({
        status,
        error_code: errorCode,
        retry: { retryable },
      });
      expect(adapter.calls).toBe(0);
    },
  );

  it("keeps a critical conflict explicit instead of selecting a silent winner", async () => {
    const queue = new InMemoryRefreshQueueRepository();
    queue.enqueue(
      makeRefreshRequest({
        reason: "SOURCE_CONFLICT",
        criticalFieldPaths: ["listing_price"],
        priorityInput: {
          ...makeRefreshRequest().priorityInput,
          reason: "SOURCE_CONFLICT",
          conflict: "critical",
          fieldCriticality: "critical",
        },
      }),
    );
    const pipeline = new FixtureEvidencePipeline(
      makeIngestionOutcome({
        changedFields: [],
        newConflictIds: ["source_conflict_price_101"],
        resolvedConflictIds: [],
      }),
    );
    const executor = makeExecutor({
      queue,
      policy: new FixtureRefreshPolicyGateway(),
      adapters: [new FixtureRefreshAdapter({})],
      pipeline,
    });
    expect(await executor.processNextRefreshTask(context)).toMatchObject({
      status: "succeeded",
      changed_fields: [],
      new_conflict_ids: ["source_conflict_price_101"],
      resolved_conflict_ids: [],
    });
  });

  it("keeps live src_dev_02 targeted refresh blocked by the real policy", async () => {
    const queue = new InMemoryRefreshQueueRepository();
    queue.enqueue(
      makeRefreshRequest({
        sourceId: "src_dev_02",
        entityId: "offer_vneshstroi_73124",
        targetUrls: ["https://vneshstroi.ru/kvartiry/73124/"],
        fieldPaths: ["listing_price"],
      }),
    );
    const adapter = new FixtureRefreshAdapter({}, "src_dev_02", "http");
    const pipeline = new FixtureEvidencePipeline(makeIngestionOutcome());
    const executor = makeExecutor({
      queue,
      policy: new RegistryRefreshPolicyGateway(),
      adapters: [adapter],
      pipeline,
    });
    const result = await executor.processNextRefreshTask({
      ...context,
      environment: "test",
      satisfiedConditions: ["TARGETED_UNIT_HTTP_POC_APPROVED"],
    });
    expect(result).toMatchObject({
      status: "blocked",
      error_code: "POLICY_DENIED",
      selected_method: null,
    });
    expect(adapter.calls).toBe(0);
    expect(pipeline.calls).toBe(0);
  });
});
