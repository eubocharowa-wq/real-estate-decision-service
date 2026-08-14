import type { CriterionEvaluationResult, MatchResult } from "../../domain";
import { MATCHING_V1_CONFIG } from "../config";
import { criterionWeight } from "./aggregation";
import type {
  CriterionResultPair,
  MatchSummaryCode,
  StructuredCriterionExplanation,
} from "./types";

const explanationCode = (result: CriterionEvaluationResult): string => {
  const code = result.explanation_data.explanation_code;
  return typeof code === "string" ? code : "CRITERION_EVALUATED";
};

export const structuredCriterion = (
  pair: CriterionResultPair,
  codeOverride?: string,
): StructuredCriterionExplanation => {
  const weight = criterionWeight(pair.criterion);
  return {
    criterion_id: pair.criterion.criterion_id,
    code: codeOverride ?? explanationCode(pair.result),
    status: pair.result.status,
    priority: pair.criterion.priority,
    weight,
    fit: pair.result.fit,
    contribution:
      weight === null || pair.result.fit === null
        ? null
        : weight * pair.result.fit,
    actual: pair.result.actual,
    target: pair.result.target,
    verification_status: pair.result.verification_status,
    freshness_status: pair.result.freshness_status,
    evidence_refs: pair.result.evidence_refs,
  };
};

const byContributionThenId = (
  left: StructuredCriterionExplanation,
  right: StructuredCriterionExplanation,
): number =>
  (right.contribution ?? 0) - (left.contribution ?? 0) ||
  left.criterion_id.localeCompare(right.criterion_id);

export const selectStrengths = (
  pairs: readonly CriterionResultPair[],
): readonly StructuredCriterionExplanation[] =>
  pairs
    .filter(
      (pair) =>
        pair.result.status === "matched" &&
        pair.result.fit !== null &&
        pair.result.fit >= MATCHING_V1_CONFIG.explanations.strengthMinimumFit &&
        criterionWeight(pair.criterion) !== null,
    )
    .map((pair) => structuredCriterion(pair))
    .sort(byContributionThenId)
    .slice(0, MATCHING_V1_CONFIG.explanations.maximumStrengths);

export const selectCompromises = (
  pairs: readonly CriterionResultPair[],
): readonly StructuredCriterionExplanation[] =>
  pairs
    .filter(
      (pair) =>
        criterionWeight(pair.criterion) !== null &&
        (["partially_matched", "not_matched", "conflicting"].includes(
          pair.result.status,
        ) ||
          (pair.result.fit !== null &&
            pair.result.fit <
              MATCHING_V1_CONFIG.explanations.strengthMinimumFit)),
    )
    .map((pair) => structuredCriterion(pair))
    .sort(
      (left, right) =>
        (left.fit ?? 1) - (right.fit ?? 1) ||
        left.criterion_id.localeCompare(right.criterion_id),
    )
    .slice(0, MATCHING_V1_CONFIG.explanations.maximumCompromises);

export const summaryCode = (
  eligibility: MatchResult["eligibility_status"],
  matchScore: number,
): MatchSummaryCode => {
  switch (eligibility) {
    case "unavailable":
      return "UNAVAILABLE";
    case "insufficient_data":
      return "INSUFFICIENT_DATA";
    case "hard_fail":
      return "HARD_CRITERIA_FAILED";
    case "possible_match":
      return "CONDITIONAL_MATCH";
    case "eligible_with_unknowns":
      return "GOOD_MATCH_WITH_UNKNOWNS";
    case "eligible":
      return matchScore >= MATCHING_V1_CONFIG.summary.strongMatchMinimumScore
        ? "STRONG_MATCH"
        : "CONDITIONAL_MATCH";
  }
};
