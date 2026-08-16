export const COMPARISON_POLICY_V1 = Object.freeze({
  version: "comparison-policy-v1",
  minimumItems: 2,
  maximumItems: 4,
  maximumDecisionDrivers: 4,
  maximumTradeoffs: 4,
  minimumCriterionFitGap: 0.15,
  minimumNumericSpreadRatio: 0.08,
  clearLeaderMatchGap: 10,
  nearTieMatchGap: 5,
  expertRequestPath: "/expert/request",
} as const);
