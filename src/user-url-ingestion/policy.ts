import type { SourceIdentification } from "./types";

export const USER_URL_INGESTION_POLICY_V1 = Object.freeze({
  version: "user-url-ingestion-policy-v1",
  maximumUrlLength: 2_048,
  maximumRedirects: 3,
  maximumResponseBytes: 1_500_000,
  requestTimeoutMs: 8_000,
  minimumComparisonFields: Object.freeze([
    "property_type",
    "location",
    "identity",
    "price_or_explicit_unknown",
  ]),
  removableTrackingParameters: Object.freeze([
    "gclid",
    "fbclid",
    "yclid",
    "mc_cid",
    "mc_eid",
  ]),
  removableTrackingPrefixes: Object.freeze(["utm_"]),
} as const);

export type IngestionMode =
  | "automatic_allowed"
  | "fixture_mock"
  | "manual_confirmation"
  | "unsupported"
  | "blocked";

export type AllowedIngestionMethod =
  | "fixture_mock"
  | "manual"
  | "api"
  | "feed"
  | "http_fetch"
  | "browser_agent"
  | "openclaw"
  | "partner_connector";

export interface IngestionPolicyDecision {
  readonly policyVersion: string;
  readonly sourceId: string | null;
  readonly mode: IngestionMode;
  readonly canAccess: boolean;
  readonly canAutomate: boolean;
  readonly canStore: boolean;
  readonly canDisplay: boolean;
  readonly canRefresh: boolean;
  readonly allowedMethods: readonly AllowedIngestionMethod[];
  readonly requiresManualReview: boolean;
  readonly reasonCode:
    | "FIXTURE_APPROVED"
    | "MANUAL_ONLY"
    | "SOURCE_BLOCKED"
    | "PARTNER_API_ONLY"
    | "PERMISSION_REQUIRED"
    | "SOURCE_UNKNOWN";
}

export interface SourcePolicyResolver {
  resolve(identification: SourceIdentification): IngestionPolicyDecision;
}

interface SourcePolicyConfig {
  readonly mode: IngestionMode;
  readonly canAccess: boolean;
  readonly canAutomate: boolean;
  readonly canStore: boolean;
  readonly canDisplay: boolean;
  readonly canRefresh: boolean;
  readonly allowedMethods: readonly AllowedIngestionMethod[];
  readonly requiresManualReview: boolean;
  readonly reasonCode: IngestionPolicyDecision["reasonCode"];
}

const policy = (config: SourcePolicyConfig): Readonly<SourcePolicyConfig> =>
  Object.freeze(config);

/**
 * TASK-012 policy stub. It is deliberately small and versioned; TASK-013 owns
 * the full runtime registry. Hostname identification never grants permission.
 */
export const SOURCE_POLICY_CONFIG_V1: Readonly<
  Record<string, SourcePolicyConfig>
> = Object.freeze({
  fixture_user_url: policy({
    mode: "fixture_mock",
    canAccess: true,
    canAutomate: true,
    canStore: true,
    canDisplay: true,
    canRefresh: false,
    allowedMethods: ["fixture_mock", "manual"],
    requiresManualReview: false,
    reasonCode: "FIXTURE_APPROVED",
  }),
  manual_fixture_source: policy({
    mode: "manual_confirmation",
    canAccess: true,
    canAutomate: false,
    canStore: false,
    canDisplay: false,
    canRefresh: false,
    allowedMethods: ["manual"],
    requiresManualReview: true,
    reasonCode: "MANUAL_ONLY",
  }),
  blocked_fixture_source: policy({
    mode: "blocked",
    canAccess: false,
    canAutomate: false,
    canStore: false,
    canDisplay: false,
    canRefresh: false,
    allowedMethods: ["manual"],
    requiresManualReview: true,
    reasonCode: "SOURCE_BLOCKED",
  }),
  unsupported_fixture_source: policy({
    mode: "unsupported",
    canAccess: false,
    canAutomate: false,
    canStore: false,
    canDisplay: false,
    canRefresh: false,
    allowedMethods: ["manual"],
    requiresManualReview: true,
    reasonCode: "MANUAL_ONLY",
  }),
  source_dev_06: policy({
    mode: "blocked",
    canAccess: false,
    canAutomate: false,
    canStore: false,
    canDisplay: false,
    canRefresh: false,
    allowedMethods: ["manual"],
    requiresManualReview: true,
    reasonCode: "PERMISSION_REQUIRED",
  }),
  source_mkt_01: policy({
    mode: "manual_confirmation",
    canAccess: false,
    canAutomate: false,
    canStore: false,
    canDisplay: false,
    canRefresh: false,
    allowedMethods: ["manual", "partner_connector"],
    requiresManualReview: true,
    reasonCode: "PARTNER_API_ONLY",
  }),
  source_mkt_03: policy({
    mode: "manual_confirmation",
    canAccess: false,
    canAutomate: false,
    canStore: false,
    canDisplay: false,
    canRefresh: false,
    allowedMethods: ["manual", "partner_connector"],
    requiresManualReview: true,
    reasonCode: "PARTNER_API_ONLY",
  }),
  source_mkt_04: policy({
    mode: "manual_confirmation",
    canAccess: false,
    canAutomate: false,
    canStore: false,
    canDisplay: false,
    canRefresh: false,
    allowedMethods: ["manual", "partner_connector"],
    requiresManualReview: true,
    reasonCode: "PARTNER_API_ONLY",
  }),
});

const fallbackPolicy = policy({
  mode: "manual_confirmation",
  canAccess: false,
  canAutomate: false,
  canStore: false,
  canDisplay: false,
  canRefresh: false,
  allowedMethods: ["manual"],
  requiresManualReview: true,
  reasonCode: "SOURCE_UNKNOWN",
});

export class FixtureSourcePolicyResolver implements SourcePolicyResolver {
  resolve(identification: SourceIdentification): IngestionPolicyDecision {
    const config = identification.knownSourceId
      ? SOURCE_POLICY_CONFIG_V1[identification.knownSourceId]
      : undefined;
    const resolved = config ?? fallbackPolicy;
    return {
      policyVersion: USER_URL_INGESTION_POLICY_V1.version,
      sourceId: identification.knownSourceId,
      ...resolved,
    };
  }
}
