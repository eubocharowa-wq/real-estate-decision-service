import { z } from "zod";

import {
  entityIdSchema,
  isoDateTimeSchema,
  marketTypeSchema,
  nonEmptyStringSchema,
  propertyTypeSchema,
  ratioSchema,
  sourceTrustSchema,
  urlSchema,
  verificationStatusSchema,
} from "../../domain/common/schema";
import { sourceTypeSchema } from "../../domain/source/schema";

export const sourceEnvironmentSchema = z.enum([
  "development",
  "test",
  "pilot",
  "production",
]);

export const sourceRegistryStatusSchema = z.enum([
  "candidate",
  "testing",
  "active",
  "degraded",
  "paused",
  "blocked",
  "deprecated",
  "manual_only",
]);

export const sourceApprovalLifecycleSchema = z.enum([
  "candidate",
  "testing",
  "review_required",
  "approved_for_pilot",
  "production_approved",
  "paused",
  "blocked",
  "deprecated",
]);

export const permissionStatusSchema = z.enum([
  "approved",
  "conditional",
  "denied",
  "unknown",
]);

export const environmentApprovalStatusSchema = z.enum([
  "approved",
  "conditional",
  "denied",
]);

export const sourceOperationSchema = z.enum([
  "identify",
  "user_url_ingest",
  "scheduled_collect",
  "targeted_refresh",
  "display",
  "store",
  "manual_import",
  "expert_verification",
]);

export const registryCollectionMethodSchema = z.enum([
  "api",
  "partner_feed",
  "xml_feed",
  "http",
  "browser",
  "openclaw",
  "manual",
  "user_supplied",
  "expert",
  "fixture_mock",
  "none",
]);

export const policyReasonCodeSchema = z.enum([
  "PRODUCTION_NOT_APPROVED",
  "PERMISSION_REQUIRED",
  "REVIEW_REQUIRED",
  "PARTNER_API_ONLY",
  "PARTNER_CHANNEL",
  "DO_NOT_AUTOCOLLECT",
  "MANUAL_ONLY",
  "SOURCE_BLOCKED",
  "SOURCE_PAUSED",
  "SOURCE_DEPRECATED",
  "AUTOMATION_ALLOWED",
  "FIXTURE_APPROVED",
  "STORAGE_NOT_APPROVED",
  "DISPLAY_NOT_APPROVED",
  "REFRESH_NOT_APPROVED",
  "ATTRIBUTION_REQUIRED",
  "SOURCE_DEGRADED",
  "SOURCE_FAILING",
  "SOURCE_CHANGED",
  "SOURCE_UNKNOWN",
  "ENVIRONMENT_NOT_APPROVED",
  "METHOD_NOT_ALLOWED",
  "OPERATION_NOT_SUPPORTED",
  "ENTITY_NOT_COVERED",
  "FIELD_NOT_COVERED",
  "REQUIRED_CONDITION_MISSING",
  "ACCESS_NOT_APPROVED",
  "DERIVATION_NOT_APPROVED",
  "CACHE_NOT_APPROVED",
  "SCOPED_POC_ONLY",
  "TARGET_SCOPE_REQUIRED",
  "TARGET_LIMIT_EXCEEDED",
  "TARGET_URL_NOT_ALLOWED",
  "REQUESTED_FIELDS_REQUIRED",
  "FIELD_NOT_ALLOWED",
  "DISCOVERY_NOT_ALLOWED",
  "LINK_TRAVERSAL_NOT_ALLOWED",
  "PAGINATION_NOT_ALLOWED",
  "SITEMAP_NOT_ALLOWED",
  "AUTHENTICATION_NOT_ALLOWED",
  "CHALLENGE_ACTION_NOT_ALLOWED",
  "POLICY_ALLOWED",
]);

const supportLevelSchema = z.enum(["full", "partial", "none"]);
const refreshModeSchema = z.enum([
  "scheduled",
  "targeted",
  "user_triggered",
  "manual_only",
  "none",
]);

const domainRuleSchema = z.strictObject({
  hostname: nonEmptyStringSchema,
  include_subdomains: z.boolean(),
  shared_ownership_rule: nonEmptyStringSchema.nullable(),
});

export const fieldCoverageSchema = z.strictObject({
  field_pattern: nonEmptyStringSchema,
  support: supportLevelSchema,
  notes: nonEmptyStringSchema.nullable(),
});

const capabilitiesSchema = z.strictObject({
  discover: supportLevelSchema,
  collect: supportLevelSchema,
  refresh: supportLevelSchema,
  verify: supportLevelSchema,
  user_url_ingest: supportLevelSchema,
  display: supportLevelSchema,
});

const methodPolicySchema = z.strictObject({
  method: registryCollectionMethodSchema,
  priority: z.number().int().min(1).max(100),
  operations: z.array(sourceOperationSchema).min(1),
  required_conditions: z.array(nonEmptyStringSchema),
  credential_ref: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .nullable(),
});

const environmentApprovalSchema = z.strictObject({
  status: environmentApprovalStatusSchema,
  allowed_methods: z.array(registryCollectionMethodSchema),
  required_conditions: z.array(nonEmptyStringSchema),
});

const storagePolicySchema = z.strictObject({
  raw_content: permissionStatusSchema,
  normalized_data: permissionStatusSchema,
  evidence_metadata: permissionStatusSchema,
  snapshots: permissionStatusSchema,
  derived_data: permissionStatusSchema,
});

const displayPolicySchema = z.strictObject({
  normalized_facts: permissionStatusSchema,
  source_link: permissionStatusSchema,
  evidence_snippet: permissionStatusSchema,
  raw_content: permissionStatusSchema,
  image_media: permissionStatusSchema,
});

const attributionPolicySchema = z.strictObject({
  attribution_required: z.boolean(),
  attribution_label: nonEmptyStringSchema,
  link_required: z.boolean(),
  logo_allowed: z.boolean(),
  display_restrictions: z.array(nonEmptyStringSchema),
});

export const collectionScopeSchema = z.strictObject({
  explicit_targets_only: z.boolean(),
  allowed_hosts: z.array(nonEmptyStringSchema).min(1),
  allowed_path_patterns: z.array(nonEmptyStringSchema).min(1),
  maximum_target_urls: z.number().int().positive(),
  discovery_allowed: z.boolean(),
  follow_links_allowed: z.boolean(),
  pagination_allowed: z.boolean(),
  sitemap_allowed: z.boolean(),
  authentication_allowed: z.boolean(),
  challenge_action: z.enum(["stop", "manual_review"]),
});

export const fieldPolicySchema = z.strictObject({
  requested_fields_required: z.boolean(),
  allowed_fields: z.array(nonEmptyStringSchema).min(1),
  required_evidence_metadata: z.tuple([
    z.literal("source_url"),
    z.literal("observed_at"),
  ]),
  verification_ceilings: z.array(
    z.strictObject({
      field_pattern: nonEmptyStringSchema,
      maximum_status: verificationStatusSchema,
    }),
  ),
});

export const retentionModeSchema = z.enum([
  "prohibited",
  "transient_only",
  "persistent",
]);

export const retentionPolicySchema = z.strictObject({
  normalized_facts: retentionModeSchema,
  evidence_metadata: retentionModeSchema,
  raw_content: retentionModeSchema,
  raw_snapshots: retentionModeSchema,
});

export const fieldAuthoritySchema = z.strictObject({
  field_pattern: nonEmptyStringSchema,
  priority: z.number().int().min(0).max(100),
  authority_type: z.enum([
    "authoritative",
    "primary",
    "secondary",
    "user_provided",
    "unknown",
  ]),
  notes: nonEmptyStringSchema,
});

export const freshnessPolicySchema = z
  .strictObject({
    field_pattern: nonEmptyStringSchema,
    volatility: z.enum(["V1", "V2", "V3", "V4"]),
    target_ttl_hours: z.number().positive().nullable(),
    stale_after_hours: z.number().positive().nullable(),
    critical_after_hours: z.number().positive().nullable(),
    valid_until_overrides: z.boolean(),
    refresh_modes: z.array(refreshModeSchema).min(1),
  })
  .superRefine((value, context) => {
    if (
      value.target_ttl_hours !== null &&
      value.stale_after_hours !== null &&
      value.target_ttl_hours > value.stale_after_hours
    )
      context.addIssue({
        code: "custom",
        path: ["target_ttl_hours"],
        message: "target TTL must not exceed stale threshold",
      });
    if (
      value.stale_after_hours !== null &&
      value.critical_after_hours !== null &&
      value.stale_after_hours > value.critical_after_hours
    )
      context.addIssue({
        code: "custom",
        path: ["stale_after_hours"],
        message: "stale threshold must not exceed critical threshold",
      });
  });

const productionGateSchema = z.strictObject({
  technically_possible: z.boolean(),
  access_terms_checked: z.boolean(),
  right_to_store_confirmed: z.boolean(),
  right_to_display_confirmed: z.boolean(),
  right_to_refresh_confirmed: z.boolean(),
  attribution_defined: z.boolean(),
  production_approved: z.boolean(),
});

const healthSchema = z.strictObject({
  status: z.enum(["healthy", "degraded", "failing", "unknown"]),
  recent_success_rate: ratioSchema.nullable(),
  recent_error_rate: ratioSchema.nullable(),
  last_successful_run_at: isoDateTimeSchema.nullable(),
  source_changed: z.boolean(),
  auth_issue: z.boolean(),
  rate_limited: z.boolean(),
  reason_codes: z.array(
    z.enum([
      "SOURCE_CHANGED",
      "AUTH_ISSUE",
      "RATE_LIMITED",
      "RECENT_FAILURES",
      "NO_RUNTIME_DATA",
    ]),
  ),
});

const operationalPolicySchema = z.strictObject({
  minimum_interval_seconds: z.number().int().nonnegative().nullable(),
  maximum_concurrency: z.number().int().positive().nullable(),
  daily_budget: z.number().int().positive().nullable(),
});

export const sourceRegistryEntrySchema = z.strictObject({
  source_id: entityIdSchema,
  name: nonEmptyStringSchema,
  source_type: sourceTypeSchema,
  domains: z.array(domainRuleSchema).min(1),
  base_url: urlSchema,
  geography: z.strictObject({
    country_codes: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
    regions: z.array(nonEmptyStringSchema),
    cities: z.array(nonEmptyStringSchema),
  }),
  coverage: z.strictObject({
    property_types: z.array(propertyTypeSchema),
    market_types: z.array(marketTypeSchema),
    entity_types: z.array(nonEmptyStringSchema).min(1),
    fields: z.array(fieldCoverageSchema).min(1),
  }),
  capabilities: capabilitiesSchema,
  status: sourceRegistryStatusSchema,
  approval_lifecycle: sourceApprovalLifecycleSchema,
  trust_level: sourceTrustSchema,
  environment_approval: z.strictObject({
    development: environmentApprovalSchema,
    test: environmentApprovalSchema,
    pilot: environmentApprovalSchema,
    production: environmentApprovalSchema,
  }),
  policy: z.strictObject({
    access: permissionStatusSchema,
    automation: permissionStatusSchema,
    storage: storagePolicySchema,
    display: displayPolicySchema,
    refresh: z.strictObject({
      permission: permissionStatusSchema,
      modes: z.array(refreshModeSchema).min(1),
    }),
    derivation: permissionStatusSchema,
    cache: permissionStatusSchema,
    collection_scope: collectionScopeSchema,
    field_policy: fieldPolicySchema,
    retention_policy: retentionPolicySchema,
    methods: z.array(methodPolicySchema).min(1),
    attribution: attributionPolicySchema,
    required_conditions: z.array(nonEmptyStringSchema),
    reason_codes: z.array(policyReasonCodeSchema).min(1),
  }),
  production_gate: productionGateSchema,
  field_authority: z.array(fieldAuthoritySchema).min(1),
  freshness: z.array(freshnessPolicySchema).min(1),
  operational: operationalPolicySchema,
  health: healthSchema,
  reviewed_at: isoDateTimeSchema,
  notes: nonEmptyStringSchema,
});

export const sourceRegistryConfigSchema = z.strictObject({
  schema_version: z.literal("1.1"),
  registry_version: nonEmptyStringSchema,
  policy_version: nonEmptyStringSchema,
  sources: z.array(sourceRegistryEntrySchema).min(1),
});

export type SourceEnvironment = z.infer<typeof sourceEnvironmentSchema>;
export type SourceRegistryStatus = z.infer<typeof sourceRegistryStatusSchema>;
export type PermissionStatus = z.infer<typeof permissionStatusSchema>;
export type SourceOperation = z.infer<typeof sourceOperationSchema>;
export type RegistryCollectionMethod = z.infer<
  typeof registryCollectionMethodSchema
>;
export type PolicyReasonCode = z.infer<typeof policyReasonCodeSchema>;
export type CollectionScope = z.infer<typeof collectionScopeSchema>;
export type FieldPolicy = z.infer<typeof fieldPolicySchema>;
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;
export type FieldCoverage = z.infer<typeof fieldCoverageSchema>;
export type FieldAuthority = z.infer<typeof fieldAuthoritySchema>;
export type FreshnessPolicy = z.infer<typeof freshnessPolicySchema>;
export type SourceRegistryEntry = z.infer<typeof sourceRegistryEntrySchema>;
export type SourceRegistryConfig = z.infer<typeof sourceRegistryConfigSchema>;
