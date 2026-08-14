import type { Criterion } from "../../domain";
import { MATCHING_V1_CONFIG } from "../config";
import type { CriterionResultPair, ScoreAggregationResult } from "./types";

const roundScore = (value: number): number => {
  const factor = 10 ** MATCHING_V1_CONFIG.aggregation.scorePrecisionDigits;
  return Math.round(value * factor) / factor;
};

export const criterionWeight = (criterion: Criterion): number | null => {
  if (criterion.priority === "preferred" || criterion.priority === "avoid") {
    return (
      criterion.weight ??
      MATCHING_V1_CONFIG.aggregation.defaultPriorityWeights[criterion.priority]
    );
  }
  return null;
};

const isEvaluableSoftResult = (pair: CriterionResultPair): boolean =>
  criterionWeight(pair.criterion) !== null &&
  pair.result.fit !== null &&
  ["matched", "partially_matched", "not_matched"].includes(pair.result.status);

export const aggregateCriteria = (
  pairs: readonly CriterionResultPair[],
): ScoreAggregationResult => {
  const evaluable = pairs.filter(isEvaluableSoftResult);
  const excluded = pairs
    .filter((pair) => !isEvaluableSoftResult(pair))
    .map((pair) => pair.criterion.criterion_id)
    .sort();
  const grouped = new Map<string, CriterionResultPair[]>();

  for (const pair of evaluable) {
    const groupId =
      pair.criterion.criterion_group_id ?? pair.criterion.criterion_id;
    const members = grouped.get(groupId) ?? [];
    members.push(pair);
    grouped.set(groupId, members);
  }

  const groups = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupId, members]) => {
      const memberWeights = members.map((member) =>
        criterionWeight(member.criterion)!,
      );
      const memberWeightSum = memberWeights.reduce(
        (sum, weight) => sum + weight,
        0,
      );
      const fit =
        members.reduce(
          (sum, member, index) =>
            sum + member.result.fit! * memberWeights[index],
          0,
        ) / memberWeightSum;
      const weight = Math.max(...memberWeights);
      return {
        group_id: groupId,
        criterion_ids: members
          .map((member) => member.criterion.criterion_id)
          .sort(),
        fit,
        weight,
        contribution: fit * weight,
      };
    });

  const weightedSum = groups.reduce(
    (sum, group) => sum + group.contribution,
    0,
  );
  const weightSum = groups.reduce((sum, group) => sum + group.weight, 0);
  return {
    score: weightSum === 0 ? 0 : roundScore((weightedSum / weightSum) * 100),
    status: weightSum === 0 ? "no_evaluable_criteria" : "calculated",
    weighted_sum: roundScore(weightedSum),
    weight_sum: weightSum,
    included_criterion_ids: evaluable
      .map((pair) => pair.criterion.criterion_id)
      .sort(),
    excluded_criterion_ids: excluded,
    groups: groups.map((group) => ({
      ...group,
      fit: roundScore(group.fit),
      contribution: roundScore(group.contribution),
    })),
  };
};
