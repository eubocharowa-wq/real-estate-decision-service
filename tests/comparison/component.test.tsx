// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ComparisonClient,
  ComparisonPageView,
  ComparisonSelectionState,
} from "../../src/comparison/components";
import { ShortlistPageView } from "../../src/shortlist/components";
import { pilotView } from "../shortlist/fixtures";
import {
  comparisonView,
  crossTypeComparisonView,
  uncertainComparisonView,
} from "./fixtures";

afterEach(cleanup);

describe("TASK-011 comparison components", () => {
  it("renders the comparison heading and request summary", () => {
    render(<ComparisonPageView view={uncertainComparisonView} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Сравнение вариантов",
    );
    expect(screen.getByLabelText("Обязательные условия запроса")).toBeTruthy();
  });

  it("renders exactly two finalist columns for a two-item view", () => {
    render(<ComparisonPageView view={uncertainComparisonView} />);
    const table = screen.getByRole("table");
    expect(
      within(table.querySelector("thead") as HTMLElement).getAllByRole(
        "columnheader",
      ),
    ).toHaveLength(3);
  });

  it("renders four finalist columns", () => {
    const view = comparisonView([
      "prop_nb_001",
      "prop_nb_002",
      "prop_nb_003",
      "prop_nb_004",
    ]);
    render(<ComparisonPageView view={view} />);
    const table = screen.getByRole("table");
    expect(
      within(table.querySelector("thead") as HTMLElement).getAllByRole(
        "columnheader",
      ),
    ).toHaveLength(5);
    expect(
      screen.queryByRole("link", { name: "Добавить ещё вариант" }),
    ).toBeNull();
  });

  it("disables an unselected shortlist card when four are selected", () => {
    render(
      <ShortlistPageView
        view={{ ...pilotView, cards: [pilotView.cards[0]!] }}
        comparisonPropertyIds={new Set(["p1", "p2", "p3", "p4"])}
        onComparisonToggle={() => undefined}
      />,
    );
    const button = screen.getByRole("button", { name: "Выбрано максимум 4" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows Match and reliability as separate labels", () => {
    render(<ComparisonPageView view={uncertainComparisonView} />);
    expect(screen.getAllByText(/% Match/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Надёжность:/).length).toBeGreaterThanOrEqual(2);
  });

  it("starts comparison sections with must and exclude criteria", () => {
    render(<ComparisonPageView view={uncertainComparisonView} />);
    const groups = screen.getAllByText(
      /Обязательные условия и исключения|Желательные условия|Финансовый сценарий/,
    );
    expect(groups[0]?.textContent).toBe("Обязательные условия и исключения");
  });

  it("renders hard fail visibly without hiding the candidate", () => {
    const view = comparisonView(["prop_nb_005", "prop_sec_001"]);
    render(<ComparisonPageView view={view} />);
    expect(
      screen.getAllByText(/Hard fail|обязательному условию/i).length,
    ).toBeGreaterThan(0);
    const table = screen.getByRole("table");
    expect(
      within(table.querySelector("thead") as HTMLElement).getAllByRole(
        "columnheader",
      ),
    ).toHaveLength(3);
  });

  it("renders critical unknowns in their own grouped section", () => {
    render(<ComparisonPageView view={uncertainComparisonView} />);
    expect(
      screen.getByRole("heading", { name: "Что важно проверить" }),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/проверить|подтвердить|расходится/i).length,
    ).toBeGreaterThan(0);
  });

  it("renders a conflict as an explicit state, not an exact advantage", () => {
    const firstSection = uncertainComparisonView.sections[0]!;
    const firstRow = firstSection.rows[0]!;
    const conflictView = {
      ...uncertainComparisonView,
      sections: [
        {
          ...firstSection,
          rows: [
            {
              ...firstRow,
              cells: [
                {
                  ...firstRow.cells[0]!,
                  state: "conflict" as const,
                  value: "Цена расходится между источниками",
                },
                firstRow.cells[1]!,
              ],
            },
          ],
        },
        ...uncertainComparisonView.sections.slice(1),
      ],
    };
    render(<ComparisonPageView view={conflictView} />);
    expect(
      screen.getAllByText("Есть расхождение источников").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Цена расходится между источниками").length,
    ).toBeGreaterThan(0);
  });

  it("renders stale freshness as visible text", () => {
    const firstSection = uncertainComparisonView.sections[0]!;
    const firstRow = firstSection.rows[0]!;
    const staleView = {
      ...uncertainComparisonView,
      sections: [
        {
          ...firstSection,
          rows: [
            {
              ...firstRow,
              cells: [
                {
                  ...firstRow.cells[0]!,
                  freshnessLabel: "Данные могли измениться",
                },
                firstRow.cells[1]!,
              ],
            },
          ],
        },
        ...uncertainComparisonView.sections.slice(1),
      ],
    };
    render(<ComparisonPageView view={staleView} />);
    expect(screen.getByText(/Данные могли измениться/)).toBeTruthy();
  });

  it("renders cross-type cells as not applicable rather than false", () => {
    render(<ComparisonPageView view={crossTypeComparisonView} />);
    expect(
      screen.getAllByText("Не относится к этому типу объекта").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Не применимо").length).toBeGreaterThan(0);
  });

  it("shows finance, timing, property, and type-specific groups", () => {
    render(<ComparisonPageView view={crossTypeComparisonView} />);
    for (const heading of [
      "Финансовый сценарий",
      "Сроки и наличие",
      "Объект",
      "Особенности типа объекта",
    ]) {
      expect(screen.getByText(heading)).toBeTruthy();
    }
  });

  it("shows the selected seller/source/program context per column", () => {
    render(<ComparisonPageView view={uncertainComparisonView} />);
    uncertainComparisonView.columns.forEach((column) =>
      expect(document.body.textContent).toContain(column.scenarioLabel),
    );
  });

  it("renders deterministic decision drivers", () => {
    render(<ComparisonPageView view={uncertainComparisonView} />);
    const section = screen
      .getByRole("heading", { name: "Decision Drivers" })
      .closest("section");
    expect(section).toBeTruthy();
    expect(
      within(section as HTMLElement).getAllByRole("listitem").length,
    ).toBeGreaterThan(0);
  });

  it("renders explicit trade-offs", () => {
    render(<ComparisonPageView view={uncertainComparisonView} />);
    expect(screen.getByRole("heading", { name: "Trade-offs" })).toBeTruthy();
  });

  it("renders one of the five deterministic conclusion states", () => {
    render(<ComparisonPageView view={uncertainComparisonView} />);
    expect(
      screen.getByRole("heading", {
        name: uncertainComparisonView.conclusion.label,
      }),
    ).toBeTruthy();
  });

  it("renders a contextual choice-assistance expert link", () => {
    render(<ComparisonPageView view={uncertainComparisonView} />);
    const link = screen.getByRole("link", {
      name: "Помочь выбрать между этими вариантами",
    });
    expect(link.getAttribute("href")).toContain("type=choice_assistance");
    expect(link.getAttribute("href")).toContain("comparison=");
  });

  it("provides a remove control for every column", () => {
    const onRemove = vi.fn();
    render(
      <ComparisonPageView view={uncertainComparisonView} onRemove={onRemove} />,
    );
    const buttons = screen.getAllByRole("button", {
      name: /убрать .* из сравнения/i,
    });
    expect(buttons).toHaveLength(2);
    buttons[0]?.click();
    expect(onRemove).toHaveBeenCalledWith(
      uncertainComparisonView.columns[0]?.propertyId,
    );
  });

  it("exposes the horizontally scrollable comparison region to keyboard users", () => {
    render(<ComparisonPageView view={uncertainComparisonView} />);
    const region = screen.getByLabelText(
      "Горизонтально прокручиваемая таблица сравнения",
    );
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(within(region).getByRole("table")).toBeTruthy();
  });

  it("keeps a missing item as an explicit unavailable column", () => {
    const second = uncertainComparisonView.columns[1]!;
    const view = {
      ...uncertainComparisonView,
      partial: true,
      columns: [
        uncertainComparisonView.columns[0]!,
        {
          ...second,
          status: "unavailable" as const,
          availabilityWarning: "Объект больше недоступен.",
          errorMessage: "Объект больше недоступен.",
        },
      ],
    };
    render(<ComparisonPageView view={view} />);
    expect(screen.getByText("Объект больше недоступен.")).toBeTruthy();
    expect(screen.getByText(/Часть данных.*недоступны/i)).toBeTruthy();
  });

  it("renders a controlled empty state through the client", () => {
    render(<ComparisonClient initialView={null} />);
    expect(screen.getByText("Сравнение не найдено")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Вернуться к подбору" }),
    ).toHaveProperty("href");
  });

  it("renders the one-item comparison state", () => {
    render(<ComparisonSelectionState count={1} />);
    expect(
      screen.getByText("Добавьте ещё один вариант для сравнения."),
    ).toBeTruthy();
  });
});
