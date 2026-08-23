export const BUYER_JOURNEY_ID_STORAGE_KEY = "reds:buyer-journey-id:v1";
export const BUYER_SESSION_ID_STORAGE_KEY = "reds:buyer-session-id:v1";

export const getOrCreateBuyerSessionId = (): string => {
  const current = window.sessionStorage.getItem(BUYER_SESSION_ID_STORAGE_KEY);
  if (current) return current;
  const sessionId = `session_${globalThis.crypto.randomUUID().replaceAll("-", "_")}`;
  window.sessionStorage.setItem(BUYER_SESSION_ID_STORAGE_KEY, sessionId);
  return sessionId;
};

export const getBuyerJourneyId = (): string | null =>
  window.sessionStorage.getItem(BUYER_JOURNEY_ID_STORAGE_KEY);

export const saveBuyerJourneyId = (journeyId: string): void => {
  window.sessionStorage.setItem(BUYER_JOURNEY_ID_STORAGE_KEY, journeyId);
};
