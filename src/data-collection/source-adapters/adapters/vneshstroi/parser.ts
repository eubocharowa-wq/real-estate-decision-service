import { z } from "zod";

import {
  VNESHSTROI_PARSER_VERSION,
  type VneshstroiSupportedField,
} from "../../config";
import type { RawCollectionField } from "../../contracts";

const nullableText = z.string().trim().min(1).nullable().optional();

const unitPayloadSchema = z.strictObject({
  external_unit_id: z.string().regex(/^[0-9]+$/),
  property_type: z.literal("apartment"),
  market_type: z.literal("new_build"),
  development_name: nullableText,
  unit_number: nullableText,
  rooms: nullableText,
  floor: nullableText,
  total_area_m2: nullableText,
  listing_price: nullableText,
  price_kind: z.enum(["exact", "from"]).nullable().optional(),
  availability: nullableText,
  handover_date: nullableText,
});

type UnitPayload = z.infer<typeof unitPayloadSchema>;

export class VneshstroiSourceChangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VneshstroiSourceChangedError";
  }
}

const payloadScriptPattern =
  /<script\b[^>]*\bid=["']vneshstroi-unit-data["'][^>]*>([\s\S]*?)<\/script>/iu;
const expectedPageMarker =
  /<main\b[^>]*\bdata-vneshstroi-page=["']unit["'][^>]*>/iu;

export const parseVneshstroiUnitPayload = (html: string): UnitPayload => {
  if (!html.trim())
    throw new VneshstroiSourceChangedError("The unit page is empty.");
  if (!expectedPageMarker.test(html))
    throw new VneshstroiSourceChangedError(
      "The expected unit-page marker is missing.",
    );
  const script = payloadScriptPattern.exec(html)?.[1]?.trim();
  if (!script)
    throw new VneshstroiSourceChangedError(
      "The expected unit data payload is missing.",
    );
  try {
    return unitPayloadSchema.parse(JSON.parse(script));
  } catch (error) {
    throw new VneshstroiSourceChangedError(
      `The unit data payload no longer matches ${VNESHSTROI_PARSER_VERSION}: ${
        error instanceof Error ? error.message : "invalid payload"
      }`,
    );
  }
};

const fieldValues = (
  payload: UnitPayload,
): Readonly<Record<VneshstroiSupportedField, string | null>> => ({
  "identity.unit_id": payload.external_unit_id,
  "identity.property_type": payload.property_type,
  "identity.market_type": payload.market_type,
  "identity.development_name": payload.development_name ?? null,
  "identity.unit_number": payload.unit_number ?? null,
  "physical.rooms": payload.rooms ?? null,
  "physical.floor": payload.floor ?? null,
  "physical.total_area_m2": payload.total_area_m2 ?? null,
  listing_price: payload.listing_price ?? null,
  "timeline.handover_date": payload.handover_date ?? null,
  availability: payload.availability ?? null,
});

const fieldConfidence: Readonly<Record<VneshstroiSupportedField, number>> = {
  "identity.unit_id": 1,
  "identity.property_type": 1,
  "identity.market_type": 1,
  "identity.development_name": 0.98,
  "identity.unit_number": 0.98,
  "physical.rooms": 0.98,
  "physical.floor": 0.98,
  "physical.total_area_m2": 0.98,
  listing_price: 0.97,
  "timeline.handover_date": 0.95,
  availability: 0.9,
};

export const extractVneshstroiFields = (
  payload: UnitPayload,
  requestedFields: readonly VneshstroiSupportedField[],
): {
  readonly fields: readonly RawCollectionField[];
  readonly missingFields: readonly string[];
} => {
  const values = fieldValues(payload);
  const fields: RawCollectionField[] = [];
  const missingFields: string[] = [];
  for (const field of requestedFields) {
    const value = values[field];
    if (value === null) {
      missingFields.push(field);
      continue;
    }
    fields.push({
      field,
      raw_value: value,
      semantics:
        field === "listing_price"
          ? payload.price_kind === "from"
            ? "lower_bound"
            : "source_claim"
          : field === "availability"
            ? "source_claim"
            : "exact",
      extraction_confidence: fieldConfidence[field],
      evidence_reference: `payload:${field}`,
    });
  }
  return { fields, missingFields };
};
