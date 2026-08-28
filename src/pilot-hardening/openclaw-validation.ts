import { z } from "zod";

import {
  entityIdSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  ratioSchema,
  urlSchema,
} from "../domain/common/schema";
import type { CollectionPlan } from "../data-collection/source-registry";
import type {
  OpenClawCollectionRequest,
  OpenClawStagedResult,
} from "./contracts";

export const OPENCLAW_STAGED_RESULT_SCHEMA_VERSION =
  "openclaw-staged-result-v2" as const;

const identityHintsSchema = z.strictObject({
  property_external_id: nonEmptyStringSchema.nullable(),
  offer_external_id: nonEmptyStringSchema.nullable(),
});

const stagedEvidenceSchema = z.strictObject({
  source_id: entityIdSchema,
  source_url: urlSchema,
  observed_at: isoDateTimeSchema,
  evidence_type: z.literal("extraction"),
  evidence_reference: nonEmptyStringSchema,
  raw_value: z.json(),
  extraction_confidence: ratioSchema.nullable(),
});

const extractedFactSchema = z
  .strictObject({
    field: nonEmptyStringSchema,
    value: z.json(),
    verification_status: z.enum(["claimed", "unconfirmed", "unknown"]),
    evidence: stagedEvidenceSchema,
  })
  .superRefine((fact, context) => {
    if (fact.verification_status === "unknown" && fact.value !== null)
      context.addIssue({
        code: "custom",
        message: "An unknown fact cannot carry an inferred value.",
        path: ["value"],
      });
    if (
      fact.evidence.raw_value === null ||
      (fact.verification_status !== "unknown" && fact.value === null)
    )
      context.addIssue({
        code: "custom",
        message:
          "An extracted fact requires an observed raw evidence value; known facts also require a value.",
        path: ["evidence"],
      });
  });

export const openClawStagedResultSchema = z.strictObject({
  schema_version: z.literal(OPENCLAW_STAGED_RESULT_SCHEMA_VERSION),
  request_id: entityIdSchema,
  collection_run_id: entityIdSchema,
  source_id: entityIdSchema,
  source_url: urlSchema,
  observed_at: isoDateTimeSchema,
  identity_hints: identityHintsSchema,
  status: z.enum(["partial", "complete", "source_changed", "failed"]),
  facts: z.array(extractedFactSchema),
  missing_fields: z.array(nonEmptyStringSchema),
  raw_content_reference: z.null(),
  warnings: z.array(nonEmptyStringSchema),
});

const unique = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

/**
 * Validates the untrusted agent output against the already-approved plan.
 * Unknown keys, unrequested fields and incomplete evidence all fail closed.
 */
export const parseOpenClawStagedResult = (
  value: unknown,
  input: {
    readonly request: OpenClawCollectionRequest;
    readonly plan: CollectionPlan;
    readonly expectedCollectionRunId?: string;
  },
): OpenClawStagedResult | null => {
  const parsed = openClawStagedResultSchema.safeParse(value);
  if (!parsed.success) return null;
  const result = parsed.data;
  const requestedFields = input.plan.validatedRequestedFields;
  const factFields = result.facts.map((fact) => fact.field);
  const knownFactFields = result.facts
    .filter((fact) => fact.verification_status !== "unknown")
    .map((fact) => fact.field);
  const unknownFactFields = result.facts
    .filter((fact) => fact.verification_status === "unknown")
    .map((fact) => fact.field);
  if (
    result.request_id !== input.request.request_id ||
    (input.expectedCollectionRunId !== undefined &&
      result.collection_run_id !== input.expectedCollectionRunId) ||
    result.source_id !== input.request.collection_task.source_id ||
    !input.plan.validatedTargetUrls.includes(result.source_url) ||
    !unique(factFields) ||
    !unique(result.missing_fields) ||
    factFields.some((field) => !requestedFields.includes(field)) ||
    result.missing_fields.some((field) => !requestedFields.includes(field)) ||
    knownFactFields.some((field) => result.missing_fields.includes(field)) ||
    unknownFactFields.some((field) => !result.missing_fields.includes(field))
  )
    return null;

  const accountedFields = new Set([...factFields, ...result.missing_fields]);
  if (
    requestedFields.some((field) => !accountedFields.has(field)) ||
    accountedFields.size !== requestedFields.length ||
    (result.status === "complete" &&
      (result.missing_fields.length > 0 || unknownFactFields.length > 0))
  )
    return null;

  for (const fact of result.facts) {
    if (
      fact.evidence.source_id !== result.source_id ||
      fact.evidence.source_url !== result.source_url ||
      fact.evidence.observed_at !== result.observed_at
    )
      return null;
  }
  return result as OpenClawStagedResult;
};
