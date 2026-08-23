import { describe, expect, it } from "vitest";

import { sourceRegistry } from "../../src/data-collection/source-registry";

const requiredPilotIds = [
  "src_dev_01",
  "src_dev_02",
  "src_dev_03",
  "src_dev_04",
  "src_dev_05",
  "src_dev_06",
  "src_mkt_01",
  "src_mkt_02",
  "src_mkt_03",
  "src_mkt_04",
  "src_fin_01",
  "src_fin_02",
  "src_geo_01",
] as const;

describe("pilot source matrix mapping", () => {
  it("contains every required pilot source exactly once", () => {
    const pilot = sourceRegistry
      .list()
      .filter((source) => source.source_id.startsWith("src_"));
    expect(pilot.map((source) => source.source_id).sort()).toEqual(
      [...requiredPilotIds].sort(),
    );
  });

  it("does not mark any pilot source production approved", () => {
    for (const id of requiredPilotIds) {
      const source = sourceRegistry.get(id)!;
      expect(source.approval_lifecycle).not.toBe("production_approved");
      expect(source.environment_approval.production.status).toBe("denied");
      expect(source.production_gate.production_approved).toBe(false);
    }
  });

  it.each([
    ["src_mkt_01", ["PARTNER_API_ONLY", "DO_NOT_AUTOCOLLECT"]],
    ["src_mkt_03", ["PARTNER_API_ONLY"]],
    [
      "src_mkt_04",
      ["REVIEW_REQUIRED", "PARTNER_API_ONLY", "DO_NOT_AUTOCOLLECT"],
    ],
    [
      "src_dev_06",
      ["PERMISSION_REQUIRED", "DO_NOT_AUTOCOLLECT", "MANUAL_ONLY"],
    ],
    ["src_geo_01", ["PARTNER_CHANNEL", "STORAGE_NOT_APPROVED"]],
    ["src_fin_01", ["REVIEW_REQUIRED"]],
  ])("preserves matrix conclusions for %s", (sourceId, reasons) => {
    expect(sourceRegistry.get(sourceId)?.policy.reason_codes).toEqual(reasons);
  });

  it("models field-specific authority without universal source ranking", () => {
    const government = sourceRegistry.get("src_fin_01")!;
    const developer = sourceRegistry.get("src_dev_02")!;
    expect(
      government.field_authority.find(
        (authority) => authority.field_pattern === "financing.program_rules.*",
      ),
    ).toMatchObject({ priority: 100, authority_type: "authoritative" });
    expect(
      developer.field_authority.find(
        (authority) => authority.field_pattern === "availability",
      ),
    ).toMatchObject({ priority: 85, authority_type: "primary" });
  });

  it("keeps map query/display and persistent storage permissions separate", () => {
    const maps = sourceRegistry.get("src_geo_01")!;
    expect(maps.policy.access).toBe("conditional");
    expect(maps.policy.display.normalized_facts).toBe("conditional");
    expect(maps.policy.storage.raw_content).toBe("denied");
    expect(maps.policy.storage.normalized_data).toBe("conditional");
  });
});
