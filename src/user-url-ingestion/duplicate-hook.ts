import type { DuplicateCandidateDecision, RawIngestionResult } from "./types";

export const USER_URL_DUPLICATE_HOOK_VERSION = "user-url-duplicate-hook-v1";

/**
 * Conservative hook: only the deterministic fixture's strong identity link is
 * accepted automatically. Similar text/address is never enough to merge.
 */
export const evaluateDuplicateCandidate = (
  raw: RawIngestionResult,
): DuplicateCandidateDecision =>
  raw.duplicateOfPropertyId
    ? {
        status: "same_property",
        existingPropertyId: raw.duplicateOfPropertyId,
        reasonCodes: ["STRONG_FIXTURE_IDENTITY_LINK"],
        preserveAsNewOffer: true,
        requiresUserDecision: false,
        hookVersion: USER_URL_DUPLICATE_HOOK_VERSION,
      }
    : {
        status: "no_candidate",
        existingPropertyId: null,
        reasonCodes: [],
        preserveAsNewOffer: false,
        requiresUserDecision: false,
        hookVersion: USER_URL_DUPLICATE_HOOK_VERSION,
      };
