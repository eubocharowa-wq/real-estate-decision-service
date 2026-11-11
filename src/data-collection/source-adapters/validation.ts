import type { CollectionTask, RawCollectionResult } from "./contracts";
import { rawCollectionResultSchema } from "./contracts";
import {
  parseArea,
  parseAvailability,
  parseFloor,
  parseIsoDate,
  parsePrice,
  parseRooms,
  SourceValueError,
} from "./value-parsers";
import {
  marketTypeSchema,
  propertyTypeSchema,
} from "../../domain/common/schema";

export type RawResultValidation =
  | { readonly success: true; readonly value: RawCollectionResult }
  | {
      readonly success: false;
      readonly message: string;
    };

const validateFieldValue = (
  field: RawCollectionResult["extracted_fields"][number],
): void => {
  switch (field.field) {
    case "identity.unit_id":
    case "identity.listing_id":
      if (
        typeof field.raw_value !== "string" ||
        !/^[0-9]+$/u.test(field.raw_value)
      )
        throw new SourceValueError(field.field, "invalid numeric unit ID");
      break;
    case "identity.property_type":
      if (!propertyTypeSchema.safeParse(field.raw_value).success)
        throw new SourceValueError(field.field, "unexpected property type");
      break;
    case "identity.market_type":
      if (!marketTypeSchema.safeParse(field.raw_value).success)
        throw new SourceValueError(field.field, "unexpected market type");
      break;
    case "physical.rooms":
      parseRooms(field.raw_value);
      break;
    case "physical.floor":
      parseFloor(field.raw_value);
      break;
    case "physical.total_area_m2":
      parseArea(field.raw_value);
      break;
    case "listing_price":
      parsePrice(field.raw_value, field.semantics);
      break;
    case "timeline.handover_date":
      parseIsoDate(field.field, field.raw_value);
      break;
    case "availability":
      parseAvailability(field.raw_value);
      break;
    case "building.floors_total":
    case "building.built_year":
    case "land.area_sotka":
      if (typeof field.raw_value !== "number" || field.raw_value <= 0)
        throw new SourceValueError(field.field, "invalid positive number");
      break;
    case "location.geo_point": {
      const point = field.raw_value;
      if (
        typeof point !== "object" ||
        point === null ||
        !("latitude" in point) ||
        !("longitude" in point) ||
        typeof point.latitude !== "number" ||
        typeof point.longitude !== "number"
      )
        throw new SourceValueError(field.field, "invalid geo point");
      break;
    }
    default:
      if (typeof field.raw_value !== "string" || !field.raw_value.trim())
        throw new SourceValueError(field.field, "invalid textual field");
  }
};

export const validateRawCollectionResult = (
  value: unknown,
  task: CollectionTask,
): RawResultValidation => {
  const parsed = rawCollectionResultSchema.safeParse(value);
  if (!parsed.success) return { success: false, message: parsed.error.message };
  const raw = parsed.data;
  if (raw.status !== "success" && raw.status !== "partial")
    return { success: true, value: raw };
  if (raw.source_id !== task.source_id || raw.task_id !== task.task_id)
    return { success: false, message: "Raw result identity mismatch." };
  const identityField = task.requested_fields.includes("identity.unit_id")
    ? "identity.unit_id"
    : task.requested_fields.includes("identity.listing_id")
      ? "identity.listing_id"
      : null;
  const requiredIdentityFields = [
    "identity.property_type",
    "identity.market_type",
  ];
  if (
    identityField === null ||
    requiredIdentityFields.some(
      (field) => !task.requested_fields.includes(field),
    )
  )
    return {
      success: false,
      message:
        "A source record ID, property type, and market type are required for stable normalization.",
    };
  const fields = raw.extracted_fields.map((field) => field.field);
  if (new Set(fields).size !== fields.length)
    return { success: false, message: "Duplicate extracted field." };
  if (fields.some((field) => !task.requested_fields.includes(field)))
    return {
      success: false,
      message: "Raw result contains a field outside the validated task scope.",
    };
  const expectedMissing = task.requested_fields.filter(
    (field) => !fields.includes(field),
  );
  if (
    JSON.stringify([...expectedMissing].sort()) !==
    JSON.stringify([...raw.missing_fields].sort())
  )
    return {
      success: false,
      message: "Raw missing-field set is inconsistent.",
    };
  if (
    (expectedMissing.length === 0 && raw.status !== "success") ||
    (expectedMissing.length > 0 && raw.status !== "partial")
  )
    return { success: false, message: "Raw result status is inconsistent." };
  const unitId = raw.extracted_fields.find(
    (field) => field.field === identityField,
  )?.raw_value;
  if (unitId !== raw.external_record_id)
    return {
      success: false,
      message: "External record identity is inconsistent.",
    };
  try {
    raw.extracted_fields.forEach(validateFieldValue);
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Field validation failed.",
    };
  }
  return { success: true, value: raw };
};
