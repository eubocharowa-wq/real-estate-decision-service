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

export const parseFloor = (value: unknown): number => {
  const text = sourceText("physical.floor", value);
  const match = /^(-?\d+)(?:\s*этаж)?$/iu.exec(text);
  if (!match) throw new SourceValueError("physical.floor", "invalid floor");
  return Number(match[1]);
};

export const parseArea = (value: unknown): number => {
  const text = sourceText("physical.total_area_m2", value);
  const match = /^(\d+(?:[.,]\d+)?)\s*(?:м²|м2)?$/iu.exec(text);
  const parsed = match ? Number(match[1].replace(",", ".")) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new SourceValueError(
      "physical.total_area_m2",
      "invalid positive area",
    );
  return parsed;
};

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
  const numeric = text
    .replace(/^от\s+/iu, "")
    .replace(/(?:₽|руб\.?)/giu, "")
    .replaceAll(" ", "")
    .trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/u.test(numeric))
    throw new SourceValueError("listing_price", "invalid monetary amount");
  const amount = numeric.replace(",", ".");
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

export const parseAvailability = (value: unknown): Offer["availability"] => {
  const text = sourceText("availability", value).toLowerCase();
  return availabilityValues[text] ?? "unknown";
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
