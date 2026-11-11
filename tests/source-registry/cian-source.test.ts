import { describe, expect, it } from "vitest";

import {
  CIAN_PROFILE,
  CIAN_SUPPORTED_FIELDS,
} from "../../src/data-collection/source-adapters";
import {
  sourcePolicyEngine,
  sourceRegistry,
  type ResolvePolicyInput,
} from "../../src/data-collection/source-registry";
import { CIAN_SOURCE_ID } from "../../src/data-collection/source-registry/config/pilot";

const DECIDED_AT = "2026-11-11T00:00:00.000Z";
const FLAT_CARD = "https://tula.cian.ru/sale/flat/308625197/";
const HOUSE_CARD = "https://tula.cian.ru/sale/suburban/327585364/";

const resolve = (overrides: Partial<ResolvePolicyInput> = {}) =>
  sourcePolicyEngine.resolve({
    sourceId: CIAN_SOURCE_ID,
    operation: "scheduled_collect",
    environment: "test",
    requestedMethod: "http",
    targetUrls: [FLAT_CARD],
    requestedFields: [...CIAN_SUPPORTED_FIELDS],
    satisfiedConditions: [],
    decidedAt: DECIDED_AT,
    ...overrides,
  });

describe("ЦИАН registry entry", () => {
  const entry = sourceRegistry.get(CIAN_SOURCE_ID);

  it("keeps automatic collection conditional on independent approvals", () => {
    expect(entry?.policy.automation).toBe("conditional");
    expect(entry?.policy.reason_codes).toContain("DO_NOT_AUTOCOLLECT");
    expect(entry?.environment_approval.production.status).toBe("denied");
  });

  it.each(["development", "test", "pilot", "production"] as const)(
    "allows no automatic method without approvals in %s",
    (environment) => {
      for (const requestedMethod of [
        "http",
        "browser",
        "openclaw",
        "api",
      ] as const) {
        const decision = resolve({ environment, requestedMethod });
        expect(decision.allowed).toBe(false);
        expect(decision.automation.allowed).toBe(false);
        expect(decision.reasonCodes).toContain("METHOD_NOT_ALLOWED");
        expect(decision.reasonCodes).not.toContain("AUTOMATION_ALLOWED");
      }
    },
  );

  it("can select one-card HTTP only after both scoped conditions", () => {
    const decision = resolve({
      satisfiedConditions: [
        "CIAN_NORMALIZED_DATA_USE_APPROVED",
        "CIAN_CARD_HTTP_ACCESS_APPROVED",
      ],
    });
    expect(decision.allowed).toBe(true);
    expect(decision.allowedMethods).toContain("http");
    expect(decision.allowedMethods).not.toContain("api");
  });

  it("still allows a person to enter a card by hand", () => {
    const manual = resolve({
      operation: "manual_import",
      requestedMethod: "manual",
      targetUrls: undefined,
      requestedFields: undefined,
    });
    expect(manual.allowed).toBe(true);
    expect(manual.allowedMethods).not.toContain("http");
  });

  it.each([FLAT_CARD, HOUSE_CARD])("scopes collection to %s", (card) => {
    const decision = resolve({ targetUrls: [card] });
    expect(decision.reasonCodes).not.toContain("TARGET_URL_NOT_ALLOWED");
    expect(decision.validatedTargetUrls).toEqual([card]);
    expect(decision.collectionScope).toMatchObject({
      explicit_targets_only: true,
      maximum_target_urls: 1,
      discovery_allowed: false,
      follow_links_allowed: false,
      pagination_allowed: false,
      sitemap_allowed: false,
      authentication_allowed: false,
      challenge_action: "stop",
    });
  });

  it.each([
    `${FLAT_CARD}?utm_source=x`,
    "https://tula.cian.ru/cat.php?deal_type=sale&offer_type=flat",
    "https://tula.cian.ru/kupit-kvartiru/",
    "https://tula.cian.ru/rent/flat/308625197/",
    "https://tula.cian.ru/sale/flat/308625197",
    "http://tula.cian.ru/sale/flat/308625197/",
  ])("refuses %s", (target) => {
    const decision = resolve({ targetUrls: [target] });
    expect(decision.reasonCodes).toContain("TARGET_URL_NOT_ALLOWED");
    expect(decision.validatedTargetUrls).toEqual([]);
  });

  it("refuses more than one card, discovery and pagination", () => {
    expect(
      resolve({ targetUrls: [FLAT_CARD, HOUSE_CARD] }).reasonCodes,
    ).toContain("TARGET_LIMIT_EXCEEDED");
    expect(resolve({ discovery: true }).reasonCodes).toContain(
      "DISCOVERY_NOT_ALLOWED",
    );
    expect(resolve({ pagination: true }).reasonCodes).toContain(
      "PAGINATION_NOT_ALLOWED",
    );
    expect(resolve({ followLinks: true }).reasonCodes).toContain(
      "LINK_TRAVERSAL_NOT_ALLOWED",
    );
  });

  it("allows exactly the adapter's facts and nothing personal", () => {
    expect(
      [...(entry?.policy.field_policy.allowed_fields ?? [])].sort(),
    ).toEqual([...CIAN_SUPPORTED_FIELDS].sort());
    expect(resolve().reasonCodes).not.toContain("FIELD_NOT_ALLOWED");
    for (const field of [
      "contact.phone",
      "seller.name",
      "listing.description",
      "media.photos",
      "availability",
    ])
      expect(resolve({ requestedFields: [field] }).reasonCodes).toContain(
        "FIELD_NOT_ALLOWED",
      );
  });

  it("caps every fact at claimed and retains no page content", () => {
    const ceilings = entry?.policy.field_policy.verification_ceilings ?? [];
    expect(ceilings.length).toBeGreaterThan(0);
    for (const ceiling of ceilings)
      expect(ceiling.maximum_status).toBe("claimed");
    expect(entry?.policy.retention_policy).toEqual({
      normalized_facts: "transient_only",
      evidence_metadata: "transient_only",
      raw_content: "prohibited",
      raw_snapshots: "prohibited",
    });
    expect(entry?.policy.display.raw_content).toBe("denied");
    expect(entry?.policy.display.image_media).toBe("denied");
  });

  it("agrees with the adapter profile", () => {
    expect(CIAN_PROFILE.sourceId).toBe(CIAN_SOURCE_ID);
    expect(CIAN_PROFILE.attributionLabel).toBe(
      entry?.policy.attribution.attribution_label,
    );
    expect(CIAN_PROFILE.collectionContract.retention).toEqual(
      entry?.policy.retention_policy,
    );
    expect(CIAN_PROFILE.collectionContract.maximumTargetUrls).toBe(
      entry?.policy.collection_scope.maximum_target_urls,
    );
  });
});
