import type {
  RawIngestionField,
  RawIngestionFieldName,
  RawIngestionResult,
} from "../types";
import type { UserUrlAdapterContext, UserUrlIngestionAdapter } from "./types";

type Fixture = Readonly<Record<RawIngestionFieldName, unknown>> & {
  readonly duplicateOfPropertyId?: string;
  readonly missing?: readonly RawIngestionFieldName[];
};

const normal: Fixture = {
  title: "Светлая квартира у парка",
  property_type: "apartment",
  market_type: "secondary",
  city: "Тула",
  location_text: "Центральный район, улица Демонстрационная, 12",
  rooms: 2,
  area_m2: 54.8,
  floor: 5,
  price: "8750000",
  seller_name: "Собственник объявления",
  availability: "available",
  published_at: "2026-08-10T09:00:00.000Z",
  updated_at: "2026-08-16T09:00:00.000Z",
  gas: null,
  financing_claim: null,
};

const fixtures: Readonly<Record<string, Fixture>> = Object.freeze({
  "/listing/apartment": normal,
  "/listing/price-from": {
    ...normal,
    title: "Квартира от застройщика",
    price: "6900000",
    financing_claim: "Цена от 6,9 млн ₽",
  },
  "/listing/house": {
    ...normal,
    title: "Дом с участком",
    property_type: "house",
    market_type: "suburban",
    rooms: 4,
    area_m2: 122,
    floor: 1,
    price: "13900000",
    gas: "Газ по границе участка",
  },
  "/listing/financing": {
    ...normal,
    title: "Квартира с рекламой ипотеки",
    financing_claim: "Семейная ипотека от 3,5%",
  },
  "/listing/partial": {
    ...normal,
    title: "Объявление с неполными данными",
    price: null,
    location_text: null,
    rooms: null,
    area_m2: null,
    floor: null,
    missing: ["location_text", "price", "rooms", "area_m2", "floor"],
  },
  "/listing/duplicate-new-offer": {
    ...normal,
    title: "Новый оффер по существующему объекту",
    price: "8420000",
    duplicateOfPropertyId: "prop_sec_001",
  },
});

const field = (
  name: RawIngestionFieldName,
  value: unknown,
): RawIngestionField => ({
  field: name,
  rawValue: value,
  parsedValue: value,
  evidenceText: `${name}: ${String(value)}`,
  extractionConfidence: value === null ? 0 : 0.88,
  semantics:
    name === "financing_claim" || name === "gas"
      ? "claim"
      : name === "price" && value === "6900000"
        ? "price_from"
        : "fact",
});

export class FixtureUserUrlAdapter implements UserUrlIngestionAdapter {
  readonly name = "deterministic-fixture-adapter";
  readonly version = "fixture-adapter-v1";

  supports({ policy }: UserUrlAdapterContext): boolean {
    return (
      policy.mode === "fixture_mock" &&
      policy.allowedMethods.includes("fixture_mock")
    );
  }

  async collect(context: UserUrlAdapterContext): Promise<RawIngestionResult> {
    const fixture = fixtures[context.url.pathname];
    if (!fixture) throw new Error("FIXTURE_NOT_FOUND");
    const rawFields = (Object.keys(normal) as RawIngestionFieldName[]).map(
      (name) => field(name, fixture[name] ?? null),
    );
    return {
      schemaVersion: "1.0",
      ingestionId: context.ingestionId,
      sourceId: context.policy.sourceId ?? "fixture_user_url",
      originalUrl: context.url.originalUrl,
      sourceUrl: context.url.canonicalUrl,
      finalUrl: context.url.canonicalUrl,
      collectedAt: context.now,
      status: fixture.missing?.length ? "partial" : "complete",
      externalListingId: context.url.pathname.split("/").at(-1) ?? null,
      duplicateOfPropertyId: fixture.duplicateOfPropertyId ?? null,
      rawFields,
      extractionConfidence: fixture.missing?.length ? 0.62 : 0.88,
      warnings: fixture.missing?.length
        ? ["Источник не содержит часть полей."]
        : [],
      missingFields: fixture.missing ?? [],
      adapterVersion: this.version,
    };
  }
}
