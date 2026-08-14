import { z } from "zod";

import {
  addressSchema,
  dateRangeSchema,
  entityIdSchema,
  isoDateSchema,
  marketTypeSchema,
  moneySchema,
  nonEmptyStringSchema,
  propertyTypeSchema,
  ratioSchema,
  schemaVersionSchema,
  urlSchema,
} from "../common/schema";
import { criterionSchema } from "../matching/schema";

export const userRequestIntentSchema = z.enum([
  "find",
  "compare",
  "affordability",
  "location_discovery",
  "check",
  "decision_help",
  "mixed",
]);

const locationPreferenceSchema = z.strictObject({
  country_codes: z.array(z.string().regex(/^[A-Z]{2}$/)),
  regions: z.array(nonEmptyStringSchema),
  cities: z.array(nonEmptyStringSchema),
  preferred_districts: z.array(nonEmptyStringSchema),
  excluded_districts: z.array(nonEmptyStringSchema),
  destination_addresses: z.array(addressSchema),
});

const budgetRangeSchema = z.strictObject({
  minimum: moneySchema.nullable(),
  maximum: moneySchema.nullable(),
});

export const userRequestSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    user_request_id: entityIdSchema,
    intent: userRequestIntentSchema,
    goal: z.strictObject({
      purpose: z.enum([
        "own_residence",
        "relocation",
        "investment",
        "other",
        "unknown",
      ]),
      description: nonEmptyStringSchema.nullable(),
    }),
    location: locationPreferenceSchema,
    property: z.strictObject({
      allowed_property_types: z.array(propertyTypeSchema),
      allowed_market_types: z.array(marketTypeSchema),
      rooms_min: z.number().int().nonnegative().nullable(),
      rooms_max: z.number().int().nonnegative().nullable(),
    }),
    budget: z.strictObject({
      purchase_price: budgetRangeSchema,
      total_budget: moneySchema.nullable(),
      renovation_budget: moneySchema.nullable(),
    }),
    financing: z.strictObject({
      purchase_methods: z.array(
        z.enum(["cash", "mortgage", "installment", "mixed", "unknown"]),
      ),
      required_program_types: z.array(nonEmptyStringSchema),
      initial_payment_max: moneySchema.nullable(),
      monthly_payment_max: moneySchema.nullable(),
      financing_period: dateRangeSchema,
    }),
    timeline: z.strictObject({
      purchase_by: isoDateSchema.nullable(),
      move_in_by: isoDateSchema.nullable(),
      ready_now_required: z.boolean().nullable(),
    }),
    household: z.strictObject({
      adults_count: z.number().int().nonnegative().nullable(),
      children_count: z.number().int().nonnegative().nullable(),
      pets_count: z.number().int().nonnegative().nullable(),
      notes: nonEmptyStringSchema.nullable(),
    }),
    lifestyle: z.strictObject({
      commute_modes: z.array(
        z.enum(["walk", "public_transport", "car", "bicycle", "other"]),
      ),
      notes: z.array(nonEmptyStringSchema),
    }),
    infrastructure: z.array(criterionSchema),
    property_features: z.array(criterionSchema),
    must_have: z.array(criterionSchema),
    nice_to_have: z.array(criterionSchema),
    avoid: z.array(criterionSchema),
    unknowns: z.array(
      z.strictObject({
        field: nonEmptyStringSchema,
        reason: nonEmptyStringSchema,
        critical: z.boolean(),
      }),
    ),
    source_links: z.array(urlSchema),
    clarifications: z.array(
      z.strictObject({
        clarification_id: entityIdSchema,
        question: nonEmptyStringSchema,
        status: z.enum(["open", "answered", "dismissed"]),
        answer: nonEmptyStringSchema.nullable(),
      }),
    ),
    confidence: z.strictObject({
      extraction_confidence: ratioSchema,
      status: z.enum(["high", "medium", "low"]),
    }),
    result_limit: z.number().int().min(5).max(10),
  })
  .meta({ title: "UserRequest" });

export type UserRequest = z.infer<typeof userRequestSchema>;
