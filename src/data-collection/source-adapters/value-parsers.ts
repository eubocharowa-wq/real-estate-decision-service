import type { Offer } from "../../domain";

export class SourceValueError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(`${field}: ${message}`);
    this.name = "SourceValueError";
  }
}

const sourceText = (field: string, value: unknown): string => {
  if (typeof value !== "string" || !value.trim())
    throw new SourceValueError(field, "expected a non-empty source string");
  return value.replaceAll("\u00a0", " ").trim();
};

export const parseRooms = (value: unknown): number => {
  const text = sourceText("physical.rooms", value).toLowerCase();
  if (text === "студия") return 0;
  const match = /^(\d+)\s*(?:-?комн(?:атная|\.)?)?$/u.exec(text);
  if (!match) throw new SourceValueError("physical.rooms", "invalid rooms");
  return Number(match[1]);
};

export interface FloorPosition {
  readonly floor: number;
  /** Only when the source states it in the same value, as in "5/17". */
  readonly floorsTotal: number | null;
}

/**
 * Real listings state the floor together with the building height: "5/17" and
 * "5 из 17" are as common as a bare "5". Both parts are kept — discarding the
 * building height would throw away a fact the source actually published.
 */
export const parseFloorPosition = (value: unknown): FloorPosition => {
  const text = sourceText("physical.floor", value);
  const match =
    /^(-?\d+)(?:\s*этаж)?(?:\s*(?:\/|из)\s*(\d+)(?:\s*этаж(?:ей|а)?)?)?$/iu.exec(
      text,
    );
  if (!match) throw new SourceValueError("physical.floor", "invalid floor");
  const floor = Number(match[1]);
  const floorsTotal = match[2] === undefined ? null : Number(match[2]);
  if (floorsTotal !== null && floorsTotal <= 0)
    throw new SourceValueError(
      "physical.floor",
      "building height must be positive",
    );
  if (floorsTotal !== null && floor > floorsTotal)
    throw new SourceValueError(
      "physical.floor",
      "floor cannot exceed the building height",
    );
  return { floor, floorsTotal };
};

export const parseFloor = (value: unknown): number =>
  parseFloorPosition(value).floor;

export interface AreaBreakdown {
  readonly total: number;
  /** Present only when the source publishes the "total/living/kitchen" form. */
  readonly living: number | null;
  readonly kitchen: number | null;
}

const areaNumber = (raw: string): number => {
  const match = /^(\d+(?:[.,]\d+)?)\s*(?:м²|м2|кв\.?\s?м\.?)?$/iu.exec(
    raw.trim(),
  );
  const parsed = match ? Number(match[1]!.replace(",", ".")) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new SourceValueError(
      "physical.total_area_m2",
      "invalid positive area",
    );
  return parsed;
};

/**
 * "38.2/23.7/8.4" is the standard Russian way to publish total, living and
 * kitchen area in one value. The first component is the total area; the other
 * two are real facts of the same listing and are kept rather than discarded.
 */
export const parseAreaBreakdown = (value: unknown): AreaBreakdown => {
  const text = sourceText("physical.total_area_m2", value);
  const parts = text.split("/");
  if (parts.length > 3)
    throw new SourceValueError(
      "physical.total_area_m2",
      "expected at most total/living/kitchen area",
    );
  const [total, living, kitchen] = parts.map((part) => areaNumber(part));
  if (living !== undefined && living > total!)
    throw new SourceValueError(
      "physical.total_area_m2",
      "living area cannot exceed the total area",
    );
  if (kitchen !== undefined && kitchen > total!)
    throw new SourceValueError(
      "physical.total_area_m2",
      "kitchen area cannot exceed the total area",
    );
  return {
    total: total!,
    living: living ?? null,
    kitchen: kitchen ?? null,
  };
};

export const parseArea = (value: unknown): number =>
  parseAreaBreakdown(value).total;

/**
 * Shifts a decimal string by whole places, so "4,5 млн" becomes exactly
 * "4500000" without going through a binary float.
 */
const shiftDecimal = (value: string, places: number): string => {
  const [whole = "0", fraction = ""] = value.split(".");
  if (places === 0) return fraction ? `${whole}.${fraction}` : whole;
  const padded = fraction.padEnd(places, "0");
  const shifted = `${whole}${padded.slice(0, places)}`;
  const remainder = padded.slice(places);
  const normalized = shifted.replace(/^0+(?=\d)/u, "");
  return remainder ? `${normalized}.${remainder}` : normalized;
};

const PRICE_MULTIPLIERS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly places: number;
}> = [
  { pattern: /\s*млн\.?$/iu, places: 6 },
  { pattern: /\s*млрд\.?$/iu, places: 9 },
  { pattern: /\s*тыс\.?$/iu, places: 3 },
];

export const parsePrice = (
  value: unknown,
  semantics: "exact" | "lower_bound" | "source_claim" | "unknown",
): { readonly amount: string; readonly priceFrom: boolean } => {
  const text = sourceText("listing_price", value);
  const hasFromPrefix = /^от\s+/iu.test(text);
  if (hasFromPrefix && semantics !== "lower_bound")
    throw new SourceValueError(
      "listing_price",
      "a lower-bound price cannot be classified as exact",
    );
  if (!hasFromPrefix && semantics === "lower_bound")
    throw new SourceValueError(
      "listing_price",
      "lower-bound semantics require an explicit source marker",
    );
  let numeric = text
    .replace(/^от\s+/iu, "")
    .replace(/(?:₽|руб\.?|rub)/giu, "")
    .trim();
  let places = 0;
  for (const multiplier of PRICE_MULTIPLIERS) {
    if (multiplier.pattern.test(numeric)) {
      numeric = numeric.replace(multiplier.pattern, "");
      places = multiplier.places;
      break;
    }
  }
  numeric = numeric.replaceAll(" ", "").trim();
  // Two decimals are kopecks; a scaled value like "4,5 млн" carries more.
  const maximumFractionDigits = places > 0 ? places : 2;
  const pattern = new RegExp(
    `^\\d+(?:[.,]\\d{1,${maximumFractionDigits}})?$`,
    "u",
  );
  if (!pattern.test(numeric))
    throw new SourceValueError("listing_price", "invalid monetary amount");
  const amount = shiftDecimal(numeric.replace(",", "."), places);
  if (Number(amount) <= 0)
    throw new SourceValueError("listing_price", "price must be positive");
  return { amount, priceFrom: hasFromPrefix };
};

const availabilityValues: Readonly<Record<string, Offer["availability"]>> = {
  "в продаже": "available",
  доступна: "available",
  забронирована: "reserved",
  резерв: "reserved",
  продана: "sold",
  "временно недоступна": "temporarily_unavailable",
};

/**
 * Availability never fails a collection, but an unrecognised value must not
 * pass for a deliberate unknown either: the caller has to be able to tell
 * "the source said nothing" from "the source said something we cannot read".
 */
export type AvailabilityParseResult =
  | { readonly recognized: true; readonly value: Offer["availability"] }
  | {
      readonly recognized: false;
      readonly value: "unknown";
      readonly sourceText: string;
    };

export const parseAvailability = (value: unknown): AvailabilityParseResult => {
  const text = sourceText("availability", value);
  const recognized = availabilityValues[text.toLowerCase()];
  return recognized
    ? { recognized: true, value: recognized }
    : { recognized: false, value: "unknown", sourceText: text };
};

export const parseIsoDate = (field: string, value: unknown): string => {
  const text = sourceText(field, value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text))
    throw new SourceValueError(field, "expected an ISO calendar date");
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  )
    throw new SourceValueError(field, "invalid calendar date");
  return text;
};
