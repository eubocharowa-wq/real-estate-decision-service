import type { MatchResult, Offer } from "../domain";
import type { ShortlistCandidateInput } from "./types";

export const SHORTLIST_POLICY_V1 = Object.freeze({
  version: "shortlist-policy-v1",
  includedEligibilityStatuses: [
    "eligible",
    "eligible_with_unknowns",
    "possible_match",
  ] as const satisfies readonly MatchResult["eligibility_status"][],
  excludedAvailabilityStatuses: [
    "sold",
    "temporarily_unavailable",
  ] as const satisfies readonly Offer["availability"][],
  minResultLimit: 5,
  maxResultLimit: 10,
  defaultResultLimit: 10,
  maxStrengths: 3,
  maxCompromises: 2,
  maxCriticalUnknowns: 3,
  ordering: "provided_input_order",
});

const contains = <T extends string>(
  values: readonly T[],
  value: string,
): value is T => values.some((candidate) => candidate === value);

export const resolveShortlistLimit = (requestedLimit: number): number => {
  if (!Number.isInteger(requestedLimit)) {
    return SHORTLIST_POLICY_V1.defaultResultLimit;
  }
  return Math.min(
    SHORTLIST_POLICY_V1.maxResultLimit,
    Math.max(SHORTLIST_POLICY_V1.minResultLimit, requestedLimit),
  );
};

/**
 * The only primary-shortlist filter. It deliberately preserves provided order
 * and never pads the result with failed or unavailable candidates.
 */
export const applyShortlistPolicy = (
  candidates: readonly ShortlistCandidateInput[],
  requestedLimit: number,
): readonly ShortlistCandidateInput[] => {
  const limit = resolveShortlistLimit(requestedLimit);
  return candidates
    .filter((candidate) =>
      contains(
        SHORTLIST_POLICY_V1.includedEligibilityStatuses,
        candidate.match.match_result.eligibility_status,
      ),
    )
    .filter(
      (candidate) =>
        candidate.offer === null ||
        !contains(
          SHORTLIST_POLICY_V1.excludedAvailabilityStatuses,
          candidate.offer.availability,
        ),
    )
    .slice(0, limit);
};
