import { describe, expect, it, vi } from "vitest";

import {
  FixtureSourcePolicyResolver,
  UserUrlIngestionOrchestrator,
  identifyUserUrlSource,
  validateUserUrl,
} from "../../src/user-url-ingestion";
import type { UserUrlIngestionAdapter } from "../../src/user-url-ingestion";

describe("source identification and policy gate", () => {
  it("never grants automatic collection to an unknown source", () => {
    const url = validateUserUrl("https://unknown.example/listing/1");
    if (!url.success) throw new Error("fixture URL invalid");
    const identification = identifyUserUrlSource(url.value);
    const decision = new FixtureSourcePolicyResolver().resolve(identification);
    expect(identification.knownSourceId).toBeNull();
    expect(decision).toMatchObject({
      mode: "manual_confirmation",
      canAutomate: false,
      reasonCode: "SOURCE_UNKNOWN",
    });
  });

  it("does not invoke an adapter when policy blocks the source", async () => {
    const collect = vi.fn();
    const adapter: UserUrlIngestionAdapter = {
      name: "spy",
      version: "v1",
      supports: () => true,
      collect,
    };
    const result = await new UserUrlIngestionOrchestrator({
      adapters: [adapter],
    }).preview("https://blocked.fixture.example/listing/apartment");
    expect(result.status).toBe("needs_confirmation");
    expect(result.policyDecision?.canAccess).toBe(false);
    expect(collect).not.toHaveBeenCalled();
  });

  it.each([
    "https://familia71.ru/object/1",
    "https://www.cian.ru/sale/flat/1/",
    "https://domclick.ru/card/1",
    "https://www.avito.ru/tula/kvartiry/1",
  ])(
    "does not invoke automation for restricted matrix source %s",
    async (url) => {
      const collect = vi.fn();
      const result = await new UserUrlIngestionOrchestrator({
        adapters: [
          { name: "spy", version: "v1", supports: () => true, collect },
        ],
      }).preview(url);
      expect(result.policyDecision?.canAutomate).toBe(false);
      expect(result.status).toBe("needs_confirmation");
      expect(collect).not.toHaveBeenCalled();
    },
  );

  it("creates a manual candidate for a restricted source without invoking automation", async () => {
    const collect = vi.fn();
    const result = await new UserUrlIngestionOrchestrator({
      adapters: [{ name: "spy", version: "v1", supports: () => true, collect }],
      now: () => new Date("2026-08-17T08:00:00.000Z"),
    }).preview("https://blocked.fixture.example/listing/1");
    const service = new UserUrlIngestionOrchestrator({
      now: () => new Date("2026-08-17T08:00:00.000Z"),
    });
    const outcome = service.confirm(result, {
      ...result.editableFields,
      title: "Объект, введённый вручную",
      city: "Тула",
      locationText: "Центральный район",
    });
    expect(collect).not.toHaveBeenCalled();
    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.candidate.evidence.length).toBeGreaterThan(0);
      expect(
        outcome.candidate.evidence.every(
          (item) =>
            item.evidence_type === "user_provided" &&
            item.verification_status === "unconfirmed",
        ),
      ).toBe(true);
    }
  });
});
