// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  PropertyDetailNotFound,
  PropertyDetailPageView,
} from "../../src/property-detail/components";
import { detailView, personalizedDetailView } from "./fixtures";

afterEach(cleanup);

describe("TASK-010 Property Detail components", () => {
  it("renders Match Score and Data Confidence as separate values", () => {
    render(<PropertyDetailPageView view={personalizedDetailView} />);
    expect(screen.getByText("100% подходит под ваши условия")).toBeTruthy();
    expect(screen.getByText(/Data Confidence · отдельно/i)).toBeTruthy();
    expect(
      screen.getAllByText(personalizedDetailView.dataQuality.confidenceLabel)
        .length,
    ).toBeGreaterThan(0);
  });

  it("renders only request-specific strengths", () => {
    render(<PropertyDetailPageView view={personalizedDetailView} />);
    const section = screen
      .getByRole("heading", {
        name: "Почему подходит именно вам",
      })
      .closest("section");
    expect(section).toBeTruthy();
    expect(
      within(section as HTMLElement).getByText(
        "Первоначальный взнос соответствует условию",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/отличная квартира/i)).toBeNull();
  });

  it("renders compromises in their own block", () => {
    render(
      <PropertyDetailPageView
        view={{
          ...personalizedDetailView,
          compromises: [{ id: "area", text: "Площадь меньше желаемой" }],
        }}
      />,
    );
    expect(screen.getByText("Площадь меньше желаемой")).toBeTruthy();
  });

  it("does not hide direct-open hard failures", () => {
    const hardFail = detailView({
      propertyId: "prop_nb_001",
      requestId: "request_pilot_c",
      offerId: "offer_nb_001_primary",
    });
    render(<PropertyDetailPageView view={hardFail} />);
    expect(
      screen.getAllByText("Не соответствует обязательному условию").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Площадь .* меньше желаемой/)).toBeTruthy();
  });

  it("renders critical unknowns with a contextual expert hook", () => {
    render(<PropertyDetailPageView view={personalizedDetailView} />);
    expect(screen.getByText("Что ещё нужно подтвердить")).toBeTruthy();
    const link = screen.getAllByRole("link", {
      name: /проверить этот вопрос/i,
    })[0];
    expect(link?.getAttribute("href")).toMatch(
      /^\/expert\/request\?property=prop_nb_001&field=/,
    );
  });

  it("renders centralized verification labels and stale freshness", () => {
    const stale = detailView({
      propertyId: "prop_sec_006",
      offerId: "offer_sec_006_primary",
    });
    render(<PropertyDetailPageView view={stale} />);
    expect(
      screen.getAllByText("Срок актуальности истёк").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Подтверждено|Нет данных/).length,
    ).toBeGreaterThan(0);
  });

  it("shows conflicting evidence as multiple labeled values", () => {
    const conflict = detailView({
      propertyId: "prop_nb_001",
      offerId: "offer_nb_001_primary",
    });
    render(<PropertyDetailPageView view={conflict} />);
    const section = screen
      .getByRole("heading", {
        name: "Расхождения источников",
      })
      .closest("section");
    expect(section).toBeTruthy();
    expect(
      within(section as HTMLElement).getAllByText(/4\s*350\s*000|5\s*180\s*000/)
        .length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      within(section as HTMLElement).getAllByText(/августа 2026/).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("marks price_from as a minimum, not an exact unit price", () => {
    const priceFrom = detailView({
      propertyId: "prop_special_template_001",
      offerId: "offer_special_template_001_primary",
    });
    render(<PropertyDetailPageView view={priceFrom} />);
    expect(screen.getByText(/^от 3/)).toBeTruthy();
    expect(screen.getByText(/Минимальная цена, а не точная цена/)).toBeTruthy();
  });

  it("keeps alternative Offers separate", () => {
    const alternatives = detailView({
      propertyId: "prop_nb_005",
      offerId: "offer_nb_005_primary",
    });
    render(<PropertyDetailPageView view={alternatives} />);
    expect(
      screen.getByText("Другие предложения по этому же объекту"),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Открыть это предложение" }),
    ).toHaveProperty("href");
  });

  it("renders a staged rate as distinct periods", () => {
    const staged = detailView({
      propertyId: "prop_nb_003",
      requestId: "request_pilot_b",
      offerId: "offer_nb_003_primary",
      scenarioId: "scenario_nb_003_staged",
    });
    render(<PropertyDetailPageView view={staged} />);
    expect(screen.getByText("1–12 месяц")).toBeTruthy();
    expect(screen.getByText("с 13 месяца")).toBeTruthy();
    expect(screen.getByText("0.10%")).toBeTruthy();
    expect(screen.getByText("12.00%")).toBeTruthy();
  });

  it("marks claimed financing and avoids a bank-approval claim", () => {
    const claimed = detailView({
      propertyId: "prop_nb_002",
      requestId: "request_pilot_b",
      offerId: "offer_nb_002_primary",
      scenarioId: "scenario_nb_002_claimed",
    });
    render(<PropertyDetailPageView view={claimed} />);
    expect(
      screen.getByText(
        "Условие заявлено, но ещё не подтверждено для этого объекта.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/это не банковское одобрение/i)).toBeTruthy();
  });

  it("does not turn a removed/expired listing into sold", () => {
    const removed = detailView({
      propertyId: "prop_sec_006",
      offerId: "offer_sec_006_primary",
    });
    render(<PropertyDetailPageView view={removed} />);
    expect(screen.getByText("Статус уточняется")).toBeTruthy();
    expect(screen.queryByText("Продано")).toBeNull();
  });

  it("renders all decision sections without an image", () => {
    render(<PropertyDetailPageView view={personalizedDetailView} />);
    expect(
      screen.getByRole("img", { name: /изображение объекта.*отсутствует/i }),
    ).toBeTruthy();
    expect(screen.getByText("Страница полноценна без фото")).toBeTruthy();
    expect(screen.getByText("Источники и подтверждения")).toBeTruthy();
  });

  it("shows facts only and a describe CTA without an active UserRequest", () => {
    const factual = detailView({ propertyId: "prop_nb_003" });
    render(<PropertyDetailPageView view={factual} />);
    expect(
      screen.getByText("Соответствие этому запросу ещё не рассчитано."),
    ).toBeTruthy();
    expect(screen.queryByText(/\d+% подходит под ваши условия/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Описать свои условия" }),
    ).toBeTruthy();
  });

  it("renders a controlled not-found state", () => {
    render(<PropertyDetailNotFound />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Объект не найден")).toBeTruthy();
  });

  it("provides back and comparison hooks with selected context", () => {
    render(<PropertyDetailPageView view={personalizedDetailView} />);
    expect(
      screen
        .getAllByRole("link", { name: "Вернуться к вариантам" })[0]
        ?.getAttribute("href"),
    ).toBe("/shortlist");
    expect(
      screen
        .getByRole("link", { name: "Добавить к сравнению" })
        .getAttribute("href"),
    ).toContain(
      "property=prop_nb_001&offer=offer_nb_001_agency&scenario=scenario_nb_001_zero",
    );
  });
});
