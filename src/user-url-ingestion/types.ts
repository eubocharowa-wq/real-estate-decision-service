import type {
  FieldEvidence,
  Offer,
  Property,
  Source,
  SourceSnapshot,
} from "../domain";
import type { IngestionMode, IngestionPolicyDecision } from "./policy";

export type UserUrlIngestionStatus =
  | "received"
  | "source_identified"
  | "policy_checked"
  | "extracting"
  | "partial"
  | "needs_confirmation"
  | "ready_for_normalization"
  | "normalized"
  | "duplicate_candidate"
  | "ready_for_comparison"
  | "blocked"
  | "failed";

export interface UserUrlIngestionInput {
  readonly url: string;
  readonly userRequestId?: string | null;
  readonly comparisonId?: string | null;
  readonly locale?: string | null;
}

export type UserUrlIngestionErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "PRIVATE_NETWORK_BLOCKED"
  | "SOURCE_UNKNOWN"
  | "SOURCE_BLOCKED"
  | "AUTOMATION_NOT_ALLOWED"
  | "FETCH_FAILED"
  | "EXTRACTION_FAILED"
  | "INVALID_STRUCTURE"
  | "INSUFFICIENT_DATA"
  | "DUPLICATE_SUSPECTED";

export interface ValidatedUserUrl {
  readonly originalUrl: string;
  readonly canonicalUrl: string;
  readonly protocol: "http:" | "https:";
  readonly hostname: string;
  readonly pathname: string;
}

export interface SourceIdentification {
  readonly hostname: string;
  readonly knownSourceId: string | null;
  readonly sourceType: Source["source_type"];
  readonly confidence: "exact" | "unknown";
  readonly policyStatus: "configured" | "unknown_source";
}

export type RawIngestionFieldName =
  | "title"
  | "property_type"
  | "market_type"
  | "city"
  | "location_text"
  | "rooms"
  | "area_m2"
  | "floor"
  | "price"
  | "seller_name"
  | "availability"
  | "published_at"
  | "updated_at"
  | "gas"
  | "financing_claim";

export interface RawIngestionField {
  readonly field: RawIngestionFieldName;
  readonly rawValue: unknown;
  readonly parsedValue: unknown;
  readonly evidenceText: string;
  readonly extractionConfidence: number;
  readonly semantics: "fact" | "price_from" | "claim";
}

export interface RawIngestionResult {
  readonly schemaVersion: "1.0";
  readonly ingestionId: string;
  readonly sourceId: string;
  readonly originalUrl: string;
  readonly sourceUrl: string;
  readonly finalUrl: string;
  readonly collectedAt: string;
  readonly status: "complete" | "partial";
  readonly externalListingId: string | null;
  readonly duplicateOfPropertyId: string | null;
  readonly rawFields: readonly RawIngestionField[];
  readonly extractionConfidence: number;
  readonly warnings: readonly string[];
  readonly missingFields: readonly RawIngestionFieldName[];
  readonly adapterVersion: string;
}

export interface ManualConfirmationFields {
  readonly title: string;
  readonly propertyType: Property["property_type"];
  readonly marketType: Property["market_type"];
  readonly city: string;
  readonly locationText: string;
  readonly priceAmount: string | null;
  readonly priceExplicitUnknown: boolean;
  readonly priceFrom: boolean;
  readonly rooms: number | null;
  readonly areaM2: number | null;
  readonly floor: number | null;
  readonly availability: Offer["availability"];
  readonly sellerName: string;
  readonly sourceName: string;
}

export interface MatchingReadiness {
  readonly status: "ready" | "ready_with_unknowns" | "not_ready";
  readonly missingFields: readonly string[];
}

export interface DuplicateCandidateDecision {
  readonly status:
    | "no_candidate"
    | "same_property"
    | "possible_duplicate"
    | "insufficient_data";
  readonly existingPropertyId: string | null;
  readonly reasonCodes: readonly string[];
  readonly preserveAsNewOffer: boolean;
  readonly requiresUserDecision: boolean;
  readonly hookVersion: string;
}

export interface NormalizedUserUrlCandidate {
  readonly schemaVersion: "1.0";
  readonly normalizationVersion: string;
  readonly ingestionId: string;
  readonly originalUrl: string;
  readonly canonicalUrl: string;
  readonly propertyCandidate: Property;
  readonly offerCandidate: Offer;
  readonly source: Source;
  readonly snapshot: SourceSnapshot | null;
  readonly evidence: readonly FieldEvidence[];
  readonly warnings: readonly string[];
  readonly unresolvedFields: readonly string[];
  readonly financingClaims: readonly string[];
  readonly matchingReadiness: MatchingReadiness;
  readonly duplicateDecision: DuplicateCandidateDecision;
  readonly sourceMode: IngestionMode;
}

export interface UserUrlIngestionAuditEvent {
  readonly ingestionId: string;
  readonly sourceId: string | null;
  readonly event:
    | "received"
    | "policy_denied"
    | "adapter_started"
    | "adapter_finished"
    | "normalization_failed"
    | "candidate_ready";
  readonly status: UserUrlIngestionStatus;
  readonly policyReason: IngestionPolicyDecision["reasonCode"] | null;
  readonly adapter: string | null;
  readonly durationMs: number;
  readonly errorCode: UserUrlIngestionErrorCode | null;
}

export interface UserUrlIngestionPreview {
  readonly schemaVersion: "1.0";
  readonly ingestionId: string;
  readonly status: "needs_confirmation" | "blocked" | "failed";
  readonly originalUrl: string;
  readonly canonicalUrl: string | null;
  readonly sourceIdentification: SourceIdentification | null;
  readonly policyDecision: IngestionPolicyDecision | null;
  readonly rawResult: RawIngestionResult | null;
  readonly editableFields: ManualConfirmationFields;
  readonly warnings: readonly string[];
  readonly userMessage: string;
  readonly errorCode: UserUrlIngestionErrorCode | null;
  readonly auditEvents: readonly UserUrlIngestionAuditEvent[];
}

export type UserUrlValidationOutcome =
  | { readonly success: true; readonly value: ValidatedUserUrl }
  | {
      readonly success: false;
      readonly error: {
        readonly code:
          "INVALID_URL" | "UNSUPPORTED_PROTOCOL" | "PRIVATE_NETWORK_BLOCKED";
        readonly message: string;
      };
    };

export type UserUrlConfirmationOutcome =
  | {
      readonly success: true;
      readonly candidate: NormalizedUserUrlCandidate;
      readonly auditEvents: readonly UserUrlIngestionAuditEvent[];
    }
  | {
      readonly success: false;
      readonly error: {
        readonly code: UserUrlIngestionErrorCode;
        readonly message: string;
        readonly missingFields: readonly string[];
      };
      readonly auditEvents: readonly UserUrlIngestionAuditEvent[];
    };
