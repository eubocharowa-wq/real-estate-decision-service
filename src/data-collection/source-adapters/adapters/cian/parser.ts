import { z } from "zod";

import { CIAN_PARSER_VERSION, type CianSupportedField } from "../../config";
import type { RawCollectionField } from "../../contracts";

type Json = RawCollectionField["raw_value"];

export type CianCardErrorCode =
  | "SOURCE_CHANGED"
  | "UNSUPPORTED_CATEGORY"
  | "URL_NOT_CANONICAL"
  | "IDENTITY_MISMATCH";

export class CianCardError extends Error {
  constructor(
    readonly code: CianCardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CianCardError";
  }
}

const CATEGORY_TYPES = {
  newBuildingFlatSale: {
    propertyType: "apartment",
    marketType: "new_build",
    urlSegment: "flat",
  },
  flatSale: {
    propertyType: "apartment",
    marketType: "secondary",
    urlSegment: "flat",
  },
  houseSale: {
    propertyType: "house",
    marketType: "suburban",
    urlSegment: "suburban",
  },
} as const;

export type CianCategory = keyof typeof CATEGORY_TYPES;

const isCianCategory = (value: string): value is CianCategory =>
  Object.hasOwn(CATEGORY_TYPES, value);

const COMMON_FIELDS = [
  "identity.listing_id",
  "identity.property_type",
  "identity.market_type",
  "listing_price",
  "physical.total_area_m2",
  "physical.rooms",
  "building.floors_total",
  "building.built_year",
  "location.address.region",
  "location.address.city",
  "location.address.street",
  "location.address.house_number",
  "location.geo_point",
] as const satisfies readonly CianSupportedField[];

/** What a card of each category is expected to state; the rest never applies. */
const CATEGORY_FIELDS: Readonly<
  Record<CianCategory, readonly CianSupportedField[]>
> = {
  newBuildingFlatSale: [
    ...COMMON_FIELDS,
    "physical.floor",
    "identity.development_name",
    "building.developer_name",
    "timeline.handover_quarter",
  ],
  flatSale: [...COMMON_FIELDS, "physical.floor"],
  houseSale: [...COMMON_FIELDS, "land.area_sotka", "building.material_type"],
};

/** `locationTypeId` of a `type: "location"` address entry, as the card state publishes it. */
const LOCATION_TYPE_CITY = 1;
const LOCATION_TYPE_REGION = 2;

const SOTKA_PER_AREA_UNIT: Readonly<Record<string, number>> = {
  sotka: 1,
  hectare: 100,
};

const QUARTER_NUMBERS: Readonly<Record<string, 1 | 2 | 3 | 4>> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
};

const BUILT_YEAR_RANGE = { minimum: 1000, maximum: 9999 } as const;

const decimalText = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/u);
const decimalLike = z.union([z.number().finite(), decimalText]);

/**
 * Only the allow-listed facts are declared. Everything else in the card state
 * — phones, the listing text, photos, the agent and the user — is dropped at
 * this boundary and never reaches a candidate.
 */
const offerSchema = z.object({
  cianId: z.number().int().positive(),
  category: z.string().min(1),
  priceTotalRur: z.number().positive().nullish(),
  totalArea: decimalLike.nullish(),
  roomsCount: z.number().int().nonnegative().nullish(),
  floorNumber: z.number().int().nullish(),
  building: z
    .object({
      floorsCount: z.number().int().positive().nullish(),
      buildYear: z.number().int().nullish(),
      materialType: z.string().nullish(),
      deadline: z
        .object({
          year: z.number().int().nullish(),
          quarter: z.union([z.string(), z.number()]).nullish(),
          isComplete: z.boolean().nullish(),
        })
        .nullish(),
    })
    .nullish(),
  land: z
    .object({
      area: decimalLike.nullish(),
      areaUnitType: z.string().nullish(),
    })
    .nullish(),
  geo: z
    .object({
      address: z
        .array(
          z.object({
            type: z.string().nullish(),
            fullName: z.string().nullish(),
            locationTypeId: z.number().nullish(),
          }),
        )
        .nullish(),
      coordinates: z
        .object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
        })
        .nullish(),
      jk: z
        .object({
          name: z.string().nullish(),
          developer: z.object({ name: z.string().nullish() }).nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

type CianOfferState = z.infer<typeof offerSchema>;

const stateEntriesSchema = z.array(
  z.object({ key: z.string(), value: z.unknown().optional() }),
);

const defaultStateSchema = z.object({
  offerData: z.object({ offer: offerSchema }),
});

const STATE_ASSIGNMENT =
  /window\._cianConfig\[(['"])frontend-offer-card\1\]\s*=[^;]*?\.concat\(\s*/gu;

/** The balanced JSON array starting at `start`, or null when it never closes. */
const readJsonArray = (text: string, start: number): string | null => {
  if (text[start] !== "[") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
};

const readOfferState = (html: string): CianOfferState => {
  if (!html.trim())
    throw new CianCardError("SOURCE_CHANGED", "The card page is empty.");
  let assignments = 0;
  for (const match of html.matchAll(STATE_ASSIGNMENT)) {
    assignments += 1;
    const array = readJsonArray(html, match.index + match[0].length);
    if (array === null) continue;
    let entries: z.infer<typeof stateEntriesSchema>;
    try {
      entries = stateEntriesSchema.parse(JSON.parse(array));
    } catch {
      continue;
    }
    const state = entries.find((entry) => entry.key === "defaultState");
    if (!state) continue;
    const parsed = defaultStateSchema.safeParse(state.value);
    if (!parsed.success)
      throw new CianCardError(
        "SOURCE_CHANGED",
        `The card state no longer matches ${CIAN_PARSER_VERSION}: ${z.prettifyError(parsed.error)}`,
      );
    return parsed.data.offerData.offer;
  }
  throw new CianCardError(
    "SOURCE_CHANGED",
    assignments === 0
      ? "The frontend-offer-card state script is missing."
      : "The frontend-offer-card state has no readable defaultState entry.",
  );
};

const CARD_HOST = /^(?:[a-z0-9-]+\.)?cian\.ru$/u;
const CARD_PATH = /^\/sale\/(flat|suburban)\/([0-9]+)\/$/u;

export interface CianCardUrl {
  readonly canonicalUrl: string;
  readonly listingId: string;
  readonly segment: "flat" | "suburban";
}

/**
 * A card is addressed only as `https://<region>.cian.ru/sale/flat/<id>/` or
 * `/sale/suburban/<id>/`. Query parameters and fragments are refused rather
 * than stripped, matching what the registry's collection scope accepts.
 */
export const parseCianCardUrl = (value: string): CianCardUrl => {
  const refuse = (): never => {
    throw new CianCardError(
      "URL_NOT_CANONICAL",
      "Expected a canonical card URL without query parameters: https://<region>.cian.ru/sale/flat/<id>/ or /sale/suburban/<id>/.",
    );
  };
  if (value.includes("?") || value.includes("#")) return refuse();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return refuse();
  }
  const path = CARD_PATH.exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !CARD_HOST.test(url.hostname) ||
    !path
  )
    return refuse();
  return {
    canonicalUrl: url.toString(),
    listingId: path[2]!,
    segment: path[1] as CianCardUrl["segment"],
  };
};

export interface CianCardFacts {
  readonly listingId: string;
  readonly canonicalUrl: string;
  readonly category: CianCategory;
  readonly propertyType: "apartment" | "house";
  readonly marketType: "new_build" | "secondary" | "suburban";
  /** Whole roubles as a decimal string; the seller's asking price. */
  readonly priceRub: string | null;
  readonly totalAreaM2: number | null;
  readonly rooms: number | null;
  readonly floor: number | null;
  readonly floorsTotal: number | null;
  readonly builtYear: number | null;
  readonly materialType: string | null;
  readonly landAreaSotka: number | null;
  readonly address: {
    readonly region: string | null;
    readonly city: string | null;
    readonly street: string | null;
    readonly houseNumber: string | null;
  };
  readonly geoPoint: {
    readonly latitude: number;
    readonly longitude: number;
  } | null;
  readonly developmentName: string | null;
  readonly developerName: string | null;
  /** A quarter is not a date; it is never turned into one. */
  readonly handoverQuarter: {
    readonly year: number;
    readonly quarter: 1 | 2 | 3 | 4;
    readonly isComplete: boolean | null;
  } | null;
}

/** One applicable field of a card: its value, or null when the card is silent. */
export interface CianFieldObservation {
  readonly field: CianSupportedField;
  readonly value: Json;
  readonly rawValue: Json;
  readonly statePath: string;
}

export interface CianParsedCard {
  readonly facts: CianCardFacts;
  readonly observations: readonly CianFieldObservation[];
  readonly warnings: readonly string[];
}

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const positiveNumber = (
  value: number | string | null | undefined,
): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const parseCianOfferCard = ({
  html,
  sourceUrl,
}: {
  readonly html: string;
  /** The canonical URL the card was saved from. */
  readonly sourceUrl: string;
}): CianParsedCard => {
  const url = parseCianCardUrl(sourceUrl);
  const offer = readOfferState(html);
  if (!isCianCategory(offer.category))
    throw new CianCardError(
      "UNSUPPORTED_CATEGORY",
      `Card category "${offer.category}" is outside ${CIAN_PARSER_VERSION}.`,
    );
  const category = offer.category;
  const types = CATEGORY_TYPES[category];
  const listingId = String(offer.cianId);
  if (url.listingId !== listingId || url.segment !== types.urlSegment)
    throw new CianCardError(
      "IDENTITY_MISMATCH",
      "The card state does not describe the listing the URL addresses.",
    );

  const warnings: string[] = [];
  const unreadable = (field: CianSupportedField, raw: Json): null => {
    warnings.push(
      `${field} was published as ${JSON.stringify(raw)}, which ${CIAN_PARSER_VERSION} does not read; it is not treated as a value.`,
    );
    return null;
  };

  const addressEntries = offer.geo?.address ?? [];
  const addressComponent = (
    field: CianSupportedField,
    matches: (entry: (typeof addressEntries)[number]) => boolean,
  ): string | null => {
    const names = addressEntries
      .filter(matches)
      .map((entry) => textOrNull(entry.fullName))
      .filter((name): name is string => name !== null);
    if (names.length > 1) return unreadable(field, names);
    return names[0] ?? null;
  };
  const address = {
    region: addressComponent(
      "location.address.region",
      (entry) =>
        entry.type === "location" &&
        entry.locationTypeId === LOCATION_TYPE_REGION,
    ),
    city: addressComponent(
      "location.address.city",
      (entry) =>
        entry.type === "location" &&
        entry.locationTypeId === LOCATION_TYPE_CITY,
    ),
    street: addressComponent(
      "location.address.street",
      (entry) => entry.type === "street",
    ),
    houseNumber: addressComponent(
      "location.address.house_number",
      (entry) => entry.type === "house",
    ),
  };

  const rawBuiltYear = offer.building?.buildYear ?? null;
  const builtYear =
    rawBuiltYear === null
      ? null
      : rawBuiltYear >= BUILT_YEAR_RANGE.minimum &&
          rawBuiltYear <= BUILT_YEAR_RANGE.maximum
        ? rawBuiltYear
        : unreadable("building.built_year", rawBuiltYear);

  const rawLand =
    offer.land?.area === null || offer.land?.area === undefined
      ? null
      : {
          area: offer.land.area,
          areaUnitType: offer.land.areaUnitType ?? null,
        };
  let landAreaSotka: number | null = null;
  if (category === "houseSale" && rawLand !== null) {
    const area = positiveNumber(rawLand.area);
    const factor = SOTKA_PER_AREA_UNIT[rawLand.areaUnitType ?? ""];
    landAreaSotka =
      area === null || factor === undefined
        ? unreadable("land.area_sotka", rawLand)
        : area * factor;
  }

  const rawDeadline = offer.building?.deadline ?? null;
  let handoverQuarter: CianCardFacts["handoverQuarter"] = null;
  if (category === "newBuildingFlatSale" && rawDeadline !== null) {
    const quarter = QUARTER_NUMBERS[String(rawDeadline.quarter ?? "")];
    const year = rawDeadline.year ?? null;
    handoverQuarter =
      quarter === undefined || year === null
        ? unreadable("timeline.handover_quarter", {
            year,
            quarter: rawDeadline.quarter ?? null,
          })
        : { year, quarter, isComplete: rawDeadline.isComplete ?? null };
  }

  const coordinates = offer.geo?.coordinates ?? null;
  const facts: CianCardFacts = {
    listingId,
    canonicalUrl: url.canonicalUrl,
    category,
    propertyType: types.propertyType,
    marketType: types.marketType,
    priceRub:
      offer.priceTotalRur === null || offer.priceTotalRur === undefined
        ? null
        : /^\d+(?:\.\d+)?$/u.test(String(offer.priceTotalRur))
          ? String(offer.priceTotalRur)
          : unreadable("listing_price", offer.priceTotalRur),
    totalAreaM2:
      offer.totalArea === null || offer.totalArea === undefined
        ? null
        : (positiveNumber(offer.totalArea) ??
          unreadable("physical.total_area_m2", offer.totalArea)),
    rooms: offer.roomsCount ?? null,
    floor: category === "houseSale" ? null : (offer.floorNumber ?? null),
    floorsTotal: offer.building?.floorsCount ?? null,
    builtYear,
    materialType:
      category === "houseSale"
        ? textOrNull(offer.building?.materialType)
        : null,
    landAreaSotka,
    address,
    geoPoint: coordinates
      ? { latitude: coordinates.lat, longitude: coordinates.lng }
      : null,
    developmentName:
      category === "newBuildingFlatSale"
        ? textOrNull(offer.geo?.jk?.name)
        : null,
    developerName:
      category === "newBuildingFlatSale"
        ? textOrNull(offer.geo?.jk?.developer?.name)
        : null,
    handoverQuarter,
  };

  const observed: Readonly<
    Record<
      CianSupportedField,
      { readonly value: Json; readonly rawValue: Json; readonly path: string }
    >
  > = {
    "identity.listing_id": {
      value: facts.listingId,
      rawValue: offer.cianId,
      path: "cianId",
    },
    "identity.property_type": {
      value: facts.propertyType,
      rawValue: category,
      path: "category",
    },
    "identity.market_type": {
      value: facts.marketType,
      rawValue: category,
      path: "category",
    },
    "identity.development_name": {
      value: facts.developmentName,
      rawValue: facts.developmentName,
      path: "geo.jk.name",
    },
    listing_price: {
      value:
        facts.priceRub === null
          ? null
          : { amount: facts.priceRub, currency: "RUB" },
      rawValue: offer.priceTotalRur ?? null,
      path: "priceTotalRur",
    },
    "physical.total_area_m2": {
      value: facts.totalAreaM2,
      rawValue: offer.totalArea ?? null,
      path: "totalArea",
    },
    "physical.rooms": {
      value: facts.rooms,
      rawValue: offer.roomsCount ?? null,
      path: "roomsCount",
    },
    "physical.floor": {
      value: facts.floor,
      rawValue: offer.floorNumber ?? null,
      path: "floorNumber",
    },
    "building.floors_total": {
      value: facts.floorsTotal,
      rawValue: offer.building?.floorsCount ?? null,
      path: "building.floorsCount",
    },
    "building.built_year": {
      value: facts.builtYear,
      rawValue: rawBuiltYear,
      path: "building.buildYear",
    },
    "building.material_type": {
      value: facts.materialType,
      rawValue: facts.materialType,
      path: "building.materialType",
    },
    "building.developer_name": {
      value: facts.developerName,
      rawValue: facts.developerName,
      path: "geo.jk.developer.name",
    },
    "land.area_sotka": {
      value: facts.landAreaSotka,
      rawValue: rawLand,
      path: "land.area",
    },
    "location.address.region": {
      value: address.region,
      rawValue: address.region,
      path: "geo.address[type=location]",
    },
    "location.address.city": {
      value: address.city,
      rawValue: address.city,
      path: "geo.address[type=location]",
    },
    "location.address.street": {
      value: address.street,
      rawValue: address.street,
      path: "geo.address[type=street]",
    },
    "location.address.house_number": {
      value: address.houseNumber,
      rawValue: address.houseNumber,
      path: "geo.address[type=house]",
    },
    "location.geo_point": {
      value: facts.geoPoint,
      rawValue: coordinates,
      path: "geo.coordinates",
    },
    "timeline.handover_quarter": {
      value: handoverQuarter
        ? {
            quarter: `${handoverQuarter.year}-Q${handoverQuarter.quarter}`,
            is_complete: handoverQuarter.isComplete,
          }
        : null,
      rawValue: rawDeadline
        ? {
            year: rawDeadline.year ?? null,
            quarter: rawDeadline.quarter ?? null,
            isComplete: rawDeadline.isComplete ?? null,
          }
        : null,
      path: "building.deadline",
    },
  };

  return {
    facts,
    observations: CATEGORY_FIELDS[category].map((field) => ({
      field,
      value: observed[field].value,
      // A silent card has no raw value either; an unreadable one keeps it.
      rawValue: observed[field].rawValue,
      statePath: `offerData.offer.${observed[field].path}`,
    })),
    warnings,
  };
};
