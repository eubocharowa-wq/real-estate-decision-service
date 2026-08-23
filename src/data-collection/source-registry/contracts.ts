import type {
  FieldAuthority,
  FieldCoverage,
  FreshnessPolicy,
  PolicyReasonCode,
  RegistryCollectionMethod,
  SourceEnvironment,
  SourceOperation,
  SourceRegistryEntry,
} from "./schema";

export interface RegistrySourceIdentification {
  readonly status: "known" | "unknown" | "invalid_url";
  readonly hostname: string | null;
  readonly sourceId: string | null;
  readonly sourceType: SourceRegistryEntry["source_type"] | "other";
  readonly matchType: "exact" | "subdomain" | "unknown";
  readonly matchedDomain: string | null;
  readonly registryVersion: string;
}

export interface PermissionDecision {
  readonly status: "approved" | "conditional" | "denied" | "unknown";
  readonly allowed: boolean;
}

export interface SourcePolicyDecision {
  readonly sourceId: string | null;
  readonly environment: SourceEnvironment;
  readonly operation: SourceOperation;
  readonly requestedMethod: RegistryCollectionMethod | null;
  readonly allowed: boolean;
  readonly access: PermissionDecision;
  readonly automation: PermissionDecision;
  readonly storage: {
    readonly rawContent: PermissionDecision;
    readonly normalizedData: PermissionDecision;
    readonly evidenceMetadata: PermissionDecision;
    readonly snapshots: PermissionDecision;
    readonly derivedData: PermissionDecision;
  };
  readonly display: {
    readonly normalizedFacts: PermissionDecision;
    readonly sourceLink: PermissionDecision;
    readonly evidenceSnippet: PermissionDecision;
    readonly rawContent: PermissionDecision;
    readonly imageMedia: PermissionDecision;
  };
  readonly refresh: {
    readonly permission: PermissionDecision;
    readonly modes: readonly (
      "scheduled" | "targeted" | "user_triggered" | "manual_only" | "none"
    )[];
  };
  readonly derivation: PermissionDecision;
  readonly cache: PermissionDecision;
  readonly attribution: SourceRegistryEntry["policy"]["attribution"];
  readonly collectionScope: SourceRegistryEntry["policy"]["collection_scope"];
  readonly fieldPolicy: SourceRegistryEntry["policy"]["field_policy"];
  readonly retentionPolicy: SourceRegistryEntry["policy"]["retention_policy"];
  readonly validatedTargetUrls: readonly string[];
  readonly validatedRequestedFields: readonly string[];
  readonly allowedMethods: readonly RegistryCollectionMethod[];
  readonly requiredConditions: readonly string[];
  readonly missingConditions: readonly string[];
  readonly reasonCodes: readonly PolicyReasonCode[];
  readonly sourceStatus: SourceRegistryEntry["status"] | "unknown";
  readonly health: SourceRegistryEntry["health"];
  readonly registryVersion: string;
  readonly policyVersion: string;
  readonly decidedAt: string;
}

export interface ResolvePolicyInput {
  readonly sourceId: string | null;
  readonly operation: SourceOperation;
  readonly environment: SourceEnvironment;
  readonly requestedMethod?: RegistryCollectionMethod | null;
  readonly targetUrls?: readonly string[];
  readonly requestedFields?: readonly string[];
  readonly discovery?: boolean;
  readonly followLinks?: boolean;
  readonly pagination?: boolean;
  readonly sitemap?: boolean;
  readonly authentication?: boolean;
  readonly challengeAction?: "stop" | "manual_review" | "bypass";
  readonly satisfiedConditions?: readonly string[];
  readonly decidedAt: string;
}

export interface CollectionPlan {
  readonly sourceId: string | null;
  readonly operation: SourceOperation;
  readonly environment: SourceEnvironment;
  readonly entityType: string | null;
  readonly targetField: string | null;
  readonly validatedTargetUrls: readonly string[];
  readonly validatedRequestedFields: readonly string[];
  readonly allowed: boolean;
  readonly preferredMethod: RegistryCollectionMethod | null;
  readonly fallbackMethods: readonly RegistryCollectionMethod[];
  readonly storagePolicy: SourcePolicyDecision["storage"];
  readonly displayPolicy: SourcePolicyDecision["display"];
  readonly fieldCoverage: FieldCoverage | null;
  readonly freshnessPolicy: FreshnessPolicy | null;
  readonly fieldAuthority: FieldAuthority | null;
  readonly attributionPolicy: SourcePolicyDecision["attribution"];
  readonly collectionScope: SourcePolicyDecision["collectionScope"];
  readonly fieldPolicy: SourcePolicyDecision["fieldPolicy"];
  readonly retentionPolicy: SourcePolicyDecision["retentionPolicy"];
  readonly requiredConditions: readonly string[];
  readonly reasonCodes: readonly PolicyReasonCode[];
  readonly registryVersion: string;
  readonly policyVersion: string;
  readonly decidedAt: string;
}

export interface ResolveCollectionPlanInput {
  readonly sourceId: string | null;
  readonly operation: SourceOperation;
  readonly environment: SourceEnvironment;
  readonly entityType?: string | null;
  readonly targetField?: string | null;
  readonly requestedMethod?: RegistryCollectionMethod | null;
  readonly targetUrls?: readonly string[];
  readonly requestedFields?: readonly string[];
  readonly discovery?: boolean;
  readonly followLinks?: boolean;
  readonly pagination?: boolean;
  readonly sitemap?: boolean;
  readonly authentication?: boolean;
  readonly challengeAction?: "stop" | "manual_review" | "bypass";
  readonly satisfiedConditions?: readonly string[];
  readonly decidedAt: string;
  readonly healthOverride?: SourceRegistryEntry["health"] | null;
}
