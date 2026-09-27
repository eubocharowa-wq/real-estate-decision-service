import { expect, test } from "./fixtures";

import {
  expectNoSeriousAccessibilityViolations,
  expectViewportContained,
} from "./support";

test("primary navigation has no dead application links", async ({ page }) => {
  await page.goto("/");
  const viewport = page.viewportSize();
  const navigation =
    viewport && viewport.width <= 820
      ? page.locator("details.site-menu").getByRole("navigation", {
          name: "Меню разделов",
        })
      : page.locator(".site-nav");
  if (viewport && viewport.width <= 820)
    await page.getByText("Меню", { exact: true }).click();
  const hrefs = await navigation
    .getByRole("link")
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => typeof href === "string"),
    );
  expect(hrefs.length).toBeGreaterThan(0);

  await page.goto("/selection");
  await expect(page.locator("main")).toHaveCount(1);

  for (const href of hrefs) {
    const response = await page.goto(href);
    expect(response?.status(), href).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.getByText("404").first()).not.toBeVisible();
  }
});

test("missing journey states remain recoverable and accessible", async ({
  page,
}) => {
  await page.goto("/request/confirm");
  await expect(
    page.getByRole("heading", {
      name: "Сначала опишите, какую недвижимость вы ищете.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Вернуться к запросу" }),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await expectViewportContained(page);
});
