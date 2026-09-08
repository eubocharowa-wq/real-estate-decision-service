import { describe, expect, it } from "vitest";

import {
  createSourceCollectionPipeline,
  rawCollectionResultSchema,
  type CollectionTask,
  type RawCollectionResult,
  type SourceAdapter,
  type SourceAdapterContext,
  type SourceNormalizationProfile,
} from "../../src/data-collection/source-adapters";
import {
  SourcePolicyEngine,
  SourceRegistry,
  type SourceRegistryConfig,
} from "../../src/data-collection/source-registry";
import { PILOT_SOURCE_REGISTRY_CONFIG } from "../../src/data-collection/source-registry/config/pilot";

/**
 * The point of the layer-A rework: a second source runs through the same
 * pipeline without the pipeline knowing anything about it. This one uses a
 * different id, a different method, a different attribution label, a different
 * seller — and publishes an address, which the first source never did.
 */
const SOURCE_ID = "src_second_fixture";
const CONDITION = "SECOND_SOURCE_FEED_APPROVED";
const UNIT_URL = "https://second.fixture.example/units/4021";
const OBSERVED_AT = "2026-09-08T09:00:00.000Z";

const secondSourceEntry: SourceRegistryConfig["sources"][number] = {
  source_id: SOURCE_ID,
  name: "Второй источник",
  source_type: "registry",
  domains: [
    {
      hostname: "second.fixture.example",
      include_subdomains: false,
      shared_ownership_rule: null,
    },
  ],
  base_url: "https://second.fixture.example",
  geography: { country_codes: ["RU"], regions: [], cities: [] },
  coverage: {
    property_types: ["apartment"],
    market_types: ["new_build"],
    entity_types: ["property", "offer"],
    fields: [
      { field_pattern: "identity.*", support: "full", notes: null },
      { field_pattern: "physical.*", support: "full", notes: null },
      { field_pattern: "location.*", support: "full", notes: null },
    ],
  },
  capabilities: {
    discover: "none",
    collect: "full",
    refresh: "none",
    verify: "partial",
    user_url_ingest: "none",
    display: "partial",
  },
  status: "active",
  approval_lifecycle: "testing",
  trust_level: "authoritative",
  environment_approval: {
    development: {
      status: "approved",
      allowed_methods: ["xml_feed", "manual"],
      required_conditions: [],
    },
    test: {
      status: "approved",
      allowed_methods: ["xml_feed", "manual"],
      required_conditions: [],
    },
    pilot: {
      status: "denied",
      allowed_methods: ["manual"],
      required_conditions: [],
    },
    production: {
      status: "denied",
      allowed_methods: ["manual"],
      required_conditions: [],
    },
  },
  policy: {
    access: "approved",
    automation: "approved",
    storage: {
      raw_content: "denied",
      normalized_data: "approved",
      evidence_metadata: "approved",
      snapshots: "denied",
      derived_data: "approved",
    },
    display: {
      normalized_facts: "approved",
      source_link: "approved",
      evidence_snippet: "denied",
      raw_content: "denied",
      image_media: "denied",
    },
    refresh: { permission: "denied", modes: ["none"] },
    derivation: "approved",
    cache: "denied",
    collection_scope: {
      explicit_targets_only: true,
      allowed_hosts: ["second.fixture.example"],
      allowed_path_patterns: ["^/units/[0-9]+$"],
      maximum_target_urls: 1,
      discovery_allowed: false,
      follow_links_allowed: false,
      pagination_allowed: false,
      sitemap_allowed: false,
      authentication_allowed: false,
      challenge_action: "stop",
    },
    field_policy: {
      requested_fields_required: true,
      allowed_fields: ["identity.*", "physical.*", "location.address.*"],
      required_evidence_metadata: ["source_url", "observed_at"],
      verification_ceilings: [],
    },
    retention_policy: {
      normalized_facts: "persistent",
      evidence_metadata: "persistent",
      raw_content: "prohibited",
      raw_snapshots: "prohibited",
    },
    methods: [
      {
        method: "xml_feed",
        priority: 100,
        operations: ["scheduled_collect"],
        required_conditions: [CONDITION],
        credential_ref: null,
      },
    ],
    attribution: {
      attribution_required: true,
      attribution_label: "Второй источник",
      link_required: true,
      logo_allowed: false,
      display_restrictions: [],
    },
    required_conditions: [CONDITION],
    reason_codes: ["POLICY_ALLOWED"],
  },
  production_gate: {
    technically_possible: true,
    access_terms_checked: true,
    right_to_store_confirmed: true,
    right_to_display_confirmed: true,
    right_to_refresh_confirmed: false,
    attribution_defined: true,
    production_approved: false,
  },
  field_authority: [
    {
      field_pattern: "*",
      priority: 90,
      authority_type: "authoritative",
      notes: "Offline fixture for the multi-source pipeline test.",
    },
  ],
  freshness: [
    {
      field_pattern: "*",
      volatility: "V3",
      target_ttl_hours: 168,
      stale_after_hours: 720,
      critical_after_hours: 2160,
      valid_until_overrides: false,
      refresh_modes: ["manual_only"],
    },
  ],
  operational: {
    minimum_interval_seconds: 0,
    maximum_concurrency: 1,
    daily_budget: 10,
  },
  health: {
    status: "healthy",
    recent_success_rate: 1,
    recent_error_rate: 0,
    last_successful_run_at: null,
    source_changed: false,
    auth_issue: false,
    rate_limited: false,
    reason_codes: [],
  },
  reviewed_at: "2026-09-01T00:00:00.000Z",
  notes: "Offline fixture source; contains no third-party content.",
};

const registry = new SourceRegistry({
  ...PILOT_SOURCE_REGISTRY_CONFIG,
  sources: [...PILOT_SOURCE_REGISTRY_CONFIG.sources, secondSourceEntry],
});
const policyEngine = new SourcePolicyEngine(registry);

const REQUESTED_FIELDS = [
  "identity.unit_id",
  "identity.property_type",
  "identity.market_type",
  "physical.total_area_m2",
  "physical.floor",
  "location.address.country_code",
  "location.address.region",
  "location.address.city",
  "location.address.district",
  "location.address.street",
  "location.address.house_number",
] as const;

const VALUES: Readonly<Record<string, string>> = {
  "identity.unit_id": "4021",
  "identity.property_type": "apartment",
  "identity.market_type": "new_build",
  // The formats a real source publishes, not the canonical fixture shape.
  "physical.total_area_m2": "62.4/34.1/11.2",
  "physical.floor": "7 из 17",
  "location.address.country_code": "RU",
  "location.address.region": "Тульская область",
  "location.address.city": "Тула",
  "location.address.district": "Центральный",
  "location.address.street": "Улица Такая-то",
  "location.address.house_number": "12к2",
};

class SecondSourceFeedAdapter implements SourceAdapter {
  readonly sourceId = SOURCE_ID;
  readonly method = "xml_feed" as const;
  readonly version = "second-source-feed-adapter-v1";

  canHandle(task: CollectionTask): boolean {
    return task.source_id === this.sourceId && task.mode === "collect";
  }

  collect(
    task: CollectionTask,
    context: SourceAdapterContext,
  ): Promise<RawCollectionResult> {
    return Promise.resolve(
      rawCollectionResultSchema.parse({
        schema_version: "1.0",
        collection_run_id: context.collectionRunId,
        task_id: task.task_id,
        source_id: task.source_id,
        source_url: UNIT_URL,
        canonical_url: UNIT_URL,
        collected_at: context.observedAt,
        http_status: null,
        content_type: "application/xml",
        raw_payload_reference: null,
        external_record_id: VALUES["identity.unit_id"],
        extracted_fields: context.plan.validatedRequestedFields.map(
          (field) => ({
            field,
            raw_value: VALUES[field]!,
            semantics: "exact",
            extraction_confidence: 0.99,
            evidence_reference: `feed:${field}`,
          }),
        ),
        missing_fields: [],
        warnings: [],
        adapter_version: this.version,
        parser_version: "second-source-parser-v1",
        collector_version: "second-source-collector-v1",
        status: "success",
        error_code: null,
      }),
    );
  }
}

const SECOND_SOURCE_PROFILE: SourceNormalizationProfile = {
  sourceId: SOURCE_ID,
  adapterVersion: "second-source-feed-adapter-v1",
  normalizationVersion: "second-source-normalization-v1",
  attributionLabel: "Второй источник",
  seller: {
    seller_type: "developer",
    seller_id: SOURCE_ID,
    name: "Второй источник",
  },
  collectionContract: {
    method: "xml_feed",
    environments: ["development", "test"],
    requiredConditions: [CONDITION],
    maximumTargetUrls: 1,
    retention: {
      normalized_facts: "persistent",
      evidence_metadata: "persistent",
      raw_content: "prohibited",
      raw_snapshots: "prohibited",
    },
  },
};

const task: CollectionTask = {
  schema_version: "1.0",
  task_id: "task_second_source_4021",
  source_id: SOURCE_ID,
  mode: "collect",
  target_urls: [UNIT_URL],
  requested_fields: [...REQUESTED_FIELDS],
  entity_type: "property",
  freshness_requirement: "current_observation",
  priority: "normal",
  created_at: "2026-09-08T08:59:00.000Z",
};

const pipeline = createSourceCollectionPipeline({
  adapters: [new SecondSourceFeedAdapter()],
  profiles: [SECOND_SOURCE_PROFILE],
  policyEngine,
});

describe("a second source through the same pipeline", () => {
  it("collects over a non-HTTP method under its own policy contract", async () => {
    const result = await pipeline.execute({
      task,
      environment: "test",
      satisfiedConditions: [CONDITION],
      observedAt: OBSERVED_AT,
    });

    expect(result.status).toBe("success");
    expect(result.policyAudit.allowedMethod).toBe("xml_feed");
    expect(result.log.method).toBe("xml_feed");
    const candidate = result.candidate;
    if (!candidate) throw new Error("Expected a candidate");
    expect(candidate.attribution.label).toBe("Второй источник");
    expect(candidate.normalizationVersion).toBe(
      "second-source-normalization-v1",
    );
    expect(candidate.offerCandidate.seller).toEqual({
      seller_type: "developer",
      seller_id: SOURCE_ID,
      name: "Второй источник",
    });
    expect(
      candidate.evidence.every((item) => item.source_id === SOURCE_ID),
    ).toBe(true);
  });

  it("carries the published address into the property", async () => {
    const result = await pipeline.execute({
      task,
      environment: "test",
      satisfiedConditions: [CONDITION],
      observedAt: OBSERVED_AT,
    });
    const candidate = result.candidate;
    if (!candidate) throw new Error("Expected a candidate");

    // Without this the city, district and excluded-location criteria could
    // never match a collected object.
    expect(candidate.propertyCandidate.location.address).toEqual({
      country_code: "RU",
      region: "Тульская область",
      city: "Тула",
      locality: null,
      district: "Центральный",
      street: "Улица Такая-то",
      house_number: "12к2",
      postal_code: null,
    });
    expect(candidate.propertyCandidate.physical).toMatchObject({
      total_area_m2: 62.4,
      living_area_m2: 34.1,
      kitchen_area_m2: 11.2,
      floor: 7,
    });
    expect(candidate.propertyCandidate.building.floors_total).toBe(17);
  });

  it("denies a source that has no collection profile", async () => {
    const withoutProfile = createSourceCollectionPipeline({
      adapters: [new SecondSourceFeedAdapter()],
      profiles: [],
      policyEngine,
    });

    const result = await withoutProfile.execute({
      task,
      environment: "test",
      satisfiedConditions: [CONDITION],
      observedAt: OBSERVED_AT,
    });

    expect(result).toMatchObject({
      status: "blocked",
      errorCode: "POLICY_DENIED",
      candidate: null,
      metrics: { attempts: 0 },
    });
    expect(result.rawResult.warnings).toContain(
      "No adapter was invoked because the source has no collection profile.",
    );
  });

  it("denies an environment the source did not declare", async () => {
    const result = await pipeline.execute({
      task,
      environment: "pilot",
      satisfiedConditions: [CONDITION],
      observedAt: OBSERVED_AT,
    });

    expect(result.status).toBe("blocked");
    expect(result.candidate).toBeNull();
  });
});
