// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildPilotPropertyDetailInput,
  buildPropertyDetailView,
} from "../../src/property-detail";
import { PropertyDetailPageView } from "../../src/property-detail/components";
import {
  buildPilotShortlistInput,
  buildShortlistView,
} from "../../src/shortlist";
import { ShortlistPageView } from "../../src/shortlist/components";
import { propertyDetailDataset } from "./fixtures";

afterEach(cleanup);

describe("TASK-010 Shortlist → Property Detail", () => {
  it("preserves Offer/Scenario, shows match and checks, then links back", () => {
    const request = propertyDetailDataset.userRequests.find(
      (item) => item.user_request_id === "request_pilot_a",
    )!;
    const shortlistInput = buildPilotShortlistInput(request).input;
    const shortlist = buildShortlistView(shortlistInput);
    if (!shortlist.success) throw new Error(shortlist.error.message);
    render(<ShortlistPageView view={shortlist.view} />);

    const card = screen
      .getAllByTestId("shortlist-card")
      .find((item) => item.getAttribute("data-scenario-id") !== "");
    expect(card).toBeTruthy();
    const propertyId = card!.getAttribute("data-property-id")!;
    const offerId = card!.getAttribute("data-offer-id")!;
    const scenarioId = card!.getAttribute("data-scenario-id")!;
    const href = within(card!)
      .getByRole("link", {
        name: /посмотреть подробнее/i,
      })
      .getAttribute("href");
    expect(href).toBe(
      `/property/${propertyId}?offer=${offerId}&scenario=${scenarioId}`,
    );
    cleanup();

    const adapted = buildPilotPropertyDetailInput({
      propertyId,
      offerId,
      scenarioId,
      userRequest: request,
    });
    if (!adapted.success) throw new Error(adapted.error.message);
    const detail = buildPropertyDetailView(adapted.input);
    if (!detail.success) throw new Error(detail.error.message);
    expect(detail.view.selectedOfferId).toBe(offerId);
    expect(detail.view.selectedScenarioId).toBe(scenarioId);

    render(<PropertyDetailPageView view={detail.view} />);
    expect(screen.getByText(/% подходит под ваши условия/)).toBeTruthy();
    expect(screen.getByText("Что ещё нужно подтвердить")).toBeTruthy();
    expect(screen.getByText("Что стоит проверить")).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "Вернуться к вариантам" })[0]
        ?.getAttribute("href"),
    ).toBe("/shortlist");
  });
});
