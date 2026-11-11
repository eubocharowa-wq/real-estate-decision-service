import type { FieldEvidence, Offer, Property } from "../../../../domain";
import {
  fieldEvidenceSchema,
  offerSchema,
  propertySchema,
} from "../../../../domain";
import {
  CIAN_ADAPTER_VERSION,
  CIAN_EXTRACTION_CONFIDENCE,
  CIAN_NORMALIZATION_VERSION,
  CIAN_PARSER_VERSION,
  type CianSupportedField,
} from "../../config";
import { parseCianOfferCard, type CianCardFacts } from "./parser";
import { CIAN_PROFILE } from "./profile";

const OFFER_FIELDS: ReadonlySet<CianSupportedField> = new Set([
  "identity.listing_id",
  "listing_price",
]);

const stableToken = (value: string): string => {
  let hash = 2_166_136_261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

/**
 * A saved card turned into a staging candidate: a Property and an Offer kept
 * apart, every value a seller claim. It is never a canonical record — dedup
 * and the canonical update are later stages this adapter does not perform.
 */
export interface CianStagingCandidate {
  readonly schemaVersion: "1.0";
  readonly stage: "staging";
  readonly persistence: "transient_only";
  readonly sourceId: string;
  readonly adapterVersion: string;
  readonly parserVersion: string;
  readonly normalizationVersion: string;
  readonly externalRecordId: string;
  readonly canonicalUrl: string;
  readonly collectedAt: string;
  readonly attribution: {
    readonly label: string;
    readonly sourceUrl: string;
  };
  readonly facts: CianCardFacts;
  readonly propertyCandidate: Property;
  readonly offerCandidate: Offer;
  readonly evidence: readonly FieldEvidence[];
  /** Fields this kind of card should state and this one does not. */
  readonly unresolvedFields: readonly string[];
  readonly warnings: readonly string[];
}

export const buildCianStagingCandidate = ({
  html,
  sourceUrl,
  collectedAt,
}: {
  readonly html: string;
  /** The canonical URL the card was saved from. */
  readonly sourceUrl: string;
  /** When the card was actually saved, not when it is parsed. */
  readonly collectedAt: string;
}): CianStagingCandidate => {
  const { facts, observations, warnings } = parseCianOfferCard({
    html,
    sourceUrl,
  });
  const sourceId = CIAN_PROFILE.sourceId;
  const propertyId = `candidate_property_${sourceId}_${facts.listingId}`;
  const offerId = `candidate_offer_${sourceId}_${facts.listingId}`;
  const snapshotToken = stableToken(collectedAt);

  const evidence = observations.map((observation, index) =>
    fieldEvidenceSchema.parse({
      schema_version: "1.0",
      evidence_id: `candidate_evidence_${sourceId}_${facts.listingId}_${snapshotToken}_${index + 1}`,
      entity_type: OFFER_FIELDS.has(observation.field) ? "offer" : "property",
      entity_id: OFFER_FIELDS.has(observation.field) ? offerId : propertyId,
      field: observation.field,
      value: observation.value,
      raw_value: observation.rawValue,
      source_id: sourceId,
      snapshot_id: null,
      source_url: facts.canonicalUrl,
      collected_at: collectedAt,
      verification_status: observation.value === null ? "unknown" : "claimed",
      // A saved card says nothing about how current it still is.
      freshness_status: "unknown",
      extraction_confidence:
        observation.value === null ? null : CIAN_EXTRACTION_CONFIDENCE,
      evidence_type: "extraction",
      evidence_text: null,
      evidence_reference: `${CIAN_ADAPTER_VERSION}:${observation.statePath}`,
    }),
  );
  const evidenceIds = (entityType: "property" | "offer"): string[] =>
    evidence
      .filter((item) => item.entity_type === entityType)
      .map((item) => item.evidence_id);

  const propertyCandidate = propertySchema.parse({
    schema_version: "1.0",
    identity: {
      property_id: propertyId,
      // A listing ID names the offer; which physical object it is stays open
      // until dedup.
      canonical_key: null,
      cadastral_number: null,
      source_unit_ids: [`${sourceId}:${facts.listingId}`],
    },
    property_type: facts.propertyType,
    market_type: facts.marketType,
    location: {
      address: {
        country_code: null,
        region: facts.address.region,
        city: facts.address.city,
        locality: null,
        district: null,
        street: facts.address.street,
        house_number: facts.address.houseNumber,
        postal_code: null,
      },
      geo_point: facts.geoPoint,
    },
    physical: {
      total_area_m2: facts.totalAreaM2,
      living_area_m2: null,
      kitchen_area_m2: null,
      rooms: facts.rooms,
      bedrooms: null,
      floor: facts.floor,
      balcony: null,
      bathrooms: null,
      layout_type: null,
    },
    building: {
      name: facts.developmentName,
      building_type: null,
      floors_total: facts.floorsTotal,
      built_year: facts.builtYear,
      elevator: null,
      freight_elevator: null,
    },
    condition: {
      finishing_type: "unknown",
      condition_description: null,
      ready_for_living: null,
    },
    land: {
      area_sotka: facts.landAreaSotka,
      category: null,
      permitted_use: null,
    },
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
      created_at: collectedAt,
      updated_at: collectedAt,
      evidence_refs: evidenceIds("property"),
      tags: ["staging_candidate", sourceId],
    },
  });

  const offerCandidate = offerSchema.parse({
    schema_version: "1.0",
    offer_id: offerId,
    property_id: propertyId,
    seller: CIAN_PROFILE.seller,
    source_reference: {
      source_id: sourceId,
      snapshot_id: null,
      source_url: facts.canonicalUrl,
      evidence_ids: evidenceIds("offer"),
    },
    listing_price:
      facts.priceRub === null
        ? null
        : { amount: facts.priceRub, currency: "RUB" },
    price_from: facts.priceRub === null ? null : false,
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
    verification_status: facts.priceRub === null ? "unknown" : "claimed",
    freshness_status: "unknown",
    evidence_refs: evidenceIds("offer"),
  });

  return {
    schemaVersion: "1.0",
    stage: "staging",
    persistence: "transient_only",
    sourceId,
    adapterVersion: CIAN_ADAPTER_VERSION,
    parserVersion: CIAN_PARSER_VERSION,
    normalizationVersion: CIAN_NORMALIZATION_VERSION,
    externalRecordId: facts.listingId,
    canonicalUrl: facts.canonicalUrl,
    collectedAt,
    attribution: {
      label: CIAN_PROFILE.attributionLabel,
      sourceUrl: facts.canonicalUrl,
    },
    facts,
    propertyCandidate,
    offerCandidate,
    evidence,
    unresolvedFields: observations
      .filter((observation) => observation.value === null)
      .map((observation) => observation.field),
    warnings,
  };
};
