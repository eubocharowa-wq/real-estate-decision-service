import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../../app/api/buyer-journeys/route";
import { resetBuyerJourneyRuntimeForTests } from "../../src/buyer-journey";
import { readCuratedPilotCandidateFiles } from "../../src/pilot-hardening/curated-dataset";
import {
  confirmRequest,
  createConfirmationSession,
} from "../../src/request-confirmation";
import {
  parseUserRequest,
  userRequestParserOutcomeSchema,
} from "../../src/user-request-parser";
import type { ShortlistCardView } from "../../src/shortlist";

/**
 * Follow-up to the P0 pilot slice: regression coverage for "обычные русские
 * запросы дают правильный подбор" (city in any grammatical case, an unknown
 * object city not excluding the object, colloquial room-count words, and a
 * mandatory city). See src/geography, src/user-request-parser/extraction.ts
 * and src/request-confirmation/state.ts for the implementation.
 */

const post = (body: unknown) =>
  POST(
    new Request("http://local.test/api/buyer-journeys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const originalApplicationMode = process.env.REDS_APPLICATION_MODE;
const originalDatabaseUrl = process.env.DATABASE_URL;

describe("P0 follow-up: ordinary Russian requests match correctly", () => {
  describe("через реальный HTTP route, режим pilot, реальные curated-объекты", () => {
    beforeEach(() => {
      process.env.REDS_APPLICATION_MODE = "pilot";
      delete process.env.DATABASE_URL;
      resetBuyerJourneyRuntimeForTests();
    });

    afterEach(() => {
      if (originalApplicationMode === undefined)
        delete process.env.REDS_APPLICATION_MODE;
      else process.env.REDS_APPLICATION_MODE = originalApplicationMode;
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      resetBuyerJourneyRuntimeForTests();
    });

    it("«Квартиру в Туле до 6 млн» returns a non-empty shortlist and flags unconfirmed-city objects instead of dropping them", async () => {
      const started = await post({
        action: "start_and_parse",
        sessionId: "session_p0_followup_tula",
        rawRequestText: "Квартиру в Туле до 6 млн",
      });
      expect(started.status).toBe(201);
      const startedBody: unknown = await started.json();
      const journey = Reflect.get(startedBody as object, "journey") as {
        journey_id: string;
      };
      const parserOutcome = userRequestParserOutcomeSchema.parse(
        Reflect.get(startedBody as object, "parserOutcome"),
      );
      if (!parserOutcome.success) throw new Error(parserOutcome.error.message);
      expect(parserOutcome.result.parsed_request.location.cities).toEqual([
        "Тула",
      ]);
      expect(parserOutcome.result.confirmation_view.can_confirm).toBe(true);

      const confirmation = confirmRequest(
        createConfirmationSession(parserOutcome.result),
        "2026-08-15T00:00:00.000Z",
      ).confirmation_result;
      expect(confirmation).not.toBeNull();

      const confirmed = await post({
        action: "confirm_and_match",
        journeyId: journey.journey_id,
        sessionId: "session_p0_followup_tula",
        confirmationResult: confirmation,
      });
      expect(confirmed.status).toBe(200);

      const shortlist = await post({
        action: "shortlist",
        journeyId: journey.journey_id,
        sessionId: "session_p0_followup_tula",
      });
      expect(shortlist.status).toBe(200);
      const shortlistBody: unknown = await shortlist.json();
      const cards = Reflect.get(
        Reflect.get(shortlistBody as object, "view") as object,
        "cards",
      ) as readonly ShortlistCardView[];

      // Every real-pilot candidate on disk must reach the shortlist — none
      // silently dropped. Read dynamically rather than hardcoding a count,
      // the same reasoning as the migration-count fix in
      // tests/staging/readiness.postgres.test.ts: this must not go stale as
      // candidates are added. This is also the regression guard for a
      // reported live-site discrepancy (shortlist showed 4 of the 5
      // real-pilot objects): investigated and could not reproduce on this
      // code — every code path checked (validator, result_limit, the
      // availability/freshness/price/market-type fields, which are
      // identical across all 5 candidates, dedup, and the shortlist's
      // React key) returns all of them; this assertion locks in the
      // correct count so a future regression fails loudly instead of
      // silently dropping a candidate again.
      const realPilotCandidateCount = readCuratedPilotCandidateFiles().length;
      expect(cards.length).toBe(realPilotCandidateCount);

      const unconfirmedCityCards = cards.filter((card) =>
        card.criticalUnknowns.includes("Город не подтверждён"),
      );
      // The real curated dataset has two objects with address.city === null
      // (data/examples/real-pilot/candidates) — they must still reach the
      // shortlist, flagged, not be silently dropped.
      expect(unconfirmedCityCards.length).toBeGreaterThan(0);

      // Every real candidate here has an unconfirmed price (listing_price
      // is null for all 5), so none is eligibilityStatus "eligible" — none
      // may claim "100% подходит" / "Именно под ваши условия".
      for (const card of cards) {
        expect(card.eligibilityStatus).not.toBe("eligible");
        expect(card.matchLabel).not.toContain("%");
        expect(card.matchContext).not.toBe("Именно под ваши условия");
      }

      // Ordering: src/shortlist/policy.ts sorts by Match Score first, then
      // by Data Confidence as a tiebreaker (never by city specifically —
      // AGENTS.md §13/§16 keep Match Score and Data Confidence separate
      // scores). All five real candidates tie on Match Score here, so Data
      // Confidence alone decides the order; an unconfirmed city is one of
      // the unknowns that lowers it, so every confirmed-city card ends up
      // ahead of every unconfirmed-city one.
      const lastConfirmedIndex = cards.findLastIndex(
        (card) => !card.criticalUnknowns.includes("Город не подтверждён"),
      );
      const firstUnconfirmedIndex = cards.findIndex((card) =>
        card.criticalUnknowns.includes("Город не подтверждён"),
      );
      expect(lastConfirmedIndex).toBeLessThan(firstUnconfirmedIndex);
    });
  });

  it("«квартиру в туле до 6 млн» (всё строчными) recognizes Тула from the directory", async () => {
    const outcome = await parseUserRequest({
      schema_version: "1.0",
      raw_text: "квартиру в туле до 6 млн",
      locale: "ru-RU",
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) throw new Error(outcome.error.message);

    expect(outcome.result.parsed_request.location.cities).toEqual(["Тула"]);
  });

  it("«Двушка в Туле до 6 млн» extracts city Тула, rooms 2, budget 6 000 000", async () => {
    const outcome = await parseUserRequest({
      schema_version: "1.0",
      raw_text: "Двушка в Туле до 6 млн",
      locale: "ru-RU",
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) throw new Error(outcome.error.message);

    expect(outcome.result.parsed_request.location.cities).toEqual(["Тула"]);
    expect(outcome.result.parsed_request.property.rooms_min).toBe(2);
    expect(outcome.result.parsed_request.property.rooms_max).toBe(2);
    expect(outcome.result.parsed_request.budget.purchase_price.maximum).toEqual(
      { amount: "6000000.00", currency: "RUB" },
    );
  });

  it("«Квартира до 6 млн, город пока не выбрали» does not confirm and produces no shortlist", async () => {
    const outcome = await parseUserRequest({
      schema_version: "1.0",
      raw_text: "Квартира до 6 млн, город пока не выбрали",
      locale: "ru-RU",
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) throw new Error(outcome.error.message);

    expect(outcome.result.parsed_request.location.cities).toEqual([]);
    expect(outcome.result.confirmation_view.can_confirm).toBe(false);

    const confirmation = confirmRequest(
      createConfirmationSession(outcome.result),
      "2026-08-15T00:00:00.000Z",
    ).confirmation_result;
    expect(confirmation).toBeNull();
  });

  it("«хочу однушку в новостройке» extracts rooms 1 and raises critical clarifications for both city and budget", async () => {
    const outcome = await parseUserRequest({
      schema_version: "1.0",
      raw_text: "хочу однушку в новостройке",
      locale: "ru-RU",
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) throw new Error(outcome.error.message);
    const result = outcome.result;

    expect(result.parsed_request.property.rooms_min).toBe(1);
    expect(result.parsed_request.property.rooms_max).toBe(1);
    expect(result.unknowns).toContainEqual(
      expect.objectContaining({
        field: "location.city",
        materiality: "critical",
      }),
    );
    expect(result.unknowns).toContainEqual(
      expect.objectContaining({
        field: "budget.amount",
        materiality: "critical",
      }),
    );
    expect(result.clarification_candidates).toContainEqual(
      expect.objectContaining({
        field: "location.city",
        priority: "critical",
      }),
    );
    expect(result.clarification_candidates).toContainEqual(
      expect.objectContaining({ field: "budget.amount", priority: "critical" }),
    );
    expect(result.confirmation_view.can_confirm).toBe(false);
  });

  it("«Хочу только новостройку до 5 млн» does not recognize a city and still requires one", async () => {
    const outcome = await parseUserRequest({
      schema_version: "1.0",
      raw_text: "Хочу только новостройку до 5 млн",
      locale: "ru-RU",
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) throw new Error(outcome.error.message);
    const result = outcome.result;

    expect(result.parsed_request.location.cities).toEqual([]);
    expect(result.unknowns).toContainEqual(
      expect.objectContaining({
        field: "location.city",
        materiality: "critical",
      }),
    );
    expect(result.confirmation_view.can_confirm).toBe(false);
  });
});
