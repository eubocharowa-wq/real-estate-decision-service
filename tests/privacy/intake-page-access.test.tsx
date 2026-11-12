// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { connection } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../src/buyer-journey/journey-client", () => ({
  refreshJourneyState: vi.fn(),
  useJourneyState: vi.fn(() => ({ status: "missing" })),
}));

import SelectionPage from "../../app/(public)/selection/page";
import ExpertRequestPage from "../../app/expert/request/page";
import { useJourneyState } from "../../src/buyer-journey/journey-client";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GITHUB_PAGES_STATIC_PREVIEW", "");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("public form availability uses the server write policy", () => {
  it("does not collect buyer input or restore a journey with missing production permission", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", undefined);
    render(await SelectionPage());

    expect(
      screen.getByRole("heading", {
        name: "Приём новых запросов временно закрыт",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Проверить условия" }),
    ).toBeNull();
    expect(useJourneyState).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connection).toHaveBeenCalledOnce();
    expect(
      screen
        .getByRole("link", { name: "Как проверяем информацию" })
        .getAttribute("href"),
    ).toBe("/methodology");
  });

  it("does not expose an expert form or submitted context while intake is disabled", async () => {
    vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", "disabled");
    const { container } = render(
      await ExpertRequestPage({
        searchParams: Promise.resolve({ request: "PRIVATE_QUERY_MARKER" }),
      }),
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toContain("PRIVATE_QUERY_MARKER");
    expect(
      screen.getByText("Приём новых запросов временно закрыт"),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connection).toHaveBeenCalledOnce();
  });

  it("keeps incomplete public approval closed", async () => {
    vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", "approved_public");
    vi.stubEnv("REDS_PUBLIC_DATA_PROCESSING_APPROVAL_REF", " ");
    render(await SelectionPage());

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByText("Приём новых запросов временно закрыт"),
    ).toBeTruthy();
  });

  it("renders buyer input only for an explicitly approved server context", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", "approved_public");
    vi.stubEnv(
      "REDS_PUBLIC_DATA_PROCESSING_APPROVAL_REF",
      "synthetic_review_ref",
    );
    render(await SelectionPage());

    expect(screen.getByLabelText("Ваша задача")).toBeTruthy();
    expect(
      screen.queryByText("Приём новых запросов временно закрыт"),
    ).toBeNull();
    expect(connection).toHaveBeenCalledOnce();
  });

  it("preserves the synthetic expert form", async () => {
    vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", "synthetic_test");
    render(
      await ExpertRequestPage({
        searchParams: Promise.resolve({
          property: "property_synthetic",
          request: "request_synthetic",
          field: "financing.family_mortgage",
          check: "confirm_family_mortgage",
        }),
      }),
    );

    expect(
      screen.getByLabelText("Сформулируйте вопрос своими словами"),
    ).toBeTruthy();
    expect(connection).toHaveBeenCalledOnce();
  });

  it("keeps GitHub Pages static and unable to submit even with a server permission", async () => {
    vi.stubEnv("GITHUB_PAGES_STATIC_PREVIEW", "1");
    vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", "approved_public");
    vi.stubEnv(
      "REDS_PUBLIC_DATA_PROCESSING_APPROVAL_REF",
      "synthetic_review_ref",
    );
    const user = userEvent.setup();
    render(await SelectionPage());

    const button = screen.getByRole("button", {
      name: "Недоступно в статическом обзоре",
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    await user.click(button);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connection).not.toHaveBeenCalled();
    expect(useJourneyState).toHaveBeenCalledWith({ enabled: false });
  });
});
