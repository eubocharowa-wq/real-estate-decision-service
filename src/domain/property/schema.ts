import { z } from "zod";

import {
  addressSchema,
  entityIdSchema,
  freshnessStatusSchema,
  geoPointSchema,
  isoDateSchema,
  isoDateTimeSchema,
  marketTypeSchema,
  moneySchema,
  nonEmptyStringSchema,
  propertyTypeSchema,
  schemaVersionSchema,
  sourceReferenceSchema,
  verificationStatusSchema,
} from "../common/schema";

const utilityStatusSchema = z.enum([
  "connected",
  "available",
  "planned",
  "absent",
  "unknown",
]);
const finishingTypeSchema = z.enum([
  "shell",
  "pre_finish",
  "finished",
  "renovated",
  "needs_renovation",
  "unknown",
]);

export const propertySchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    identity: z.strictObject({
      property_id: entityIdSchema,
      canonical_key: nonEmptyStringSchema.nullable(),
      cadastral_number: nonEmptyStringSchema.nullable(),
      source_unit_ids: z.array(nonEmptyStringSchema),
    }),
    property_type: propertyTypeSchema,
    market_type: marketTypeSchema,
    location: z.strictObject({
      address: addressSchema,
      geo_point: geoPointSchema.nullable(),
    }),
    physical: z.strictObject({
      total_area_m2: z.number().positive().nullable(),
      living_area_m2: z.number().positive().nullable(),
      kitchen_area_m2: z.number().positive().nullable(),
      rooms: z.number().int().nonnegative().nullable(),
      bedrooms: z.number().int().nonnegative().nullable(),
      floor: z.number().int().nullable(),
      balcony: z.boolean().nullable(),
      bathrooms: z.number().int().nonnegative().nullable(),
      layout_type: nonEmptyStringSchema.nullable(),
    }),
    building: z.strictObject({
      name: nonEmptyStringSchema.nullable(),
      building_type: nonEmptyStringSchema.nullable(),
      floors_total: z.number().int().positive().nullable(),
      built_year: z.number().int().min(1000).max(9999).nullable(),
      elevator: z.boolean().nullable(),
      freight_elevator: z.boolean().nullable(),
    }),
    condition: z.strictObject({
      finishing_type: finishingTypeSchema,
      condition_description: nonEmptyStringSchema.nullable(),
      ready_for_living: z.boolean().nullable(),
    }),
    land: z.strictObject({
      area_sotka: z.number().positive().nullable(),
      category: nonEmptyStringSchema.nullable(),
      permitted_use: nonEmptyStringSchema.nullable(),
    }),
    utilities: z.strictObject({
      electricity: utilityStatusSchema,
      water: utilityStatusSchema,
      gas: utilityStatusSchema,
      sewerage: utilityStatusSchema,
      heating: utilityStatusSchema,
      internet: utilityStatusSchema,
    }),
    timeline: z.strictObject({
      planned_commissioning_date: isoDateSchema.nullable(),
      handover_date: isoDateSchema.nullable(),
      move_in_possible_date: isoDateSchema.nullable(),
    }),
    ownership: z.strictObject({
      ownership_type: z.enum([
        "private",
        "shared",
        "developer",
        "government",
        "unknown",
      ]),
      encumbrance_status: z.enum([
        "none",
        "present",
        "claimed_none",
        "unknown",
      ]),
      ownership_notes: nonEmptyStringSchema.nullable(),
    }),
    metadata: z.strictObject({
      created_at: isoDateTimeSchema,
      updated_at: isoDateTimeSchema,
      evidence_refs: z.array(entityIdSchema),
      tags: z.array(nonEmptyStringSchema),
    }),
  })
  .meta({ title: "Property" });

export const offerAvailabilitySchema = z.enum([
  "available",
  "reserved",
  "sold",
  "temporarily_unavailable",
  "unknown",
]);

export const offerSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    offer_id: entityIdSchema,
    property_id: entityIdSchema,
    seller: z.strictObject({
      seller_type: z.enum([
        "developer",
        "owner",
        "agency",
        "bank",
        "other",
        "unknown",
      ]),
      seller_id: entityIdSchema.nullable(),
      name: nonEmptyStringSchema.nullable(),
    }),
    source_reference: sourceReferenceSchema,
    listing_price: moneySchema.nullable(),
    price_from: z.boolean().nullable(),
    availability: offerAvailabilitySchema,
    published_at: isoDateTimeSchema.nullable(),
    updated_at: isoDateTimeSchema.nullable(),
    expires_at: isoDateTimeSchema.nullable(),
    mandatory_extras: z.array(
      z.strictObject({
        name: nonEmptyStringSchema,
        cost: moneySchema,
        verification_status: verificationStatusSchema,
      }),
    ),
    commercial_terms: z.strictObject({
      reservation_terms: nonEmptyStringSchema.nullable(),
      payment_terms: nonEmptyStringSchema.nullable(),
      notes: z.array(nonEmptyStringSchema),
    }),
    financing_offer_ids: z.array(entityIdSchema),
    promotion_ids: z.array(entityIdSchema),
    verification_status: verificationStatusSchema,
    freshness_status: freshnessStatusSchema,
    evidence_refs: z.array(entityIdSchema),
  })
  .meta({ title: "Offer" });

export type Property = z.infer<typeof propertySchema>;
export type Offer = z.infer<typeof offerSchema>;
