// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { requestConfirmationResultSchema } from "../../src/request-confirmation";
import {
  buildPilotShortlistInput,
  buildShortlistView,
} from "../../src/shortlist";
import { ShortlistPageView } from "../../src/shortlist/components";
import { pilotRequest } from "./fixtures";

afterEach(cleanup);

describe("TASK-009 confirmed request → pilot matches → shortlist", () => {
  it("renders 5–10 ready cards and stable technical detail CTA targets", () => {
    const confirmed = requestConfirmationResultSchema.parse({
      schema_version: "1.0",
      request_status: "confirmed",
      original_raw_text: "Синтетический подтверждённый запрос для shortlist.",
      confirmed_request: pilotRequest,
      unresolved_nonblocking_unknowns: [],
      answered_clarifications: [],
      user_changes: [],
      confirmed_at: "2026-08-15T00:00:00.000Z",
    });
    const adapted = buildPilotShortlistInput(confirmed.confirmed_request);
    expect(adapted.diagnostics.matchingErrors).toEqual([]);
    expect(adapted.diagnostics.dataQualityErrors).toEqual([]);
    const outcome = buildShortlistView(adapted.input);
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;

    render(<ShortlistPageView view={outcome.view} />);
    const cards = screen.getAllByTestId("shortlist-card");
    expect(cards.length).toBeGreaterThanOrEqual(5);
    expect(cards.length).toBeLessThanOrEqual(10);
    const renderedPropertyIds = cards.map((card) =>
      card.getAttribute("data-property-id"),
    );
    const excludedPropertyIds = adapted.input.candidates
      .filter((candidate) =>
        ["hard_fail", "unavailable"].includes(
          candidate.match.match_result.eligibility_status,
        ),
      )
      .map((candidate) => candidate.property.identity.property_id);
    expect(excludedPropertyIds.length).toBeGreaterThan(0);
    excludedPropertyIds.forEach((propertyId) =>
      expect(renderedPropertyIds).not.toContain(propertyId),
    );

    const firstCard = cards[0]!;
    const propertyId = firstCard.getAttribute("data-property-id");
    const cta = within(firstCard).getByRole("link", {
      name: /посмотреть подробнее/i,
    });
    expect(cta.getAttribute("href")).toMatch(
      new RegExp(`^/property/${propertyId}\\?offer=`),
    );
    expect(firstCard.getAttribute("data-offer-id")).not.toBe("");
    expect(firstCard.getAttribute("data-scenario-id")).not.toBe("");
  });
});
