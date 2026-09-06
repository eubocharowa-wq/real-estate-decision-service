// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
});
