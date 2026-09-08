import { z } from "zod";

import {
  addressSchema,
  entityIdSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
} from "../domain/common/schema";
import type { FieldEvidence, Offer, Property, Source } from "../domain";
import { EISJS_SOURCE_ID } from "../data-collection/source-registry/config/pilot";
import {
  REAL_PILOT_DATASET_CANDIDATE_VERSION,
  type PilotCandidate,
  type RealPilotDatasetCandidate,
  type RealPilotObservedFact,
} from "./contracts";

export const EISJS_CANDIDATE_INPUT_VERSION =
  "eisjs-candidate-input-v1" as const;

/**
 * Values a person copied from one ЕИСЖС object card.
 *
 * This is a data-entry form, not a collector: nothing here is fetched. The
 * operator reads the published project declaration and types what it says,
 * together with the date they actually checked it.
 */
export const eisjsCandidateInputSchema = z.strictObject({
  schema_version: z.literal(EISJS_CANDIDATE_INPUT_VERSION),
  /** Stable slug for this object inside our pilot dataset. */
  candidate_id: entityIdSchema,
  /** The exact card the operator read. */
  source_url: z.url().refine((value) => value.startsWith("https://"), {
    message: "The card URL must be https",
  }),
  /** When the operator actually checked the card, not when the file is built. */
  collected_at: isoDateTimeSchema,
  /** How the object is identified on the card. */
  external_object_id: nonEmptyStringSchema,
  developer_name: nonEmptyStringSchema,
  property_type: z.enum(["apartment", "apartments"]),
  address: addressSchema,
  cadastral_number: nonEmptyStringSchema.nullable(),
  total_area_m2: z.number().positive(),
  floors_total: z.number().int().positive(),
  rooms: z.number().int().nonnegative().nullable(),
  floor: z.number().int().nullable(),
  building_name: nonEmptyStringSchema.nullable(),
  /**
   * Declarations commit to a quarter, never to a calendar day. It is recorded
   * as its own representation; `timeline.handover_date` stays unknown rather
   * than being invented from the quarter.
   */
  handover_quarter: z
    .strictObject({
      year: z.number().int().min(2000).max(2100),
      quarter: z.number().int().min(1).max(4),
      /** The wording on the card, kept as the raw value. */
      as_published: nonEmptyStringSchema,
    })
    .nullable(),
});

export type EisjsCandidateInput = z.infer<typeof eisjsCandidateInputSchema>;

export const EISJS_HANDOVER_QUARTER_FIELD = "timeline.handover_quarter";

/**
 * What a project declaration does not contain.
 *
 * A declaration describes the object, not the transaction: there is no unit
 * price, no availability, no financing, and no travel times. Listing them
 * explicitly is what keeps them unknown rather than silently absent.
 */
export const EISJS_EXPLICIT_UNKNOWN_FIELDS: readonly string[] = Object.freeze([
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
  "property.timeline.handover_date",
  "property.timeline.move_in_possible_date",
  "property.condition.finishing_type",
  "property.physical.balcony",
  "property.physical.living_area_m2",
  "property.physical.kitchen_area_m2",
  "property.physical.bathrooms",
  "property.physical.layout_type",
  "property.building.elevator",
  "property.building.freight_elevator",
  "property.location.geo_point",
  "property.utilities",
  "financing.eligibility_status",
  "financing.initial_payment",
  "financing.monthly_payment",
  "mobility.user_destination",
  "infrastructure.school",
  "infrastructure.kindergarten",
  "infrastructure.transport",
]);

/**
 * What a declaration states as fact, and what it states as intention.
 *
 * A project declaration is filed under 214-ФЗ, so what it says about the
 * object as it stands — where it is, how big it is, how many floors, its
 * cadastral number — is a filed fact. A commissioning quarter is a promise
 * about the future, and a promise is `claimed` however official the filing.
 */
const CONFIRMED_FIELDS: ReadonlySet<string> = new Set([
  "location.address.country_code",
  "location.address.region",
  "location.address.city",
  "location.address.locality",
  "location.address.district",
  "location.address.street",
  "location.address.house_number",
  "location.address.postal_code",
  "identity.cadastral_number",
  "physical.total_area_m2",
  "building.floors_total",
]);

const verificationFor = (
  field: string,
): FieldEvidence["verification_status"] =>
  CONFIRMED_FIELDS.has(field) ? "confirmed" : "claimed";

export const eisjsSource = (input: {
  readonly reviewedAt: string;
}): Source => ({
  schema_version: "1.0",
  source_id: EISJS_SOURCE_ID,
  source_type: "government",
  name: "ЕИСЖС (наш.дом.рф)",
  domain: "наш.дом.рф",
  base_url: "https://наш.дом.рф",
  coverage: {
    country_codes: ["RU"],
    regions: [],
    property_types: ["apartment", "apartments"],
  },
  collection_method: "manual",
  trust_level: "authoritative",
  status: "active",
  policy_metadata: {
    access_status: "approved",
    // Project declarations are published because 214-ФЗ requires it, so the
    // facts they state may be stored and shown with attribution. Automatic
    // collection is a separate question and stays denied.
    storage_rights: true,
    display_rights: true,
    refresh_rights: false,
    reviewed_at: input.reviewedAt,
    notes:
      "214-ФЗ project declaration data, entered by hand from a published object card.",
  },
  upstream_source_id: null,
});

interface EnteredFact {
  readonly field: string;
  readonly value: unknown;
  readonly rawValue: unknown;
  readonly entity: "property" | "offer";
}

const enteredFacts = (input: EisjsCandidateInput): readonly EnteredFact[] => {
  const facts: EnteredFact[] = [];
  for (const [component, value] of Object.entries(input.address)) {
    if (value === null) continue;
    facts.push({
      field: `location.address.${component}`,
      value,
      rawValue: value,
      entity: "property",
    });
  }
  if (input.cadastral_number !== null)
    facts.push({
      field: "identity.cadastral_number",
      value: input.cadastral_number,
      rawValue: input.cadastral_number,
      entity: "property",
    });
  facts.push({
    field: "physical.total_area_m2",
    value: input.total_area_m2,
    rawValue: input.total_area_m2,
    entity: "property",
  });
  facts.push({
    field: "building.floors_total",
    value: input.floors_total,
    rawValue: input.floors_total,
    entity: "property",
  });
  if (input.rooms !== null)
    facts.push({
      field: "physical.rooms",
      value: input.rooms,
      rawValue: input.rooms,
      entity: "property",
    });
  if (input.floor !== null)
    facts.push({
      field: "physical.floor",
      value: input.floor,
      rawValue: input.floor,
      entity: "property",
    });
  if (input.building_name !== null)
    facts.push({
      field: "building.name",
      value: input.building_name,
      rawValue: input.building_name,
      entity: "property",
    });
  if (input.handover_quarter !== null)
    facts.push({
      field: EISJS_HANDOVER_QUARTER_FIELD,
      // Sortable and unambiguous; the card's own wording is the raw value.
      value: `${input.handover_quarter.year}-Q${input.handover_quarter.quarter}`,
      rawValue: input.handover_quarter.as_published,
      entity: "property",
    });
  return facts;
};

export interface BuiltEisjsCandidate {
  readonly candidate: RealPilotDatasetCandidate;
  readonly confirmedFieldCount: number;
  readonly claimedFieldCount: number;
}

export const buildEisjsCandidate = (rawInput: unknown): BuiltEisjsCandidate => {
  const input = eisjsCandidateInputSchema.parse(rawInput);
  const propertyId = `property_eisjs_${input.candidate_id}`;
  const offerId = `offer_eisjs_${input.candidate_id}`;
  const source = eisjsSource({ reviewedAt: input.collected_at });
  const facts = enteredFacts(input);

  const evidence: FieldEvidence[] = facts.map((fact) => ({
    schema_version: "1.0",
    evidence_id: `evidence_eisjs_${input.candidate_id}_${fact.field.replaceAll(".", "_")}`,
    entity_type: fact.entity,
    entity_id: fact.entity === "offer" ? offerId : propertyId,
    field: fact.field,
    value: fact.value as FieldEvidence["value"],
    raw_value: fact.rawValue as FieldEvidence["raw_value"],
    source_id: source.source_id,
    snapshot_id: null,
    source_url: input.source_url,
    collected_at: input.collected_at,
    verification_status: verificationFor(fact.field),
    freshness_status: "fresh",
    extraction_confidence: null,
    // The decision that sets the pilot's confidence floor: a filed
    // declaration is a document, not a page we scraped.
    evidence_type: "document",
    evidence_text: null,
    evidence_reference: `ЕИСЖС project declaration, card ${input.external_object_id}, checked ${input.collected_at.slice(0, 10)}`,
  }));

  const propertyEvidenceRefs = evidence
    .filter((item) => item.entity_type === "property")
    .map((item) => item.evidence_id);
  const offerEvidenceRefs = evidence
    .filter((item) => item.entity_type === "offer")
    .map((item) => item.evidence_id);

  const property: Property = {
    schema_version: "1.0",
    identity: {
      property_id: propertyId,
      canonical_key: `eisjs:${input.external_object_id}`,
      cadastral_number: input.cadastral_number,
      source_unit_ids: [`${EISJS_SOURCE_ID}:${input.external_object_id}`],
    },
    property_type: input.property_type,
    market_type: "new_build",
    location: { address: input.address, geo_point: null },
    physical: {
      total_area_m2: input.total_area_m2,
      living_area_m2: null,
      kitchen_area_m2: null,
      rooms: input.rooms,
      bedrooms: null,
      floor: input.floor,
      balcony: null,
      bathrooms: null,
      layout_type: null,
    },
    building: {
      name: input.building_name,
      building_type: null,
      floors_total: input.floors_total,
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
      // Deliberately unknown: the declaration commits to a quarter, and a
      // quarter is not a date. The quarter is carried as its own evidence.
      handover_date: null,
      move_in_possible_date: null,
    },
    ownership: {
      ownership_type: "developer",
      encumbrance_status: "unknown",
      ownership_notes: null,
    },
    metadata: {
      created_at: input.collected_at,
      updated_at: input.collected_at,
      evidence_refs: propertyEvidenceRefs,
      tags: ["manual_curated", "eisjs", "declaration_214fz"],
    },
  };

  const offer: Offer = {
    schema_version: "1.0",
    offer_id: offerId,
    property_id: propertyId,
    seller: {
      seller_type: "developer",
      seller_id: null,
      name: input.developer_name,
    },
    source_reference: {
      source_id: source.source_id,
      snapshot_id: null,
      source_url: input.source_url,
      evidence_ids: offerEvidenceRefs,
    },
    // A declaration states no commercial terms at all.
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
    evidence_refs: offerEvidenceRefs,
  };

  const pilotCandidate: PilotCandidate = {
    schema_version: "pilot-candidate-v1",
    origin: "manual_curated",
    property,
    offer,
    source,
    sources: [source],
    evidence,
    financing_claims: [],
    observed_at: input.collected_at,
    environment: "pilot",
  };

  const observedFacts: RealPilotObservedFact[] = evidence.map((item) => ({
    field: item.field,
    value: item.value,
    verification_status: item.verification_status,
    evidence_refs: [item.evidence_id],
  }));

  return {
    candidate: {
      schema_version: REAL_PILOT_DATASET_CANDIDATE_VERSION,
      candidate_id: `candidate_eisjs_${input.candidate_id}`,
      origin: "manual_curated",
      source_url: input.source_url,
      observed_facts: observedFacts,
      explicit_unknown_fields: [...EISJS_EXPLICIT_UNKNOWN_FIELDS],
      evidence_refs: evidence.map((item) => item.evidence_id),
      observed_at: input.collected_at,
      freshness_status: "fresh",
      collection_mode: "manual_curated",
      automated_fetch_performed: false,
      candidate: pilotCandidate,
    },
    confirmedFieldCount: evidence.filter(
      (item) => item.verification_status === "confirmed",
    ).length,
    claimedFieldCount: evidence.filter(
      (item) => item.verification_status === "claimed",
    ).length,
  };
};
