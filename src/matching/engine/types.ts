import type {
  Criterion,
  CriterionEvaluationResult,
  FieldEvidence,
  FinancingProgram,
  MatchResult,
  Offer,
  Property,
  PropertyFinancingEligibility,
  PurchaseScenario,
  SourceConflict,
  UserRequest,
} from "../../domain";

export const MATCHING_ALGORITHM_VERSION = "matching-v1" as const;

export type MatchSummaryCode =
  | "STRONG_MATCH"
  | "GOOD_MATCH_WITH_UNKNOWNS"
  | "CONDITIONAL_MATCH"
  | "HARD_CRITERIA_FAILED"
  | "INSUFFICIENT_DATA"
  | "UNAVAILABLE";

export type MetricCalculationStatus =
  "calculated" | "no_evaluable_criteria" | "not_calculated";

export interface MatchPropertyInput {
  readonly userRequest: UserRequest;
  readonly property: Property;
  readonly offers: readonly Offer[];
  readonly purchaseScenarios: readonly PurchaseScenario[];
  readonly financingEligibility?: readonly PropertyFinancingEligibility[];
  readonly financingPrograms?: readonly FinancingProgram[];
  readonly fieldEvidence?: readonly FieldEvidence[];
  readonly sourceConflicts?: readonly SourceConflict[];
  readonly currentTime: string;
}

export interface StructuredCriterionExplanation {
  readonly criterion_id: string;
  readonly code: string;
  readonly status: CriterionEvaluationResult["status"];
  readonly priority: Criterion["priority"];
  readonly weight: number | null;
  readonly fit: number | null;
  readonly contribution: number | null;
  readonly actual: CriterionEvaluationResult["actual"];
  readonly target: CriterionEvaluationResult["target"];
  readonly verification_status: CriterionEvaluationResult["verification_status"];
  readonly freshness_status: CriterionEvaluationResult["freshness_status"];
  readonly evidence_refs: readonly string[];
}

export interface StructuredScenarioUnknown {
  readonly scenario_id: string;
  readonly code: string;
  readonly verification_status: PurchaseScenario["verification_status"];
  readonly compatibility_status: PurchaseScenario["terms_compatibility_status"];
  readonly evidence_refs: readonly string[];
}

export interface StructuredMatchExplanation {
  readonly summary_code: MatchSummaryCode;
  readonly strengths: readonly StructuredCriterionExplanation[];
  readonly compromises: readonly StructuredCriterionExplanation[];
  readonly hard_failures: readonly StructuredCriterionExplanation[];
  readonly critical_unknowns: readonly StructuredCriterionExplanation[];
  readonly scenario_unknowns: readonly StructuredScenarioUnknown[];
}

export interface AggregationGroupDetail {
  readonly group_id: string;
  readonly criterion_ids: readonly string[];
  readonly fit: number;
  readonly weight: number;
  readonly contribution: number;
}

export interface ScoreAggregationResult {
  readonly score: number;
  readonly status: Exclude<MetricCalculationStatus, "not_calculated">;
  readonly weighted_sum: number;
  readonly weight_sum: number;
  readonly included_criterion_ids: readonly string[];
  readonly excluded_criterion_ids: readonly string[];
  readonly groups: readonly AggregationGroupDetail[];
}

export interface MatchMetricStatuses {
  readonly match_score: MetricCalculationStatus;
  readonly property_fit_score: MetricCalculationStatus;
  readonly financing_fit_score: MetricCalculationStatus;
  readonly data_confidence_score: "not_calculated";
  readonly data_completeness_score: "not_calculated";
  readonly ranking_score: "not_calculated";
}

export interface ScenarioCandidateSummary {
  readonly offer_id: string | null;
  readonly purchase_scenario_id: string | null;
  readonly eligibility_status: MatchResult["eligibility_status"];
  readonly match_score: number;
  readonly financing_fit_score: number;
  readonly scenario_verification_status:
    PurchaseScenario["verification_status"] | null;
}

export interface ScenarioSelectionDetails {
  readonly selected_offer_id: string | null;
  readonly selected_purchase_scenario_id: string | null;
  readonly selection_code: string;
  readonly tie_break_order: readonly string[];
  readonly candidates: readonly ScenarioCandidateSummary[];
}

export interface MatchingEngineResult {
  readonly match_result: MatchResult;
  readonly selected_offer_id: string | null;
  readonly summary_code: MatchSummaryCode;
  readonly metric_statuses: MatchMetricStatuses;
  readonly score_details: {
    readonly overall: ScoreAggregationResult;
    readonly property: ScoreAggregationResult;
    readonly financing: ScoreAggregationResult;
  };
  readonly explanation: StructuredMatchExplanation;
  readonly scenario_selection: ScenarioSelectionDetails;
}

export type MatchingEngineErrorCode =
  | "MALFORMED_USER_REQUEST"
  | "MALFORMED_PROPERTY"
  | "MALFORMED_OFFER"
  | "MALFORMED_PURCHASE_SCENARIO"
  | "MALFORMED_FINANCING_ELIGIBILITY"
  | "MALFORMED_FINANCING_PROGRAM"
  | "MALFORMED_FIELD_EVIDENCE"
  | "MALFORMED_SOURCE_CONFLICT"
  | "INVALID_CURRENT_TIME"
  | "DUPLICATE_CRITERION_ID"
  | "BROKEN_REFERENCE"
  | "UNSUPPORTED_CRITERION"
  | "CRITERION_EVALUATION_FAILED";

export interface MatchingEngineError {
  readonly code: MatchingEngineErrorCode;
  readonly message: string;
  readonly entity_id: string | null;
  readonly criterion_id: string | null;
}

export type MatchPropertyOutcome =
  | { readonly success: true; readonly result: MatchingEngineResult }
  | { readonly success: false; readonly error: MatchingEngineError };

export interface CriterionResultPair {
  readonly criterion: Criterion;
  readonly result: CriterionEvaluationResult;
}
