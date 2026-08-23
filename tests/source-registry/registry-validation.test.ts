import { describe, expect, it } from "vitest";

import {
  PILOT_SOURCE_REGISTRY_CONFIG,
  SourceRegistry,
  sourceRegistry,
} from "../../src/data-collection/source-registry";

const cloneConfig = () => structuredClone(PILOT_SOURCE_REGISTRY_CONFIG);

describe("source registry validation", () => {
  it("loads unique stable source IDs with a policy version", () => {
    const ids = sourceRegistry.list().map((source) => source.source_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sourceRegistry.config.registry_version).toBeTruthy();
    expect(sourceRegistry.config.policy_version).toBeTruthy();
  });

  it("rejects invalid domains", () => {
    const config = cloneConfig();
    config.sources[0]!.domains[0]!.hostname = "invalid.example/path";
    expect(() => new SourceRegistry(config)).toThrow("Invalid source domain");
  });

  it("rejects missing scoped policy contracts", () => {
    const config = cloneConfig();
    const source = config.sources[0]!;
    delete (source.policy as Partial<typeof source.policy>).collection_scope;
    expect(() => new SourceRegistry(config)).toThrow("Invalid source registry");
  });

  it("rejects collection hosts outside source ownership", () => {
    const config = cloneConfig();
    config.sources[0]!.policy.collection_scope.allowed_hosts = [
      "outside.example",
    ];
    expect(() => new SourceRegistry(config)).toThrow(
      "Collection scope host is outside source ownership",
    );
  });

  it("rejects unanchored collection path patterns", () => {
    const config = cloneConfig();
    config.sources[0]!.policy.collection_scope.allowed_path_patterns = [
      "/kvartiry/.*",
    ];
    expect(() => new SourceRegistry(config)).toThrow(
      "Collection path pattern must be anchored",
    );
  });

  it("rejects invalid source types and statuses at runtime", () => {
    const source = sourceRegistry.list()[0]!;
    expect(
      () =>
        new SourceRegistry({
          ...PILOT_SOURCE_REGISTRY_CONFIG,
          sources: [{ ...source, source_type: "invented_source_type" }],
        }),
    ).toThrow("Invalid source registry");
    expect(
      () =>
        new SourceRegistry({
          ...PILOT_SOURCE_REGISTRY_CONFIG,
          sources: [{ ...source, status: "implicitly_allowed" }],
        }),
    ).toThrow("Invalid source registry");
  });

  it("rejects duplicate domain ownership without an explicit shared rule", () => {
    const source = structuredClone(sourceRegistry.list()[0]!);
    expect(
      () =>
        new SourceRegistry({
          ...PILOT_SOURCE_REGISTRY_CONFIG,
          sources: [
            source,
            { ...source, source_id: "src_duplicate_domain_owner" },
          ],
        }),
    ).toThrow("Duplicate domain ownership without explicit rule");
  });

  it("rejects an incomplete production approval", () => {
    const config = cloneConfig();
    config.sources[0]!.environment_approval.production.status = "approved";
    expect(() => new SourceRegistry(config)).toThrow(
      "Production approval is incomplete",
    );

    const inconsistentGate = cloneConfig();
    inconsistentGate.sources[0]!.production_gate.production_approved = true;
    expect(() => new SourceRegistry(inconsistentGate)).toThrow(
      "Production approval is incomplete",
    );
  });

  it("accepts credential references but rejects secret-like values", () => {
    const validReference = cloneConfig();
    const cian = validReference.sources.find(
      (source) => source.source_id === "src_mkt_01",
    )!;
    expect(cian.policy.methods[0]!.credential_ref).toBe(
      "CIAN_PARTNER_ACCESS_KEY",
    );
    expect(() => new SourceRegistry(validReference)).not.toThrow();

    const leakedValue = cloneConfig();
    const leakedCian = leakedValue.sources.find(
      (source) => source.source_id === "src_mkt_01",
    )!;
    leakedCian.policy.methods[0]!.credential_ref = "actual-secret-value";
    expect(() => new SourceRegistry(leakedValue)).toThrow(
      "Invalid source registry",
    );
  });
});
