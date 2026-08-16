// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildShortlistItemView,
  type ShortlistCardView,
} from "../../src/shortlist";
import {
  EmptyShortlistState,
  PropertyMatchCard,
  ShortlistClient,
  ShortlistPageView,
} from "../../src/shortlist/components";
import {
  buildPilotShortlistInput,
  buildShortlistView,
} from "../../src/shortlist";
import { candidate, pilotDataset, pilotRequest, pilotView } from "./fixtures";

afterEach(cleanup);

const renderCard = (card: ShortlistCardView) => {
  render(<PropertyMatchCard card={card} />);
  return screen.getByTestId("shortlist-card");
};

describe("TASK-009 PropertyMatchCard", () => {
  it("renders high Match Score and high confidence as separate meanings", () => {
    const base = buildShortlistItemView(pilotRequest, candidate("prop_nb_003"));
    const card = renderCard({
      ...base,
      matchScore: 92,
      matchLabel: "92% подходит",
      confidence: {
        band: "high",
        label: "Данные подтверждены достаточно хорошо",
      },
      compromises: ["Площадь на 6 м² меньше желаемой"],
      noMaterialCompromises: false,
    });

    expect(within(card).getByText("92% подходит")).toBeTruthy();
    expect(
      within(card).getByText("Данные подтверждены достаточно хорошо"),
    ).toBeTruthy();
    expect(within(card).getByText("Почему подходит")).toBeTruthy();
    expect(within(card).getAllByRole("listitem").length).toBeGreaterThan(1);
    expect(
      within(card).getByText("Площадь на 6 м² меньше желаемой"),
    ).toBeTruthy();
  });

  it("renders a high match with low confidence without changing Match Score", () => {
    const base = buildShortlistItemView(pilotRequest, candidate("prop_nb_001"));
    const card = renderCard({
      ...base,
      matchScore: 95,
      matchLabel: "95% подходит",
      confidence: {
        band: "low",
        label: "Несколько важных условий не подтверждены",
      },
    });
    expect(within(card).getByText("95% подходит")).toBeTruthy();
    expect(
      within(card).getByText("Несколько важных условий не подтверждены"),
    ).toBeTruthy();
  });

  it("shows eligible_with_unknowns, critical unknown, and claimed financing", () => {
    const view = buildShortlistItemView(pilotRequest, candidate("prop_nb_002"));
    const card = renderCard(view);

    expect(
      within(card).getByText("Подходит, но важное условие нужно подтвердить"),
    ).toBeTruthy();
    expect(within(card).getByText("Что важно проверить")).toBeTruthy();
    expect(
      within(card).getByText("Заявлено, требует подтверждения"),
    ).toBeTruthy();
    expect(within(card).queryByText(/ипотека одобрена/i)).toBeNull();
  });

  it("labels price_from and never presents a conflicting price as exact", () => {
    const source = candidate("prop_nb_003");
    const priceFrom = buildShortlistItemView(pilotRequest, {
      ...source,
      offer: { ...source.offer!, price_from: true },
    });
    const { unmount } = render(<PropertyMatchCard card={priceFrom} />);
    expect(screen.getByText(/^от /)).toBeTruthy();
    expect(screen.getByText(/не точная цена/i)).toBeTruthy();
    unmount();

    render(
      <PropertyMatchCard
        card={{
          ...priceFrom,
          price: {
            kind: "conflicting",
            current: null,
            previous: null,
            label: "Цена требует уточнения",
            note: "Цена расходится между источниками",
          },
        }}
      />,
    );
    expect(screen.getByText("Цена требует уточнения")).toBeTruthy();
    expect(screen.getByText("Цена расходится между источниками")).toBeTruthy();
    expect(screen.queryByText(priceFrom.price.current!)).toBeNull();
  });

  it("renders a shared decision structure for a house without an image", () => {
    const houseRequest = pilotDataset.userRequests.find(
      (request) => request.user_request_id === "request_pilot_c",
    )!;
    const adapted = buildPilotShortlistInput(houseRequest);
    const house = adapted.input.candidates.find(
      (item) => item.property.property_type === "house",
    )!;
    const card = renderCard(buildShortlistItemView(houseRequest, house));

    expect(within(card).getAllByText("Дом").length).toBeGreaterThan(0);
    expect(within(card).getByText("Почему подходит")).toBeTruthy();
    expect(within(card).getByText("Компромиссы")).toBeTruthy();
    expect(
      within(card).getByRole("img", { name: /изображение.*отсутствует/i }),
    ).toBeTruthy();
    expect(within(card).getByText("Фото пока нет")).toBeTruthy();
  });
});

describe("TASK-009 shortlist states", () => {
  it("renders the empty state without silently relaxing must criteria", () => {
    render(<EmptyShortlistState />);
    expect(
      screen.getByText(
        "По подтверждённым обязательным условиям вариантов пока нет.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/не стали ослаблять must-критерии/i)).toBeTruthy();
  });

  it("renders ready cards, request summary, edit action, and partial status", () => {
    render(<ShortlistPageView view={{ ...pilotView, partial: true }} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Подобрали варианты под ваши условия",
    );
    expect(screen.getByLabelText("Условия запроса")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Изменить условия" })
        .getAttribute("href"),
    ).toBe("/request/confirm");
    expect(screen.getByText("Некоторые данные ещё обновляются.")).toBeTruthy();
  });

  it("renders a controlled state when a confirmed request is missing", () => {
    render(<ShortlistClient initialView={null} />);
    expect(
      screen.getByText("Сначала опишите и подтвердите условия поиска."),
    ).toBeTruthy();
  });

  it("renders empty content from a valid view model", () => {
    const built = buildShortlistView({
      ...buildPilotShortlistInput(pilotRequest).input,
      candidates: [],
    });
    if (!built.success) throw new Error(built.error.message);
    render(<ShortlistPageView view={built.view} />);
    expect(screen.getByText(/вариантов пока нет/i)).toBeTruthy();
  });
});
