import type {
  CollectionPlan,
  RegistryCollectionMethod,
  ResolveCollectionPlanInput,
} from "../../src/data-collection/source-registry";
import {
  AffectedOnlyRefreshRecomputeHook,
  type RefreshCollectionAdapter,
  type RefreshEvidencePipeline,
  type RefreshIngestionOutcome,
  type RefreshPolicyGateway,
  type RefreshRawResult,
  type RefreshTaskRequest,
  type SourceRuntimePolicy,
} from "../../src/data-collection/refresh";

export const NOW = "2026-08-23T12:00:00.000Z";
export const TARGET_URL = "https://fixtures.example/unit/101/";

export const makeRefreshRequest = (
  overrides: Partial<RefreshTaskRequest> = {},
): RefreshTaskRequest => ({
  entityType: "offer",
  entityId: "offer_fixture_101",
  sourceId: "fixture_refresh",
  targetUrls: [TARGET_URL],
  fieldPaths: ["listing_price"],
  criticalFieldPaths: [],
  reason: "STALE_FIELD",
  priorityInput: {
    reason: "STALE_FIELD",
    userRequestPriority: "normal",
    fieldCriticality: "important",
    freshness: "stale",
    conflict: "none",
    journeyStage: "discovery",
    sourceHealth: "healthy",
    volatility: "V1",
    explicitUserAction: false,
  },
  journeyStage: "discovery",
  requestedAt: NOW,
  requestedBy: "system",
  maxAttempts: 3,
  ...overrides,
});

const approved = { status: "approved" as const, allowed: true };
const denied = { status: "denied" as const, allowed: false };

export const makeAllowedPlan = (
  input: ResolveCollectionPlanInput,
  method: RegistryCollectionMethod = "fixture_mock",
): CollectionPlan => ({
  sourceId: input.sourceId,
  operation: input.operation,
  environment: input.environment,
  entityType: input.entityType ?? null,
  targetField: input.targetField ?? null,
  validatedTargetUrls: [...(input.targetUrls ?? [])],
  validatedRequestedFields: [...(input.requestedFields ?? [])],
  allowed: true,
  preferredMethod: method,
  fallbackMethods: [],
  storagePolicy: {
    rawContent: denied,
    normalizedData: approved,
    evidenceMetadata: approved,
    snapshots: denied,
    derivedData: approved,
  },
  displayPolicy: {
    normalizedFacts: approved,
    sourceLink: approved,
    evidenceSnippet: denied,
    rawContent: denied,
    imageMedia: denied,
  },
  fieldCoverage: null,
  freshnessPolicy: null,
  fieldAuthority: null,
  attributionPolicy: {
    attribution_required: true,
    attribution_label: "Offline fixture",
    link_required: true,
    logo_allowed: false,
    display_restrictions: [],
  },
  collectionScope: {
    explicit_targets_only: true,
    allowed_hosts: ["fixtures.example"],
    allowed_path_patterns: ["^/unit/[0-9]+/$"],
    maximum_target_urls: 1,
    discovery_allowed: false,
    follow_links_allowed: false,
    pagination_allowed: false,
    sitemap_allowed: false,
    authentication_allowed: false,
    challenge_action: "stop",
  },
  fieldPolicy: {
    requested_fields_required: true,
    allowed_fields: ["listing_price", "availability", "financing.*"],
    required_evidence_metadata: ["source_url", "observed_at"],
    verification_ceilings: [],
  },
  retentionPolicy: {
    normalized_facts: "transient_only",
    evidence_metadata: "transient_only",
    raw_content: "prohibited",
    raw_snapshots: "prohibited",
  },
  requiredConditions: [],
  reasonCodes: ["FIXTURE_APPROVED", "POLICY_ALLOWED"],
  registryVersion: "fixture-registry-v1",
  policyVersion: "fixture-policy-v1",
  decidedAt: input.decidedAt,
});

export const HEALTHY_RUNTIME: SourceRuntimePolicy = {
  status: "testing",
  operational: {
    minimum_interval_seconds: null,
    maximum_concurrency: null,
    daily_budget: null,
  },
  health: {
    status: "healthy",
    recent_success_rate: 1,
    recent_error_rate: 0,
    last_successful_run_at: NOW,
    source_changed: false,
    auth_issue: false,
    rate_limited: false,
    reason_codes: [],
  },
};

export class FixtureRefreshPolicyGateway implements RefreshPolicyGateway {
  calls: ResolveCollectionPlanInput[] = [];
  allowed = true;
  method: RegistryCollectionMethod = "fixture_mock";
  runtime: SourceRuntimePolicy = HEALTHY_RUNTIME;

  resolveCollectionPlan(input: ResolveCollectionPlanInput): CollectionPlan {
    this.calls.push(structuredClone(input));
    const allowed = makeAllowedPlan(input, this.method);
    return this.allowed
      ? allowed
      : {
          ...allowed,
          allowed: false,
          preferredMethod: null,
          fallbackMethods: [],
          validatedTargetUrls: [],
          validatedRequestedFields: [],
          reasonCodes: ["REFRESH_NOT_APPROVED"],
        };
  }

  getSourceRuntime(): SourceRuntimePolicy {
    return this.runtime;
  }
}

export class FixtureRefreshAdapter implements RefreshCollectionAdapter {
  readonly sourceId: string;
  readonly method: RegistryCollectionMethod;
  readonly version = "fixture-refresh-adapter-v1";
  calls = 0;

  constructor(
    private readonly result:
      | Partial<RefreshRawResult>
      | ((
          input: Parameters<RefreshCollectionAdapter["collect"]>[0],
        ) => Partial<RefreshRawResult> | Promise<Partial<RefreshRawResult>>),
    sourceId = "fixture_refresh",
    method: RegistryCollectionMethod = "fixture_mock",
  ) {
    this.sourceId = sourceId;
    this.method = method;
  }

  async collect(
    input: Parameters<RefreshCollectionAdapter["collect"]>[0],
  ): Promise<RefreshRawResult> {
    this.calls += 1;
    const override =
      typeof this.result === "function"
        ? await this.result(input)
        : this.result;
    return {
      schema_version: "1.0",
      collection_run_id: input.collectionRunId,
      refresh_task_id: input.task.refresh_task_id,
      source_id: input.task.source_id,
      source_url: input.plan.validatedTargetUrls[0]!,
      observed_at: input.observedAt,
      raw_payload_reference: null,
      status: "success",
      observed_fields: input.task.field_paths.map((fieldPath) => ({
        field_path: fieldPath,
        observation_fingerprint: `fingerprint:${fieldPath}`,
        evidence_candidate_id: `evidence_candidate_${fieldPath.replaceAll(".", "_")}`,
      })),
      missing_fields: [],
      adapter_version: this.version,
      error_code: null,
      retry_after_seconds: null,
      source_health_effect: "success",
      ...override,
    };
  }
}

export class FixtureEvidencePipeline implements RefreshEvidencePipeline {
  readonly version = "fixture-evidence-pipeline-v1";
  calls = 0;
  idempotencyKeys: string[] = [];

  constructor(private readonly outcome: RefreshIngestionOutcome) {}

  async ingest(
    input: Parameters<RefreshEvidencePipeline["ingest"]>[0],
  ): Promise<RefreshIngestionOutcome> {
    this.calls += 1;
    this.idempotencyKeys.push(input.idempotencyKey);
    return structuredClone(this.outcome);
  }
}

export const makeIngestionOutcome = (
  overrides: Partial<RefreshIngestionOutcome> = {},
): RefreshIngestionOutcome => ({
  changedFields: ["listing_price"],
  unchangedFields: [],
  missingFields: [],
  evidenceIds: ["evidence_refresh_price_101"],
  newConflictIds: [],
  resolvedConflictIds: [],
  affectedEntities: {
    affected_property_ids: ["property_fixture_101"],
    affected_offer_ids: ["offer_fixture_101"],
    affected_scenario_ids: [],
    affected_user_request_ids: ["user_request_fixture_101"],
  },
  ...overrides,
});

export const recomputeHook = () => new AffectedOnlyRefreshRecomputeHook();
