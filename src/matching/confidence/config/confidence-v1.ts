import type { FieldEvidence, Source, SourceConflict } from "../../../domain";

export const CONFIDENCE_ALGORITHM_VERSION = "confidence-v1" as const;
export const CONFIDENCE_POLICY_VERSION = "confidence-policy-v1" as const;

export interface FreshnessPolicy {
  readonly fields: readonly string[];
  readonly fresh_through_hours: number;
  readonly aging_through_hours: number;
}

export const CONFIDENCE_V1_CONFIG = {
  algorithmVersion: CONFIDENCE_ALGORITHM_VERSION,
  policyVersion: CONFIDENCE_POLICY_VERSION,
  verificationFactors: {
    confirmed: 1,
    claimed: 0.7,
    unconfirmed: 0.45,
    conflicting: 0.25,
    stale: 0.5,
    unknown: 0,
  } satisfies Record<FieldEvidence["verification_status"], number>,
  freshnessFactors: {
    fresh: 1,
    aging: 0.85,
    stale: 0.45,
    expired: 0,
    unknown: 0.35,
  } satisfies Record<FieldEvidence["freshness_status"], number>,
  conflictFactors: {
    none: 1,
    minor: 0.8,
    significant: 0.4,
    critical: 0.1,
    unresolved: 0.2,
  },
  evidenceQualityFactors: {
    direct: 1,
    derived: 0.9,
    indirect: 0.8,
    weak: 0.55,
    missing: 0,
  },
  evidenceTypeQuality: {
    primary_source: "direct",
    secondary_source: "indirect",
    document: "direct",
    manual_expert: "direct",
    user_provided: "weak",
    derived: "derived",
    extraction: "weak",
  } satisfies Record<
    FieldEvidence["evidence_type"],
    "direct" | "derived" | "indirect" | "weak"
  >,
  sourceTrustFactors: {
    authoritative: 1,
    primary: 0.95,
    secondary: 0.8,
    user_provided: 0.65,
    unknown: 0.5,
  } satisfies Record<Source["trust_level"], number>,
  conflictSeverityStatus: {
    minor: "minor",
    significant: "significant",
    critical: "critical",
    unknown: "unresolved",
  } satisfies Record<
    SourceConflict["severity"],
    "minor" | "significant" | "critical" | "unresolved"
  >,
  priorityImportance: {
    must: 5,
    exclude: 5,
    preferred: 3,
    avoid: 3,
    neutral: 0,
    unknown: 0,
  },
  conflictCompletenessFactor: 0.5,
  inexactCompletenessFactor: 0.5,
  claimedCompletenessFactor: 0.75,
  agreeingEvidenceBonusPerIndependentOrigin: 0.05,
  scorePrecisionDigits: 6,
  fieldScorePrecisionDigits: 2,
  confidenceBands: {
    high: 85,
    medium: 65,
    low: 40,
  },
  completenessBands: {
    high: 90,
    medium: 70,
    low: 40,
  },
  criticalOverrideMaximumBand: "low" as const,
  operationalFields: {
    availabilityImportance: 5,
    promotionValidityImportance: 5,
  },
  freshnessPolicies: [
    {
      fields: ["availability"],
      fresh_through_hours: 12,
      aging_through_hours: 36,
    },
    {
      fields: ["listing_price"],
      fresh_through_hours: 24,
      aging_through_hours: 72,
    },
    {
      fields: [
        "eligibility_status",
        "family_mortgage",
        "initial_payment",
        "initial_payment.zero_payment_status",
        "monthly_payment",
        "estimated_total_entry_cost",
        "promotion.current_validity",
      ],
      fresh_through_hours: 24,
      aging_through_hours: 72,
    },
    {
      fields: ["timeline.handover_date", "timeline.move_in_possible_date"],
      fresh_through_hours: 168,
      aging_through_hours: 720,
    },
    {
      fields: ["infrastructure.", "mobility."],
      fresh_through_hours: 720,
      aging_through_hours: 2160,
    },
  ] as readonly FreshnessPolicy[],
  evidenceFieldAliases: {
    "initial_payment.zero_payment_status": [
      "initial_payment",
      "financing_terms",
    ],
    eligibility_status: ["eligibility_status", "financing_terms"],
    monthly_payment: ["monthly_payment", "financing_terms"],
    estimated_total_entry_cost: [
      "estimated_total_entry_cost",
      "financing_terms",
    ],
    "promotion.current_validity": ["promotion.current_validity"],
  } satisfies Readonly<Record<string, readonly string[]>>,
} as const;

export type ConfidenceV1Config = typeof CONFIDENCE_V1_CONFIG;
