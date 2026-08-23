import type {
  FieldEvidence,
  Offer,
  Property,
  Source,
  SourceSnapshot,
} from "../domain";
import {
  fieldEvidenceSchema,
  offerSchema,
  propertySchema,
  sourceSchema,
  sourceSnapshotSchema,
} from "../domain";
import type { IngestionPolicyDecision } from "./policy";
import { evaluateDuplicateCandidate } from "./duplicate-hook";
import type {
  ManualConfirmationFields,
  MatchingReadiness,
  NormalizedUserUrlCandidate,
  RawIngestionFieldName,
  RawIngestionResult,
  ValidatedUserUrl,
} from "./types";

export const USER_URL_NORMALIZATION_VERSION = "user-url-normalization-v1";

const stableToken = (value: string): string => {
  let hash = 2_166_136_261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};
const hash64 = (value: string): string =>
  Array.from({ length: 8 }, (_, index) =>
    stableToken(`${index}:${value}`),
  ).join("");

const rawValue = (
  raw: RawIngestionResult,
  name: RawIngestionFieldName,
): unknown =>
  raw.rawFields.find((item) => item.field === name)?.parsedValue ?? null;

const differs = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) !== JSON.stringify(right);

export const manualFieldsFromRaw = (
  raw: RawIngestionResult,
): ManualConfirmationFields => ({
  title: String(rawValue(raw, "title") ?? "Объект по ссылке"),
  propertyType: (rawValue(raw, "property_type") ??
    "apartment") as Property["property_type"],
  marketType: (rawValue(raw, "market_type") ??
    "unknown") as Property["market_type"],
  city: String(rawValue(raw, "city") ?? ""),
  locationText: String(rawValue(raw, "location_text") ?? ""),
  priceAmount:
    rawValue(raw, "price") === null ? null : String(rawValue(raw, "price")),
  priceExplicitUnknown: rawValue(raw, "price") === null,
  priceFrom:
    raw.rawFields.find((item) => item.field === "price")?.semantics ===
    "price_from",
  rooms: rawValue(raw, "rooms") as number | null,
  areaM2: rawValue(raw, "area_m2") as number | null,
  floor: rawValue(raw, "floor") as number | null,
  availability: (rawValue(raw, "availability") ??
    "unknown") as Offer["availability"],
  sellerName: String(rawValue(raw, "seller_name") ?? ""),
  sourceName: "Пользовательская ссылка (fixture)",
});

const readiness = (fields: ManualConfirmationFields): MatchingReadiness => {
  const missing: string[] = [];
  if (!fields.propertyType) missing.push("property_type");
  if (!fields.city || !fields.locationText) missing.push("location");
  if (!fields.title) missing.push("identity");
  if (fields.priceAmount === null && !fields.priceExplicitUnknown)
    missing.push("price_or_explicit_unknown");
  return {
    status: missing.length
      ? "not_ready"
      : fields.priceAmount === null
        ? "ready_with_unknowns"
        : "ready",
    missingFields: missing,
  };
};

export const normalizeUserUrlCandidate = ({
  raw,
  url,
  policy,
  fields,
}: {
  readonly raw: RawIngestionResult;
  readonly url: ValidatedUserUrl;
  readonly policy: IngestionPolicyDecision;
  readonly fields: ManualConfirmationFields;
}): NormalizedUserUrlCandidate => {
  const token = stableToken(url.canonicalUrl);
  const duplicate = evaluateDuplicateCandidate(raw);
  const propertyId =
    duplicate.existingPropertyId ?? `candidate_property_${token}`;
  const offerId = `candidate_offer_${token}`;
  const snapshotId = `candidate_snapshot_${token}`;
  const sourceId = raw.sourceId;
  const evidence: FieldEvidence[] = [];
  const manualEntry = raw.adapterVersion === "manual-entry-v1";
  const evidenceMap: ReadonlyArray<[string, RawIngestionFieldName, unknown]> = [
    ["identity.title", "title", fields.title],
    ["property_type", "property_type", fields.propertyType],
    ["market_type", "market_type", fields.marketType],
    ["location.address.city", "city", fields.city],
    ["location.display", "location_text", fields.locationText],
    ["physical.rooms", "rooms", fields.rooms],
    ["physical.total_area_m2", "area_m2", fields.areaM2],
    ["physical.floor", "floor", fields.floor],
    ["listing_price", "price", fields.priceAmount],
    ["availability", "availability", fields.availability],
    ["seller.name", "seller_name", fields.sellerName || null],
  ];
  for (const [field, rawName, normalized] of evidenceMap) {
    const extracted = raw.rawFields.find((item) => item.field === rawName);
    if (!extracted) continue;
    const edited = manualEntry || differs(extracted.parsedValue, normalized);
    const entityType =
      field === "listing_price" ||
      field === "availability" ||
      field.startsWith("seller")
        ? "offer"
        : "property";
    const entityId = entityType === "offer" ? offerId : propertyId;
    if (!manualEntry && extracted.parsedValue !== null)
      evidence.push(
        fieldEvidenceSchema.parse({
          schema_version: "1.0",
          evidence_id: `candidate_evidence_${token}_${evidence.length + 1}`,
          entity_type: entityType,
          entity_id: entityId,
          field: edited ? `raw_extraction.${field}` : field,
          value: extracted.parsedValue,
          raw_value: extracted.rawValue ?? null,
          source_id: sourceId,
          snapshot_id: snapshotId,
          source_url: url.canonicalUrl,
          collected_at: raw.collectedAt,
          verification_status: "claimed",
          freshness_status: "fresh",
          extraction_confidence: extracted.extractionConfidence,
          evidence_type: "extraction",
          evidence_text: extracted.evidenceText,
          evidence_reference: `adapter:${raw.adapterVersion}:${rawName}`,
        }),
      );
    if (edited)
      evidence.push(
        fieldEvidenceSchema.parse({
          schema_version: "1.0",
          evidence_id: `candidate_evidence_${token}_${evidence.length + 1}`,
          entity_type: entityType,
          entity_id: entityId,
          field,
          value: normalized,
          raw_value: extracted.rawValue ?? null,
          source_id: sourceId,
          snapshot_id: snapshotId,
          source_url: url.canonicalUrl,
          collected_at: raw.collectedAt,
          verification_status: "unconfirmed",
          freshness_status: "fresh",
          extraction_confidence: null,
          evidence_type: "user_provided",
          evidence_text: "Значение изменено пользователем при подтверждении.",
          evidence_reference: `confirmation:${raw.ingestionId}:${rawName}`,
        }),
      );
  }
  for (const claimName of ["gas", "financing_claim"] as const) {
    const extracted = raw.rawFields.find((item) => item.field === claimName);
    if (!extracted || extracted.parsedValue === null) continue;
    evidence.push(
      fieldEvidenceSchema.parse({
        schema_version: "1.0",
        evidence_id: `candidate_evidence_${token}_${evidence.length + 1}`,
        entity_type: claimName === "gas" ? "property" : "offer",
        entity_id: claimName === "gas" ? propertyId : offerId,
        field:
          claimName === "gas" ? "utilities.gas" : "financing.marketing_claim",
        value: extracted.parsedValue,
        raw_value: extracted.rawValue ?? null,
        source_id: sourceId,
        snapshot_id: snapshotId,
        source_url: url.canonicalUrl,
        collected_at: raw.collectedAt,
        verification_status: "claimed",
        freshness_status: "fresh",
        extraction_confidence: extracted.extractionConfidence,
        evidence_type: "extraction",
        evidence_text: extracted.evidenceText,
        evidence_reference: `adapter:${raw.adapterVersion}:${claimName}`,
      }),
    );
  }
  const property = propertySchema.parse({
    schema_version: "1.0",
    identity: {
      property_id: propertyId,
      canonical_key: duplicate.existingPropertyId
        ? `existing:${propertyId}`
        : `candidate:${token}`,
      cadastral_number: null,
      source_unit_ids: raw.externalListingId ? [raw.externalListingId] : [],
    },
    property_type: fields.propertyType,
    market_type: fields.marketType,
    location: {
      address: {
        country_code: "RU",
        region: null,
        city: fields.city || null,
        locality: null,
        district: fields.locationText || null,
        street: null,
        house_number: null,
        postal_code: null,
      },
      geo_point: null,
    },
    physical: {
      total_area_m2: fields.areaM2,
      living_area_m2: null,
      kitchen_area_m2: null,
      rooms: fields.rooms,
      bedrooms: null,
      floor: fields.floor,
      balcony: null,
      bathrooms: null,
      layout_type: null,
    },
    building: {
      name: fields.title || null,
      building_type: null,
      floors_total: null,
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
      created_at: raw.collectedAt,
      updated_at: raw.collectedAt,
      evidence_refs: evidence
        .filter((item) => item.entity_type === "property")
        .map((item) => item.evidence_id),
      tags: ["temporary_candidate", "user_url"],
    },
  });
  const offer = offerSchema.parse({
    schema_version: "1.0",
    offer_id: offerId,
    property_id: propertyId,
    seller: {
      seller_type: "unknown",
      seller_id: null,
      name: fields.sellerName || null,
    },
    source_reference: {
      source_id: sourceId,
      snapshot_id: snapshotId,
      source_url: url.canonicalUrl,
      evidence_ids: evidence
        .filter((item) => item.entity_type === "offer")
        .map((item) => item.evidence_id),
    },
    listing_price: fields.priceAmount
      ? { amount: fields.priceAmount, currency: "RUB" }
      : null,
    price_from: fields.priceAmount ? fields.priceFrom : null,
    availability: fields.availability,
    published_at: rawValue(raw, "published_at") as string | null,
    updated_at: rawValue(raw, "updated_at") as string | null,
    expires_at: null,
    mandatory_extras: [],
    commercial_terms: {
      reservation_terms: null,
      payment_terms: null,
      notes: [],
    },
    financing_offer_ids: [],
    promotion_ids: [],
    verification_status:
      manualEntry ||
      evidence.some(
        (item) =>
          item.entity_type === "offer" &&
          item.evidence_type === "user_provided",
      )
        ? "unconfirmed"
        : "claimed",
    freshness_status: "fresh",
    evidence_refs: evidence
      .filter((item) => item.entity_type === "offer")
      .map((item) => item.evidence_id),
  });
  const source: Source = sourceSchema.parse({
    schema_version: "1.0",
    source_id: sourceId,
    source_type: "user_link",
    name: fields.sourceName,
    domain: url.hostname,
    base_url: `${url.protocol}//${url.hostname}`,
    coverage: { country_codes: ["RU"], regions: [], property_types: [] },
    collection_method: "user_submission",
    trust_level: "user_provided",
    status: "active",
    policy_metadata: {
      access_status: policy.canAccess ? "approved" : "restricted",
      storage_rights: policy.canStore,
      display_rights: policy.canDisplay,
      refresh_rights: policy.canRefresh,
      reviewed_at: raw.collectedAt,
      notes: `Policy ${policy.policyVersion}; ${policy.reasonCode}`,
    },
    upstream_source_id:
      manualEntry && policy.sourceId !== sourceId ? policy.sourceId : null,
  });
  const snapshot: SourceSnapshot = sourceSnapshotSchema.parse({
    schema_version: "1.0",
    snapshot_id: snapshotId,
    source_id: sourceId,
    url: url.canonicalUrl,
    collected_at: raw.collectedAt,
    content_hash: hash64(JSON.stringify(raw)),
    status: raw.status === "partial" ? "partial" : "collected",
    structured_payload_reference: `in-memory:${raw.ingestionId}`,
    raw_reference: `adapter:${raw.adapterVersion}`,
  });
  return {
    schemaVersion: "1.0",
    normalizationVersion: USER_URL_NORMALIZATION_VERSION,
    ingestionId: raw.ingestionId,
    originalUrl: raw.originalUrl,
    canonicalUrl: url.canonicalUrl,
    propertyCandidate: property,
    offerCandidate: offer,
    source,
    snapshot,
    evidence,
    warnings: raw.warnings,
    unresolvedFields: raw.missingFields,
    financingClaims: raw.rawFields
      .filter(
        (item) => item.field === "financing_claim" && item.parsedValue !== null,
      )
      .map((item) => String(item.parsedValue)),
    matchingReadiness: readiness(fields),
    duplicateDecision: duplicate,
    sourceMode: policy.mode,
  };
};
