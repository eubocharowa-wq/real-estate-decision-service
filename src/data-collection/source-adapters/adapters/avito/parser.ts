import { z } from "zod";

import { AVITO_PARSER_VERSION, type AvitoSupportedField } from "../../config";
import type { RawCollectionField } from "../../contracts";

type Json = RawCollectionField["raw_value"];

export type AvitoCardErrorCode =
  | "SOURCE_CHANGED"
  | "UNSUPPORTED_CATEGORY"
  | "URL_NOT_CANONICAL"
  | "IDENTITY_MISMATCH";

export class AvitoCardError extends Error {
  constructor(
    readonly code: AvitoCardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AvitoCardError";
  }
}

const parameterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

const hydrationSchema = z.object({
  loaderData: z.object({
    "catalog-or-main-or-item": z.object({
      buyerItem: z.object({
        paramsBlock: z.object({ items: z.array(parameterSchema) }),
        item: z.object({
          id: z.number().int().positive(),
          category: z.object({ slug: z.string().min(1) }),
          breadcrumbs: z.array(
            z.object({
              name: z.string().min(1),
              url: z.string().min(1),
            }),
          ),
          address: z.string().min(1).nullish(),
          geo: z
            .object({
              coords: z.object({
                lat: z.number().min(-90).max(90),
                lng: z.number().min(-180).max(180),
              }),
            })
            .nullish(),
          price: z.number().positive().nullish(),
          houseParams: z.object({
            data: z.object({ items: z.array(parameterSchema) }),
          }),
        }),
      }),
    }),
  }),
});

const HYDRATION_ASSIGNMENT =
  /window\.__staticRouterHydrationData\s*=\s*JSON\.parse\(\s*(["'])((?:\\.|(?!\1)[\s\S])*)\1\s*,?\s*\)/u;

const readHydration = (html: string): z.infer<typeof hydrationSchema> => {
  if (!html.trim())
    throw new AvitoCardError("SOURCE_CHANGED", "The card page is empty.");
  const match = HYDRATION_ASSIGNMENT.exec(html);
  if (!match)
    throw new AvitoCardError(
      "SOURCE_CHANGED",
      "The Avito card hydration state is missing.",
    );
  try {
    const serialized =
      match[1] === '"' ? (JSON.parse(`"${match[2]}"`) as string) : match[2]!;
    return hydrationSchema.parse(JSON.parse(serialized));
  } catch (error) {
    throw new AvitoCardError(
      "SOURCE_CHANGED",
      `The card state no longer matches ${AVITO_PARSER_VERSION}: ${
        error instanceof Error ? error.message : "invalid state"
      }`,
    );
  }
};

const CARD_HOST = /^(?:www\.)?avito\.ru$/u;
const CARD_PATH = /^\/[^/]+\/(kvartiry|doma_dachi_kottedzhi)\/[^/]+_([0-9]+)$/u;

export interface AvitoCardUrl {
  readonly canonicalUrl: string;
  readonly listingId: string;
  readonly category: "kvartiry" | "doma_dachi_kottedzhi";
}

export const parseAvitoCardUrl = (value: string): AvitoCardUrl => {
  const refuse = (): never => {
    throw new AvitoCardError(
      "URL_NOT_CANONICAL",
      "Expected one canonical Avito property-card HTTPS URL without query or fragment.",
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
    category: path[1] as AvitoCardUrl["category"],
    listingId: path[2]!,
  };
};

const normalizedText = (value: string): string =>
  value.replaceAll("\u00a0", " ").trim();

const decimal = (value: string, suffix: RegExp): number | null => {
  const match = suffix.exec(normalizedText(value));
  if (!match) return null;
  const parsed = Number(match[1]!.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const integer = (value: string): number | null => {
  const parsed = Number(normalizedText(value));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const parameter = (
  items: readonly z.infer<typeof parameterSchema>[],
  title: string,
): string | null =>
  items.find((item) => item.title === title)?.description ?? null;

const parseAddress = (raw: string | null | undefined) => {
  const parts = (raw ?? "").split(",").map(normalizedText).filter(Boolean);
  const regionIndex = parts.findIndex((part) =>
    /(?:обл\.|область)$/iu.test(part),
  );
  const cityIndex = parts.findIndex(
    (part, index) =>
      index !== regionIndex &&
      (index === regionIndex + 1 || /^(?:г\.|город)\s+/iu.test(part)) &&
      !/^(?:г\.о\.|городской округ)\s+/iu.test(part) &&
      !/^(?:ул\.|улица|просп\.|проспект|пер\.|переулок)\s+/iu.test(part),
  );
  const streetIndex = parts.findIndex((part) =>
    /^(?:ул\.|улица|просп\.|проспект|пер\.|переулок)\s+/iu.test(part),
  );
  const houseIndex =
    streetIndex >= 0 && parts.length > streetIndex + 1 ? parts.length - 1 : -1;
  const localityParts = parts.filter(
    (_part, index) =>
      index !== regionIndex &&
      index !== cityIndex &&
      index !== streetIndex &&
      index !== houseIndex,
  );
  return {
    region: regionIndex >= 0 ? parts[regionIndex]! : null,
    city: cityIndex >= 0 ? parts[cityIndex]!.replace(/^г\.\s*/iu, "") : null,
    locality: localityParts.length > 0 ? localityParts.join(", ") : null,
    street: streetIndex >= 0 ? parts[streetIndex]! : null,
    houseNumber: houseIndex >= 0 ? parts[houseIndex]! : null,
  };
};

export type AvitoCategory = "secondary_flat" | "new_build_flat" | "house";

export interface AvitoCardFacts {
  readonly listingId: string;
  readonly canonicalUrl: string;
  readonly category: AvitoCategory;
  readonly propertyType: "apartment" | "house";
  readonly marketType: "secondary" | "new_build" | "suburban";
  readonly priceRub: string | null;
  readonly totalAreaM2: number | null;
  readonly rooms: number | null;
  readonly floor: number | null;
  readonly floorsTotal: number | null;
  readonly builtYear: number | null;
  readonly materialType: string | null;
  readonly landAreaSotka: number | null;
  readonly address: ReturnType<typeof parseAddress>;
  readonly geoPoint: {
    readonly latitude: number;
    readonly longitude: number;
  } | null;
  readonly developmentName: string | null;
}

export interface AvitoFieldObservation {
  readonly field: AvitoSupportedField;
  readonly value: Json;
  readonly rawValue: Json;
  readonly statePath: string;
}

export interface AvitoParsedCard {
  readonly facts: AvitoCardFacts;
  readonly observations: readonly AvitoFieldObservation[];
  readonly warnings: readonly string[];
}

export const parseAvitoOfferCard = ({
  html,
  sourceUrl,
}: {
  readonly html: string;
  readonly sourceUrl: string;
}): AvitoParsedCard => {
  const url = parseAvitoCardUrl(sourceUrl);
  const hydration = readHydration(html);
  const buyerItem = hydration.loaderData["catalog-or-main-or-item"].buyerItem;
  const item = buyerItem.item;
  if (String(item.id) !== url.listingId)
    throw new AvitoCardError(
      "IDENTITY_MISMATCH",
      "The card state does not describe the listing addressed by the URL.",
    );
  if (
    (url.category === "kvartiry" && item.category.slug !== "kvartiry") ||
    (url.category === "doma_dachi_kottedzhi" &&
      item.category.slug !== "doma_dachi_kottedzhi")
  )
    throw new AvitoCardError(
      "UNSUPPORTED_CATEGORY",
      "The card category does not match its canonical URL.",
    );

  const breadcrumbUrls = item.breadcrumbs.map((crumb) => crumb.url);
  const category: AvitoCategory =
    url.category === "doma_dachi_kottedzhi"
      ? "house"
      : breadcrumbUrls.some((value) => value.includes("/novostroyka"))
        ? "new_build_flat"
        : breadcrumbUrls.some((value) => value.includes("/vtorichka"))
          ? "secondary_flat"
          : (() => {
              throw new AvitoCardError(
                "UNSUPPORTED_CATEGORY",
                "The apartment card does not state new-build or secondary market type.",
              );
            })();
  const params = buyerItem.paramsBlock.items;
  const houseParams = item.houseParams.data.items;
  const areaRaw = parameter(
    params,
    category === "house" ? "Площадь дома" : "Общая площадь",
  );
  const floorRaw = parameter(params, "Этаж");
  const floorMatch = floorRaw
    ? /^(-?\d+)\s+из\s+(\d+)$/u.exec(normalizedText(floorRaw))
    : null;
  const floorsRaw = parameter(houseParams, "Этажей в доме");
  const facts: AvitoCardFacts = {
    listingId: String(item.id),
    canonicalUrl: url.canonicalUrl,
    category,
    propertyType: category === "house" ? "house" : "apartment",
    marketType:
      category === "house"
        ? "suburban"
        : category === "new_build_flat"
          ? "new_build"
          : "secondary",
    priceRub: item.price == null ? null : String(item.price),
    totalAreaM2:
      areaRaw === null ? null : decimal(areaRaw, /^(\d+(?:[.,]\d+)?)\s*м²$/iu),
    rooms: (() => {
      const value = parameter(params, "Количество комнат");
      return value === null ? null : integer(value);
    })(),
    floor:
      category === "house" ? null : floorMatch ? Number(floorMatch[1]) : null,
    floorsTotal:
      category === "house"
        ? (() => {
            const value = parameter(params, "Этажей в доме");
            return value === null ? null : integer(value);
          })()
        : floorMatch
          ? Number(floorMatch[2])
          : floorsRaw === null
            ? null
            : integer(floorsRaw),
    builtYear: (() => {
      const value = parameter(houseParams, "Год постройки");
      const year = value === null ? null : integer(value);
      return year !== null && year >= 1000 && year <= 9999 ? year : null;
    })(),
    materialType:
      parameter(params, "Материал стен") ?? parameter(houseParams, "Тип дома"),
    landAreaSotka: (() => {
      const value = parameter(params, "Площадь участка");
      return value === null
        ? null
        : decimal(value, /^(\d+(?:[.,]\d+)?)\s*сот\.?$/iu);
    })(),
    address: parseAddress(item.address),
    geoPoint: item.geo
      ? { latitude: item.geo.coords.lat, longitude: item.geo.coords.lng }
      : null,
    developmentName: parameter(houseParams, "Название новостройки"),
  };

  const categoryFields: readonly AvitoSupportedField[] =
    category === "house"
      ? [
          "identity.listing_id",
          "identity.property_type",
          "identity.market_type",
          "physical.rooms",
          "physical.total_area_m2",
          "building.floors_total",
          "building.built_year",
          "building.material_type",
          "land.area_sotka",
          "location.address.region",
          "location.address.city",
          "location.address.locality",
          "location.address.street",
          "location.address.house_number",
          "location.geo_point",
          "listing_price",
        ]
      : [
          "identity.listing_id",
          "identity.property_type",
          "identity.market_type",
          "identity.development_name",
          "physical.rooms",
          "physical.floor",
          "physical.total_area_m2",
          "building.floors_total",
          "building.built_year",
          "building.material_type",
          "location.address.region",
          "location.address.city",
          "location.address.locality",
          "location.address.street",
          "location.address.house_number",
          "location.geo_point",
          "listing_price",
        ];
  const values: Readonly<Record<AvitoSupportedField, Json>> = {
    "identity.listing_id": facts.listingId,
    "identity.property_type": facts.propertyType,
    "identity.market_type": facts.marketType,
    "identity.development_name": facts.developmentName,
    "physical.rooms": facts.rooms,
    "physical.floor": facts.floor,
    "physical.total_area_m2": facts.totalAreaM2,
    "building.floors_total": facts.floorsTotal,
    "building.built_year": facts.builtYear,
    "building.material_type": facts.materialType,
    "land.area_sotka": facts.landAreaSotka,
    "location.address.region": facts.address.region,
    "location.address.city": facts.address.city,
    "location.address.locality": facts.address.locality,
    "location.address.street": facts.address.street,
    "location.address.house_number": facts.address.houseNumber,
    "location.geo_point": facts.geoPoint,
    listing_price:
      facts.priceRub === null
        ? null
        : { amount: facts.priceRub, currency: "RUB" },
  };
  const rawValues: Readonly<Record<AvitoSupportedField, Json>> = {
    ...values,
    "physical.floor": floorRaw,
    "physical.total_area_m2": areaRaw,
    listing_price: item.price ?? null,
  };
  const paths: Readonly<Record<AvitoSupportedField, string>> = {
    "identity.listing_id": "item.id",
    "identity.property_type": "item.category.slug",
    "identity.market_type": "item.breadcrumbs",
    "identity.development_name": "item.houseParams.data.items",
    "physical.rooms": "paramsBlock.items:Количество комнат",
    "physical.floor": "paramsBlock.items:Этаж",
    "physical.total_area_m2": "paramsBlock.items:Площадь",
    "building.floors_total": "paramsBlock/items:Этажей в доме",
    "building.built_year": "item.houseParams.data.items:Год постройки",
    "building.material_type": "paramsBlock/houseParams:Материал",
    "land.area_sotka": "paramsBlock.items:Площадь участка",
    "location.address.region": "item.address",
    "location.address.city": "item.address",
    "location.address.locality": "item.address",
    "location.address.street": "item.address",
    "location.address.house_number": "item.address",
    "location.geo_point": "item.geo.coords",
    listing_price: "item.price",
  };

  return {
    facts,
    observations: categoryFields.map((field) => ({
      field,
      value: values[field],
      rawValue: rawValues[field],
      statePath: paths[field],
    })),
    warnings: [],
  };
};
