import { describe, expect, it, vi } from "vitest";

import { sourcePolicyEngine } from "../../src/data-collection/source-registry";
import {
  RegistrySourcePolicyResolver,
  UserUrlIngestionOrchestrator,
} from "../../src/user-url-ingestion";
import type { UserUrlIngestionAdapter } from "../../src/user-url-ingestion";

const NOW = "2026-08-23T12:00:00.000Z";
const now = () => new Date(NOW);

describe("source policy integration", () => {
  it("routes fixture URL through identification, policy and allowed adapter", async () => {
    const service = new UserUrlIngestionOrchestrator({
      policyResolver: new RegistrySourcePolicyResolver({
        environment: "test",
        now,
      }),
      now,
    });
    const preview = await service.preview(
      "https://fixture.example/listing/apartment",
    );
    expect(preview.sourceIdentification).toMatchObject({
      knownSourceId: "fixture_user_url",
      policyStatus: "configured",
    });
    expect(preview.policyDecision).toMatchObject({
      mode: "fixture_mock",
      canAutomate: true,
      environment: "test",
    });
    expect(preview.rawResult?.adapterVersion).toBe("fixture-adapter-v1");
  });

  it("denies restricted browser automation and falls back to manual input", async () => {
    const collect = vi.fn();
    const adapter: UserUrlIngestionAdapter = {
      name: "must-not-run",
      version: "v1",
      supports: () => true,
      collect,
    };
    const service = new UserUrlIngestionOrchestrator({
      policyResolver: new RegistrySourcePolicyResolver({
        environment: "test",
        now,
      }),
      adapters: [adapter],
      now,
    });
    const preview = await service.preview("https://www.cian.ru/sale/flat/123/");
    expect(preview.sourceIdentification?.knownSourceId).toBe("src_mkt_01");
    expect(preview.policyDecision).toMatchObject({
      canAutomate: false,
      mode: "manual_confirmation",
      reasonCode: "PARTNER_API_ONLY",
    });
    expect(preview.policyDecision?.allowedMethods).toEqual(["manual"]);
    expect(collect).not.toHaveBeenCalled();
  });

  it("builds a field-aware collection plan from allowed methods only", () => {
    const plan = sourcePolicyEngine.resolveCollectionPlan({
      sourceId: "src_dev_02",
      operation: "scheduled_collect",
      environment: "test",
      entityType: "offer",
      targetField: "listing_price",
      requestedMethod: "http",
      targetUrls: ["https://vneshstroi.ru/kvartiry/12345/"],
      requestedFields: ["listing_price"],
      satisfiedConditions: ["TARGETED_UNIT_HTTP_POC_APPROVED"],
      decidedAt: NOW,
    });
    expect(plan).toMatchObject({
      allowed: true,
      preferredMethod: "http",
      fallbackMethods: [],
      targetField: "listing_price",
      validatedTargetUrls: ["https://vneshstroi.ru/kvartiry/12345/"],
      validatedRequestedFields: ["listing_price"],
      fieldCoverage: { support: "full" },
      freshnessPolicy: {
        target_ttl_hours: 24,
        stale_after_hours: 72,
        critical_after_hours: 168,
        valid_until_overrides: false,
      },
      fieldAuthority: { priority: 90, authority_type: "primary" },
    });
  });

  it("distinguishes an unsupported field from an empty source result", () => {
    const plan = sourcePolicyEngine.resolveCollectionPlan({
      sourceId: "src_dev_02",
      operation: "scheduled_collect",
      environment: "test",
      entityType: "offer",
      targetField: "legal.title_report",
      requestedMethod: "http",
      targetUrls: ["https://vneshstroi.ru/kvartiry/12345/"],
      requestedFields: ["legal.title_report"],
      satisfiedConditions: ["TARGETED_UNIT_HTTP_POC_APPROVED"],
      decidedAt: NOW,
    });
    expect(plan.allowed).toBe(false);
    expect(plan.fieldCoverage).toBeNull();
    expect(plan.reasonCodes).toContain("FIELD_NOT_COVERED");
  });

  it("uses a degraded fallback without introducing a denied method", () => {
    const degraded = sourcePolicyEngine.resolveCollectionPlan({
      sourceId: "src_fin_02",
      operation: "scheduled_collect",
      environment: "test",
      targetField: "financing.rate",
      satisfiedConditions: ["ACCESS_REVIEW_CONFIRMED"],
      decidedAt: NOW,
      healthOverride: {
        status: "degraded",
        recent_success_rate: 0.5,
        recent_error_rate: 0.5,
        last_successful_run_at: NOW,
        source_changed: true,
        auth_issue: false,
        rate_limited: false,
        reason_codes: ["SOURCE_CHANGED"],
      },
    });
    expect(degraded.preferredMethod).toBe("browser");
    expect(degraded.reasonCodes).toEqual(
      expect.arrayContaining(["SOURCE_DEGRADED", "SOURCE_CHANGED"]),
    );

    const partnerOnly = sourcePolicyEngine.resolveCollectionPlan({
      sourceId: "src_mkt_01",
      operation: "scheduled_collect",
      environment: "test",
      targetField: "listing_price",
      satisfiedConditions: ["PARTNER_CONTRACT_CONFIGURED"],
      decidedAt: NOW,
      healthOverride: {
        status: "degraded",
        recent_success_rate: 0.5,
        recent_error_rate: 0.5,
        last_successful_run_at: NOW,
        source_changed: false,
        auth_issue: false,
        rate_limited: false,
        reason_codes: ["RECENT_FAILURES"],
      },
    });
    expect(partnerOnly.preferredMethod).toBe("api");
    expect(partnerOnly.fallbackMethods).not.toContain("browser");
    expect(partnerOnly.fallbackMethods).not.toContain("openclaw");
  });
});
