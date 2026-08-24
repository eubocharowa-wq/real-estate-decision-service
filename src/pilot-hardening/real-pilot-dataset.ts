import type { FieldEvidence, Offer, Property, Source } from "../domain";
import {
  createPilotRuntimeConfig,
  PILOT_HARDENING_POLICY_VERSION,
} from "./config";
import {
  REAL_PILOT_DATASET_CANDIDATE_VERSION,
  REAL_PILOT_DATASET_MANIFEST_VERSION,
  REAL_PILOT_MANUAL_SELECTION_SOURCE_VERSION,
  type PilotCandidate,
  type PilotCandidateValidationResult,
  type RealPilotDatasetCandidate,
  type RealPilotDatasetManifest,
  type RealPilotDatasetRuntime,
  type RealPilotDatasetValidationResult,
  type RealPilotObservedFact,
} from "./contracts";
import { validatePilotCandidate } from "./candidate-validator";

const PILOT_OBSERVED_AT = "2026-08-24T00:00:00.000Z";

const REAL_PILOT_ORIGINS = new Set([
  "user_supplied",
  "manual_curated",
  "approved_live_source",
]);

const FRESHNESS_STATUSES = new Set([
  "fresh",
  "aging",
  "stale",
  "expired",
  "unknown",
]);

const AVITO_EXPLICIT_UNKNOWN_FIELDS = Object.freeze([
  "property.identity.cadastral_number",
  "property.market_type",
  "property.location",
  "property.physical.living_area_m2",
  "property.physical.kitchen_area_m2",
  "property.physical.bedrooms",
  "property.physical.balcony",
  "property.physical.bathrooms",
  "property.physical.layout_type",
  "property.building.name",
  "property.building.building_type",
  "property.building.built_year",
  "property.building.elevator",
  "property.building.freight_elevator",
  "property.condition",
  "property.land",
  "property.utilities",
  "property.timeline",
  "property.ownership",
  "offer.seller",
  "offer.listing_price",
  "offer.price_from",
  "offer.availability",
  "offer.published_at",
  "offer.updated_at",
  "offer.expires_at",
  "offer.mandatory_extras",
  "offer.commercial_terms",
  "offer.financing_offer_ids",
  "offer.promotion_ids",
]);

const sourceForUserUrl = (input: {
  readonly sourceId: string;
  readonly name: string;
  readonly domain: string;
  readonly baseUrl: string;
}): Source => ({
  schema_version: "1.0",
  source_id: input.sourceId,
  source_type: "user_link",
  name: input.name,
  domain: input.domain,
  base_url: input.baseUrl,
  coverage: { country_codes: [], regions: [], property_types: [] },
  collection_method: "user_submission",
  trust_level: "user_provided",
  status: "unknown",
  policy_metadata: {
    access_status: "restricted",
    storage_rights: true,
    display_rights: true,
    refresh_rights: false,
    reviewed_at: null,
    notes: "User-supplied manual fallback; no automated fetch performed.",
  },
  upstream_source_id: null,
});

const buildAvitoUserSuppliedCandidate = (input: {
  readonly listingId: string;
  readonly sourceUrl: string;
  readonly area: number;
  readonly floor: number;
  readonly floorsTotal: number;
}): RealPilotDatasetCandidate => {
  const propertyId = `property_avito_${input.listingId}`;
  const offerId = `offer_avito_${input.listingId}`;
  const source = sourceForUserUrl({
    sourceId: "user_link_avito",
    name: "Avito — ссылка пользователя",
    domain: "www.avito.ru",
    baseUrl: "https://www.avito.ru",
  });
  const facts = [
    { field: "rooms", value: 1 },
    { field: "total_area_m2", value: input.area },
    { field: "floor", value: input.floor },
    { field: "floors_total", value: input.floorsTotal },
  ] as const;
  const evidence: FieldEvidence[] = facts.map((fact) => ({
    schema_version: "1.0",
    evidence_id: `evidence_avito_${input.listingId}_${fact.field}`,
    entity_type: "property",
    entity_id: propertyId,
    field: fact.field,
    value: fact.value,
    raw_value: fact.value,
    source_id: source.source_id,
    snapshot_id: null,
    source_url: input.sourceUrl,
    collected_at: PILOT_OBSERVED_AT,
    verification_status: "claimed",
    freshness_status: "fresh",
    extraction_confidence: null,
    evidence_type: "user_provided",
    evidence_text: null,
    evidence_reference: "Факт явно указан в URL, переданном пользователем.",
  }));
  const evidenceRefs = evidence.map((item) => item.evidence_id);
  const property: Property = {
    schema_version: "1.0",
    identity: {
      property_id: propertyId,
      canonical_key: null,
      cadastral_number: null,
      source_unit_ids: [`avito:${input.listingId}`],
    },
    property_type: "apartment",
    market_type: "unknown",
    location: {
      address: {
        country_code: null,
        region: null,
        city: null,
        locality: null,
        district: null,
        street: null,
        house_number: null,
        postal_code: null,
      },
      geo_point: null,
    },
    physical: {
      total_area_m2: input.area,
      living_area_m2: null,
      kitchen_area_m2: null,
      rooms: 1,
      bedrooms: null,
      floor: input.floor,
      balcony: null,
      bathrooms: null,
      layout_type: null,
    },
    building: {
      name: null,
      building_type: null,
      floors_total: input.floorsTotal,
      built_year: null,
      elevator: null,
      freight_elevator: null,
    },
    condition: {
      finishing_type: "unknown",
      condition_description: null,
      ready_for_living: null,
    },
    land: { area_sotka: null, category: null, permitted_use: null },
    utilities: {
      electricity: "unknown",
      water: "unknown",
      gas: "unknown",
      sewerage: "unknown",
      heating: "unknown",
      internet: "unknown",
    },
    timeline: {
      planned_commissioning_date: null,
      handover_date: null,
      move_in_possible_date: null,
    },
    ownership: {
      ownership_type: "unknown",
      encumbrance_status: "unknown",
      ownership_notes: null,
    },
    metadata: {
      created_at: PILOT_OBSERVED_AT,
      updated_at: PILOT_OBSERVED_AT,
      evidence_refs: evidenceRefs,
      tags: ["user_supplied", "manual_fallback", "restricted_source"],
    },
  };
  const offer: Offer = {
    schema_version: "1.0",
    offer_id: offerId,
    property_id: propertyId,
    seller: { seller_type: "unknown", seller_id: null, name: null },
    source_reference: {
      source_id: source.source_id,
      snapshot_id: null,
      source_url: input.sourceUrl,
      evidence_ids: evidenceRefs,
    },
    listing_price: null,
    price_from: null,
    availability: "unknown",
    published_at: null,
    updated_at: null,
    expires_at: null,
    mandatory_extras: [],
    commercial_terms: {
      reservation_terms: null,
      payment_terms: null,
      notes: [],
    },
    financing_offer_ids: [],
    promotion_ids: [],
    verification_status: "unknown",
    freshness_status: "fresh",
    evidence_refs: [],
  };
  const candidate: PilotCandidate = {
    schema_version: "pilot-candidate-v1",
    origin: "user_supplied",
    property,
    offer,
    source,
    sources: [source],
    evidence,
    financing_claims: [],
    observed_at: PILOT_OBSERVED_AT,
    environment: "pilot",
  };
  const observedFacts: RealPilotObservedFact[] = evidence.map((item) => ({
    field: item.field,
    value: item.value,
    verification_status: "claimed",
    evidence_refs: [item.evidence_id],
  }));
  return {
    schema_version: REAL_PILOT_DATASET_CANDIDATE_VERSION,
    candidate_id: `candidate_avito_${input.listingId}`,
    origin: "user_supplied",
    source_url: input.sourceUrl,
    observed_facts: observedFacts,
    explicit_unknown_fields: AVITO_EXPLICIT_UNKNOWN_FIELDS,
    evidence_refs: evidenceRefs,
    observed_at: PILOT_OBSERVED_AT,
    freshness_status: "fresh",
    collection_mode: "manual_fallback",
    automated_fetch_performed: false,
    candidate,
  };
};

export const REAL_BUYER_PILOT_DATASET_MANIFEST_V1: RealPilotDatasetManifest =
  Object.freeze({
    schema_version: REAL_PILOT_DATASET_MANIFEST_VERSION,
    manifest_id: "real_buyer_pilot_seed_manifest",
    dataset_version: "real-buyer-pilot-seed-v1",
    environment: "pilot",
    created_at: PILOT_OBSERVED_AT,
    candidates: Object.freeze([
      buildAvitoUserSuppliedCandidate({
        listingId: "7336470679",
        sourceUrl:
          "https://www.avito.ru/tula/kvartiry/1-k._kvartira_409_m_110_et._7336470679",
        area: 40.9,
        floor: 1,
        floorsTotal: 10,
      }),
      buildAvitoUserSuppliedCandidate({
        listingId: "8383508344",
        sourceUrl:
          "https://www.avito.ru/tula/kvartiry/1-k._kvartira_36_m_29_et._8383508344",
        area: 36,
        floor: 2,
        floorsTotal: 9,
      }),
    ]),
    manual_selection_sources: Object.freeze([
      {
        schema_version: REAL_PILOT_MANUAL_SELECTION_SOURCE_VERSION,
        seed_id: "manual_selection_edinstvo71_flat_10",
        origin: "user_supplied",
        source_url: "https://edinstvo71.ru/flat/10",
        status: "manual_selection_required",
        explicit_unknown_fields: Object.freeze([
          "property.identity",
          "property.property_type",
          "property.market_type",
          "property.location",
          "property.physical",
          "property.building",
          "property.condition",
          "property.timeline",
          "property.ownership",
          "offer.identity",
          "offer.seller",
          "offer.listing_price",
          "offer.availability",
          "offer.financing",
        ]),
        observed_at: PILOT_OBSERVED_AT,
        freshness_status: "unknown",
        automated_fetch_performed: false,
        reason:
          "Unit identity is not established; a unit-specific URL or manual selection is required.",
      } as const,
    ]),
  });

const valueAt = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : null;

const strings = (value: unknown): readonly string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;

const validUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const sameJsonValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const unique = (values: readonly string[]): string[] => [...new Set(values)];

export const validateRealPilotDatasetManifest = (
  input: unknown,
  options: { readonly now?: string } = {},
): RealPilotDatasetValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const candidateResults: PilotCandidateValidationResult[] = [];
  const candidatesInput = valueAt(input, "candidates");
  const manualSourcesInput = valueAt(input, "manual_selection_sources");
  const candidates = Array.isArray(candidatesInput) ? candidatesInput : [];
  const manualSources = Array.isArray(manualSourcesInput)
    ? manualSourcesInput
    : [];
  const manifestVersion = valueAt(input, "schema_version");

  if (manifestVersion !== REAL_PILOT_DATASET_MANIFEST_VERSION)
    errors.push("INVALID_REAL_PILOT_MANIFEST_VERSION");
  if (
    typeof valueAt(input, "manifest_id") !== "string" ||
    !String(valueAt(input, "manifest_id")).trim()
  )
    errors.push("REAL_PILOT_MANIFEST_ID_REQUIRED");
  if (
    typeof valueAt(input, "dataset_version") !== "string" ||
    !String(valueAt(input, "dataset_version")).trim()
  )
    errors.push("REAL_PILOT_DATASET_VERSION_REQUIRED");
  if (
    typeof valueAt(input, "created_at") !== "string" ||
    !Number.isFinite(Date.parse(String(valueAt(input, "created_at"))))
  )
    errors.push("REAL_PILOT_MANIFEST_CREATED_AT_REQUIRED");
  if (valueAt(input, "environment") !== "pilot")
    errors.push("REAL_PILOT_MANIFEST_ENVIRONMENT_REQUIRED");
  if (!Array.isArray(candidatesInput))
    errors.push("REAL_PILOT_CANDIDATES_REQUIRED");
  else if (candidates.length === 0) errors.push("REAL_PILOT_DATASET_EMPTY");
  if (!Array.isArray(manualSourcesInput))
    errors.push("MANUAL_SELECTION_SOURCES_REQUIRED");

  const propertyIds = new Set<string>();
  const offerIds = new Set<string>();
  let validCandidateCount = 0;
  for (const [index, entry] of candidates.entries()) {
    const prefix = `candidate[${index}]`;
    const errorCountBefore = errors.length;
    const origin = valueAt(entry, "origin");
    const sourceUrl = valueAt(entry, "source_url");
    const observedAt = valueAt(entry, "observed_at");
    const freshnessStatus = valueAt(entry, "freshness_status");
    const evidenceRefs = strings(valueAt(entry, "evidence_refs"));
    const unknownFields = strings(valueAt(entry, "explicit_unknown_fields"));
    const observedFactsInput = valueAt(entry, "observed_facts");
    const candidateInput = valueAt(entry, "candidate");

    if (
      valueAt(entry, "schema_version") !== REAL_PILOT_DATASET_CANDIDATE_VERSION
    )
      errors.push(`${prefix}:INVALID_CANDIDATE_ENVELOPE_VERSION`);
    if (!REAL_PILOT_ORIGINS.has(String(origin)))
      errors.push(`${prefix}:REAL_DATA_ORIGIN_REQUIRED`);
    if (origin === "synthetic") errors.push(`${prefix}:SYNTHETIC_FORBIDDEN`);
    if (!validUrl(sourceUrl)) errors.push(`${prefix}:SOURCE_URL_REQUIRED`);
    if (
      typeof observedAt !== "string" ||
      !Number.isFinite(Date.parse(observedAt))
    )
      errors.push(`${prefix}:OBSERVED_AT_REQUIRED`);
    if (!FRESHNESS_STATUSES.has(String(freshnessStatus)))
      errors.push(`${prefix}:FRESHNESS_STATUS_REQUIRED`);
    if (!evidenceRefs || evidenceRefs.length === 0)
      errors.push(`${prefix}:EVIDENCE_REFS_REQUIRED`);
    if (!unknownFields || unknownFields.length === 0)
      errors.push(`${prefix}:EXPLICIT_UNKNOWNS_REQUIRED`);
    if (!Array.isArray(observedFactsInput))
      errors.push(`${prefix}:OBSERVED_FACTS_REQUIRED`);
    if (
      origin === "user_supplied" &&
      valueAt(entry, "automated_fetch_performed") !== false
    )
      errors.push(`${prefix}:USER_SUPPLIED_AUTOMATION_FORBIDDEN`);

    const candidateResult = validatePilotCandidate(candidateInput, {
      runtimeConfig: createPilotRuntimeConfig({ mode: "pilot" }),
      now: options.now,
    });
    candidateResults.push(candidateResult);
    if (!candidateResult.valid)
      errors.push(
        ...candidateResult.errors.map((error) => `${prefix}:${error}`),
      );

    if (candidateResult.valid) {
      const candidate = candidateInput as PilotCandidate;
      if (candidate.origin !== origin) errors.push(`${prefix}:ORIGIN_MISMATCH`);
      if (candidate.environment !== "pilot")
        errors.push(`${prefix}:CANDIDATE_ENVIRONMENT_MISMATCH`);
      if (candidate.observed_at !== observedAt)
        errors.push(`${prefix}:OBSERVED_AT_MISMATCH`);
      if (candidate.offer.freshness_status !== freshnessStatus)
        errors.push(`${prefix}:FRESHNESS_STATUS_MISMATCH`);
      if (candidate.offer.source_reference.source_url !== sourceUrl)
        errors.push(`${prefix}:SOURCE_URL_REFERENCE_MISMATCH`);
      if (candidate.evidence.length === 0)
        errors.push(`${prefix}:PROVENANCE_EVIDENCE_REQUIRED`);

      const propertyId = candidate.property.identity.property_id;
      const offerId = candidate.offer.offer_id;
      if (propertyIds.has(propertyId))
        errors.push(`${prefix}:DUPLICATE_PROPERTY_ID`);
      if (offerIds.has(offerId)) errors.push(`${prefix}:DUPLICATE_OFFER_ID`);
      if (offerIds.has(propertyId) || propertyIds.has(offerId))
        errors.push(`${prefix}:PROPERTY_OFFER_ID_COLLISION`);
      propertyIds.add(propertyId);
      offerIds.add(offerId);

      const evidenceById = new Map(
        candidate.evidence.map((item) => [item.evidence_id, item]),
      );
      if (evidenceRefs?.some((reference) => !evidenceById.has(reference)))
        errors.push(`${prefix}:DATASET_EVIDENCE_REFERENCE_MISSING`);
      if (
        evidenceRefs?.some(
          (reference) => evidenceById.get(reference)?.source_url !== sourceUrl,
        )
      )
        errors.push(`${prefix}:EVIDENCE_SOURCE_URL_MISMATCH`);
      if (
        origin === "user_supplied" &&
        candidate.evidence.some(
          (item) => item.verification_status === "confirmed",
        )
      )
        errors.push(`${prefix}:USER_SUPPLIED_CONFIRMATION_FORBIDDEN`);

      if (Array.isArray(observedFactsInput)) {
        for (const fact of observedFactsInput) {
          const field = valueAt(fact, "field");
          const factEvidenceRefs = strings(valueAt(fact, "evidence_refs"));
          const factStatus = valueAt(fact, "verification_status");
          const factValue = valueAt(fact, "value");
          if (
            typeof field !== "string" ||
            !factEvidenceRefs ||
            factEvidenceRefs.length === 0
          ) {
            errors.push(`${prefix}:INVALID_OBSERVED_FACT`);
            continue;
          }
          const factEvidence = factEvidenceRefs.flatMap((reference) => {
            const evidence = evidenceById.get(reference);
            return evidence ? [evidence] : [];
          });
          if (
            factEvidence.length !== factEvidenceRefs.length ||
            factEvidence.some(
              (item) =>
                item.field !== field || !sameJsonValue(item.value, factValue),
            )
          )
            errors.push(`${prefix}:OBSERVED_FACT_EVIDENCE_MISMATCH`);
          if (
            factStatus === "confirmed" &&
            factEvidence.some(
              (item) => item.verification_status !== "confirmed",
            )
          )
            errors.push(`${prefix}:CLAIMED_PROMOTED_TO_CONFIRMED`);
          if (origin === "user_supplied" && factStatus === "confirmed")
            errors.push(`${prefix}:USER_SUPPLIED_CONFIRMATION_FORBIDDEN`);
          if (unknownFields?.includes(field))
            errors.push(`${prefix}:FIELD_BOTH_OBSERVED_AND_UNKNOWN`);
        }
      }
    }
    if (errors.length === errorCountBefore) validCandidateCount += 1;
  }

  for (const [index, entry] of manualSources.entries()) {
    const prefix = `manual_selection_source[${index}]`;
    if (
      valueAt(entry, "schema_version") !==
      REAL_PILOT_MANUAL_SELECTION_SOURCE_VERSION
    )
      errors.push(`${prefix}:INVALID_MANUAL_SELECTION_SOURCE_VERSION`);
    if (valueAt(entry, "origin") !== "user_supplied")
      errors.push(`${prefix}:USER_SUPPLIED_ORIGIN_REQUIRED`);
    if (
      typeof valueAt(entry, "seed_id") !== "string" ||
      !String(valueAt(entry, "seed_id")).trim()
    )
      errors.push(`${prefix}:SEED_ID_REQUIRED`);
    if (!validUrl(valueAt(entry, "source_url")))
      errors.push(`${prefix}:SOURCE_URL_REQUIRED`);
    if (valueAt(entry, "status") !== "manual_selection_required")
      errors.push(`${prefix}:MANUAL_SELECTION_STATUS_REQUIRED`);
    if (valueAt(entry, "automated_fetch_performed") !== false)
      errors.push(`${prefix}:AUTOMATION_FORBIDDEN`);
    if (valueAt(entry, "freshness_status") !== "unknown")
      errors.push(`${prefix}:UNKNOWN_FRESHNESS_REQUIRED`);
    if (
      typeof valueAt(entry, "observed_at") !== "string" ||
      !Number.isFinite(Date.parse(String(valueAt(entry, "observed_at"))))
    )
      errors.push(`${prefix}:OBSERVED_AT_REQUIRED`);
    if (
      typeof valueAt(entry, "reason") !== "string" ||
      !String(valueAt(entry, "reason")).trim()
    )
      errors.push(`${prefix}:MANUAL_SELECTION_REASON_REQUIRED`);
    const unknownFields = strings(valueAt(entry, "explicit_unknown_fields"));
    if (!unknownFields || unknownFields.length === 0)
      errors.push(`${prefix}:EXPLICIT_UNKNOWNS_REQUIRED`);
  }

  const uniqueErrors = unique(errors);
  const valid = uniqueErrors.length === 0;
  return {
    schema_version: "real-pilot-dataset-validation-v1",
    valid,
    configured: valid && validCandidateCount >= 1,
    errors: uniqueErrors,
    warnings: unique(warnings),
    candidate_count: candidates.length,
    valid_candidate_count: validCandidateCount,
    manual_selection_source_count: manualSources.length,
    candidate_results: candidateResults,
    manifest_version:
      typeof manifestVersion === "string" ? manifestVersion : null,
  };
};

export const resolveRealPilotDatasetRuntime = (
  input: unknown = REAL_BUYER_PILOT_DATASET_MANIFEST_V1,
  options: { readonly now?: string } = {},
): RealPilotDatasetRuntime => {
  const validation = validateRealPilotDatasetManifest(input, options);
  const manifest = validation.valid
    ? (input as RealPilotDatasetManifest)
    : null;
  return {
    manifest,
    validation,
    candidates: validation.configured
      ? manifest!.candidates.map((item) => item.candidate)
      : [],
  };
};

export const REAL_PILOT_DATASET_POLICY_VERSION = `${PILOT_HARDENING_POLICY_VERSION}+real-pilot-dataset-v1`;
