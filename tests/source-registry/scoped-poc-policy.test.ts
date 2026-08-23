import { describe, expect, it } from "vitest";

import {
  sourcePolicyEngine,
  sourceRegistry,
  type ResolvePolicyInput,
} from "../../src/data-collection/source-registry";

const DECIDED_AT = "2026-08-23T12:00:00.000Z";
const APPROVAL = "TARGETED_UNIT_HTTP_POC_APPROVED";
const UNIT_URL = "https://vneshstroi.ru/kvartiry/12345/";

const approvedInput: ResolvePolicyInput = {
  sourceId: "src_dev_02",
  operation: "scheduled_collect",
  environment: "test",
  requestedMethod: "http",
  targetUrls: [UNIT_URL],
  requestedFields: [
    "identity.unit_id",
    "physical.rooms",
    "physical.floor",
    "physical.total_area_m2",
    "listing_price",
    "timeline.handover_date",
    "availability",
  ],
  discovery: false,
  followLinks: false,
  pagination: false,
  sitemap: false,
  authentication: false,
  challengeAction: "stop",
  satisfiedConditions: [APPROVAL],
  decidedAt: DECIDED_AT,
};

const resolve = (overrides: Partial<ResolvePolicyInput> = {}) =>
  sourcePolicyEngine.resolve({ ...approvedInput, ...overrides });

describe("src_dev_02 targeted unit HTTP PoC policy", () => {
  it.each(["development", "test"] as const)(
    "allows one approved explicit unit URL over HTTP in %s",
    (environment) => {
      const decision = resolve({ environment });
      expect(decision.allowed).toBe(true);
      expect(decision.allowedMethods).toEqual(["http"]);
      expect(decision.validatedTargetUrls).toEqual([UNIT_URL]);
      expect(decision.validatedRequestedFields).toEqual(
        approvedInput.requestedFields,
      );
      expect(decision.reasonCodes).toContain("POLICY_ALLOWED");
    },
  );

  it("encodes the narrow approval without reusing the general access condition", () => {
    const source = sourceRegistry.get("src_dev_02")!;
    expect(source.approval_lifecycle).toBe("testing");
    expect(source.policy.required_conditions).toEqual([APPROVAL]);
    expect(JSON.stringify(source)).not.toContain("ACCESS_REVIEW_CONFIRMED");
    expect(source.policy.methods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "http",
          operations: ["scheduled_collect"],
          required_conditions: [APPROVAL],
        }),
      ]),
    );
    expect(source.policy.methods.map((method) => method.method)).not.toContain(
      "browser",
    );
    expect(source.policy.methods.map((method) => method.method)).not.toContain(
      "openclaw",
    );
  });

  it.each(["browser", "openclaw"] as const)(
    "denies the %s collection method",
    (requestedMethod) => {
      const decision = resolve({ requestedMethod });
      expect(decision.allowed).toBe(false);
      expect(decision.allowedMethods).not.toContain(requestedMethod);
      expect(decision.reasonCodes).toContain("METHOD_NOT_ALLOWED");
    },
  );

  it.each([
    ["catalog URL", "https://vneshstroi.ru/kvartiry/"],
    ["different host", "https://example.com/kvartiry/12345/"],
    ["wrong path", "https://vneshstroi.ru/projects/12345/"],
  ])("denies a %s", (_case, targetUrl) => {
    const decision = resolve({ targetUrls: [targetUrl] });
    expect(decision.allowed).toBe(false);
    expect(decision.allowedMethods).toEqual([]);
    expect(decision.validatedTargetUrls).toEqual([]);
    expect(decision.reasonCodes).toContain("TARGET_URL_NOT_ALLOWED");
  });

  it("denies more than one target URL", () => {
    const decision = resolve({
      targetUrls: [UNIT_URL, "https://www.vneshstroi.ru/kvartiry/67890/"],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.validatedTargetUrls).toEqual([]);
    expect(decision.reasonCodes).toContain("TARGET_LIMIT_EXCEEDED");
  });

  it("denies a field outside the factual allowlist", () => {
    const decision = resolve({ requestedFields: ["financing.rate"] });
    expect(decision.allowed).toBe(false);
    expect(decision.validatedRequestedFields).toEqual([]);
    expect(decision.reasonCodes).toContain("FIELD_NOT_ALLOWED");
    expect(decision.fieldPolicy.verification_ceilings).toEqual(
      expect.arrayContaining([
        { field_pattern: "financing.*", maximum_status: "claimed" },
        { field_pattern: "promotion.*", maximum_status: "claimed" },
        { field_pattern: "marketing.*", maximum_status: "claimed" },
      ]),
    );
  });

  it.each([
    ["discovery", { discovery: true }, "DISCOVERY_NOT_ALLOWED"],
    ["link traversal", { followLinks: true }, "LINK_TRAVERSAL_NOT_ALLOWED"],
    ["pagination", { pagination: true }, "PAGINATION_NOT_ALLOWED"],
    ["sitemap", { sitemap: true }, "SITEMAP_NOT_ALLOWED"],
  ] as const)("denies %s", (_case, override, reasonCode) => {
    const decision = resolve(override);
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toContain(reasonCode);
  });

  it("denies authentication and challenge bypass", () => {
    const authentication = resolve({ authentication: true });
    const bypass = resolve({ challengeAction: "bypass" });
    expect(authentication.allowed).toBe(false);
    expect(authentication.reasonCodes).toContain("AUTHENTICATION_NOT_ALLOWED");
    expect(bypass.allowed).toBe(false);
    expect(bypass.reasonCodes).toContain("CHALLENGE_ACTION_NOT_ALLOWED");
  });

  it.each(["pilot", "production"] as const)(
    "denies automatic collection in %s",
    (environment) => {
      const decision = resolve({ environment });
      expect(decision.allowed).toBe(false);
      expect(decision.allowedMethods).toEqual([]);
      expect(decision.reasonCodes).toContain("ENVIRONMENT_NOT_APPROVED");
    },
  );

  it("denies refresh", () => {
    const decision = resolve({ operation: "targeted_refresh" });
    expect(decision.allowed).toBe(false);
    expect(decision.refresh.permission.allowed).toBe(false);
    expect(decision.reasonCodes).toContain("REFRESH_NOT_APPROVED");
  });

  it("denies raw storage and raw display while requiring link attribution", () => {
    const decision = resolve();
    expect(decision.storage.rawContent.allowed).toBe(false);
    expect(decision.storage.snapshots.allowed).toBe(false);
    expect(decision.display.evidenceSnippet.allowed).toBe(false);
    expect(decision.display.rawContent.allowed).toBe(false);
    expect(decision.display.imageMedia.allowed).toBe(false);
    expect(decision.attribution).toMatchObject({
      attribution_required: true,
      attribution_label: "ВНЕШСТРОЙ",
      link_required: true,
      logo_allowed: false,
    });
    expect(decision.retentionPolicy).toEqual({
      normalized_facts: "transient_only",
      evidence_metadata: "transient_only",
      raw_content: "prohibited",
      raw_snapshots: "prohibited",
    });
    expect(decision.fieldPolicy.required_evidence_metadata).toEqual([
      "source_url",
      "observed_at",
    ]);
  });

  it("fails closed without the scoped approval condition", () => {
    const decision = resolve({ satisfiedConditions: [] });
    expect(decision.allowed).toBe(false);
    expect(decision.missingConditions).toContain(APPROVAL);
    expect(decision.reasonCodes).toContain("REQUIRED_CONDITION_MISSING");
  });

  it("fails closed when target or field scope is missing", () => {
    const noTargets = resolve({ targetUrls: undefined });
    const noFields = resolve({ requestedFields: undefined });
    expect(noTargets.allowed).toBe(false);
    expect(noTargets.reasonCodes).toContain("TARGET_SCOPE_REQUIRED");
    expect(noFields.allowed).toBe(false);
    expect(noFields.reasonCodes).toContain("REQUESTED_FIELDS_REQUIRED");
  });

  it("returns only validated target and field scope in a collection plan", () => {
    const plan = sourcePolicyEngine.resolveCollectionPlan({
      ...approvedInput,
      entityType: "offer",
      targetField: "listing_price",
    });
    expect(plan.allowed).toBe(true);
    expect(plan.preferredMethod).toBe("http");
    expect(plan.fallbackMethods).toEqual([]);
    expect(plan.validatedTargetUrls).toEqual([UNIT_URL]);
    expect(plan.validatedRequestedFields).toEqual(
      approvedInput.requestedFields,
    );

    const deniedPlan = sourcePolicyEngine.resolveCollectionPlan({
      ...approvedInput,
      targetUrls: ["https://vneshstroi.ru/kvartiry/"],
      targetField: "listing_price",
    });
    expect(deniedPlan.allowed).toBe(false);
    expect(deniedPlan.preferredMethod).toBeNull();
    expect(deniedPlan.validatedTargetUrls).toEqual([]);
    expect(deniedPlan.validatedRequestedFields).toEqual([]);
  });
});
