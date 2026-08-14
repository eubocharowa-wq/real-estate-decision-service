import { z } from "zod";

export const SCHEMA_VERSION = "1.0" as const;

export const schemaVersionSchema = z.literal(SCHEMA_VERSION);
export const nonEmptyStringSchema = z.string().trim().min(1);
export const entityIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9:_-]*$/,
    "Expected a stable lowercase entity identifier",
  );
export const isoDateSchema = z.iso.date();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const urlSchema = z.url();
export const scoreSchema = z.number().min(0).max(100);
export const ratioSchema = z.number().min(0).max(1);
export const decimalStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Expected a non-negative decimal string");
export const percentageStringSchema = decimalStringSchema.meta({
  description:
    "A percentage encoded as a decimal string; business limits live outside schemas.",
});
export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "Expected an ISO 4217-style three-letter currency code");

export const moneySchema = z
  .strictObject({
    amount: decimalStringSchema.meta({
      description:
        "A base-unit monetary amount encoded as a decimal string to avoid binary floating-point loss.",
    }),
    currency: currencyCodeSchema,
  })
  .meta({ title: "Money" });

export const nullableMoneySchema = moneySchema.nullable();

export const dateRangeSchema = z
  .strictObject({
    from: isoDateSchema.nullable(),
    to: isoDateSchema.nullable(),
  })
  .meta({ title: "DateRange" });

export const geoPointSchema = z
  .strictObject({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .meta({ title: "GeoPoint" });

export const addressSchema = z
  .strictObject({
    country_code: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    region: nonEmptyStringSchema.nullable(),
    city: nonEmptyStringSchema.nullable(),
    locality: nonEmptyStringSchema.nullable(),
    district: nonEmptyStringSchema.nullable(),
    street: nonEmptyStringSchema.nullable(),
    house_number: nonEmptyStringSchema.nullable(),
    postal_code: nonEmptyStringSchema.nullable(),
  })
  .meta({ title: "Address" });

export const propertyTypeSchema = z.enum([
  "apartment",
  "apartments",
  "house",
  "townhouse",
  "land",
]);

export const marketTypeSchema = z.enum([
  "new_build",
  "secondary",
  "suburban",
  "unknown",
]);

export const verificationStatusSchema = z.enum([
  "confirmed",
  "claimed",
  "unconfirmed",
  "conflicting",
  "stale",
  "unknown",
]);

export const freshnessStatusSchema = z.enum([
  "fresh",
  "aging",
  "stale",
  "expired",
  "unknown",
]);

export const prioritySchema = z.enum([
  "must",
  "preferred",
  "neutral",
  "avoid",
  "exclude",
  "unknown",
]);

export const sourceTrustSchema = z.enum([
  "authoritative",
  "primary",
  "secondary",
  "user_provided",
  "unknown",
]);

export const entityReferenceSchema = z
  .strictObject({
    entity_type: nonEmptyStringSchema,
    entity_id: entityIdSchema,
  })
  .meta({ title: "EntityReference" });

export const sourceReferenceSchema = z
  .strictObject({
    source_id: entityIdSchema,
    snapshot_id: entityIdSchema.nullable(),
    source_url: urlSchema.nullable(),
    evidence_ids: z.array(entityIdSchema),
  })
  .meta({ title: "SourceReference" });

export const verificationInfoSchema = z
  .strictObject({
    verification_status: verificationStatusSchema,
    freshness_status: freshnessStatusSchema,
    checked_at: isoDateTimeSchema.nullable(),
    evidence_refs: z.array(entityIdSchema),
  })
  .meta({ title: "VerificationInfo" });

export const fieldValueWithEvidenceSchema = z
  .strictObject({
    value: z.json(),
    verification_status: verificationStatusSchema,
    freshness_status: freshnessStatusSchema,
    evidence_refs: z.array(entityIdSchema),
  })
  .meta({ title: "FieldValueWithEvidence" });

export type Money = z.infer<typeof moneySchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
export type GeoPoint = z.infer<typeof geoPointSchema>;
export type Address = z.infer<typeof addressSchema>;
export type EntityReference = z.infer<typeof entityReferenceSchema>;
export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export type VerificationInfo = z.infer<typeof verificationInfoSchema>;
export type FieldValueWithEvidence = z.infer<
  typeof fieldValueWithEvidenceSchema
>;
