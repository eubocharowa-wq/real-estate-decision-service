// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/buyer-journey/browser-storage", () => ({
  getOrCreateBuyerSessionId: () => "session_property_error_test",
}));

vi.mock("../../src/buyer-journey/journey-client", () => ({
  useJourneyState: () => ({
    status: "ready",
    state: { journey_id: "journey_property_error_test" },
  }),
}));

import { PropertyDetailClient } from "../../src/property-detail/components";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("PropertyDetailClient error presentation", () => {
  it("preserves ENTITY_NOT_FOUND title and description", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({
        code: "ENTITY_NOT_FOUND",
        title: "Объект не найден",
        message: "Он мог быть удалён из текущего набора данных.",
      }),
    });

    render(<PropertyDetailClient propertyId="missing-property" />);

    expect(
      await screen.findByRole("heading", { name: "Объект не найден" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Он мог быть удалён из текущего набора данных."),
    ).toBeTruthy();
  });
});
