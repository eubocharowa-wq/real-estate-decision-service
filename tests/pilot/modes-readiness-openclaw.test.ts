import { afterEach, describe, expect, it, vi } from "vitest";

import { sourcePolicyEngine } from "../../src/data-collection/source-registry";
import { BuyerJourneyApplication } from "../../src/buyer-journey";
import type { OpenClawExecutor } from "../../src/pilot-hardening";
import * as sourceReadinessModule from "../../src/pilot-hardening/source-readiness";
import {
  CURRENT_OPENCLAW_LIVE_DIAGNOSTIC,
  PILOT_MODE_POLICIES,
  createPilotRuntimeConfig,
  evaluateAllPilotSources,
  evaluateSourcePilotReadiness,
  executeControlledOpenClawCollection,
  isFeatureOperational,
  parseOpenClawStagedResult,
  resolvePilotRuntimeConfig,
} from "../../src/pilot-hardening";
import { OPENCLAW_STAGED_RESULT_FIXTURE } from "./fixtures/openclaw-staged-result";
import {
  GOLDEN_RAW_REQUEST,
  confirmParsedJourney,
} from "../buyer-journey/helpers";

const createPilotOpenClawInput = (
  execute: OpenClawExecutor["execute"],
): Parameters<typeof executeControlledOpenClawCollection>[0] => ({
  request: {
    request_id: "openclaw_request_001",
    controlled_mode: "targeted_refresh",
    environment: "pilot",
    collection_task: {
      schema_version: "1.0",
      task_id: "collection_task_openclaw_001",
      source_id: "src_dev_02",
      mode: "collect",
      target_urls: ["https://vneshstroi.ru/kvartiry/123/"],
      requested_fields: ["listing_price"],
      entity_type: "offer",
      freshness_requirement: "current_observation",
      priority: "high",
      created_at: "2026-08-24T00:00:00.000Z",
    },
    satisfied_conditions: ["TARGETED_UNIT_HTTP_POC_APPROVED"],
    requested_at: "2026-08-24T00:00:00.000Z",
  },
  runtimeConfig: createPilotRuntimeConfig({
    mode: "pilot",
    features: { openclaw_collection: true, live_source_poc: true },
    killSwitches: {
      openclaw_execution: false,
      live_source_adapter: false,
    },
  }),
  executor: { execute },
});

const mockCanonicalPolicyAndReadinessAllowed = (
  input: ReturnType<typeof createPilotOpenClawInput>,
) => {
  const canonicalDecision = sourcePolicyEngine.resolve({
    sourceId: input.request.collection_task.source_id,
    operation: "targeted_refresh",
    environment: input.request.environment,
    requestedMethod: "openclaw",
    targetUrls: input.request.collection_task.target_urls,
    requestedFields: input.request.collection_task.requested_fields,
    discovery: false,
    followLinks: false,
    pagination: false,
    sitemap: false,
    authentication: false,
    challengeAction: "stop",
    satisfiedConditions: input.request.satisfied_conditions,
    decidedAt: input.request.requested_at,
  });
  vi.spyOn(sourcePolicyEngine, "resolve").mockReturnValue({
    ...canonicalDecision,
    allowed: true,
    allowedMethods: ["openclaw"],
  });
  vi.spyOn(
    sourceReadinessModule,
    "evaluateSourcePilotReadiness",
  ).mockReturnValue({
    source_id: "src_dev_02",
    ready: true,
    blockers: [],
    warnings: [],
    approved_operations: ["targeted_refresh"],
    approved_environment: "pilot",
    policy_version: "test-readiness-allowed",
  });
};

afterEach(() => vi.restoreAllMocks());

describe("pilot modes and source readiness", async () => {
  it("centralizes mode datasets, operations and risky defaults", () => {
    expect(PILOT_MODE_POLICIES.demo.allowedOrigins).toContain("synthetic");
    expect(PILOT_MODE_POLICIES.pilot.allowedOrigins).not.toContain("synthetic");
    expect(PILOT_MODE_POLICIES.production.fixtureBacked).toEqual([]);

    const config = resolvePilotRuntimeConfig({
      REDS_APPLICATION_MODE: "pilot",
      REDS_FEATURE_OPENCLAW_COLLECTION: "true",
      REDS_KILL_OPENCLAW_EXECUTION: "true",
    });
    expect(config.mode).toBe("pilot");
    expect(config.cohort).toBe("internal_test");
    expect(
      isFeatureOperational(config, "openclaw_collection", "openclaw_execution"),
    ).toBe(false);
  });

  it("fails readiness closed for src_dev_02 and all current real sources", () => {
    const readiness = evaluateSourcePilotReadiness("src_dev_02");
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toContain("PILOT_APPROVAL_MISSING");
    expect(readiness.blockers).toContain("PILOT_ENVIRONMENT_NOT_APPROVED");
    expect(readiness.warnings).toContain("REFRESH_INTENTIONALLY_MANUAL");
    expect(evaluateAllPilotSources().some((source) => source.ready)).toBe(
      false,
    );
    expect(CURRENT_OPENCLAW_LIVE_DIAGNOSTIC).toMatchObject({
      selected_use_case: null,
      live_execution_enabled: false,
      blocker: "NO_PILOT_APPROVED_BROWSER_BENEFICIAL_SOURCE",
    });
  });

  it("does not load synthetic fixtures into pilot mode implicitly", async () => {
    const application = new BuyerJourneyApplication({
      clock: () => "2026-08-24T00:00:00.000Z",
      pilotRuntimeConfig: createPilotRuntimeConfig({ mode: "pilot" }),
    });
    const journey = await application.startBuyerJourney({
      sessionId: "session_pilot_no_fixture",
      rawRequestText: GOLDEN_RAW_REQUEST,
    });
    await confirmParsedJourney(application, journey);
    const result = await application.runJourneyMatching(journey.journey_id);
    expect(result.bundle.dataset_snapshot.dataset_type).toBe("empty_pilot");
    expect(result.bundle.entries).toEqual([]);
    expect(result.shortlist.cards).toEqual([]);
    expect(result.shortlist.datasetNotice).toContain(
      "Данных недостаточно для вывода",
    );
  });
});

describe("OpenClaw controlled boundary", async () => {
  it("accepts only scoped evidence-bearing staged facts, never canonical entities", () => {
    const plan = sourcePolicyEngine.resolveCollectionPlan({
      sourceId: "src_dev_02",
      operation: "scheduled_collect",
      environment: "test",
      entityType: "offer",
      requestedMethod: "http",
      targetUrls: ["https://vneshstroi.ru/kvartiry/123/"],
      requestedFields: ["listing_price"],
      discovery: false,
      followLinks: false,
      pagination: false,
      sitemap: false,
      authentication: false,
      challengeAction: "stop",
      satisfiedConditions: ["TARGETED_UNIT_HTTP_POC_APPROVED"],
      decidedAt: "2026-08-24T00:00:00.000Z",
    });
    const request = {
      request_id: "openclaw_request_fixture",
      controlled_mode: "verify" as const,
      environment: "test" as const,
      collection_task: {
        schema_version: "1.0" as const,
        task_id: "collection_task_openclaw_fixture",
        source_id: "src_dev_02",
        mode: "collect" as const,
        target_urls: ["https://vneshstroi.ru/kvartiry/123/"],
        requested_fields: ["listing_price"],
        entity_type: "offer" as const,
        freshness_requirement: "current_observation" as const,
        priority: "normal" as const,
        created_at: "2026-08-24T00:00:00.000Z",
      },
      satisfied_conditions: ["TARGETED_UNIT_HTTP_POC_APPROVED"],
      requested_at: "2026-08-24T00:00:00.000Z",
    };
    const parsed = parseOpenClawStagedResult(OPENCLAW_STAGED_RESULT_FIXTURE, {
      request,
      plan,
    });
    expect(parsed).toEqual(OPENCLAW_STAGED_RESULT_FIXTURE);
    expect(parsed).not.toHaveProperty("property");
    expect(parsed).not.toHaveProperty("offer");
    expect(parsed?.raw_content_reference).toBeNull();
    expect(
      parseOpenClawStagedResult(
        {
          ...OPENCLAW_STAGED_RESULT_FIXTURE,
          facts: [
            {
              ...OPENCLAW_STAGED_RESULT_FIXTURE.facts[0],
              verification_status: "confirmed",
            },
          ],
        },
        { request, plan },
      ),
    ).toBeNull();
    expect(
      parseOpenClawStagedResult(
        {
          ...OPENCLAW_STAGED_RESULT_FIXTURE,
          unexpected_agent_field: true,
        },
        { request, plan },
      ),
    ).toBeNull();
    expect(
      parseOpenClawStagedResult(
        {
          ...OPENCLAW_STAGED_RESULT_FIXTURE,
          facts: [
            {
              ...OPENCLAW_STAGED_RESULT_FIXTURE.facts[0],
              evidence: {
                ...OPENCLAW_STAGED_RESULT_FIXTURE.facts[0]!.evidence,
                evidence_reference: "",
              },
            },
          ],
        },
        { request, plan },
      ),
    ).toBeNull();
  });

  it("does not invoke executor when feature is enabled but policy/readiness deny", async () => {
    const execute = vi.fn<OpenClawExecutor["execute"]>();
    const result = await executeControlledOpenClawCollection(
      createPilotOpenClawInput(execute),
    );
    expect(result.status).toBe("blocked");
    expect(result.blocker_code).toBe("SOURCE_POLICY_DENIED");
    expect(result.executor_invoked).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not expose or honor caller-supplied policy/readiness overrides", async () => {
    type PublicExecutionInput = Parameters<
      typeof executeControlledOpenClawCollection
    >[0];
    const exposedOverrides: {
      readonly policyEngine: "policyEngine" extends keyof PublicExecutionInput
        ? true
        : false;
      readonly readinessEvaluator: "readinessEvaluator" extends keyof PublicExecutionInput
        ? true
        : false;
    } = { policyEngine: false, readinessEvaluator: false };
    expect(exposedOverrides).toEqual({
      policyEngine: false,
      readinessEvaluator: false,
    });

    const execute = vi.fn<OpenClawExecutor["execute"]>();
    const overridePolicy = vi.fn(() => {
      throw new Error("caller policy override must never run");
    });
    const overrideReadiness = vi.fn(() => {
      throw new Error("caller readiness override must never run");
    });
    const runtimeInputWithExtraKeys = {
      ...createPilotOpenClawInput(execute),
      policyEngine: { resolve: overridePolicy },
      readinessEvaluator: overrideReadiness,
    };
    const result = await executeControlledOpenClawCollection(
      runtimeInputWithExtraKeys,
    );
    expect(result.blocker_code).toBe("SOURCE_POLICY_DENIED");
    expect(result.executor_invoked).toBe(false);
    expect(overridePolicy).not.toHaveBeenCalled();
    expect(overrideReadiness).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not invoke executor when canonical policy allows but readiness denies", async () => {
    const execute = vi.fn<OpenClawExecutor["execute"]>();
    const input = createPilotOpenClawInput(execute);
    const canonicalDecision = sourcePolicyEngine.resolve({
      sourceId: input.request.collection_task.source_id,
      operation: "targeted_refresh",
      environment: input.request.environment,
      requestedMethod: "openclaw",
      targetUrls: input.request.collection_task.target_urls,
      requestedFields: input.request.collection_task.requested_fields,
      discovery: false,
      followLinks: false,
      pagination: false,
      sitemap: false,
      authentication: false,
      challengeAction: "stop",
      satisfiedConditions: input.request.satisfied_conditions,
      decidedAt: input.request.requested_at,
    });
    vi.spyOn(sourcePolicyEngine, "resolve").mockReturnValue({
      ...canonicalDecision,
      allowed: true,
      allowedMethods: ["openclaw"],
    });
    vi.spyOn(
      sourceReadinessModule,
      "evaluateSourcePilotReadiness",
    ).mockReturnValue({
      source_id: "src_dev_02",
      ready: false,
      blockers: ["PILOT_APPROVAL_MISSING"],
      warnings: [],
      approved_operations: ["targeted_refresh"],
      approved_environment: null,
      policy_version: "test-readiness-denied",
    });

    const result = await executeControlledOpenClawCollection(input);
    expect(result.status).toBe("blocked");
    expect(result.blocker_code).toBe("SOURCE_NOT_PILOT_READY");
    expect(result.executor_invoked).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("checks feature and kill switch before resolving the Collection Plan", async () => {
    const execute = vi.fn<OpenClawExecutor["execute"]>();
    const base = createPilotOpenClawInput(execute);
    mockCanonicalPolicyAndReadinessAllowed(base);
    const planSpy = vi.spyOn(sourcePolicyEngine, "resolveCollectionPlan");

    const featureDisabled = await executeControlledOpenClawCollection({
      ...base,
      runtimeConfig: createPilotRuntimeConfig({
        mode: "pilot",
        features: { openclaw_collection: false, live_source_poc: true },
        killSwitches: {
          openclaw_execution: false,
          live_source_adapter: false,
        },
      }),
    });
    expect(featureDisabled.blocker_code).toBe("FEATURE_DISABLED");
    expect(planSpy).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps an active kill switch ahead of Collection Plan and executor", async () => {
    const execute = vi.fn<OpenClawExecutor["execute"]>();
    const base = createPilotOpenClawInput(execute);
    mockCanonicalPolicyAndReadinessAllowed(base);
    const planSpy = vi.spyOn(sourcePolicyEngine, "resolveCollectionPlan");

    const killed = await executeControlledOpenClawCollection({
      ...base,
      runtimeConfig: createPilotRuntimeConfig({
        mode: "pilot",
        features: { openclaw_collection: true, live_source_poc: true },
        killSwitches: {
          openclaw_execution: true,
          live_source_adapter: false,
        },
      }),
    });
    expect(killed.blocker_code).toBe("KILL_SWITCH_ACTIVE");
    expect(planSpy).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("invokes the executor only with the canonical approved Collection Plan", async () => {
    const execute = vi.fn<OpenClawExecutor["execute"]>(async () => ({
      ...OPENCLAW_STAGED_RESULT_FIXTURE,
      request_id: "openclaw_request_001",
    }));
    const input = createPilotOpenClawInput(execute);
    mockCanonicalPolicyAndReadinessAllowed(input);

    const result = await executeControlledOpenClawCollection(input);
    expect(result.status).toBe("staged");
    expect(result.blocker_code).toBeNull();
    expect(result.plan).toMatchObject({
      allowed: true,
      preferredMethod: "openclaw",
      validatedTargetUrls: input.request.collection_task.target_urls,
      validatedRequestedFields: input.request.collection_task.requested_fields,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({
      request: input.request,
      plan: result.plan,
    });
  });

  it("keeps the kill switch independent of stored evidence and flags", () => {
    const config = createPilotRuntimeConfig({
      mode: "pilot",
      features: { openclaw_collection: true },
      killSwitches: { openclaw_execution: true },
    });
    expect(config.features.openclaw_collection).toBe(true);
    expect(config.killSwitches.openclaw_execution).toBe(true);
  });
});
