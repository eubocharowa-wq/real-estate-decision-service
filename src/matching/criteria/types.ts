import type {
  Criterion,
  CriterionEvaluationResult,
  FieldEvidence,
  FinancingProgram,
  Offer,
  Property,
  PropertyFinancingEligibility,
  PurchaseScenario,
  SourceConflict,
} from "../../domain";

export const CRITERIA_REGISTRY_VERSION = "criteria-registry-v1" as const;
export const CRITERIA_EVALUATOR_VERSION = "criteria-evaluators-v1" as const;

export type EvaluatorType =
  | "boolean"
  | "exact"
  | "set"
  | "min"
  | "max"
  | "range"
  | "distance"
  | "travel_time"
  | "date"
  | "categorical"
  | "financial"
  | "applicability"
  | "derived";

export type ActualEntity =
  | "property"
  | "offer"
  | "purchase_scenario"
  | "financing_eligibility"
  | "evidence"
  | "derived";

export interface CriterionDefinition {
  readonly key: string;
  readonly category: Criterion["category"];
  readonly evaluatorType: EvaluatorType;
  readonly supportedOperators: readonly Criterion["operator"][];
  readonly actualEntity: ActualEntity;
  readonly actualField: string;
  readonly conflictFields: readonly string[];
  readonly aliases: readonly string[];
  readonly valueType:
    "boolean" | "number" | "money" | "date" | "string" | "set";
  readonly allowedUnits: readonly string[];
  readonly applicablePropertyTypes: readonly Property["property_type"][];
  readonly sourceRequirement: Criterion["source_requirement"];
  readonly freshnessRequirement: Criterion["freshness_requirement"];
  readonly supportsTolerance: boolean;
  readonly supportsSoftCurve: boolean;
}

export interface CriterionEvaluationContext {
  readonly property: Property;
  readonly offer?: Offer | null;
  readonly purchaseScenario?: PurchaseScenario | null;
  readonly financingEligibility?: PropertyFinancingEligibility | null;
  readonly financingProgram?: FinancingProgram | null;
  readonly fieldEvidence?: readonly FieldEvidence[];
  readonly sourceConflicts?: readonly SourceConflict[];
  readonly currentTime: string;
}

export interface NormalizedActualValue {
  readonly value: CriterionEvaluationResult["actual"];
  readonly verificationStatus: CriterionEvaluationResult["verification_status"];
  readonly freshnessStatus: CriterionEvaluationResult["freshness_status"];
  readonly evidenceRefs: readonly string[];
  readonly exact: boolean;
  readonly unknownReason: string | null;
}

export type CriterionEvaluationErrorCode =
  | "MALFORMED_CRITERION"
  | "UNSUPPORTED_CRITERION"
  | "UNSUPPORTED_OPERATOR"
  | "INVALID_UNIT"
  | "INVALID_TARGET"
  | "CONTEXT_MISMATCH";

export interface CriterionEvaluationError {
  readonly code: CriterionEvaluationErrorCode;
  readonly criterionId: string | null;
  readonly message: string;
}

export type CriterionEvaluationOutcome =
  | {
      readonly success: true;
      readonly result: CriterionEvaluationResult;
    }
  | {
      readonly success: false;
      readonly error: CriterionEvaluationError;
    };

export interface ComparisonResult {
  readonly matched: boolean;
  readonly fit: number;
  readonly margin: CriterionEvaluationResult["margin"];
  readonly explanationCode: string;
  readonly explanationParams: Record<
    string,
    CriterionEvaluationResult["actual"]
  >;
}
