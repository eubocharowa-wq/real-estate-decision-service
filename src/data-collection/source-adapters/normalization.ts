import type { FieldEvidence, Offer, Property } from "../../domain";
import { fieldEvidenceSchema, offerSchema, propertySchema } from "../../domain";
import type { CollectionPlan } from "../source-registry";
import { VNESHSTROI_ADAPTER_VERSION, VNESHSTROI_SOURCE_ID } from "./config";
import type {
  MatchingReadiness,
  RawCollectionField,
  RawCollectionResult,
  TransientNormalizedCandidate,
} from "./contracts";
import {
  parseArea,
  parseAvailability,
  parseFloor,
  parseIsoDate,
  parsePrice,
  parseRooms,
} from "./value-parsers";

export { VNESHSTROI_NORMALIZATION_VERSION } from "./config";

const stableToken = (value: string): string => {
  let hash = 2_166_136_261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const rawField = (
  raw: RawCollectionResult,
  field: string,
): RawCollectionField | undefined =>
  raw.extracted_fields.find((item) => item.field === field);

const rawText = (raw: RawCollectionResult, field: string): string | null => {
  const value = rawField(raw, field)?.raw_value;
  return typeof value === "string" ? value : null;
};

const normalizedEvidenceValue = (
  field: string,
  raw: RawCollectionField,
): unknown => {
  switch (field) {
    case "physical.rooms":
      return parseRooms(raw.raw_value);
    case "physical.floor":
      return parseFloor(raw.raw_value);
    case "physical.total_area_m2":
      return parseArea(raw.raw_value);
    case "listing_price": {
      const price = parsePrice(raw.raw_value, raw.semantics);
      return { amount: price.amount, currency: "RUB" };
    }
    case "timeline.handover_date":
      return parseIsoDate(field, raw.raw_value);
    case "availability":
      return parseAvailability(raw.raw_value);
    default:
      return raw.raw_value;
  }
};

const offerField = (field: string): boolean =>
  field === "listing_price" || field === "availability";

const makeEvidence = ({
  raw,
  plan,
  field,
  propertyId,
  offerId,
  index,
}: {
  readonly raw: RawCollectionResult;
  readonly plan: CollectionPlan;
  readonly field: string;
  readonly propertyId: string;
  readonly offerId: string;
  readonly index: number;
}): FieldEvidence => {
  const extracted = rawField(raw, field);
  const entityType = offerField(field) ? "offer" : "property";
  const entityId = entityType === "offer" ? offerId : propertyId;
  const evidenceReference = extracted?.evidence_reference ?? `missing:${field}`;
  return fieldEvidenceSchema.parse({
    schema_version: "1.0",
    evidence_id: `evidence_${stableToken(
      `${raw.collection_run_id}:${field}:${index}`,
    )}`,
    entity_type: entityType,
    entity_id: entityId,
    field,
    value: extracted ? normalizedEvidenceValue(field, extracted) : null,
    raw_value: extracted?.raw_value ?? null,
    source_id: VNESHSTROI_SOURCE_ID,
    snapshot_id: null,
    source_url: raw.canonical_url,
    collected_at: raw.collected_at,
    verification_status: extracted ? "claimed" : "unknown",
    freshness_status: extracted ? "fresh" : "unknown",
    extraction_confidence: extracted?.extraction_confidence ?? null,
    evidence_type: "extraction",
    evidence_text: null,
    evidence_reference: `${VNESHSTROI_ADAPTER_VERSION}:${evidenceReference};policy=${plan.policyVersion}`,
  });
};

const matchingReadiness = ({
  raw,
  priceFrom,
  availability,
}: {
  readonly raw: RawCollectionResult;
  readonly priceFrom: boolean | null;
  readonly availability: Offer["availability"];
}): MatchingReadiness => {
  const missing = new Set(raw.missing_fields);
  if (
    availability === "unknown" &&
    raw.extracted_fields.some((item) => item.field === "availability")
  )
    missing.add("availability");
  const warnings = [...raw.warnings];
  if (priceFrom)
    warnings.push("Listing price is a lower bound, not an exact unit price.");
  if (availability === "unknown")
    warnings.push(
      "Availability remains unknown until supported by explicit evidence.",
    );
  const identityReady = Boolean(raw.external_record_id);
  const status = !identityReady
    ? "not_ready"
    : missing.size > 0 || warnings.length > 0
      ? "ready_with_unknowns"
      : "ready";
  return {
    ready: identityReady,
    status,
    missingCriticalFields: [...missing].sort(),
    warnings: [...new Set(warnings)],
  };
};

export const normalizeVneshstroiResult = (
  raw: RawCollectionResult,
  plan: CollectionPlan,
): TransientNormalizedCandidate => {
  const unitId = raw.external_record_id;
  if (!unitId) throw new Error("Cannot normalize without an external unit ID.");
  const propertyId = `candidate_property_${VNESHSTROI_SOURCE_ID}_${unitId}`;
  const offerId = `candidate_offer_${VNESHSTROI_SOURCE_ID}_${unitId}`;
  const sourceUnitId = `${VNESHSTROI_SOURCE_ID}:${unitId}`;
  const priceField = rawField(raw, "listing_price");
  const parsedPrice = priceField
    ? parsePrice(priceField.raw_value, priceField.semantics)
    : null;
  const availabilityField = rawField(raw, "availability");
  const availability = availabilityField
    ? parseAvailability(availabilityField.raw_value)
    : "unknown";
  const handoverField = rawField(raw, "timeline.handover_date");
  const evidence = plan.validatedRequestedFields.map((field, index) =>
    makeEvidence({ raw, plan, field, propertyId, offerId, index }),
  );
  const propertyEvidence = evidence
    .filter((item) => item.entity_type === "property")
    .map((item) => item.evidence_id);
  const offerEvidence = evidence
    .filter((item) => item.entity_type === "offer")
    .map((item) => item.evidence_id);

  const property: Property = propertySchema.parse({
    schema_version: "1.0",
    identity: {
      property_id: propertyId,
      canonical_key: `source-unit:${sourceUnitId}`,
      cadastral_number: null,
      source_unit_ids: [sourceUnitId],
    },
    property_type: rawText(raw, "identity.property_type"),
    market_type: rawText(raw, "identity.market_type"),
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
      total_area_m2: rawField(raw, "physical.total_area_m2")
        ? parseArea(rawField(raw, "physical.total_area_m2")!.raw_value)
        : null,
      living_area_m2: null,
      kitchen_area_m2: null,
      rooms: rawField(raw, "physical.rooms")
        ? parseRooms(rawField(raw, "physical.rooms")!.raw_value)
        : null,
      bedrooms: null,
      floor: rawField(raw, "physical.floor")
        ? parseFloor(rawField(raw, "physical.floor")!.raw_value)
        : null,
      balcony: null,
      bathrooms: null,
      layout_type: null,
    },
    building: {
      name: rawText(raw, "identity.development_name"),
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
      handover_date: handoverField
        ? parseIsoDate(handoverField.field, handoverField.raw_value)
        : null,
      move_in_possible_date: null,
    },
    ownership: {
      ownership_type: "unknown",
      encumbrance_status: "unknown",
      ownership_notes: null,
    },
    metadata: {
      created_at: raw.collected_at,
      updated_at: raw.collected_at,
      evidence_refs: propertyEvidence,
      tags: ["transient_candidate", VNESHSTROI_SOURCE_ID],
    },
  });

  const offer: Offer = offerSchema.parse({
    schema_version: "1.0",
    offer_id: offerId,
    property_id: propertyId,
    seller: {
      seller_type: "developer",
      seller_id: VNESHSTROI_SOURCE_ID,
      name: "ВНЕШСТРОЙ",
    },
    source_reference: {
      source_id: VNESHSTROI_SOURCE_ID,
      snapshot_id: null,
      source_url: raw.canonical_url,
      evidence_ids: offerEvidence,
    },
    listing_price: parsedPrice
      ? { amount: parsedPrice.amount, currency: "RUB" }
      : null,
    price_from: parsedPrice ? parsedPrice.priceFrom : null,
    availability,
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
    verification_status: evidence.some(
      (item) =>
        item.entity_type === "offer" && item.verification_status === "claimed",
    )
      ? "claimed"
      : "unknown",
    freshness_status: "fresh",
    evidence_refs: offerEvidence,
  });

  const readiness = matchingReadiness({
    raw,
    priceFrom: offer.price_from,
    availability: offer.availability,
  });
  return {
    property,
    offer,
    evidence,
    unresolvedFields: readiness.missingCriticalFields,
    warnings: readiness.warnings,
    matchingReadiness: readiness,
  };
};
