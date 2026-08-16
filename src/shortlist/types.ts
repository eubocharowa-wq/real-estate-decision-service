import type {
  FieldEvidence,
  FinancingProgram,
  Offer,
  Promotion,
  Property,
  PurchaseScenario,
  Source,
  UserRequest,
} from "../domain";
import type {
  DataQualityBand,
  DataQualityEngineResult,
  MatchingEngineResult,
} from "../matching";

export interface ShortlistCandidateInput {
  readonly property: Property;
  readonly offer: Offer | null;
  readonly purchaseScenario: PurchaseScenario | null;
  readonly financingProgram: FinancingProgram | null;
  readonly promotion: Promotion | null;
  readonly match: MatchingEngineResult;
  readonly dataQuality: DataQualityEngineResult | null;
  readonly sources: readonly Source[];
  readonly fieldEvidence: readonly FieldEvidence[];
}

export interface ShortlistInput {
  readonly userRequest: UserRequest;
  readonly candidates: readonly ShortlistCandidateInput[];
  readonly generatedAt: string;
  readonly partial: boolean;
  readonly datasetNotice: string | null;
}

export type ShortlistPriceKind =
  "exact" | "from" | "old_new" | "unknown" | "conflicting";

export interface ShortlistPriceView {
  readonly kind: ShortlistPriceKind;
  readonly current: string | null;
  readonly previous: string | null;
  readonly label: string;
  readonly note: string | null;
}

export interface ShortlistConfidenceView {
  readonly band: DataQualityBand | "pending";
  readonly label: string;
}

export interface ShortlistFinancingView {
  readonly available: boolean;
  readonly program: string | null;
  readonly initialPayment: string | null;
  readonly monthlyPayment: string | null;
  readonly claimLabel: string | null;
}

export interface ShortlistCardView {
  readonly propertyId: string;
  readonly offerId: string | null;
  readonly purchaseScenarioId: string | null;
  readonly title: string;
  readonly subtitle: string;
  readonly propertyTypeLabel: string;
  readonly secondaryFacts: readonly string[];
  readonly price: ShortlistPriceView;
  readonly matchScore: number;
  readonly matchLabel: string;
  readonly matchContext: string;
  readonly eligibilityStatus:
    "eligible" | "eligible_with_unknowns" | "possible_match";
  readonly eligibilityLabel: string;
  readonly requiresVerification: boolean;
  readonly confidence: ShortlistConfidenceView;
  readonly strengths: readonly string[];
  readonly compromises: readonly string[];
  readonly noMaterialCompromises: boolean;
  readonly criticalUnknowns: readonly string[];
  readonly financing: ShortlistFinancingView;
  readonly availabilityLabel: string;
  readonly freshnessLabel: string;
  readonly sourceSummary: string;
  readonly image: null;
  readonly detailHref: string;
}

export interface ShortlistView {
  readonly requestId: string;
  readonly heading: string;
  readonly description: string;
  readonly requestSummary: readonly string[];
  readonly cards: readonly ShortlistCardView[];
  readonly resultLimit: number;
  readonly generatedAtLabel: string;
  readonly partial: boolean;
  readonly datasetNotice: string | null;
}

export type ShortlistBuildErrorCode =
  "INVALID_GENERATED_AT" | "BROKEN_REFERENCE" | "MISSING_MATCH_SCORE";

export interface ShortlistBuildError {
  readonly code: ShortlistBuildErrorCode;
  readonly message: string;
  readonly entityId: string | null;
}

export type ShortlistBuildOutcome =
  | { readonly success: true; readonly view: ShortlistView }
  | { readonly success: false; readonly error: ShortlistBuildError };
