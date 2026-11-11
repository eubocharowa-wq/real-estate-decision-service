import { describe, expect, it } from "vitest";

import { AVITO_SUPPORTED_FIELDS } from "../../src/data-collection/source-adapters";
import {
  AVITO_SOURCE_ID,
  sourcePolicyEngine,
  sourceRegistry,
} from "../../src/data-collection/source-registry";

const CARD =
  "https://www.avito.ru/tula/kvartiry/2-k._kvartira_473_m_716_et._8437781969";
const decide = (
  targetUrls: readonly string[] = [CARD],
  satisfiedConditions: readonly string[] = [],
  environment: "test" | "production" = "test",
) =>
  sourcePolicyEngine.resolve({
    sourceId: AVITO_SOURCE_ID,
    operation: "scheduled_collect",
    environment,
    requestedMethod: "http",
    targetUrls,
    requestedFields: [...AVITO_SUPPORTED_FIELDS],
    discovery: false,
    followLinks: false,
    pagination: false,
    sitemap: false,
    authentication: false,
    challengeAction: "stop",
    satisfiedConditions,
    decidedAt: "2026-11-11T12:00:00.000Z",
  });

describe("Avito source policy", () => {
  it("is a separate conditional source and is denied by default", () => {
    const source = sourceRegistry.get(AVITO_SOURCE_ID);
    expect(source?.policy.automation).toBe("conditional");
    expect(source?.policy.reason_codes).toContain("DO_NOT_AUTOCOLLECT");
    expect(decide().allowed).toBe(false);
  });

  it("requires both access and normalized-use conditions", () => {
    expect(decide([CARD], ["AVITO_CARD_HTTP_ACCESS_APPROVED"]).allowed).toBe(
      false,
    );
    const allowed = decide(
      [CARD],
      ["AVITO_CARD_HTTP_ACCESS_APPROVED", "AVITO_NORMALIZED_DATA_USE_APPROVED"],
    );
    expect(allowed.allowed).toBe(true);
    expect(allowed.validatedTargetUrls).toEqual([CARD]);
  });

  it("remains denied in production even if both test conditions are supplied", () => {
    expect(
      decide(
        [CARD],
        [
          "AVITO_CARD_HTTP_ACCESS_APPROVED",
          "AVITO_NORMALIZED_DATA_USE_APPROVED",
        ],
        "production",
      ).allowed,
    ).toBe(false);
  });

  it.each([
    "https://www.avito.ru/tula/kvartiry?query=flat",
    "https://www.avito.ru/tula/kvartiry",
    `${CARD}?context=x`,
    "https://example.com/tula/kvartiry/card_123",
  ])("refuses non-card target %s", (target) => {
    expect(
      decide(
        [target],
        [
          "AVITO_CARD_HTTP_ACCESS_APPROVED",
          "AVITO_NORMALIZED_DATA_USE_APPROVED",
        ],
      ).reasonCodes,
    ).toContain("TARGET_URL_NOT_ALLOWED");
  });

  it("keeps raw content, media, snippets and seller fields out", () => {
    const source = sourceRegistry.get(AVITO_SOURCE_ID)!;
    expect(source.policy.retention_policy.raw_content).toBe("prohibited");
    expect(source.policy.display).toMatchObject({
      raw_content: "denied",
      evidence_snippet: "denied",
      image_media: "denied",
    });
    expect(source.policy.field_policy.allowed_fields).toEqual(
      AVITO_SUPPORTED_FIELDS,
    );
    expect(source.policy.field_policy.allowed_fields).not.toContain(
      "seller.name",
    );
  });
});
