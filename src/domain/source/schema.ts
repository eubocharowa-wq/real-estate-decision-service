import { z } from "zod";

import {
  entityIdSchema,
  freshnessStatusSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  propertyTypeSchema,
  ratioSchema,
  schemaVersionSchema,
  sourceTrustSchema,
  urlSchema,
  verificationStatusSchema,
} from "../common/schema";

export const sourceTypeSchema = z.enum([
  "developer_site",
  "project_site",
  "classified",
  "agency_site",
  "bank_site",
  "government",
  "registry",
  "map_service",
  "poi_provider",
  "user_link",
  "manual_expert",
  "partner_feed",
  "api",
  "other",
]);

export const collectionMethodSchema = z.enum([
  "api",
  "feed",
  "http_fetch",
  "browser_agent",
  "openclaw",
  "manual",
  "user_submission",
  "import",
  "partner_connector",
]);

export const sourceSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    source_id: entityIdSchema,
    source_type: sourceTypeSchema,
    name: nonEmptyStringSchema,
    domain: nonEmptyStringSchema.nullable(),
    base_url: urlSchema.nullable(),
    coverage: z.strictObject({
      country_codes: z.array(z.string().regex(/^[A-Z]{2}$/)),
      regions: z.array(nonEmptyStringSchema),
      property_types: z.array(propertyTypeSchema),
    }),
    collection_method: collectionMethodSchema,
    trust_level: sourceTrustSchema,
    status: z.enum(["active", "degraded", "blocked", "inactive", "unknown"]),
    policy_metadata: z.strictObject({
      access_status: z.enum([
        "approved",
        "restricted",
        "pending",
        "prohibited",
        "unknown",
      ]),
      storage_rights: z.boolean().nullable(),
      display_rights: z.boolean().nullable(),
      refresh_rights: z.boolean().nullable(),
      reviewed_at: isoDateTimeSchema.nullable(),
      notes: nonEmptyStringSchema.nullable(),
    }),
    upstream_source_id: entityIdSchema.nullable(),
  })
  .meta({ title: "Source" });

export const sourceSnapshotSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    snapshot_id: entityIdSchema,
    source_id: entityIdSchema,
    url: urlSchema,
    collected_at: isoDateTimeSchema,
    content_hash: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum([
      "collected",
      "partial",
      "source_changed",
      "failed",
      "blocked",
      "unknown",
    ]),
    structured_payload_reference: nonEmptyStringSchema.nullable(),
    raw_reference: nonEmptyStringSchema.nullable(),
  })
  .meta({ title: "SourceSnapshot" });

export const evidenceTypeSchema = z.enum([
  "primary_source",
  "secondary_source",
  "document",
  "manual_expert",
  "user_provided",
  "derived",
  "extraction",
]);

export const fieldEvidenceSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    evidence_id: entityIdSchema,
    entity_type: nonEmptyStringSchema,
    entity_id: entityIdSchema,
    field: nonEmptyStringSchema,
    value: z.json(),
    raw_value: z.json(),
    source_id: entityIdSchema,
    snapshot_id: entityIdSchema.nullable(),
    source_url: urlSchema.nullable(),
    collected_at: isoDateTimeSchema,
    verification_status: verificationStatusSchema,
    freshness_status: freshnessStatusSchema,
    extraction_confidence: ratioSchema.nullable(),
    evidence_type: evidenceTypeSchema,
    evidence_text: nonEmptyStringSchema.nullable(),
    evidence_reference: nonEmptyStringSchema.nullable(),
  })
  .meta({ title: "FieldEvidence" });

export const sourceConflictSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    conflict_id: entityIdSchema,
    entity_id: entityIdSchema,
    field: nonEmptyStringSchema,
    evidence_ids: z.array(entityIdSchema).min(2),
    severity: z.enum(["minor", "significant", "critical", "unknown"]),
    status: z.enum(["open", "resolved", "dismissed", "unknown"]),
    resolved_value: z.json(),
    resolution_reason: nonEmptyStringSchema.nullable(),
    resolved_by: entityIdSchema.nullable(),
    resolved_at: isoDateTimeSchema.nullable(),
  })
  .meta({ title: "SourceConflict" });

export type Source = z.infer<typeof sourceSchema>;
export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>;
export type FieldEvidence = z.infer<typeof fieldEvidenceSchema>;
export type SourceConflict = z.infer<typeof sourceConflictSchema>;
