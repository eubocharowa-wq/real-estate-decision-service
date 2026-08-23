import { readFile } from "node:fs/promises";

import type {
  CollectionTask,
  HttpCollectionResponse,
  HttpCollector,
} from "../../src/data-collection/source-adapters";

export const UNIT_URL = "https://vneshstroi.ru/kvartiry/73124/";
export const OBSERVED_AT = "2026-08-23T12:00:00.000Z";
export const APPROVAL = "TARGETED_UNIT_HTTP_POC_APPROVED";

export const REQUESTED_FIELDS = [
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

export const makeTask = (
  overrides: Partial<CollectionTask> = {},
): CollectionTask => ({
  schema_version: "1.0",
  task_id: "task_src_dev_02_73124",
  source_id: "src_dev_02",
  mode: "collect",
  target_urls: [UNIT_URL],
  requested_fields: [...REQUESTED_FIELDS],
  entity_type: "offer",
  freshness_requirement: "current_observation",
  priority: "normal",
  created_at: "2026-08-23T11:59:00.000Z",
  ...overrides,
});

export const readFixture = (name: string): Promise<string> =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

export class FixtureHttpCollector implements HttpCollector {
  readonly version = "offline-fixture-http-v1";
  calls = 0;

  constructor(
    private readonly response:
      HttpCollectionResponse | (() => Promise<HttpCollectionResponse>),
  ) {}

  async get(): Promise<HttpCollectionResponse> {
    this.calls += 1;
    return typeof this.response === "function"
      ? this.response()
      : this.response;
  }
}

export const fixtureResponse = (
  body: string,
  overrides: Partial<HttpCollectionResponse> = {},
): HttpCollectionResponse => ({
  status: 200,
  finalUrl: UNIT_URL,
  contentType: "text/html; charset=utf-8",
  body,
  ...overrides,
});
