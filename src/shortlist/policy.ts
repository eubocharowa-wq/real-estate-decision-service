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
  ordering: "match_score_desc_then_data_confidence_desc",
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
 * Data Confidence as a tiebreaker: higher Match Score leads, and within an
 * equal Match Score, higher Data Confidence leads. Match Score and Data
 * Confidence stay two separate scores (AGENTS.md §13/§16) — this never
 * folds one into the other — but confidence still has to decide who is
 * shown first when two candidates fit equally well. An unconfirmed field
 * (an unconfirmed city among them) lowers Data Confidence through the
 * existing, generic confidence engine, so it is never named here: a
 * candidate with more unknowns simply confirms less and sorts lower.
 * A candidate with no confidence result at all (dataQuality === null)
 * sorts as if its confidence were the lowest possible.
 */
const dataConfidenceScore = (candidate: ShortlistCandidateInput): number =>
  candidate.dataQuality?.data_quality.data_confidence_score ?? -1;

/**
 * Never pads the result with failed or unavailable candidates. Beyond the
 * Match Score / Data Confidence ordering above, two candidates that are
 * equal on both keep the relative order they arrived in — this sort is
 * stable (guaranteed by the language since ES2019).
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
    .sort(
      (left, right) =>
        right.match.match_result.match_score -
          left.match.match_result.match_score ||
        dataConfidenceScore(right) - dataConfidenceScore(left),
    )
    .slice(0, limit);
};
