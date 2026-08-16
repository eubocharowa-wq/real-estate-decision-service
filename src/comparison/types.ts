import type {
  Criterion,
  CriterionEvaluationResult,
  UserRequest,
} from "../domain";
import type { PropertyDetailInput } from "../property-detail";
import type { ComparisonSelection, ComparisonSelectionItem } from "./selection";

export interface ComparisonReadyItemInput {
  readonly status: "ready";
  readonly selection: ComparisonSelectionItem;
  readonly detail: PropertyDetailInput;
}

export interface ComparisonUnavailableItemInput {
  readonly status: "unavailable";
  readonly selection: ComparisonSelectionItem;
  readonly message: string;
}

export type ComparisonItemInput =
  ComparisonReadyItemInput | ComparisonUnavailableItemInput;

export interface ComparisonInput {
  readonly comparisonId: string;
  readonly userRequest: UserRequest;
  readonly selection: ComparisonSelection;
  readonly items: readonly ComparisonItemInput[];
  readonly createdAt: string;
  readonly partial: boolean;
}

export type ComparisonRowStatus =
  CriterionEvaluationResult["status"] | "available" | "unavailable";

export type ComparisonCellState =
  | "neutral"
  | "best_confirmed"
  | "hard_fail"
  | "critical_unknown"
  | "conflict"
  | "not_applicable"
  | "unavailable";

export interface ComparisonCellView {
  readonly propertyId: string;
  readonly value: string;
  readonly status: ComparisonRowStatus;
  readonly statusLabel: string;
  readonly verificationLabel: string;
  readonly freshnessLabel: string | null;
  readonly state: ComparisonCellState;
  readonly detail: string | null;
  readonly comparableValue: string | number | boolean | null;
  readonly fit: number | null;
}

export interface ComparisonRowView {
  readonly id: string;
  readonly label: string;
  readonly target: string | null;
  readonly importance: Criterion["priority"] | "context";
  readonly importanceLabel: string;
  readonly userCriterion: boolean;
  readonly dynamic: boolean;
  readonly cells: readonly ComparisonCellView[];
}

export interface ComparisonSectionView {
  readonly id:
    | "must"
    | "preferred"
    | "avoid"
    | "finance"
    | "timing"
    | "property"
    | "type_specific";
  readonly title: string;
  readonly rows: readonly ComparisonRowView[];
}

export interface ComparisonColumnView {
  readonly status: "ready" | "unavailable";
  readonly propertyId: string;
  readonly offerId: string | null;
  readonly scenarioId: string | null;
  readonly title: string;
  readonly propertyType: string;
  readonly price: string;
  readonly availability: string;
  readonly availabilityWarning: string | null;
  readonly matchScore: number | null;
  readonly matchLabel: string;
  readonly confidence: string;
  readonly confidenceBand: string;
  readonly scenarioLabel: string;
  readonly scenarioVerification: string;
  readonly hardFail: boolean;
  readonly criticalUnknownCount: number;
  readonly criticalConflictCount: number;
  readonly detailHref: string | null;
  readonly errorMessage: string | null;
}

export interface DecisionDriverView {
  readonly id: string;
  readonly rowId: string;
  readonly label: string;
  readonly importance: "high" | "medium";
  readonly description: string;
  readonly leadingPropertyIds: readonly string[];
  readonly affectedPropertyIds: readonly string[];
  readonly spread: {
    readonly minimum: number;
    readonly maximum: number;
  } | null;
  readonly unresolved: boolean;
}

export interface TradeoffView {
  readonly id: string;
  readonly text: string;
  readonly propertyIds: readonly string[];
  readonly driverIds: readonly string[];
}

export type ComparisonConclusionStatus =
  | "clear_leader"
  | "conditional_leader"
  | "near_tie"
  | "insufficient_data"
  | "no_valid_option";

export interface ComparisonConclusionView {
  readonly status: ComparisonConclusionStatus;
  readonly label: string;
  readonly summary: string;
  readonly leadingPropertyId: string | null;
  readonly alternativePropertyId: string | null;
  readonly decisionDriverIds: readonly string[];
  readonly conditions: readonly string[];
  readonly unresolvedQuestions: readonly string[];
}

export interface ComparisonUnknownGroupView {
  readonly propertyId: string;
  readonly propertyTitle: string;
  readonly items: readonly string[];
}

export interface ComparisonView {
  readonly comparisonId: string;
  readonly userRequestId: string;
  readonly userRequestSchemaVersion: string;
  readonly selectionSignature: string;
  readonly requestSummary: readonly string[];
  readonly columns: readonly ComparisonColumnView[];
  readonly sections: readonly ComparisonSectionView[];
  readonly decisionDrivers: readonly DecisionDriverView[];
  readonly tradeoffs: readonly TradeoffView[];
  readonly criticalUnknowns: readonly ComparisonUnknownGroupView[];
  readonly conclusion: ComparisonConclusionView;
  readonly partial: boolean;
  readonly actions: {
    readonly shortlistHref: string;
    readonly editRequestHref: string;
    readonly expertHref: string | null;
    readonly canAdd: boolean;
  };
}

export type ComparisonBuildOutcome =
  | { readonly success: true; readonly view: ComparisonView }
  | {
      readonly success: false;
      readonly error: {
        readonly code:
          | "INVALID_CREATED_AT"
          | "BROKEN_REFERENCE"
          | "MIXED_USER_REQUEST"
          | "INVALID_SELECTION_SIZE";
        readonly message: string;
      };
    };
