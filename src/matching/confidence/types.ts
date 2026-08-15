import type {
  Criterion,
  DataQuality,
  FieldEvidence,
  MatchResult,
  Offer,
  Promotion,
  PurchaseScenario,
  Source,
  SourceConflict,
  UserRequest,
} from "../../domain";
import type {
  DataQualityReasonCode,
  RecommendedCheckCode,
} from "./reason-codes";

export type DataQualityBand = "high" | "medium" | "low" | "critical";
export type DataQualityConflictStatus =
  DataQuality["fields"][number]["conflict_status"];
export type DataQualityEvidenceQuality =
  DataQuality["fields"][number]["evidence_quality"];

export interface CalculateDataQualityInput {
  readonly userRequest: UserRequest;
  readonly matchResult: MatchResult;
  readonly fieldEvidence: readonly FieldEvidence[];
  readonly sourceConflicts: readonly SourceConflict[];
  readonly sources: readonly Source[];
  readonly selectedOffer?: Offer | null;
  readonly selectedPurchaseScenario?: PurchaseScenario | null;
  readonly selectedPromotion?: Promotion | null;
  readonly currentTime: string;
}

export interface FieldConfidenceFactors {
  readonly verification: number;
  readonly freshness: number;
  readonly conflict: number;
  readonly evidence_quality: number;
}

export interface FieldConfidenceCalculation {
  readonly confidence_ratio: number;
  readonly confidence_score: number;
  readonly factors: FieldConfidenceFactors;
}

export interface RecommendedCheck {
  readonly field: string;
  readonly criterion_ids: readonly string[];
  readonly code: RecommendedCheckCode;
  readonly priority: "critical" | "high" | "medium" | "low";
  readonly evidence_refs: readonly string[];
}

export interface FieldDataQualityResult {
  readonly field: string;
  readonly data_fields: readonly string[];
  readonly criterion_ids: readonly string[];
  readonly importance: number;
  readonly confidence_score: number;
  readonly completeness_factor: number;
  readonly verification_status: FieldEvidence["verification_status"];
  readonly freshness_status: FieldEvidence["freshness_status"];
  readonly conflict_status: DataQualityConflictStatus;
  readonly evidence_quality: DataQualityEvidenceQuality;
  readonly evidence_count: number;
  readonly evidence_refs: readonly string[];
  readonly critical: boolean;
  readonly factors: FieldConfidenceFactors;
  readonly reason_codes: readonly DataQualityReasonCode[];
  readonly recommended_check: RecommendedCheck | null;
}

export interface CriticalUnknown {
  readonly field: string;
  readonly criterion_ids: readonly string[];
  readonly reason: DataQualityReasonCode;
  readonly current_status: string;
  readonly recommended_check: RecommendedCheck;
}

export interface CriticalConflict {
  readonly field: string;
  readonly criterion_ids: readonly string[];
  readonly evidence_refs: readonly string[];
  readonly reason: "FIELD_CONFLICTING";
  readonly recommended_check: RecommendedCheck;
}

export interface DataQualityEngineResult {
  readonly data_quality: DataQuality;
  readonly match_result: MatchResult;
  readonly confidence_status: DataQualityBand;
  readonly completeness_status: DataQualityBand;
  readonly field_results: readonly FieldDataQualityResult[];
  readonly critical_unknowns: readonly CriticalUnknown[];
  readonly critical_conflicts: readonly CriticalConflict[];
  readonly recommended_checks: readonly RecommendedCheck[];
  readonly algorithm_version: string;
  readonly policy_version: string;
  readonly calculated_at: string;
  readonly excluded_criterion_ids: readonly string[];
}

export type DataQualityEngineErrorCode =
  | "MALFORMED_USER_REQUEST"
  | "MALFORMED_MATCH_RESULT"
  | "MALFORMED_FIELD_EVIDENCE"
  | "MALFORMED_SOURCE_CONFLICT"
  | "MALFORMED_SOURCE"
  | "MALFORMED_SELECTED_OFFER"
  | "MALFORMED_SELECTED_SCENARIO"
  | "MALFORMED_SELECTED_PROMOTION"
  | "INVALID_CURRENT_TIME"
  | "DUPLICATE_CRITERION_ID"
  | "BROKEN_REFERENCE"
  | "UNSUPPORTED_CRITERION";

export interface DataQualityEngineError {
  readonly code: DataQualityEngineErrorCode;
  readonly message: string;
  readonly entity_id: string | null;
  readonly criterion_id: string | null;
}

export type DataQualityEngineOutcome =
  | { readonly success: true; readonly result: DataQualityEngineResult }
  | { readonly success: false; readonly error: DataQualityEngineError };

export interface RelevantCriterion {
  readonly criterion: Criterion;
  readonly result: MatchResult["criteria_results"][number];
}
