// @vitest-environment jsdom

import { existsSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import AboutPage from "../app/(public)/about/page";
import ExpertReviewPage from "../app/(public)/expert-review/page";
import HowItWorksPage from "../app/(public)/how-it-works/page";
import MaterialsPage from "../app/(public)/materials/page";
import MethodologyPage from "../app/(public)/methodology/page";
import SelectionPage from "../app/(public)/selection/page";
import { SiteFooter, SiteHeader } from "../app/(public)/site-chrome";

afterEach(cleanup);

const navigationLabels = [
  "Подбор",
  "Сравнение",
  "Экспертная проверка",
  "Как проверяем",
  "Материалы",
];

describe("public site chrome", () => {
  it("renders the header with its identity link and primary call to action", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("banner")).toBeDefined();
    expect(screen.getByLabelText("На главную").getAttribute("href")).toBe("/");
    expect(
      screen.getByRole("link", { name: "Начать подбор" }).getAttribute("href"),
    ).toBe("/selection");
  });

  it("exposes every navigation item in the main navigation", () => {
    render(<SiteHeader />);

    const primaryNavigation = screen.getByRole("navigation", {
      name: "Основная навигация",
    });

    for (const label of navigationLabels) {
      expect(
        within(primaryNavigation).getByRole("link", { name: label }),
      ).toBeDefined();
    }
  });

  it("repeats the navigation in the mobile menu and adds the about link", () => {
    render(<SiteHeader />);

    const menu = screen.getByRole("navigation", { name: "Меню разделов" });

    expect(screen.getByText("Меню")).toBeDefined();
    for (const label of [...navigationLabels, "Об эксперте"]) {
      expect(within(menu).getByRole("link", { name: label })).toBeDefined();
    }
  });

  it("renders the footer columns", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("contentinfo")).toBeDefined();
    expect(
      within(screen.getByRole("region", { name: "Продукт" })).getAllByRole(
        "link",
      ),
    ).toHaveLength(navigationLabels.length);

    const about = screen.getByRole("region", { name: "О сервисе" });
    expect(
      within(about)
        .getByRole("link", { name: "Об эксперте" })
        .getAttribute("href"),
    ).toBe("/about");
    expect(
      within(about)
        .getByRole("link", { name: "Как проверяем" })
        .getAttribute("href"),
    ).toBe("/methodology");

    expect(screen.getByRole("region", { name: "Правовое" })).toBeDefined();
  });

  it("points every navigation link at a route that exists", () => {
    render(
      <>
        <SiteHeader />
        <SiteFooter />
      </>,
    );

    const appDirectory = join(process.cwd(), "app");
    const hrefs = new Set(
      screen
        .getAllByRole("link")
        .map((link) => link.getAttribute("href") ?? "")
        .filter((href) => href.startsWith("/")),
    );

    expect(hrefs.size).toBeGreaterThan(0);
    for (const href of hrefs) {
      const segment = href === "/" ? "" : href.slice(1);
      // Public pages live in the (public) route group, internal screens sit
      // directly under app/ — either location answers the URL.
      const candidates = [
        join(appDirectory, "(public)", segment, "page.tsx"),
        join(appDirectory, segment, "page.tsx"),
      ];
      expect(
        candidates.some((candidate) => existsSync(candidate)),
        `no page renders ${href}`,
      ).toBe(true);
    }
  });
});

describe("public content pages", () => {
  it("renders the selection entry point", () => {
    render(<SelectionPage />);

    expect(
      screen.getByRole("heading", {
        name: "Опишите задачу — получите разобранный список",
      }),
    ).toBeDefined();
    expect(
      screen.getByText("Опишите, какую недвижимость вы ищете"),
    ).toBeDefined();
  });

  it("renders the how-it-works journey", () => {
    render(<HowItWorksPage />);

    expect(
      screen.getByRole("heading", { name: "Как работает подбор" }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", {
        name: "Каждый вариант получает две отдельные оценки",
      }),
    ).toBeDefined();
  });

  it("renders expert review with unresolved copy marked as a placeholder", () => {
    render(<ExpertReviewPage />);

    expect(
      screen.getByRole("heading", {
        name: "Проверка там, где данных недостаточно",
      }),
    ).toBeDefined();
    expect(
      screen.getByText("{{ТРЕБУЕТСЯ ТЕКСТ: состав услуги}}"),
    ).toBeDefined();
    expect(screen.getByText("{{ТРЕБУЕТСЯ ТЕКСТ: цена и срок}}")).toBeDefined();
  });

  it("renders the methodology page with the coverage note", () => {
    render(<MethodologyPage />);

    expect(
      screen.getByRole("heading", {
        name: "Соответствие и надёжность данных — разные величины",
      }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Неизвестное — это не «нет»" }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", {
        name: "Процент соответствия не назначает языковая модель",
      }),
    ).toBeDefined();
    expect(
      screen.getByText(/Недоступный источник не исчезает из картины/),
    ).toBeDefined();
  });

  it("renders the about page as a placeholder structure", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: "Об эксперте" })).toBeDefined();
    expect(
      screen.getAllByText("{{ТРЕБУЕТСЯ ТЕКСТ: об эксперте}}").length,
    ).toBeGreaterThan(0);
  });

  it("renders materials with an honest empty state", () => {
    render(<MaterialsPage />);

    expect(
      screen.getByRole("heading", { name: "Материалов пока нет" }),
    ).toBeDefined();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });
});
