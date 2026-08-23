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
      if (
        typeof field.raw_value !== "string" ||
        !/^[0-9]+$/u.test(field.raw_value)
      )
        throw new SourceValueError(field.field, "invalid numeric unit ID");
      break;
    case "identity.property_type":
      if (field.raw_value !== "apartment")
        throw new SourceValueError(field.field, "unexpected property type");
      break;
    case "identity.market_type":
      if (field.raw_value !== "new_build")
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
  const requiredIdentityFields = [
    "identity.unit_id",
    "identity.property_type",
    "identity.market_type",
  ];
  if (
    requiredIdentityFields.some(
      (field) => !task.requested_fields.includes(field),
    )
  )
    return {
      success: false,
      message:
        "Unit ID, property type, and market type are required for stable normalization.",
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
    (field) => field.field === "identity.unit_id",
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
