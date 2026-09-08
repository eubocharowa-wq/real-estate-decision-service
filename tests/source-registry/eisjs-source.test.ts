import { describe, expect, it } from "vitest";

import {
  sourcePolicyEngine,
  sourceRegistry,
} from "../../src/data-collection/source-registry";
import { EISJS_SOURCE_ID } from "../../src/data-collection/source-registry/config/pilot";

const DECIDED_AT = "2026-09-08T00:00:00.000Z";

describe("ЕИСЖС registry entry", () => {
  const entry = sourceRegistry.get(EISJS_SOURCE_ID);

  it("shares наш.дом.рф with the mortgage rules source under an explicit rule", () => {
    const shared = entry?.domains.find(
      (domain) => domain.hostname === "наш.дом.рф",
    );
    const financeShared = sourceRegistry
      .get("src_fin_01")
      ?.domains.find((domain) => domain.hostname === "наш.дом.рф");

    expect(shared?.shared_ownership_rule).toBeTruthy();
    // Both sides must name the same rule, or the registry refuses to build.
    expect(financeShared?.shared_ownership_rule).toBe(
      shared?.shared_ownership_rule,
    );
  });

  it("is an authoritative government source collected by hand", () => {
    expect(entry).toMatchObject({
      source_type: "government",
      trust_level: "authoritative",
      status: "manual_only",
    });
    expect(entry?.policy.automation).toBe("denied");
    expect(entry?.capabilities.collect).toBe("none");
  });

  it("may store and display normalized facts, with attribution", () => {
    expect(entry?.policy.storage.normalized_data).toBe("approved");
    expect(entry?.policy.storage.evidence_metadata).toBe("approved");
    expect(entry?.policy.display.normalized_facts).toBe("approved");
    expect(entry?.policy.display.raw_content).toBe("denied");
    expect(entry?.policy.attribution.attribution_required).toBe(true);
    expect(entry?.policy.attribution.link_required).toBe(true);
  });

  it("allows manual import in the pilot and denies automatic collection", () => {
    const manual = sourcePolicyEngine.resolve({
      sourceId: EISJS_SOURCE_ID,
      operation: "manual_import",
      environment: "pilot",
      requestedMethod: "manual",
      decidedAt: DECIDED_AT,
    });
    expect(manual.allowed).toBe(true);

    const automatic = sourcePolicyEngine.resolve({
      sourceId: EISJS_SOURCE_ID,
      operation: "scheduled_collect",
      environment: "pilot",
      requestedMethod: "http",
      targetUrls: ["https://наш.дом.рф/card"],
      requestedFields: ["physical.total_area_m2"],
      decidedAt: DECIDED_AT,
    });
    expect(automatic.allowed).toBe(false);
    expect(automatic.reasonCodes).toContain("METHOD_NOT_ALLOWED");
  });

  it("refuses a query-addressed card, which is how the source addresses them", () => {
    const decision = sourcePolicyEngine.resolve({
      sourceId: EISJS_SOURCE_ID,
      operation: "scheduled_collect",
      environment: "pilot",
      requestedMethod: "manual",
      targetUrls: ["https://наш.дом.рф/catalog?objId=123"],
      requestedFields: ["physical.total_area_m2"],
      decidedAt: DECIDED_AT,
    });

    expect(decision.reasonCodes).toContain("TARGET_URL_NOT_ALLOWED");
    expect(decision.validatedTargetUrls).toEqual([]);
  });
});
