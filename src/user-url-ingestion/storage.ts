import type { NormalizedUserUrlCandidate } from "./types";

export const USER_URL_CANDIDATES_STORAGE_KEY = "reds.user-url-candidates.v1";

export const readStoredUserUrlCandidates =
  (): readonly NormalizedUserUrlCandidate[] => {
    if (typeof window === "undefined") return [];
    try {
      const value: unknown = JSON.parse(
        window.sessionStorage.getItem(USER_URL_CANDIDATES_STORAGE_KEY) ?? "[]",
      );
      return Array.isArray(value)
        ? (value as NormalizedUserUrlCandidate[])
        : [];
    } catch {
      return [];
    }
  };

export const upsertStoredUserUrlCandidate = (
  candidate: NormalizedUserUrlCandidate,
): void => {
  const current = readStoredUserUrlCandidates();
  const next = [
    ...current.filter((item) => item.canonicalUrl !== candidate.canonicalUrl),
    candidate,
  ];
  window.sessionStorage.setItem(
    USER_URL_CANDIDATES_STORAGE_KEY,
    JSON.stringify(next),
  );
};
