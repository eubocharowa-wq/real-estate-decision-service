import {
  resolveRuntimeSourceEnvironment,
  sourcePolicyEngine,
  type PolicyReasonCode,
  type RegistryCollectionMethod,
  type SourceEnvironment,
  type SourcePolicyEngine,
} from "../data-collection/source-registry";
import type { SourceIdentification } from "./types";

export const USER_URL_INGESTION_POLICY_V1 = Object.freeze({
  version: "user-url-ingestion-policy-v1",
  maximumUrlLength: 2_048,
  maximumRedirects: 3,
  maximumResponseBytes: 1_500_000,
  requestTimeoutMs: 8_000,
  allowedContentTypes: Object.freeze(["text/html", "application/xhtml+xml"]),
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
  readonly registryVersion: string;
  readonly environment: SourceEnvironment;
  readonly decidedAt: string;
  readonly sourceId: string | null;
  readonly mode: IngestionMode;
  readonly canAccess: boolean;
  readonly canAutomate: boolean;
  readonly canStore: boolean;
  readonly canDisplay: boolean;
  readonly canRefresh: boolean;
  readonly allowedMethods: readonly AllowedIngestionMethod[];
  readonly requiresManualReview: boolean;
  readonly reasonCode: PolicyReasonCode;
  readonly reasonCodes: readonly PolicyReasonCode[];
}

export interface SourcePolicyResolver {
  resolve(identification: SourceIdentification): IngestionPolicyDecision;
}

const automaticMethods = new Set<RegistryCollectionMethod>([
  "api",
  "partner_feed",
  "xml_feed",
  "http",
  "browser",
  "openclaw",
  "fixture_mock",
]);

const ingestionMethod = (
  method: RegistryCollectionMethod,
): AllowedIngestionMethod | null => {
  switch (method) {
    case "fixture_mock":
      return "fixture_mock";
    case "api":
      return "api";
    case "partner_feed":
    case "xml_feed":
      return "feed";
    case "http":
      return "http_fetch";
    case "browser":
      return "browser_agent";
    case "openclaw":
      return "openclaw";
    case "manual":
    case "user_supplied":
    case "expert":
      return "manual";
    case "none":
      return null;
  }
};

const uniqueMethods = (
  methods: readonly RegistryCollectionMethod[],
): AllowedIngestionMethod[] => [
  ...new Set(
    methods
      .map(ingestionMethod)
      .filter((method): method is AllowedIngestionMethod => method !== null),
  ),
];

export interface RegistrySourcePolicyResolverOptions {
  readonly environment?: SourceEnvironment;
  readonly now?: () => Date;
  readonly engine?: SourcePolicyEngine;
}

/**
 * Compatibility adapter from TASK-012 to the centralized TASK-013 policy
 * engine. Method names are translated here; permissions are never inferred.
 */
export class RegistrySourcePolicyResolver implements SourcePolicyResolver {
  private readonly environment: SourceEnvironment;
  private readonly now: () => Date;
  private readonly engine: SourcePolicyEngine;

  constructor(options: RegistrySourcePolicyResolverOptions = {}) {
    this.environment =
      options.environment ??
      resolveRuntimeSourceEnvironment({
        configuredEnvironment: process.env.SOURCE_POLICY_ENV,
        nodeEnvironment: process.env.NODE_ENV,
      });
    this.now = options.now ?? (() => new Date());
    this.engine = options.engine ?? sourcePolicyEngine;
  }

  resolve(identification: SourceIdentification): IngestionPolicyDecision {
    const decision = this.engine.resolve({
      sourceId: identification.knownSourceId,
      operation: "user_url_ingest",
      environment: this.environment,
      decidedAt: this.now().toISOString(),
    });
    const hasAutomaticMethod = decision.allowedMethods.some((method) =>
      automaticMethods.has(method),
    );
    const canAutomate = decision.allowed && hasAutomaticMethod;
    const allowedMethods = uniqueMethods(decision.allowedMethods);
    const mode: IngestionMode =
      decision.sourceStatus === "blocked"
        ? "blocked"
        : canAutomate && decision.allowedMethods.includes("fixture_mock")
          ? "fixture_mock"
          : canAutomate
            ? "automatic_allowed"
            : allowedMethods.includes("manual")
              ? "manual_confirmation"
              : "unsupported";
    const reasonCode = decision.reasonCodes[0] ?? "POLICY_ALLOWED";
    return {
      policyVersion: decision.policyVersion,
      registryVersion: decision.registryVersion,
      environment: decision.environment,
      decidedAt: decision.decidedAt,
      sourceId: decision.sourceId,
      mode,
      canAccess: decision.access.allowed,
      canAutomate,
      canStore: decision.storage.normalizedData.allowed,
      canDisplay: decision.display.normalizedFacts.allowed,
      canRefresh: decision.refresh.permission.allowed,
      allowedMethods,
      requiresManualReview:
        !canAutomate ||
        decision.reasonCodes.some((reason) =>
          [
            "PERMISSION_REQUIRED",
            "REVIEW_REQUIRED",
            "MANUAL_ONLY",
            "SOURCE_UNKNOWN",
          ].includes(reason),
        ),
      reasonCode,
      reasonCodes: decision.reasonCodes,
    };
  }
}

/** @deprecated Use RegistrySourcePolicyResolver. */
export class FixtureSourcePolicyResolver extends RegistrySourcePolicyResolver {}
