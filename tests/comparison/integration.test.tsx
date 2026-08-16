// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addComparisonItem,
  buildComparisonView,
  buildPilotComparisonInput,
  createComparisonSelection,
  removeComparisonItem,
} from "../../src/comparison";
import { ComparisonPageView } from "../../src/comparison/components";
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
import { comparisonRequest } from "./fixtures";

afterEach(cleanup);

describe("TASK-011 shortlist → comparison → detail integration", () => {
  it("adds stable shortlist items, compares them, removes one, and preserves detail return context", async () => {
    const user = userEvent.setup();
    const request = comparisonRequest();
    const shortlist = buildShortlistView(
      buildPilotShortlistInput(request).input,
    );
    if (!shortlist.success) throw new Error(shortlist.error.message);
    let selection = createComparisonSelection(request);
    const toggle = vi.fn((card: (typeof shortlist.view.cards)[number]) => {
      const outcome = addComparisonItem(selection, {
        propertyId: card.propertyId,
        offerId: card.offerId,
        scenarioId: card.purchaseScenarioId,
      });
      if (outcome.success) selection = outcome.state;
    });
    const chosenCards = shortlist.view.cards.slice(0, 2);
    render(
      <ShortlistPageView
        view={{ ...shortlist.view, cards: chosenCards }}
        comparisonPropertyIds={new Set()}
        onComparisonToggle={toggle}
      />,
    );
    const addButtons = screen.getAllByRole("button", {
      name: "Добавить к сравнению",
    });
    await user.click(addButtons[0]!);
    await user.click(addButtons[1]!);
    expect(selection.items).toHaveLength(2);
    expect(
      selection.items.every((item) => item.offerId && item.scenarioId),
    ).toBe(true);
    cleanup();

    const built = buildComparisonView(
      buildPilotComparisonInput({ userRequest: request, selection }),
    );
    if (!built.success) throw new Error(built.error.message);
    const remove = vi.fn((propertyId: string) => {
      const outcome = removeComparisonItem(selection, propertyId);
      if (outcome.success) selection = outcome.state;
    });
    render(<ComparisonPageView view={built.view} onRemove={remove} />);
    const detail = screen.getAllByRole("link", { name: "Подробнее" })[0];
    expect(detail?.getAttribute("href")).toContain("from=comparison");
    expect(detail?.getAttribute("href")).toContain("offer=");
    expect(detail?.getAttribute("href")).toContain("scenario=");
    await user.click(
      screen.getAllByRole("button", { name: /убрать .* из сравнения/i })[0]!,
    );
    expect(selection.items).toHaveLength(1);

    const replacement = shortlist.view.cards[2]!;
    const added = addComparisonItem(selection, {
      propertyId: replacement.propertyId,
      offerId: replacement.offerId,
      scenarioId: replacement.purchaseScenarioId,
    });
    if (!added.success) throw new Error(added.message);
    selection = added.state;
    expect(selection.items).toHaveLength(2);
    cleanup();

    const selected = selection.items[0]!;
    const detailInput = buildPilotPropertyDetailInput({
      propertyId: selected.propertyId,
      offerId: selected.offerId,
      scenarioId: selected.scenarioId,
      userRequest: request,
    });
    if (!detailInput.success) throw new Error(detailInput.error.message);
    const detailView = buildPropertyDetailView(detailInput.input);
    if (!detailView.success) throw new Error(detailView.error.message);
    render(
      <PropertyDetailPageView
        view={detailView.view}
        backHrefOverride="/comparison"
      />,
    );
    expect(
      screen
        .getAllByRole("link", { name: "Вернуться к сравнению" })[0]
        ?.getAttribute("href"),
    ).toBe("/comparison");
  });
});
