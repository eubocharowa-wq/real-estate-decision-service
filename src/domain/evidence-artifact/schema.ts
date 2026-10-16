import { z } from "zod";

import {
  entityIdSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  SCHEMA_VERSION,
  schemaVersionSchema,
  urlSchema,
} from "../common/schema";

export const EVIDENCE_ARTIFACT_SCHEMA_VERSION = SCHEMA_VERSION;

export const evidenceArtifactStateSchema = z.enum([
  "quarantine",
  "staged",
  "approved",
]);

export const evidenceArtifactKindSchema = z.enum([
  "source_snapshot",
  "user_document",
  "manual_evidence",
]);

/** No public access state exists in the Slice A contract. */
export const evidenceArtifactAccessScopeSchema = z.enum([
  "private_owner",
  "restricted_internal",
]);

export const evidenceArtifactRetentionPolicySchema = z.enum([
  "transient",
  "standard",
  "user_document",
  "legal_hold",
]);

export const evidenceArtifactSha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected a lowercase SHA-256 hex digest");

export const evidenceArtifactStorageKeySchema = nonEmptyStringSchema
  .max(512)
  .refine(
    (value) => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value),
    "Storage key must be opaque and must not be a URL",
  );

export const evidenceArtifactSchema = z
  .strictObject({
    artifact_id: entityIdSchema,
    schema_version: schemaVersionSchema,
    artifact_kind: evidenceArtifactKindSchema,
    source_id: entityIdSchema,
    source_url: urlSchema.nullable(),
    source_reference: nonEmptyStringSchema.nullable(),
    collected_at: isoDateTimeSchema,
    mime_type: z
      .string()
      .trim()
      .regex(
        /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i,
        "Expected a MIME media type",
      ),
    byte_size: z.number().int().nonnegative().safe(),
    sha256: evidenceArtifactSha256Schema,
    storage_key: evidenceArtifactStorageKeySchema,
    state: evidenceArtifactStateSchema,
    access_scope: evidenceArtifactAccessScopeSchema,
    retention_policy: evidenceArtifactRetentionPolicySchema,
    retain_until: isoDateTimeSchema.nullable(),
    created_at: isoDateTimeSchema,
  })
  .superRefine((artifact, context) => {
    if (artifact.source_url === null && artifact.source_reference === null)
      context.addIssue({
        code: "custom",
        path: ["source_reference"],
        message: "Either source_url or source_reference is required",
      });
    if (
      artifact.artifact_kind === "user_document" &&
      artifact.access_scope !== "private_owner"
    )
      context.addIssue({
        code: "custom",
        path: ["access_scope"],
        message: "User documents must remain private to their owner",
      });
  })
  .meta({ title: "EvidenceArtifact" });

export const evidenceArtifactLinkSubjectTypeSchema = z.enum([
  "field_evidence",
  "source_snapshot",
]);

export const evidenceArtifactLinkRelationSchema = z.enum([
  "supports",
  "captures",
  "derived_from",
]);

export const evidenceArtifactLinkSchema = z
  .strictObject({
    artifact_id: entityIdSchema,
    subject_type: evidenceArtifactLinkSubjectTypeSchema,
    subject_id: entityIdSchema,
    relation: evidenceArtifactLinkRelationSchema,
    created_at: isoDateTimeSchema,
  })
  .meta({ title: "EvidenceArtifactLink" });

export const evidenceArtifactActorTypeSchema = z.enum([
  "system",
  "service",
  "user",
  "expert",
  "operator",
]);

export const evidenceArtifactReasonCodeSchema = z.enum([
  "checksum_validated",
  "content_validated",
  "evidence_reviewed",
  "manual_approval",
  "retention_review",
]);

export const evidenceArtifactEventMetadataSchema = z.strictObject({
  reason_code: evidenceArtifactReasonCodeSchema.nullable(),
});

export const evidenceArtifactEventSchema = z
  .strictObject({
    event_id: entityIdSchema,
    artifact_id: entityIdSchema,
    event_type: z.enum(["artifact_created", "state_transitioned"]),
    from_state: evidenceArtifactStateSchema.nullable(),
    to_state: evidenceArtifactStateSchema,
    actor_type: evidenceArtifactActorTypeSchema,
    actor_ref: entityIdSchema.nullable(),
    occurred_at: isoDateTimeSchema,
    metadata: evidenceArtifactEventMetadataSchema,
  })
  .superRefine((event, context) => {
    if (
      event.event_type === "artifact_created" &&
      (event.from_state !== null || event.to_state !== "quarantine")
    )
      context.addIssue({
        code: "custom",
        path: ["to_state"],
        message: "A created artifact must start in quarantine",
      });
    if (event.event_type === "state_transitioned" && event.from_state === null)
      context.addIssue({
        code: "custom",
        path: ["from_state"],
        message: "A state transition requires its previous state",
      });
  })
  .meta({ title: "EvidenceArtifactEvent" });

export type EvidenceArtifact = z.infer<typeof evidenceArtifactSchema>;
export type EvidenceArtifactState = z.infer<typeof evidenceArtifactStateSchema>;
export type EvidenceArtifactKind = z.infer<typeof evidenceArtifactKindSchema>;
export type EvidenceArtifactAccessScope = z.infer<
  typeof evidenceArtifactAccessScopeSchema
>;
export type EvidenceArtifactRetentionPolicy = z.infer<
  typeof evidenceArtifactRetentionPolicySchema
>;
export type EvidenceArtifactLink = z.infer<typeof evidenceArtifactLinkSchema>;
export type EvidenceArtifactLinkSubjectType = z.infer<
  typeof evidenceArtifactLinkSubjectTypeSchema
>;
export type EvidenceArtifactLinkRelation = z.infer<
  typeof evidenceArtifactLinkRelationSchema
>;
export type EvidenceArtifactActorType = z.infer<
  typeof evidenceArtifactActorTypeSchema
>;
export type EvidenceArtifactReasonCode = z.infer<
  typeof evidenceArtifactReasonCodeSchema
>;
export type EvidenceArtifactEvent = z.infer<typeof evidenceArtifactEventSchema>;
