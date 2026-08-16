import type {
  FieldEvidence,
  FinancingOffer,
  FinancingProgram,
  Offer,
  Promotion,
  Property,
  PurchaseScenario,
  Source,
  SourceConflict,
  UserRequest,
} from "../domain";
import type {
  DataQualityBand,
  DataQualityEngineResult,
  MatchingEngineResult,
} from "../matching";

export interface PropertyDetailInput {
  readonly property: Property;
  readonly offers: readonly Offer[];
  readonly selectedOffer: Offer | null;
  readonly purchaseScenarios: readonly PurchaseScenario[];
  readonly selectedPurchaseScenario: PurchaseScenario | null;
  readonly selectedFinancingProgram: FinancingProgram | null;
  readonly selectedFinancingOffer: FinancingOffer | null;
  readonly selectedPromotion: Promotion | null;
  readonly userRequest: UserRequest | null;
  readonly matching: MatchingEngineResult | null;
  readonly dataQuality: DataQualityEngineResult | null;
  readonly sources: readonly Source[];
  readonly fieldEvidence: readonly FieldEvidence[];
  readonly sourceConflicts: readonly SourceConflict[];
  readonly generatedAt: string;
  readonly partial: boolean;
  readonly contextNotice: string | null;
}

export interface DetailStatusView {
  readonly key: string;
  readonly label: string;
  readonly description: string;
}

export interface PropertyFactView {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly semantics: "known" | "false" | "unknown" | "not_applicable";
  readonly verification: DetailStatusView;
  readonly freshness: DetailStatusView | null;
  readonly requestRelevant: boolean;
}

export interface DecisionPointView {
  readonly id: string;
  readonly text: string;
}

export interface RecommendedCheckView {
  readonly id: string;
  readonly field: string;
  readonly title: string;
  readonly priority: "critical" | "high" | "medium" | "low";
  readonly expertHref: string;
}

export interface UnknownView {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly check: RecommendedCheckView | null;
}

export interface ConflictValueView {
  readonly evidenceId: string;
  readonly value: string;
  readonly source: string;
  readonly checkedAt: string;
  readonly verification: DetailStatusView;
  readonly sourceUrl: string | null;
}

export interface ConflictView {
  readonly id: string;
  readonly title: string;
  readonly severityLabel: string;
  readonly values: readonly ConflictValueView[];
  readonly check: RecommendedCheckView | null;
}

export interface DetailPriceView {
  readonly kind: "exact" | "from" | "unknown" | "conflicting";
  readonly label: string;
  readonly note: string | null;
}

export interface MatchSummaryView {
  readonly score: number;
  readonly label: string;
  readonly eligibility: string;
  readonly hardFail: boolean;
}

export interface DataQualityView {
  readonly confidenceBand: DataQualityBand | "pending";
  readonly confidenceLabel: string;
  readonly completenessBand: DataQualityBand | "pending";
  readonly completenessLabel: string;
  readonly criticalUnknownCount: number;
  readonly criticalConflictCount: number;
}

export interface FinancingRateView {
  readonly id: string;
  readonly period: string;
  readonly rate: string;
  readonly conditions: readonly string[];
}

export interface FinancingFactView {
  readonly label: string;
  readonly value: string;
}

export interface FinancingView {
  readonly available: boolean;
  readonly scenarioId: string | null;
  readonly context: string;
  readonly claimedNotice: string | null;
  readonly facts: readonly FinancingFactView[];
  readonly rates: readonly FinancingRateView[];
  readonly mandatoryCosts: readonly FinancingFactView[];
  readonly assumptions: readonly {
    readonly text: string;
    readonly verification: DetailStatusView;
  }[];
  readonly promotion: string | null;
  readonly priceImpact: string | null;
  readonly verification: DetailStatusView | null;
  readonly freshness: DetailStatusView | null;
}

export interface AlternativeOfferView {
  readonly offerId: string;
  readonly seller: string;
  readonly source: string;
  readonly price: string;
  readonly availability: string;
  readonly commercialTerms: readonly string[];
  readonly financingDifference: string;
  readonly href: string;
}

export interface SourceSectionView {
  readonly sourceId: string;
  readonly name: string;
  readonly typeLabel: string;
  readonly url: string | null;
  readonly checkedAt: string;
  readonly supports: readonly string[];
  readonly evidenceCount: number;
  readonly verification: DetailStatusView;
  readonly freshness: DetailStatusView;
}

export interface PropertyDetailView {
  readonly propertyId: string;
  readonly selectedOfferId: string | null;
  readonly selectedScenarioId: string | null;
  readonly personalized: boolean;
  readonly partial: boolean;
  readonly contextNotice: string | null;
  readonly identity: {
    readonly title: string;
    readonly location: string;
    readonly summary: readonly string[];
    readonly image: null;
  };
  readonly price: DetailPriceView;
  readonly availability: {
    readonly label: string;
    readonly freshness: string;
    readonly checkedAt: string;
  };
  readonly matchSummary: MatchSummaryView | null;
  readonly dataQuality: DataQualityView;
  readonly strengths: readonly DecisionPointView[];
  readonly compromises: readonly DecisionPointView[];
  readonly hardFailures: readonly DecisionPointView[];
  readonly facts: readonly PropertyFactView[];
  readonly timeline: readonly PropertyFactView[];
  readonly criterionResults: readonly PropertyFactView[];
  readonly financing: FinancingView;
  readonly unknowns: readonly UnknownView[];
  readonly conflicts: readonly ConflictView[];
  readonly recommendedChecks: readonly RecommendedCheckView[];
  readonly sources: readonly SourceSectionView[];
  readonly alternativeOffers: readonly AlternativeOfferView[];
  readonly actions: {
    readonly backHref: string;
    readonly describeHref: string;
    readonly editHref: string;
    readonly comparisonHref: string;
  };
}

export type PropertyDetailBuildErrorCode =
  "INVALID_GENERATED_AT" | "BROKEN_REFERENCE";

export type PropertyDetailBuildOutcome =
  | { readonly success: true; readonly view: PropertyDetailView }
  | {
      readonly success: false;
      readonly error: {
        readonly code: PropertyDetailBuildErrorCode;
        readonly message: string;
      };
    };

export type PilotPropertyDetailAdapterOutcome =
  | {
      readonly success: true;
      readonly input: PropertyDetailInput;
      readonly diagnostics: readonly string[];
    }
  | {
      readonly success: false;
      readonly error: {
        readonly code:
          | "PROPERTY_NOT_FOUND"
          | "OFFER_NOT_FOUND"
          | "SCENARIO_NOT_FOUND"
          | "MATCHING_UNAVAILABLE";
        readonly message: string;
      };
    };
