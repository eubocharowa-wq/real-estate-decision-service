export const MATCHING_V1_CONFIG = {
  algorithmVersion: "matching-v1",
  aggregation: {
    groupStrategy: "weighted_average",
    groupWeightStrategy: "maximum_member_weight",
    scorePrecisionDigits: 6,
    defaultPriorityWeights: {
      preferred: 3,
      avoid: 4,
    },
  },
  scenarioSelection: {
    eligibilityOrder: {
      eligible: 5,
      eligible_with_unknowns: 4,
      possible_match: 3,
      insufficient_data: 2,
      hard_fail: 1,
      unavailable: 0,
    },
    verificationOrder: {
      confirmed: 6,
      stale: 5,
      claimed: 4,
      unconfirmed: 3,
      unknown: 2,
      conflicting: 1,
    },
    tieBreakOrder: [
      "eligibility",
      "financing_fit",
      "scenario_verification",
      "lower_total_entry_cost",
      "stable_scenario_id",
      "stable_offer_id",
    ],
  },
  freshnessOrder: {
    fresh: 0,
    aging: 1,
    stale: 2,
    expired: 3,
    unknown: 4,
  },
  explanations: {
    maximumStrengths: 5,
    maximumCompromises: 5,
    strengthMinimumFit: 0.75,
  },
  summary: {
    strongMatchMinimumScore: 85,
  },
  unavailableOfferStatuses: ["sold", "temporarily_unavailable"],
  formalMetricPlaceholder: 0,
} as const;

export type MatchingV1Config = typeof MATCHING_V1_CONFIG;
