// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BUYER_JOURNEY_ID_STORAGE_KEY,
  BUYER_SESSION_ID_STORAGE_KEY,
  clearBuyerJourneyIdentifiersForTests,
  getBuyerJourneyId,
  getOrCreateBuyerSessionId,
} from "../../src/buyer-journey/browser-storage";
import {
  ensureJourneyState,
  refreshJourneyState,
  resetJourneyStateForTests,
  saveComparisonSelection,
} from "../../src/buyer-journey/journey-client";

/**
 * The browser half of restoration.
 *
 * A reopened tab has two identifiers and no state, and must rebuild its
 * screens from them alone. These tests stub the HTTP boundary and check what
 * the client sends and what it keeps.
 */
const JOURNEY_ID = "journey_client_1";
const SESSION_ID = "session_client_1";

const state = {
  journey_id: JOURNEY_ID,
  session_id: SESSION_ID,
  owner_id: SESSION_ID,
  raw_request_text: "Квартира до 5 млн, семейная ипотека обязательна.",
  current_stage: "shortlist",
  parsed_request: null,
  confirmed_request: null,
  confirmed_request_version: 1,
  comparison_selection: {
    schemaVersion: "1.0",
    userRequestId: "req_1",
    userRequestSchemaVersion: "1.0",
    items: [{ propertyId: "prop_nb_002", offerId: null, scenarioId: null }],
  },
  imported_candidates: [],
};

const jsonResponse = (body: unknown, ok = true) =>
  ({
    ok,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  clearBuyerJourneyIdentifiersForTests();
  resetJourneyStateForTests();
  fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ state })));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetJourneyStateForTests();
});

describe("journey client state", () => {
  it("keeps only the two identifiers in the browser", () => {
    window.localStorage.setItem(BUYER_JOURNEY_ID_STORAGE_KEY, JOURNEY_ID);
    const sessionId = getOrCreateBuyerSessionId();

    expect(Object.keys(window.localStorage).toSorted()).toEqual([
      BUYER_JOURNEY_ID_STORAGE_KEY,
      BUYER_SESSION_ID_STORAGE_KEY,
    ]);
    expect(getBuyerJourneyId()).toBe(JOURNEY_ID);
    expect(sessionId.startsWith("session_")).toBe(true);
  });

  it("survives a closed tab: identifiers outlive sessionStorage", () => {
    window.localStorage.setItem(BUYER_JOURNEY_ID_STORAGE_KEY, JOURNEY_ID);
    // Closing a tab clears sessionStorage but not localStorage.
    window.sessionStorage.clear();

    expect(getBuyerJourneyId()).toBe(JOURNEY_ID);
  });

  it("restores the journey from the stored id", async () => {
    window.localStorage.setItem(BUYER_JOURNEY_ID_STORAGE_KEY, JOURNEY_ID);
    window.localStorage.setItem(BUYER_SESSION_ID_STORAGE_KEY, SESSION_ID);

    const restored = await ensureJourneyState();

    expect(restored).toEqual({ status: "ready", state });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      action: "journey_state",
      journeyId: JOURNEY_ID,
      sessionId: SESSION_ID,
    });
  });

  it("reports a missing journey without calling the server", async () => {
    expect(await ensureJourneyState()).toEqual({ status: "missing" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shares one request between concurrent readers and refreshes on demand", async () => {
    window.localStorage.setItem(BUYER_JOURNEY_ID_STORAGE_KEY, JOURNEY_ID);

    await Promise.all([
      ensureJourneyState(),
      ensureJourneyState(),
      ensureJourneyState(),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A cached read is free; an explicit refresh always asks again.
    await ensureJourneyState();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await refreshJourneyState();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces the server message when restoration fails", async () => {
    window.localStorage.setItem(BUYER_JOURNEY_ID_STORAGE_KEY, JOURNEY_ID);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: "Путь выбора не найден." }, false),
    );

    expect(await ensureJourneyState()).toEqual({
      status: "error",
      message: "Путь выбора не найден.",
    });
  });

  it("puts the previous selection back when the write is refused", async () => {
    window.localStorage.setItem(BUYER_JOURNEY_ID_STORAGE_KEY, JOURNEY_ID);
    await ensureJourneyState();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: "Условия изменились." }, false),
    );

    await expect(saveComparisonSelection(null)).rejects.toThrow(
      "Условия изменились.",
    );
    expect(await ensureJourneyState()).toEqual({ status: "ready", state });
  });
});
