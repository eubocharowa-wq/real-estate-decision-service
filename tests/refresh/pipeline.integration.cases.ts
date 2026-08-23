import { describe, expect, it } from "vitest";

import {
  AffectedOnlyRefreshRecomputeHook,
  InMemoryRefreshQueueRepository,
  planScheduledRefreshes,
  RefreshExecutor,
  RefreshTaskService,
  type RefreshFieldCandidate,
} from "../../src/data-collection/refresh";
import {
  FixtureEvidencePipeline,
  FixtureRefreshAdapter,
  FixtureRefreshPolicyGateway,
  makeIngestionOutcome,
  NOW,
  TARGET_URL,
} from "./helpers";

const candidate = (
  overrides: Partial<RefreshFieldCandidate> = {},
): RefreshFieldCandidate => ({
  entityType: "offer",
  entityId: "offer_fixture_101",
  sourceId: "fixture_refresh",
  targetUrl: TARGET_URL,
  fieldPath: "listing_price",
  observedAt: "2026-08-20T12:00:00.000Z",
  validUntil: null,
  verificationStatus: "confirmed",
  criticality: "important",
  conflict: "none",
  volatility: "V1",
  freshnessPolicy: {
    field_pattern: "listing_price",
    volatility: "V1",
    target_ttl_hours: 6,
    stale_after_hours: 24,
    critical_after_hours: 72,
    valid_until_overrides: true,
    refresh_modes: ["targeted"],
  },
  sourceHealth: "healthy",
  userRequestPriority: "high",
  journeyStage: "comparison",
  requestedBy: "application",
  automaticRefreshAvailable: true,
  ...overrides,
});

const execute = async ({
  request,
  adapter,
  pipeline,
}: {
  request: NonNullable<
    ReturnType<typeof planScheduledRefreshes>[number]["request"]
  >;
  adapter: FixtureRefreshAdapter;
  pipeline: FixtureEvidencePipeline;
}) => {
  const queue = new InMemoryRefreshQueueRepository();
  const policy = new FixtureRefreshPolicyGateway();
  const service = new RefreshTaskService(queue, policy);
  service.enqueue(request, { environment: "test", satisfiedConditions: [] });
  const executor = new RefreshExecutor({
    queue,
    policy,
    adapters: [adapter],
    evidencePipeline: pipeline,
    recomputeHook: new AffectedOnlyRefreshRecomputeHook(),
  });
  return {
    result: await executor.processNextRefreshTask({
      environment: "test",
      satisfiedConditions: [],
      workerId: "worker_integration",
      now: NOW,
    }),
    queue,
    policy,
  };
};

describe("refresh orchestration integration", () => {
  it("stale price produces evidence, a changed field and narrow recompute", async () => {
    const plan = planScheduledRefreshes({
      now: NOW,
      candidates: [candidate()],
    })[0]!;
    expect(plan.reason).toBe("STALE_FIELD");
    const pipeline = new FixtureEvidencePipeline(makeIngestionOutcome());
    const execution = await execute({
      request: plan.request!,
      adapter: new FixtureRefreshAdapter({}),
      pipeline,
    });
    expect(execution.policy.calls).toHaveLength(2);
    expect(execution.result).toMatchObject({
      status: "succeeded",
      changed_fields: ["listing_price"],
      evidence_ids: ["evidence_refresh_price_101"],
      recompute: {
        match_result_pairs: [
          {
            user_request_id: "user_request_fixture_101",
            property_id: "property_fixture_101",
          },
        ],
      },
    });
  });

  it("critical unknown remains missing after a partial fixture result", async () => {
    const field = "financing.family_mortgage_applicability";
    const plan = planScheduledRefreshes({
      now: NOW,
      candidates: [
        candidate({
          fieldPath: field,
          observedAt: null,
          freshnessStatus: "unknown",
          verificationStatus: "unknown",
          criticality: "critical",
          freshnessPolicy: {
            ...candidate().freshnessPolicy!,
            field_pattern: "financing.*",
          },
        }),
      ],
    })[0]!;
    expect(plan.reason).toBe("CRITICAL_UNKNOWN");
    const adapter = new FixtureRefreshAdapter({
      status: "partial",
      observed_fields: [],
      missing_fields: [field],
    });
    const pipeline = new FixtureEvidencePipeline(
      makeIngestionOutcome({
        changedFields: [],
        unchangedFields: [],
        missingFields: [field],
        evidenceIds: [],
      }),
    );
    const execution = await execute({
      request: { ...plan.request!, maxAttempts: 1 },
      adapter,
      pipeline,
    });
    expect(execution.result).toMatchObject({
      status: "partial",
      changed_fields: [],
      missing_fields: [field],
      evidence_ids: [],
      retry: { retryable: false },
    });
    expect(execution.queue.list()[0]?.status).toBe("partial");
  });

  it("routes a critical conflict to manual review when automation is unavailable", () => {
    const plan = planScheduledRefreshes({
      now: NOW,
      candidates: [
        candidate({
          conflict: "critical",
          criticality: "critical",
          verificationStatus: "conflicting",
          automaticRefreshAvailable: false,
        }),
      ],
    })[0]!;
    expect(plan).toMatchObject({
      action: "manual_review_required",
      reason: "MANUAL_REVIEW_REQUEST",
      request: null,
    });
  });
});
