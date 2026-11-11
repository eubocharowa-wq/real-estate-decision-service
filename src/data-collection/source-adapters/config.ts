export const VNESHSTROI_SOURCE_ID = "src_dev_02" as const;
export const VNESHSTROI_APPROVAL_CONDITION =
  "TARGETED_UNIT_HTTP_POC_APPROVED" as const;

export const VNESHSTROI_ADAPTER_VERSION = "src-dev-02-http-adapter-v1";
export const VNESHSTROI_PARSER_VERSION = "src-dev-02-parser-v1";
export const VNESHSTROI_NORMALIZATION_VERSION = "src-dev-02-normalization-v1";

export { CIAN_SOURCE_ID } from "../source-registry/config/pilot";

export const CIAN_ADAPTER_VERSION = "src-mkt-01-card-adapter-v1";
export const CIAN_PARSER_VERSION = "src-mkt-01-card-parser-v1";
export const CIAN_NORMALIZATION_VERSION = "src-mkt-01-normalization-v1";

export const AVITO_SOURCE_ID = "src_mkt_04" as const;
export const AVITO_ADAPTER_VERSION = "src-mkt-04-card-adapter-v1";
export const AVITO_PARSER_VERSION = "src-mkt-04-card-parser-v1";
export const AVITO_NORMALIZATION_VERSION = "src-mkt-04-normalization-v1";

/** Structured state is read as published; the value is not interpreted. */
export const CIAN_EXTRACTION_CONFIDENCE = 0.98;

export const SOURCE_ADAPTER_HTTP_CONFIG = Object.freeze({
  timeoutMs: 10_000,
  maximumResponseBytes: 512 * 1024,
  maximumAttempts: 1,
  allowedContentTypes: ["text/html"] as const,
  redirectPolicy: "deny" as const,
  retryableHttpStatuses: [429, 500, 502, 503, 504] as const,
});

/**
 * Address components a source may publish.
 *
 * Normalization maps any of these into `Property.location.address`. Without
 * them the address stays entirely null and the city, district and excluded
 * location criteria can never match a collected object.
 */
export const ADDRESS_COLLECTION_FIELDS = [
  "location.address.country_code",
  "location.address.region",
  "location.address.city",
  "location.address.locality",
  "location.address.district",
  "location.address.street",
  "location.address.house_number",
  "location.address.postal_code",
] as const;

export type AddressCollectionField = (typeof ADDRESS_COLLECTION_FIELDS)[number];

export const VNESHSTROI_SUPPORTED_FIELDS = [
  "identity.unit_id",
  "identity.property_type",
  "identity.market_type",
  "identity.development_name",
  "identity.unit_number",
  "physical.rooms",
  "physical.floor",
  "physical.total_area_m2",
  "listing_price",
  "timeline.handover_date",
  "availability",
] as const;

export type VneshstroiSupportedField =
  (typeof VNESHSTROI_SUPPORTED_FIELDS)[number];

/**
 * Every fact the Cian card adapter may emit. Phones, the listing text, photos
 * and anything about the agent or the user are deliberately absent.
 */
export const CIAN_SUPPORTED_FIELDS = [
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
  "building.developer_name",
  "land.area_sotka",
  "location.address.region",
  "location.address.city",
  "location.address.street",
  "location.address.house_number",
  "location.geo_point",
  "timeline.handover_quarter",
  "listing_price",
] as const;

export type CianSupportedField = (typeof CIAN_SUPPORTED_FIELDS)[number];

/** Facts retained from an Avito card; seller data and listing prose are excluded. */
export const AVITO_SUPPORTED_FIELDS = [
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
  "land.area_sotka",
  "location.address.region",
  "location.address.city",
  "location.address.locality",
  "location.address.street",
  "location.address.house_number",
  "location.geo_point",
  "listing_price",
] as const;

export type AvitoSupportedField = (typeof AVITO_SUPPORTED_FIELDS)[number];
