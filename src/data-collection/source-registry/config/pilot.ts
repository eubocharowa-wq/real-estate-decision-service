import type {
  FreshnessPolicy,
  RegistryCollectionMethod,
  SourceRegistryConfig,
  SourceRegistryEntry,
} from "../schema";

export const SOURCE_REGISTRY_VERSION = "source-registry-pilot-v1.1";
export const SOURCE_POLICY_VERSION = "source-policy-engine-v1.1";

const manualMethods: SourceRegistryEntry["policy"]["methods"] = [
  {
    method: "manual",
    priority: 10,
    operations: ["user_url_ingest", "manual_import", "expert_verification"],
    required_conditions: [],
    credential_ref: null,
  },
  {
    method: "user_supplied",
    priority: 20,
    operations: ["user_url_ingest", "manual_import"],
    required_conditions: [],
    credential_ref: null,
  },
];

const standardFreshness: readonly FreshnessPolicy[] = [
  {
    field_pattern: "listing_price",
    volatility: "V1",
    target_ttl_hours: 24,
    stale_after_hours: 72,
    critical_after_hours: 168,
    valid_until_overrides: false,
    refresh_modes: ["scheduled", "targeted", "user_triggered"],
  },
  {
    field_pattern: "availability",
    volatility: "V1",
    target_ttl_hours: 12,
    stale_after_hours: 36,
    critical_after_hours: 72,
    valid_until_overrides: false,
    refresh_modes: ["scheduled", "targeted", "user_triggered"],
  },
  {
    field_pattern: "promotion.*",
    volatility: "V1",
    target_ttl_hours: 24,
    stale_after_hours: 48,
    critical_after_hours: 72,
    valid_until_overrides: true,
    refresh_modes: ["scheduled", "targeted", "user_triggered"],
  },
  {
    field_pattern: "financing.*",
    volatility: "V1",
    target_ttl_hours: 24,
    stale_after_hours: 72,
    critical_after_hours: 168,
    valid_until_overrides: true,
    refresh_modes: ["scheduled", "targeted", "user_triggered"],
  },
  {
    field_pattern: "timeline.handover_date",
    volatility: "V2",
    target_ttl_hours: 168,
    stale_after_hours: 720,
    critical_after_hours: 1_440,
    valid_until_overrides: false,
    refresh_modes: ["targeted", "user_triggered"],
  },
  {
    field_pattern: "physical.*",
    volatility: "V4",
    target_ttl_hours: 2_160,
    stale_after_hours: 8_760,
    critical_after_hours: 17_520,
    valid_until_overrides: false,
    refresh_modes: ["targeted"],
  },
];

const productionGate = (technicallyPossible: boolean) => ({
  technically_possible: technicallyPossible,
  access_terms_checked: false,
  right_to_store_confirmed: false,
  right_to_display_confirmed: false,
  right_to_refresh_confirmed: false,
  attribution_defined: true,
  production_approved: false,
});

const healthUnknown: SourceRegistryEntry["health"] = {
  status: "unknown",
  recent_success_rate: null,
  recent_error_rate: null,
  last_successful_run_at: null,
  source_changed: false,
  auth_issue: false,
  rate_limited: false,
  reason_codes: ["NO_RUNTIME_DATA"],
};

const environmentApproval = (
  developmentMethods: readonly RegistryCollectionMethod[],
  testMethods = developmentMethods,
  pilotMethods: readonly RegistryCollectionMethod[] = [
    "manual",
    "user_supplied",
  ],
) => ({
  development: {
    status: "approved" as const,
    allowed_methods: [...developmentMethods],
    required_conditions: [],
  },
  test: {
    status: "approved" as const,
    allowed_methods: [...testMethods],
    required_conditions: [],
  },
  pilot: {
    status: "conditional" as const,
    allowed_methods: [...pilotMethods],
    required_conditions: ["PILOT_APPROVAL_CONFIRMED"],
  },
  production: {
    status: "denied" as const,
    allowed_methods: ["manual" as const, "user_supplied" as const],
    required_conditions: [],
  },
});

const defaultStorage = {
  raw_content: "unknown" as const,
  normalized_data: "unknown" as const,
  evidence_metadata: "unknown" as const,
  snapshots: "unknown" as const,
  derived_data: "unknown" as const,
};

const defaultDisplay = {
  normalized_facts: "unknown" as const,
  source_link: "approved" as const,
  evidence_snippet: "unknown" as const,
  raw_content: "denied" as const,
  image_media: "denied" as const,
};

const defaultFieldPolicy: SourceRegistryEntry["policy"]["field_policy"] = {
  requested_fields_required: false,
  allowed_fields: ["*"],
  required_evidence_metadata: ["source_url", "observed_at"],
  verification_ceilings: [],
};

const defaultRetentionPolicy: SourceRegistryEntry["policy"]["retention_policy"] =
  {
    normalized_facts: "prohibited",
    evidence_metadata: "prohibited",
    raw_content: "prohibited",
    raw_snapshots: "prohibited",
  };

/** A hostname, or a hostname explicitly shared with another source. */
export type DomainInput =
  | string
  | {
      readonly hostname: string;
      readonly sharedOwnershipRule: string;
    };

const domainRule = (input: DomainInput) =>
  typeof input === "string"
    ? {
        hostname: input,
        include_subdomains: true,
        shared_ownership_rule: null,
      }
    : {
        hostname: input.hostname,
        include_subdomains: true,
        shared_ownership_rule: input.sharedOwnershipRule,
      };

const domainHostname = (input: DomainInput): string =>
  typeof input === "string" ? input : input.hostname;

export const EISJS_SHARED_DOMAIN_RULE =
  "наш.дом.рф serves both ДОМ.РФ programme rules (src_fin_01) and ЕИСЖС project declarations (src_gov_01)";

export const EISJS_SOURCE_ID = "src_gov_01" as const;

interface ExternalEntryInput {
  readonly sourceId: string;
  readonly name: string;
  readonly sourceType: SourceRegistryEntry["source_type"];
  readonly domains: readonly DomainInput[];
  readonly baseUrl: string;
  readonly status?: SourceRegistryEntry["status"];
  readonly lifecycle?: SourceRegistryEntry["approval_lifecycle"];
  readonly trust?: SourceRegistryEntry["trust_level"];
  readonly propertyTypes?: SourceRegistryEntry["coverage"]["property_types"];
  readonly marketTypes?: SourceRegistryEntry["coverage"]["market_types"];
  readonly entityTypes: readonly string[];
  readonly fieldCoverage: SourceRegistryEntry["coverage"]["fields"];
  readonly fieldAuthority: SourceRegistryEntry["field_authority"];
  readonly capabilities: SourceRegistryEntry["capabilities"];
  readonly policyReasons: SourceRegistryEntry["policy"]["reason_codes"];
  readonly access?: SourceRegistryEntry["policy"]["access"];
  readonly automation?: SourceRegistryEntry["policy"]["automation"];
  readonly storage?: SourceRegistryEntry["policy"]["storage"];
  readonly display?: SourceRegistryEntry["policy"]["display"];
  readonly refresh?: SourceRegistryEntry["policy"]["refresh"];
  readonly derivation?: SourceRegistryEntry["policy"]["derivation"];
  readonly cache?: SourceRegistryEntry["policy"]["cache"];
  readonly methods?: SourceRegistryEntry["policy"]["methods"];
  readonly environmentMethods?: readonly RegistryCollectionMethod[];
  readonly environmentApproval?: SourceRegistryEntry["environment_approval"];
  readonly collectionScope?: SourceRegistryEntry["policy"]["collection_scope"];
  readonly fieldPolicy?: SourceRegistryEntry["policy"]["field_policy"];
  readonly retentionPolicy?: SourceRegistryEntry["policy"]["retention_policy"];
  readonly requiredConditions?: readonly string[];
  readonly attributionRestrictions?: readonly string[];
  readonly technicallyPossible?: boolean;
  readonly credentialRef?: string | null;
  readonly reviewedAt?: string;
  readonly notes: string;
}

const externalEntry = (input: ExternalEntryInput): SourceRegistryEntry => ({
  source_id: input.sourceId,
  name: input.name,
  source_type: input.sourceType,
  domains: input.domains.map(domainRule),
  base_url: input.baseUrl,
  geography: { country_codes: ["RU"], regions: [], cities: [] },
  coverage: {
    property_types: input.propertyTypes ?? [],
    market_types: input.marketTypes ?? [],
    entity_types: [...input.entityTypes],
    fields: input.fieldCoverage,
  },
  capabilities: input.capabilities,
  status: input.status ?? "testing",
  approval_lifecycle: input.lifecycle ?? "review_required",
  trust_level: input.trust ?? "primary",
  environment_approval:
    input.environmentApproval ??
    environmentApproval(
      input.environmentMethods ?? ["manual", "user_supplied"],
    ),
  policy: {
    access: input.access ?? "conditional",
    automation: input.automation ?? "conditional",
    storage: input.storage ?? defaultStorage,
    display: input.display ?? defaultDisplay,
    refresh: input.refresh ?? {
      permission: "unknown",
      modes: ["manual_only"],
    },
    derivation: input.derivation ?? "unknown",
    cache: input.cache ?? "unknown",
    collection_scope: input.collectionScope ?? {
      explicit_targets_only: false,
      allowed_hosts: input.domains.map(domainHostname),
      allowed_path_patterns: ["^/.*$"],
      maximum_target_urls: 100,
      discovery_allowed: false,
      follow_links_allowed: false,
      pagination_allowed: false,
      sitemap_allowed: false,
      authentication_allowed: false,
      challenge_action: "stop",
    },
    field_policy: input.fieldPolicy ?? defaultFieldPolicy,
    retention_policy: input.retentionPolicy ?? defaultRetentionPolicy,
    methods: input.methods ?? manualMethods,
    attribution: {
      attribution_required: true,
      attribution_label: input.name,
      link_required: true,
      logo_allowed: false,
      display_restrictions: [...(input.attributionRestrictions ?? [])],
    },
    required_conditions: [...(input.requiredConditions ?? [])],
    reason_codes: input.policyReasons,
  },
  production_gate: productionGate(input.technicallyPossible ?? true),
  field_authority: input.fieldAuthority,
  freshness: [...standardFreshness],
  operational: {
    minimum_interval_seconds: null,
    maximum_concurrency: null,
    daily_budget: null,
  },
  health: healthUnknown,
  reviewed_at: input.reviewedAt ?? "2026-08-12T00:00:00.000Z",
  notes: input.notes,
});

const developerFields: SourceRegistryEntry["coverage"]["fields"] = [
  { field_pattern: "identity.*", support: "full", notes: null },
  { field_pattern: "physical.*", support: "full", notes: null },
  { field_pattern: "listing_price", support: "full", notes: null },
  { field_pattern: "availability", support: "partial", notes: null },
  {
    field_pattern: "financing.*",
    support: "partial",
    notes: "Marketing claims require applicability verification.",
  },
];

const developerAuthority: SourceRegistryEntry["field_authority"] = [
  {
    field_pattern: "listing_price",
    priority: 90,
    authority_type: "primary",
    notes: "Strong only for a concrete unit and current commercial terms.",
  },
  {
    field_pattern: "availability",
    priority: 85,
    authority_type: "primary",
    notes: "Primary for own inventory, subject to freshness.",
  },
  {
    field_pattern: "financing.*",
    priority: 45,
    authority_type: "primary",
    notes: "Developer marketing does not confirm property eligibility.",
  },
];

const developerCapabilities = {
  discover: "full" as const,
  collect: "full" as const,
  refresh: "partial" as const,
  verify: "partial" as const,
  user_url_ingest: "partial" as const,
  display: "partial" as const,
};

const reviewedBrowserMethods = (
  condition: string,
): SourceRegistryEntry["policy"]["methods"] => [
  {
    method: "http",
    priority: 60,
    operations: ["scheduled_collect", "targeted_refresh", "user_url_ingest"],
    required_conditions: [condition],
    credential_ref: null,
  },
  {
    method: "browser",
    priority: 40,
    operations: ["scheduled_collect", "targeted_refresh", "user_url_ingest"],
    required_conditions: [condition],
    credential_ref: null,
  },
  ...manualMethods,
];

const developerEntries: SourceRegistryEntry[] = [
  externalEntry({
    sourceId: "src_dev_01",
    name: "Консоль Девелопмент",
    sourceType: "developer_site",
    domains: ["konsole.ru"],
    baseUrl: "https://tula.konsole.ru",
    entityTypes: ["property", "offer", "promotion"],
    propertyTypes: ["apartment"],
    marketTypes: ["new_build"],
    fieldCoverage: developerFields,
    fieldAuthority: developerAuthority,
    capabilities: developerCapabilities,
    policyReasons: ["PERMISSION_REQUIRED", "DO_NOT_AUTOCOLLECT"],
    access: "denied",
    automation: "denied",
    methods: manualMethods,
    notes:
      "DEV-01: unit pages are useful, but access permission is required before automation.",
  }),
  externalEntry({
    sourceId: "src_dev_02",
    name: "ВНЕШСТРОЙ",
    sourceType: "developer_site",
    domains: ["vneshstroi.ru"],
    baseUrl: "https://vneshstroi.ru",
    entityTypes: ["property", "offer", "promotion"],
    propertyTypes: ["apartment"],
    marketTypes: ["new_build"],
    fieldCoverage: [
      ...developerFields,
      {
        field_pattern: "timeline.handover_date",
        support: "partial",
        notes: "Only an explicitly published handover/timing fact is in scope.",
      },
    ],
    fieldAuthority: developerAuthority,
    capabilities: developerCapabilities,
    lifecycle: "testing",
    policyReasons: ["SCOPED_POC_ONLY"],
    storage: {
      raw_content: "denied",
      normalized_data: "conditional",
      evidence_metadata: "conditional",
      snapshots: "denied",
      derived_data: "denied",
    },
    display: {
      normalized_facts: "conditional",
      source_link: "approved",
      evidence_snippet: "denied",
      raw_content: "denied",
      image_media: "denied",
    },
    refresh: { permission: "denied", modes: ["none"] },
    derivation: "conditional",
    cache: "denied",
    methods: [
      {
        method: "http",
        priority: 100,
        operations: ["scheduled_collect"],
        required_conditions: ["TARGETED_UNIT_HTTP_POC_APPROVED"],
        credential_ref: null,
      },
      ...manualMethods,
    ],
    environmentApproval: {
      development: {
        status: "approved",
        allowed_methods: ["http", "manual", "user_supplied"],
        required_conditions: [],
      },
      test: {
        status: "approved",
        allowed_methods: ["http", "manual", "user_supplied"],
        required_conditions: [],
      },
      pilot: {
        status: "denied",
        allowed_methods: ["manual", "user_supplied"],
        required_conditions: [],
      },
      production: {
        status: "denied",
        allowed_methods: ["manual", "user_supplied"],
        required_conditions: [],
      },
    },
    collectionScope: {
      explicit_targets_only: true,
      allowed_hosts: ["vneshstroi.ru", "www.vneshstroi.ru"],
      allowed_path_patterns: ["^/kvartiry/[0-9]+/?$"],
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
      allowed_fields: [
        "identity.*",
        "physical.rooms",
        "physical.floor",
        "physical.total_area_m2",
        "listing_price",
        "timeline.handover_date",
        "availability",
      ],
      required_evidence_metadata: ["source_url", "observed_at"],
      verification_ceilings: [
        { field_pattern: "financing.*", maximum_status: "claimed" },
        { field_pattern: "promotion.*", maximum_status: "claimed" },
        { field_pattern: "marketing.*", maximum_status: "claimed" },
      ],
    },
    retentionPolicy: {
      normalized_facts: "transient_only",
      evidence_metadata: "transient_only",
      raw_content: "prohibited",
      raw_snapshots: "prohibited",
    },
    requiredConditions: ["TARGETED_UNIT_HTTP_POC_APPROVED"],
    reviewedAt: "2026-08-23T00:00:00.000Z",
    notes:
      "DEV-02: approved only for one explicit unit URL over HTTP in development/test; no discovery, refresh, raw retention or production use.",
  }),
  externalEntry({
    sourceId: "src_dev_03",
    name: "ОСТ",
    sourceType: "developer_site",
    domains: ["ost71.ru"],
    baseUrl: "https://ost71.ru",
    entityTypes: ["property", "offer", "promotion"],
    propertyTypes: ["apartment", "house"],
    marketTypes: ["new_build", "suburban"],
    fieldCoverage: developerFields,
    fieldAuthority: developerAuthority,
    capabilities: developerCapabilities,
    policyReasons: ["REVIEW_REQUIRED"],
    methods: reviewedBrowserMethods("ACCESS_REVIEW_CONFIRMED"),
    environmentMethods: ["http", "browser", "manual", "user_supplied"],
    requiredConditions: ["ACCESS_REVIEW_CONFIRMED"],
    notes:
      "DEV-03: apartment, house and finance-claim PoC candidate under review.",
  }),
  externalEntry({
    sourceId: "src_dev_04",
    name: "Стройкомплект",
    sourceType: "developer_site",
    domains: ["новостройки-тула.рф"],
    baseUrl: "https://новостройки-тула.рф",
    entityTypes: ["property", "offer", "promotion"],
    propertyTypes: ["apartment"],
    marketTypes: ["new_build"],
    fieldCoverage: developerFields,
    fieldAuthority: developerAuthority,
    capabilities: { ...developerCapabilities, collect: "partial" },
    policyReasons: ["REVIEW_REQUIRED"],
    methods: reviewedBrowserMethods("ACCESS_REVIEW_CONFIRMED"),
    environmentMethods: ["http", "browser", "manual", "user_supplied"],
    requiredConditions: ["ACCESS_REVIEW_CONFIRMED"],
    notes:
      "DEV-04: public values are informational and access review is incomplete.",
  }),
  externalEntry({
    sourceId: "src_dev_05",
    name: "Новая Тула",
    sourceType: "project_site",
    domains: ["novayatula.ru"],
    baseUrl: "https://novayatula.ru",
    entityTypes: ["property", "offer", "promotion", "financing_offer"],
    propertyTypes: ["apartment"],
    marketTypes: ["new_build"],
    fieldCoverage: developerFields,
    fieldAuthority: developerAuthority,
    capabilities: { ...developerCapabilities, collect: "partial" },
    policyReasons: ["REVIEW_REQUIRED"],
    methods: reviewedBrowserMethods("ACCESS_REVIEW_CONFIRMED"),
    environmentMethods: ["http", "browser", "manual", "user_supplied"],
    requiredConditions: ["ACCESS_REVIEW_CONFIRMED"],
    notes:
      "DEV-05: useful finance/promotion case with incomplete unit identity.",
  }),
  externalEntry({
    sourceId: "src_dev_06",
    name: "ЖК Фамилия",
    sourceType: "project_site",
    domains: ["familia71.ru"],
    baseUrl: "https://familia71.ru",
    status: "manual_only",
    lifecycle: "review_required",
    entityTypes: ["development", "offer"],
    propertyTypes: ["apartment"],
    marketTypes: ["new_build"],
    fieldCoverage: developerFields,
    fieldAuthority: developerAuthority,
    capabilities: {
      discover: "none",
      collect: "none",
      refresh: "none",
      verify: "partial",
      user_url_ingest: "partial",
      display: "partial",
    },
    policyReasons: ["PERMISSION_REQUIRED", "DO_NOT_AUTOCOLLECT", "MANUAL_ONLY"],
    access: "denied",
    automation: "denied",
    storage: {
      raw_content: "denied",
      normalized_data: "denied",
      evidence_metadata: "denied",
      snapshots: "denied",
      derived_data: "denied",
    },
    display: {
      ...defaultDisplay,
      normalized_facts: "denied",
      evidence_snippet: "denied",
    },
    refresh: { permission: "denied", modes: ["manual_only"] },
    derivation: "denied",
    cache: "denied",
    methods: manualMethods,
    notes:
      "DEV-06: published restriction requires permission; only manual user-supplied flow is available.",
  }),
];

const marketplaceFields: SourceRegistryEntry["coverage"]["fields"] = [
  { field_pattern: "identity.*", support: "partial", notes: null },
  { field_pattern: "physical.*", support: "partial", notes: null },
  { field_pattern: "listing_price", support: "full", notes: null },
  { field_pattern: "availability", support: "partial", notes: null },
];

const marketplaceAuthority: SourceRegistryEntry["field_authority"] = [
  {
    field_pattern: "listing_price",
    priority: 55,
    authority_type: "secondary",
    notes:
      "Listing price is an offer claim and can conflict with primary sources.",
  },
  {
    field_pattern: "physical.*",
    priority: 45,
    authority_type: "secondary",
    notes:
      "Useful for coverage, but identity and facts require dedup/evidence checks.",
  },
];

const marketplaceCapabilities = {
  discover: "partial" as const,
  collect: "partial" as const,
  refresh: "partial" as const,
  verify: "partial" as const,
  user_url_ingest: "partial" as const,
  display: "partial" as const,
};

const partnerMethods = (
  credentialRef: string,
): SourceRegistryEntry["policy"]["methods"] => [
  {
    method: "api",
    priority: 100,
    operations: ["scheduled_collect", "targeted_refresh", "user_url_ingest"],
    required_conditions: ["PARTNER_CONTRACT_CONFIGURED"],
    credential_ref: credentialRef,
  },
  ...manualMethods,
];

const marketplaceEntries: SourceRegistryEntry[] = [
  externalEntry({
    sourceId: "src_mkt_01",
    name: "ЦИАН",
    sourceType: "classified",
    domains: ["cian.ru"],
    baseUrl: "https://www.cian.ru",
    trust: "secondary",
    entityTypes: ["property", "offer"],
    propertyTypes: ["apartment", "apartments", "house", "townhouse", "land"],
    marketTypes: ["new_build", "secondary", "suburban"],
    fieldCoverage: marketplaceFields,
    fieldAuthority: marketplaceAuthority,
    capabilities: marketplaceCapabilities,
    policyReasons: ["PARTNER_API_ONLY", "DO_NOT_AUTOCOLLECT"],
    methods: partnerMethods("CIAN_PARTNER_ACCESS_KEY"),
    environmentMethods: ["api", "manual", "user_supplied"],
    requiredConditions: ["PARTNER_CONTRACT_CONFIGURED"],
    notes:
      "MKT-01: HTML automation is prohibited; only a separately configured partner channel or manual input is allowed.",
  }),
  externalEntry({
    sourceId: "src_mkt_02",
    name: "Яндекс Недвижимость",
    sourceType: "classified",
    domains: ["realty.yandex.ru"],
    baseUrl: "https://realty.yandex.ru",
    trust: "secondary",
    entityTypes: ["property", "offer"],
    propertyTypes: ["apartment", "apartments", "house", "townhouse", "land"],
    marketTypes: ["new_build", "secondary", "suburban"],
    fieldCoverage: marketplaceFields,
    fieldAuthority: marketplaceAuthority,
    capabilities: marketplaceCapabilities,
    policyReasons: ["REVIEW_REQUIRED", "PARTNER_CHANNEL"],
    methods: [
      {
        method: "partner_feed",
        priority: 100,
        operations: ["scheduled_collect", "targeted_refresh"],
        required_conditions: ["INBOUND_PARTNER_CHANNEL_CONFIRMED"],
        credential_ref: "YANDEX_REALTY_PARTNER_CREDENTIAL",
      },
      ...manualMethods,
    ],
    environmentMethods: ["partner_feed", "manual", "user_supplied"],
    requiredConditions: ["INBOUND_PARTNER_CHANNEL_CONFIRMED"],
    notes:
      "MKT-02: documented YRL feed is outbound to Yandex, not a confirmed inbound inventory API.",
  }),
  externalEntry({
    sourceId: "src_mkt_03",
    name: "Домклик",
    sourceType: "classified",
    domains: ["domclick.ru"],
    baseUrl: "https://domclick.ru",
    trust: "secondary",
    entityTypes: ["property", "offer", "financing_offer"],
    propertyTypes: ["apartment", "apartments", "house", "townhouse", "land"],
    marketTypes: ["new_build", "secondary", "suburban"],
    fieldCoverage: marketplaceFields,
    fieldAuthority: marketplaceAuthority,
    capabilities: marketplaceCapabilities,
    policyReasons: ["PARTNER_API_ONLY"],
    methods: partnerMethods("DOMCLICK_PARTNER_TOKEN"),
    environmentMethods: ["api", "manual", "user_supplied"],
    requiredConditions: ["PARTNER_CONTRACT_CONFIGURED"],
    notes:
      "MKT-03: available API covers an authorized company's own listings, not general market search.",
  }),
  externalEntry({
    sourceId: "src_mkt_04",
    name: "Авито",
    sourceType: "classified",
    domains: ["avito.ru"],
    baseUrl: "https://www.avito.ru",
    trust: "secondary",
    entityTypes: ["property", "offer"],
    propertyTypes: ["apartment", "apartments", "house", "townhouse", "land"],
    marketTypes: ["new_build", "secondary", "suburban"],
    fieldCoverage: marketplaceFields,
    fieldAuthority: marketplaceAuthority,
    capabilities: marketplaceCapabilities,
    policyReasons: [
      "REVIEW_REQUIRED",
      "PARTNER_API_ONLY",
      "DO_NOT_AUTOCOLLECT",
    ],
    methods: partnerMethods("AVITO_PARTNER_CLIENT_CREDENTIAL"),
    environmentMethods: ["api", "manual", "user_supplied"],
    requiredConditions: ["PARTNER_CONTRACT_CONFIGURED"],
    notes:
      "MKT-04: account-based Business API exists; public market ingestion is not established.",
  }),
];

const financeFields: SourceRegistryEntry["coverage"]["fields"] = [
  { field_pattern: "financing.program_rules.*", support: "full", notes: null },
  { field_pattern: "financing.rate", support: "full", notes: null },
  { field_pattern: "financing.initial_payment", support: "full", notes: null },
  {
    field_pattern: "financing.property_eligibility",
    support: "partial",
    notes: "Program rules do not confirm a specific property or borrower.",
  },
];

const financeEntries: SourceRegistryEntry[] = [
  externalEntry({
    sourceId: "src_fin_01",
    name: "ДОМ.РФ",
    sourceType: "government",
    domains: [
      "дом.рф",
      "спроси.дом.рф",
      // наш.дом.рф carries two different things: the mortgage programme rules
      // this entry is authoritative for, and the ЕИСЖС developer declarations
      // that src_gov_01 covers. The shared rule makes that split explicit
      // instead of letting one entry silently own both.
      { hostname: "наш.дом.рф", sharedOwnershipRule: EISJS_SHARED_DOMAIN_RULE },
    ],
    baseUrl: "https://дом.рф",
    trust: "authoritative",
    entityTypes: ["financing_program", "document"],
    fieldCoverage: financeFields,
    fieldAuthority: [
      {
        field_pattern: "financing.program_rules.*",
        priority: 100,
        authority_type: "authoritative",
        notes:
          "Authoritative for government program rules, not bank approval or unit eligibility.",
      },
      {
        field_pattern: "financing.property_eligibility",
        priority: 55,
        authority_type: "authoritative",
        notes:
          "Defines general rules but does not confirm a specific transaction.",
      },
    ],
    capabilities: {
      discover: "partial",
      collect: "full",
      refresh: "partial",
      verify: "full",
      user_url_ingest: "partial",
      display: "partial",
    },
    policyReasons: ["REVIEW_REQUIRED"],
    access: "approved",
    automation: "conditional",
    methods: [
      {
        method: "http",
        priority: 80,
        operations: [
          "scheduled_collect",
          "targeted_refresh",
          "user_url_ingest",
        ],
        required_conditions: ["OFFICIAL_SOURCE_REUSE_REVIEWED"],
        credential_ref: null,
      },
      ...manualMethods,
    ],
    environmentMethods: ["http", "manual", "user_supplied"],
    requiredConditions: ["OFFICIAL_SOURCE_REUSE_REVIEWED"],
    notes:
      "FIN-01: authoritative public reference; storage/reuse rights still require an explicit reviewed decision.",
  }),
  externalEntry({
    sourceId: "src_fin_02",
    name: "ВТБ",
    sourceType: "bank_site",
    domains: ["vtb.ru"],
    baseUrl: "https://www.vtb.ru",
    trust: "primary",
    entityTypes: ["financing_offer", "document"],
    fieldCoverage: financeFields,
    fieldAuthority: [
      {
        field_pattern: "financing.rate",
        priority: 90,
        authority_type: "primary",
        notes: "Primary for published bank terms, not individual approval.",
      },
      {
        field_pattern: "financing.initial_payment",
        priority: 90,
        authority_type: "primary",
        notes: "Primary for bank terms subject to applicability and freshness.",
      },
    ],
    capabilities: {
      discover: "none",
      collect: "full",
      refresh: "partial",
      verify: "full",
      user_url_ingest: "partial",
      display: "partial",
    },
    policyReasons: ["REVIEW_REQUIRED"],
    methods: reviewedBrowserMethods("ACCESS_REVIEW_CONFIRMED"),
    environmentMethods: ["http", "browser", "manual", "user_supplied"],
    requiredConditions: ["ACCESS_REVIEW_CONFIRMED"],
    notes:
      "FIN-02: bank implementation reference pending review for systematic storage and refresh.",
  }),
];

/**
 * ЕИСЖС (наш.дом.рф) — the unified housing-construction information system.
 *
 * Developers publish project declarations there because 214-ФЗ requires it, so
 * the origin of the data is clean. That is not the same as a right to collect
 * it automatically: object cards are addressed by query parameters, which the
 * collection scope refuses, and no adapter exists. The pilot therefore enters
 * these objects by hand under `manual_import`, and the entry says so.
 */
const eisjsFields: SourceRegistryEntry["coverage"]["fields"] = [
  { field_pattern: "identity.*", support: "full", notes: null },
  { field_pattern: "location.*", support: "full", notes: null },
  {
    field_pattern: "physical.*",
    support: "partial",
    notes: "Area and floor are declared; layout details are not.",
  },
  {
    field_pattern: "building.*",
    support: "partial",
    notes: "Building height and commissioning are declared.",
  },
  {
    field_pattern: "timeline.*",
    support: "partial",
    notes:
      "Declared with quarter granularity as a developer commitment, never as a confirmed calendar date.",
  },
  {
    field_pattern: "listing_price",
    support: "none",
    notes: "Unit prices are not published in project declarations.",
  },
  {
    field_pattern: "availability",
    support: "none",
    notes: "Unit availability is not published in project declarations.",
  },
  {
    field_pattern: "financing.*",
    support: "none",
    notes: "Declarations describe the object, not a transaction.",
  },
];

const eisjsEntry = externalEntry({
  sourceId: EISJS_SOURCE_ID,
  name: "ЕИСЖС (наш.дом.рф)",
  sourceType: "government",
  domains: [
    { hostname: "наш.дом.рф", sharedOwnershipRule: EISJS_SHARED_DOMAIN_RULE },
  ],
  baseUrl: "https://наш.дом.рф",
  trust: "authoritative",
  status: "manual_only",
  entityTypes: ["property", "document"],
  propertyTypes: ["apartment", "apartments"],
  marketTypes: ["new_build"],
  fieldCoverage: eisjsFields,
  fieldAuthority: [
    {
      field_pattern: "location.*",
      priority: 95,
      authority_type: "authoritative",
      notes: "Address as filed in the project declaration.",
    },
    {
      field_pattern: "physical.*",
      priority: 95,
      authority_type: "authoritative",
      notes: "Area and floor as filed in the project declaration.",
    },
    {
      field_pattern: "timeline.*",
      priority: 60,
      authority_type: "authoritative",
      notes:
        "A declared commissioning commitment about the future, not a verified fact.",
    },
  ],
  capabilities: {
    discover: "none",
    collect: "none",
    refresh: "none",
    verify: "full",
    user_url_ingest: "none",
    display: "partial",
  },
  policyReasons: ["MANUAL_ONLY"],
  access: "approved",
  automation: "denied",
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
  refresh: { permission: "denied", modes: ["manual_only"] },
  derivation: "approved",
  cache: "denied",
  methods: manualMethods,
  environmentApproval: {
    development: {
      status: "approved",
      allowed_methods: ["manual"],
      required_conditions: [],
    },
    test: {
      status: "approved",
      allowed_methods: ["manual"],
      required_conditions: [],
    },
    pilot: {
      status: "approved",
      allowed_methods: ["manual"],
      required_conditions: [],
    },
    production: {
      status: "denied",
      allowed_methods: ["manual"],
      required_conditions: [],
    },
  },
  retentionPolicy: {
    normalized_facts: "persistent",
    evidence_metadata: "persistent",
    raw_content: "prohibited",
    raw_snapshots: "prohibited",
  },
  reviewedAt: "2026-09-08T00:00:00.000Z",
  notes:
    "GOV-01: 214-ФЗ project declarations, entered by hand. Automatic collection is denied: object cards are query-addressed and no adapter is approved.",
});

const geoEntry = externalEntry({
  sourceId: "src_geo_01",
  name: "API Яндекс Карт",
  sourceType: "map_service",
  domains: ["api-maps.yandex.ru", "geocode-maps.yandex.ru"],
  baseUrl: "https://api-maps.yandex.ru",
  trust: "primary",
  entityTypes: ["geo_point", "poi", "travel_time"],
  fieldCoverage: [
    { field_pattern: "location.geo_point", support: "full", notes: null },
    { field_pattern: "infrastructure.*", support: "full", notes: null },
    { field_pattern: "mobility.*", support: "full", notes: null },
  ],
  fieldAuthority: [
    {
      field_pattern: "location.geo_point",
      priority: 80,
      authority_type: "primary",
      notes:
        "Provider result; persistent storage depends on the selected license.",
    },
    {
      field_pattern: "mobility.*",
      priority: 80,
      authority_type: "primary",
      notes:
        "Strong for provider-calculated routes at the calculation timestamp.",
    },
  ],
  capabilities: {
    discover: "none",
    collect: "full",
    refresh: "full",
    verify: "partial",
    user_url_ingest: "none",
    display: "partial",
  },
  policyReasons: ["PARTNER_CHANNEL", "STORAGE_NOT_APPROVED"],
  access: "conditional",
  automation: "conditional",
  storage: {
    raw_content: "denied",
    normalized_data: "conditional",
    evidence_metadata: "conditional",
    snapshots: "denied",
    derived_data: "conditional",
  },
  display: {
    normalized_facts: "conditional",
    source_link: "approved",
    evidence_snippet: "denied",
    raw_content: "denied",
    image_media: "denied",
  },
  refresh: { permission: "conditional", modes: ["targeted", "user_triggered"] },
  derivation: "conditional",
  cache: "conditional",
  methods: [
    {
      method: "api",
      priority: 100,
      operations: ["scheduled_collect", "targeted_refresh"],
      required_conditions: ["COMMERCIAL_LICENSE_CONFIGURED"],
      credential_ref: "YANDEX_MAPS_API_KEY",
    },
    ...manualMethods,
  ],
  environmentMethods: ["api", "manual", "user_supplied"],
  requiredConditions: ["COMMERCIAL_LICENSE_CONFIGURED"],
  attributionRestrictions: [
    "Follow the configured commercial license attribution terms.",
  ],
  notes:
    "GEO-01: API use and persistence require a compatible license; free-mode rights are not assumed.",
});

const fixtureFreshness: SourceRegistryEntry["freshness"] = [
  ...standardFreshness,
];

const fixtureEntry = ({
  sourceId,
  hostname,
  status,
  lifecycle,
  automatic,
}: {
  sourceId: string;
  hostname: string;
  status: SourceRegistryEntry["status"];
  lifecycle: SourceRegistryEntry["approval_lifecycle"];
  automatic: boolean;
}): SourceRegistryEntry => ({
  source_id: sourceId,
  name: `Synthetic ${sourceId}`,
  source_type: "user_link",
  domains: [
    { hostname, include_subdomains: false, shared_ownership_rule: null },
  ],
  base_url: `https://${hostname}`,
  geography: { country_codes: ["RU"], regions: [], cities: [] },
  coverage: {
    property_types: ["apartment", "house"],
    market_types: ["secondary", "suburban", "unknown"],
    entity_types: ["property", "offer"],
    fields: developerFields,
  },
  capabilities: {
    discover: "none",
    collect: automatic ? "full" : "none",
    refresh: "none",
    verify: "partial",
    user_url_ingest: "full",
    display: "full",
  },
  status,
  approval_lifecycle: lifecycle,
  trust_level: "user_provided",
  environment_approval: environmentApproval(
    automatic
      ? ["fixture_mock", "manual", "user_supplied"]
      : ["manual", "user_supplied"],
    automatic
      ? ["fixture_mock", "manual", "user_supplied"]
      : ["manual", "user_supplied"],
  ),
  policy: {
    access: automatic ? "approved" : "denied",
    automation: automatic ? "approved" : "denied",
    storage: {
      raw_content: automatic ? "approved" : "denied",
      normalized_data: "approved",
      evidence_metadata: "approved",
      snapshots: automatic ? "approved" : "denied",
      derived_data: "approved",
    },
    display: {
      normalized_facts: "approved",
      source_link: "approved",
      evidence_snippet: automatic ? "approved" : "denied",
      raw_content: "denied",
      image_media: "denied",
    },
    refresh: { permission: "denied", modes: ["none"] },
    derivation: "approved",
    cache: "approved",
    collection_scope: {
      explicit_targets_only: false,
      allowed_hosts: [hostname],
      allowed_path_patterns: ["^/.*$"],
      maximum_target_urls: 1,
      discovery_allowed: false,
      follow_links_allowed: false,
      pagination_allowed: false,
      sitemap_allowed: false,
      authentication_allowed: false,
      challenge_action: "stop",
    },
    field_policy: defaultFieldPolicy,
    retention_policy: {
      normalized_facts: "transient_only",
      evidence_metadata: "transient_only",
      raw_content: automatic ? "transient_only" : "prohibited",
      raw_snapshots: automatic ? "transient_only" : "prohibited",
    },
    methods: automatic
      ? [
          {
            method: "fixture_mock",
            priority: 100,
            operations: ["user_url_ingest"],
            required_conditions: [],
            credential_ref: null,
          },
          ...manualMethods,
        ]
      : manualMethods,
    attribution: {
      attribution_required: true,
      attribution_label: `Synthetic ${sourceId}`,
      link_required: true,
      logo_allowed: false,
      display_restrictions: [
        "Synthetic fixture; never present as live market data.",
      ],
    },
    required_conditions: [],
    reason_codes: automatic ? ["FIXTURE_APPROVED"] : ["MANUAL_ONLY"],
  },
  production_gate: productionGate(true),
  field_authority: [
    {
      field_pattern: "*",
      priority: 20,
      authority_type: "user_provided",
      notes:
        "Synthetic or user-provided evidence never confirms external facts.",
    },
  ],
  freshness: fixtureFreshness,
  operational: {
    minimum_interval_seconds: 0,
    maximum_concurrency: 1,
    daily_budget: 100,
  },
  health: automatic
    ? {
        ...healthUnknown,
        status: "healthy",
        recent_success_rate: 1,
        recent_error_rate: 0,
        reason_codes: [],
      }
    : healthUnknown,
  reviewed_at: "2026-08-17T00:00:00.000Z",
  notes:
    "Synthetic TASK-012 fixture; contains no third-party content or credentials.",
});

const fixtureEntries: SourceRegistryEntry[] = [
  fixtureEntry({
    sourceId: "fixture_user_url",
    hostname: "fixture.example",
    status: "active",
    lifecycle: "approved_for_pilot",
    automatic: true,
  }),
  fixtureEntry({
    sourceId: "manual_fixture_source",
    hostname: "manual.fixture.example",
    status: "manual_only",
    lifecycle: "testing",
    automatic: false,
  }),
  fixtureEntry({
    sourceId: "blocked_fixture_source",
    hostname: "blocked.fixture.example",
    status: "blocked",
    lifecycle: "blocked",
    automatic: false,
  }),
  fixtureEntry({
    sourceId: "unsupported_fixture_source",
    hostname: "unsupported.fixture.example",
    status: "manual_only",
    lifecycle: "candidate",
    automatic: false,
  }),
  fixtureEntry({
    sourceId: "fixture_review_source",
    hostname: "review.fixture.example",
    status: "testing",
    lifecycle: "review_required",
    automatic: true,
  }),
];

export const PILOT_SOURCE_REGISTRY_CONFIG: SourceRegistryConfig = {
  schema_version: "1.1",
  registry_version: SOURCE_REGISTRY_VERSION,
  policy_version: SOURCE_POLICY_VERSION,
  sources: [
    ...developerEntries,
    ...marketplaceEntries,
    ...financeEntries,
    eisjsEntry,
    geoEntry,
    ...fixtureEntries,
  ],
};
