// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../src/buyer-journey/journey-client", () => ({
  refreshJourneyState: vi.fn(),
  useJourneyState: () => ({ status: "missing" }),
}));

import SelectionPage from "../../app/(public)/selection/page";
import ExpertRequestPage from "../../app/expert/request/page";

beforeEach(() => {
  vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", "disabled");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("closed public input pages", () => {
  it("does not render the buyer request form when dynamic writes are denied", () => {
    render(<SelectionPage />);

    expect(
      screen.getByRole("heading", {
        name: "Новый запрос сейчас отправить нельзя",
      }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Ваша задача")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Проверить условия" }),
    ).toBeNull();
  });

  it("does not render or reflect expert input when writes are denied", async () => {
    const privateMarker = "PRIVATE_EXPERT_QUERY_MARKER";
    const page = await ExpertRequestPage({
      searchParams: Promise.resolve({
        request: privateMarker,
        processingApproved: "true",
      }),
    });
    const { container } = render(page);

    expect(
      screen.getByRole("heading", {
        name: "Новые экспертные запросы временно закрыты",
      }),
    ).toBeTruthy();
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByText(privateMarker)).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Передать на экспертную проверку",
      }),
    ).toBeNull();
  });

  it("keeps the GitHub Pages design preview visible but non-submitting", () => {
    vi.stubEnv("GITHUB_PAGES_STATIC_PREVIEW", "1");
    render(<SelectionPage />);

    expect(screen.getByLabelText("Ваша задача")).toBeTruthy();
    const submit = screen.getByRole("button", {
      name: "Недоступно в статическом обзоре",
    });
    expect(submit).toHaveProperty("disabled", true);
    expect(screen.getByText(/форма не отправляет запрос/i)).toBeTruthy();
  });
});
