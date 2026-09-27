import { expect, test } from "./fixtures";

import {
  assertManualCuratedPilot,
  expectNoSeriousAccessibilityViolations,
  expectViewportContained,
  GOLDEN_BROWSER_REQUEST,
  readJourneySnapshot,
  waitForJourneyAction,
} from "./support";

test("completes the deployed buyer journey and restores it after reload", async ({
  page,
}) => {
  await page.goto("/selection");
  await expect(
    page.getByRole("heading", {
      name: "Опишите, какую недвижимость вы ищете",
    }),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await expectViewportContained(page);

  await page.getByLabel("Ваша задача").fill(GOLDEN_BROWSER_REQUEST);
  await page.getByRole("button", { name: "Проверить условия" }).click();
  await expect(page).toHaveURL(/\/request\/confirm$/);
  await expect(
    page.getByRole("heading", {
      name: "Проверьте, правильно ли мы вас поняли",
    }),
  ).toBeVisible();

  const matchingResponse = waitForJourneyAction(page, "confirm_and_match");
  await page
    .getByRole("button", { name: "Подтвердить и подобрать варианты" })
    .click();
  expect((await matchingResponse).ok()).toBe(true);
  await expect(page.getByTestId("confirmation-success")).toBeVisible();

  const shortlistResponse = waitForJourneyAction(page, "shortlist");
  await page.getByRole("link", { name: "Открыть подбор" }).click();
  expect((await shortlistResponse).ok()).toBe(true);
  await expect(page).toHaveURL(/\/shortlist$/);
  const cards = page.getByTestId("shortlist-card");
  await expect(cards).toHaveCount(5);
  await expect(
    page.getByText("dataset_type=manual_curated_pilot"),
  ).toBeVisible();
  assertManualCuratedPilot(await readJourneySnapshot(page));
  await expectNoSeriousAccessibilityViolations(page);
  await expectViewportContained(page);

  for (const index of [0, 1]) {
    const savedSelection = waitForJourneyAction(page, "comparison_selection");
    await cards
      .nth(index)
      .getByRole("button", { name: "Добавить к сравнению" })
      .click();
    expect((await savedSelection).ok()).toBe(true);
  }
  await expect(
    page.getByRole("link", { name: "Сравнить выбранные" }),
  ).toBeVisible();

  const propertyResponse = waitForJourneyAction(page, "open_property");
  await cards
    .first()
    .getByRole("link", { name: /Посмотреть подробнее/ })
    .click();
  expect((await propertyResponse).ok()).toBe(true);
  await expect(page.getByTestId("property-detail")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await expectViewportContained(page);

  await page
    .getByRole("navigation", { name: "Навигация по объекту" })
    .getByRole("link", { name: /Вернуться к вариантам/ })
    .click();
  await expect(cards).toHaveCount(5);
  const comparisonResponse = waitForJourneyAction(page, "comparison");
  await page.getByRole("link", { name: "Сравнить выбранные" }).click();
  expect((await comparisonResponse).ok()).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Сравнение вариантов" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await expectViewportContained(page);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Сравнение вариантов" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  assertManualCuratedPilot(await readJourneySnapshot(page));

  await page
    .getByRole("link", { name: "Помочь выбрать между этими вариантами" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Экспертная помощь с выбором" }),
  ).toBeVisible();
  await page
    .getByLabel("Сформулируйте вопрос своими словами")
    .fill("Сравните ключевые риски этих финалистов перед решением.");
  const expertResponse = waitForJourneyAction(page, "create_expert_request");
  await page
    .getByRole("button", { name: "Попросить помочь с выбором" })
    .click();
  expect((await expertResponse).ok()).toBe(true);
  await expect(
    page.getByRole("status").filter({ hasText: "Контекстный запрос создан" }),
  ).toBeVisible();

  await page.goto("/add-url");
  await expect(
    page.getByRole("heading", { name: "Объект по ссылке" }),
  ).toBeVisible();
  await page
    .getByLabel("URL")
    .fill("https://fixture.example/listing/apartment");
  const previewResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/user-url-ingestion"),
  );
  await page.getByRole("button", { name: "Проверить ссылку" }).click();
  expect((await previewResponse).ok()).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Проверьте извлечённые данные" }),
  ).toBeVisible();
  await expect(page.getByText(/не подтверждённые факты/)).toBeVisible();

  await page.goto("/property/task-026-not-found");
  await expect(
    page.getByRole("heading", { name: /Объект не найден/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Вернуться/ })).toBeVisible();
});
