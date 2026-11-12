// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../src/buyer-journey/browser-storage", () => ({
  getOrCreateBuyerSessionId: () => "session_public_guard_ui",
  saveBuyerJourneyId: vi.fn(),
}));

vi.mock("../../src/buyer-journey/journey-client", () => ({
  refreshJourneyState: vi.fn(),
  useJourneyState: () => ({ status: "missing" }),
}));

import { RequestEntry } from "../../app/request-entry";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockResolvedValue({
    ok: false,
    json: async () => ({
      error: "PUBLIC_DATA_WRITE_DISABLED",
      title: "Приём новых данных временно закрыт",
      message:
        "Сейчас отправка новых данных недоступна. Введённые данные не были сохранены.",
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("public request denial presentation", () => {
  it("states that input was not saved and makes no success claim", async () => {
    const user = userEvent.setup();
    render(<RequestEntry />);

    await user.type(
      screen.getByLabelText("Ваша задача"),
      "Синтетический запрос для проверки server-side guard.",
    );
    await user.click(screen.getByRole("button", { name: "Проверить условия" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Сейчас приём новых запросов временно закрыт. Введённые данные не были сохранены.",
    );
    expect(alert.textContent).not.toContain("сохранён — попробуйте");
    expect(
      screen.getByText(
        "Если отправка доступна, исходная формулировка сохранится без изменений.",
      ),
    ).toBeTruthy();
  });
});
