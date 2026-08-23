import {
  fieldEvidenceSchema,
  offerSchema,
  propertySchema,
  sourceSchema,
  type FieldEvidence,
} from "../domain";
import { sourceRegistry } from "../data-collection/source-registry";
import {
  PILOT_CANDIDATE_SCHEMA_VERSION,
  type PilotCandidate,
  type PilotCandidateValidationResult,
} from "./contracts";
import {
  PILOT_DATA_ORIGINS,
  PILOT_HARDENING_POLICY_VERSION,
  createPilotRuntimeConfig,
  type PilotApplicationMode,
  type PilotDataOrigin,
  type PilotRuntimeConfig,
} from "./config";
import { evaluateSourcePilotReadiness } from "./source-readiness";

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const valueAt = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : null;

const asOrigin = (value: unknown): PilotDataOrigin | null =>
  typeof value === "string" &&
  PILOT_DATA_ORIGINS.includes(value as PilotDataOrigin)
    ? (value as PilotDataOrigin)
    : null;

const evidenceFor = (
  evidence: readonly FieldEvidence[],
  entityId: string,
  field: string,
): readonly FieldEvidence[] =>
  evidence.filter(
    (item) => item.entity_id === entityId && item.field === field,
  );

const modeForEnvironment = (
  environment: PilotCandidate["environment"],
): PilotApplicationMode =>
  environment === "pilot"
    ? "pilot"
    : environment === "production"
      ? "production"
      : "demo";

export const validatePilotCandidate = (
  input: unknown,
  options: {
    readonly runtimeConfig?: PilotRuntimeConfig;
    readonly now?: string;
  } = {},
): PilotCandidateValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const origin = asOrigin(valueAt(input, "origin"));
  const propertyResult = propertySchema.safeParse(valueAt(input, "property"));
  const offerResult = offerSchema.safeParse(valueAt(input, "offer"));
  const sourceResult = sourceSchema.safeParse(valueAt(input, "source"));
  const sourcesInput = valueAt(input, "sources");
  const sourceResults = Array.isArray(sourcesInput)
    ? sourcesInput.map((item) => sourceSchema.safeParse(item))
    : [];
  const evidenceInput = valueAt(input, "evidence");
  const evidenceResults = Array.isArray(evidenceInput)
    ? evidenceInput.map((item) => fieldEvidenceSchema.safeParse(item))
    : [];
  const environment = valueAt(input, "environment");
  const runtime =
    options.runtimeConfig ??
    createPilotRuntimeConfig({
      mode:
        environment === "development" ||
        environment === "test" ||
        environment === "pilot" ||
        environment === "production"
          ? modeForEnvironment(environment)
          : "demo",
    });

  if (valueAt(input, "schema_version") !== PILOT_CANDIDATE_SCHEMA_VERSION)
    errors.push("INVALID_PILOT_CANDIDATE_VERSION");
  if (!origin) errors.push("INVALID_DATA_ORIGIN");
  else if (!runtime.modePolicy.allowedOrigins.includes(origin))
    errors.push("ORIGIN_NOT_ALLOWED_IN_APPLICATION_MODE");
  if (!propertyResult.success) errors.push("INVALID_PROPERTY");
  if (!offerResult.success) errors.push("INVALID_OFFER");
  if (!sourceResult.success) errors.push("INVALID_SOURCE");
  if (!Array.isArray(sourcesInput) || sourcesInput.length === 0)
    errors.push("SOURCES_REQUIRED");
  if (sourceResults.some((result) => !result.success))
    errors.push("INVALID_SOURCES");
  if (!Array.isArray(evidenceInput) || evidenceInput.length === 0)
    errors.push("FIELD_EVIDENCE_REQUIRED");
  if (evidenceResults.some((result) => !result.success))
    errors.push("INVALID_FIELD_EVIDENCE");
  if (
    environment !== "development" &&
    environment !== "test" &&
    environment !== "pilot" &&
    environment !== "production"
  )
    errors.push("INVALID_SOURCE_ENVIRONMENT");

  if (
    !propertyResult.success ||
    !offerResult.success ||
    !sourceResult.success ||
    sourceResults.some((result) => !result.success) ||
    evidenceResults.some((result) => !result.success)
  )
    return {
      valid: false,
      errors: unique(errors),
      warnings: unique(warnings),
      property_id: propertyResult.success
        ? propertyResult.data.identity.property_id
        : null,
      offer_id: offerResult.success ? offerResult.data.offer_id : null,
      origin,
      policy_version: PILOT_HARDENING_POLICY_VERSION,
    };

  const property = propertyResult.data;
  const offer = offerResult.data;
  const source = sourceResult.data;
  const sources = sourceResults.flatMap((result) =>
    result.success ? [result.data] : [],
  );
  const sourceIds = new Set(sources.map((item) => item.source_id));
  const evidence = evidenceResults.flatMap((result) =>
    result.success ? [result.data] : [],
  );
  const evidenceIds = new Set(evidence.map((item) => item.evidence_id));

  if (property.identity.property_id === offer.offer_id)
    errors.push("PROPERTY_OFFER_ID_COLLISION");
  if (offer.property_id !== property.identity.property_id)
    errors.push("OFFER_PROPERTY_REFERENCE_MISMATCH");
  if (offer.source_reference.source_id !== source.source_id)
    errors.push("OFFER_SOURCE_REFERENCE_MISMATCH");
  if (!sourceIds.has(source.source_id))
    errors.push("PRIMARY_SOURCE_MISSING_FROM_SOURCES");
  if (evidence.some((item) => !sourceIds.has(item.source_id)))
    errors.push("EVIDENCE_SOURCE_MISSING");
  const referencedEvidence = unique([
    ...property.metadata.evidence_refs,
    ...offer.evidence_refs,
    ...offer.source_reference.evidence_ids,
  ]);
  if (referencedEvidence.some((id) => !evidenceIds.has(id)))
    errors.push("REFERENCED_EVIDENCE_MISSING");
  if (
    evidence.some(
      (item) =>
        item.entity_id !== property.identity.property_id &&
        item.entity_id !== offer.offer_id,
    )
  )
    errors.push("EVIDENCE_ENTITY_REFERENCE_MISMATCH");

  const priceEvidence = evidenceFor(evidence, offer.offer_id, "listing_price");
  if (offer.listing_price !== null && priceEvidence.length === 0)
    errors.push("PRICE_EVIDENCE_REQUIRED");
  if (
    offer.price_from === true &&
    priceEvidence.some((item) => item.verification_status === "confirmed")
  )
    errors.push("LOWER_BOUND_PRICE_CANNOT_BE_EXACT_CONFIRMED_PRICE");
  if (offer.listing_price === null && offer.price_from === true)
    errors.push("PRICE_FROM_REQUIRES_LOWER_BOUND_VALUE");

  const availabilityEvidence = evidenceFor(
    evidence,
    offer.offer_id,
    "availability",
  );
  if (
    offer.availability !== "unknown" &&
    !availabilityEvidence.some((item) => item.value === offer.availability)
  )
    errors.push("AVAILABILITY_EVIDENCE_REQUIRED");
  if (offer.availability === "unknown") warnings.push("AVAILABILITY_UNKNOWN");

  if (offer.freshness_status === "unknown")
    errors.push("OFFER_FRESHNESS_UNKNOWN");
  if (["stale", "expired"].includes(offer.freshness_status))
    warnings.push(`OFFER_${offer.freshness_status.toUpperCase()}`);
  if (
    evidence.some((item) =>
      ["stale", "expired", "unknown"].includes(item.freshness_status),
    )
  )
    warnings.push("EVIDENCE_FRESHNESS_REQUIRES_ATTENTION");

  const claims = valueAt(input, "financing_claims");
  if (!Array.isArray(claims)) errors.push("INVALID_FINANCING_CLAIMS");
  else {
    const registryEntry = sourceRegistry.get(source.source_id);
    for (const claim of claims) {
      const field = valueAt(claim, "field");
      const status = valueAt(claim, "verification_status");
      const refs = valueAt(claim, "evidence_refs");
      if (
        typeof field !== "string" ||
        typeof status !== "string" ||
        !Array.isArray(refs) ||
        refs.some((ref) => typeof ref !== "string" || !evidenceIds.has(ref))
      ) {
        errors.push("INVALID_FINANCING_CLAIM");
        continue;
      }
      const ceiling = registryEntry?.policy.field_policy.verification_ceilings
        .filter(
          (item) =>
            item.field_pattern === field ||
            (item.field_pattern.endsWith(".*") &&
              field.startsWith(item.field_pattern.slice(0, -1))),
        )
        .sort(
          (left, right) =>
            right.field_pattern.length - left.field_pattern.length,
        )[0];
      if (ceiling?.maximum_status === "claimed" && status === "confirmed")
        errors.push("FINANCING_CLAIM_EXCEEDS_VERIFICATION_CEILING");
    }
  }

  if (origin === "synthetic") {
    if (runtime.mode !== "demo") errors.push("SYNTHETIC_DATA_OUTSIDE_DEMO");
    if (!source.domain?.endsWith(".example"))
      errors.push("SYNTHETIC_SOURCE_NOT_MARKED_AS_FIXTURE");
  }
  if (origin === "approved_live_source") {
    const registryEntry = sourceRegistry.get(source.source_id);
    if (!registryEntry) errors.push("LIVE_SOURCE_NOT_REGISTERED");
    else {
      const readiness = evaluateSourcePilotReadiness(registryEntry);
      if (!readiness.ready) errors.push("LIVE_SOURCE_NOT_PILOT_READY");
    }
  }
  if (origin === "expert_supplied" && source.source_type !== "manual_expert")
    errors.push("EXPERT_SUPPLIED_ORIGIN_SOURCE_TYPE_MISMATCH");
  if (
    origin === "manual_curated" &&
    (source.policy_metadata.access_status !== "approved" ||
      source.policy_metadata.storage_rights !== true ||
      source.policy_metadata.display_rights !== true)
  )
    errors.push("MANUAL_SOURCE_POLICY_INCOMPLETE");

  const observedAt = Date.parse(String(valueAt(input, "observed_at") ?? ""));
  const now = Date.parse(options.now ?? new Date().toISOString());
  if (!Number.isFinite(observedAt)) errors.push("INVALID_OBSERVED_AT");
  else if (observedAt > now + 60_000) errors.push("OBSERVED_AT_IN_FUTURE");

  return {
    valid: errors.length === 0,
    errors: unique(errors),
    warnings: unique(warnings),
    property_id: property.identity.property_id,
    offer_id: offer.offer_id,
    origin,
    policy_version: PILOT_HARDENING_POLICY_VERSION,
  };
};
