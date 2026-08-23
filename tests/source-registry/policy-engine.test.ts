import { describe, expect, it } from "vitest";

import {
  PILOT_SOURCE_REGISTRY_CONFIG,
  resolveRuntimeSourceEnvironment,
  SourcePolicyEngine,
  SourceRegistry,
  sourcePolicyEngine,
} from "../../src/data-collection/source-registry";
import type {
  RegistryCollectionMethod,
  SourceEnvironment,
  SourceOperation,
} from "../../src/data-collection/source-registry";

const DECIDED_AT = "2026-08-23T12:00:00.000Z";

const resolve = ({
  sourceId,
  operation = "user_url_ingest",
  environment = "test",
  requestedMethod,
  satisfiedConditions = [],
}: {
  sourceId: string | null;
  operation?: SourceOperation;
  environment?: SourceEnvironment;
  requestedMethod?: RegistryCollectionMethod;
  satisfiedConditions?: readonly string[];
}) =>
  sourcePolicyEngine.resolve({
    sourceId,
    operation,
    environment,
    requestedMethod,
    satisfiedConditions,
    decidedAt: DECIDED_AT,
  });

describe("source policy decisions", () => {
  it("resolves environments explicitly and rejects an invalid override", () => {
    expect(resolveRuntimeSourceEnvironment({ nodeEnvironment: "test" })).toBe(
      "test",
    );
    expect(
      resolveRuntimeSourceEnvironment({
        configuredEnvironment: "pilot",
        nodeEnvironment: "production",
      }),
    ).toBe("pilot");
    expect(() =>
      resolveRuntimeSourceEnvironment({
        configuredEnvironment: "typo",
        nodeEnvironment: "test",
      }),
    ).toThrow("Invalid SOURCE_POLICY_ENV");
  });

  it("allows an explicitly approved active fixture operation", () => {
    const decision = resolve({
      sourceId: "fixture_user_url",
      requestedMethod: "fixture_mock",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.access.allowed).toBe(true);
    expect(decision.automation.allowed).toBe(true);
    expect(decision.allowedMethods).toContain("fixture_mock");
  });

  it("allows a source under review in test but denies it in production", () => {
    const testDecision = resolve({
      sourceId: "fixture_review_source",
      requestedMethod: "fixture_mock",
    });
    const productionDecision = resolve({
      sourceId: "fixture_review_source",
      environment: "production",
      requestedMethod: "fixture_mock",
    });
    expect(testDecision.allowed).toBe(true);
    expect(productionDecision.allowed).toBe(false);
    expect(productionDecision.reasonCodes).toContain("PRODUCTION_NOT_APPROVED");
  });

  it("denies a permission-required source in production", () => {
    const decision = resolve({
      sourceId: "src_dev_01",
      environment: "production",
      operation: "scheduled_collect",
      requestedMethod: "browser",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toContain("PERMISSION_REQUIRED");
  });

  it("denies browser for partner-api-only and allows only configured API", () => {
    const browser = resolve({
      sourceId: "src_mkt_01",
      operation: "scheduled_collect",
      requestedMethod: "browser",
      satisfiedConditions: ["PARTNER_CONTRACT_CONFIGURED"],
    });
    const api = resolve({
      sourceId: "src_mkt_01",
      operation: "scheduled_collect",
      requestedMethod: "api",
      satisfiedConditions: ["PARTNER_CONTRACT_CONFIGURED"],
    });
    expect(browser.allowed).toBe(false);
    expect(browser.allowedMethods).not.toContain("browser");
    expect(browser.reasonCodes).toContain("PARTNER_API_ONLY");
    expect(api.allowed).toBe(true);
    expect(api.allowedMethods).toEqual(["api"]);
  });

  it("allows manual flow for manual-only source", () => {
    const decision = resolve({
      sourceId: "src_dev_06",
      environment: "production",
      requestedMethod: "manual",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.automation.allowed).toBe(false);
    expect(decision.allowedMethods).toContain("manual");
    expect(decision.reasonCodes).toContain("MANUAL_ONLY");
  });

  it("denies automatic operation for a blocked source", () => {
    const decision = resolve({
      sourceId: "blocked_fixture_source",
      requestedMethod: "fixture_mock",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toContain("SOURCE_BLOCKED");
  });

  it("fails closed for unknown automation but permits explicit manual input", () => {
    const automatic = resolve({
      sourceId: null,
      operation: "scheduled_collect",
      requestedMethod: "browser",
    });
    const manual = resolve({
      sourceId: null,
      requestedMethod: "user_supplied",
    });
    expect(automatic.allowed).toBe(false);
    expect(automatic.allowedMethods).toEqual([]);
    expect(automatic.reasonCodes).toContain("SOURCE_UNKNOWN");
    expect(manual.allowed).toBe(true);
    expect(manual.storage.normalizedData.allowed).toBe(true);
    expect(manual.display.normalizedFacts.allowed).toBe(true);
  });

  it("keeps access, storage, display and refresh decisions independent", () => {
    const config = structuredClone(PILOT_SOURCE_REGISTRY_CONFIG);
    const fixture = config.sources.find(
      (source) => source.source_id === "fixture_user_url",
    )!;
    fixture.policy.storage.normalized_data = "denied";
    fixture.policy.display.normalized_facts = "approved";
    fixture.policy.refresh.permission = "denied";
    const engine = new SourcePolicyEngine(new SourceRegistry(config));
    const common = {
      sourceId: "fixture_user_url",
      environment: "test" as const,
      decidedAt: DECIDED_AT,
    };
    const ingest = engine.resolve({
      ...common,
      operation: "user_url_ingest",
      requestedMethod: "fixture_mock",
    });
    const display = engine.resolve({ ...common, operation: "display" });
    const store = engine.resolve({ ...common, operation: "store" });
    expect(ingest.access.allowed).toBe(true);
    expect(ingest.storage.normalizedData.allowed).toBe(false);
    expect(ingest.display.normalizedFacts.allowed).toBe(true);
    expect(ingest.refresh.permission.allowed).toBe(false);
    expect(display.allowed).toBe(true);
    expect(store.allowed).toBe(false);
  });

  it("returns attribution requirements and is deterministic", () => {
    const input = {
      sourceId: "fixture_user_url",
      operation: "user_url_ingest" as const,
      environment: "test" as const,
      requestedMethod: "fixture_mock" as const,
      decidedAt: DECIDED_AT,
    };
    const first = sourcePolicyEngine.resolve(input);
    const second = sourcePolicyEngine.resolve(input);
    expect(first).toEqual(second);
    expect(first.attribution).toMatchObject({
      attribution_required: true,
      link_required: true,
      logo_allowed: false,
    });
  });
});
