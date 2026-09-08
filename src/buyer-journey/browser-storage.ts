export const BUYER_JOURNEY_ID_STORAGE_KEY = "reds:buyer-journey-id:v1";
export const BUYER_SESSION_ID_STORAGE_KEY = "reds:buyer-session-id:v1";

/**
 * The two identifiers the browser still holds, and the only ones.
 *
 * They live in localStorage rather than sessionStorage on purpose: a closed
 * tab clears sessionStorage, so a journey keyed there could never be reopened,
 * however durable the server side was. Everything these two keys point at —
 * the confirmed request, the parser result, the comparison selection, the
 * candidates the buyer added — is read back from the server.
 *
 * A browser that refuses storage (private mode, blocked site data) still works
 * for one uninterrupted visit: the identifiers fall back to memory and are
 * lost when the page does.
 */
const memory = new Map<string, string>();

const readKey = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
};

const writeKey = (key: string, value: string): void => {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is unavailable; the in-memory copy carries this page load.
  }
};

export const getOrCreateBuyerSessionId = (): string => {
  const current = readKey(BUYER_SESSION_ID_STORAGE_KEY);
  if (current) return current;
  const sessionId = `session_${globalThis.crypto.randomUUID().replaceAll("-", "_")}`;
  writeKey(BUYER_SESSION_ID_STORAGE_KEY, sessionId);
  return sessionId;
};

export const getBuyerJourneyId = (): string | null =>
  readKey(BUYER_JOURNEY_ID_STORAGE_KEY);

export const saveBuyerJourneyId = (journeyId: string): void => {
  writeKey(BUYER_JOURNEY_ID_STORAGE_KEY, journeyId);
};

export const clearBuyerJourneyIdentifiersForTests = (): void => {
  memory.clear();
  try {
    window.localStorage.removeItem(BUYER_JOURNEY_ID_STORAGE_KEY);
    window.localStorage.removeItem(BUYER_SESSION_ID_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
};
