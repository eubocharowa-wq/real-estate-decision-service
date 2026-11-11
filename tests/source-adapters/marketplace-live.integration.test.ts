import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  AVITO_SUPPORTED_FIELDS,
  createMarketplaceCardRuntime,
  HttpTransportError,
  type CollectionTask,
  type HttpCollectionResponse,
  type HttpCollector,
} from "../../src/data-collection/source-adapters";

const CARD_URL =
  "https://www.avito.ru/tula/kvartiry/2-k._kvartira_473_m_716_et._8437781969";
const OBSERVED_AT = "2026-11-11T12:00:00.000Z";
const html = () =>
  readFile(
    new URL(
      "../../data/examples/avito-fixtures/avito-secondary-8437781969.html",
      import.meta.url,
    ),
    "utf8",
  );

const task: CollectionTask = {
  schema_version: "1.0",
  task_id: "task_src_mkt_04_8437781969",
  source_id: "src_mkt_04",
  mode: "collect",
  target_urls: [CARD_URL],
  requested_fields: [
    "identity.listing_id",
    "identity.property_type",
    "identity.market_type",
    "physical.rooms",
    "physical.floor",
    "physical.total_area_m2",
    "building.floors_total",
    "listing_price",
  ],
  entity_type: "offer",
  freshness_requirement: "current_observation",
  priority: "normal",
  created_at: OBSERVED_AT,
};

const approvedEnv = {
  REDS_AVITO_LIVE_METHOD: "http",
  REDS_AVITO_CARD_HTTP_ACCESS_APPROVED: "true",
  REDS_AVITO_NORMALIZED_DATA_USE_APPROVED: "true",
};

class ControlledCollector implements HttpCollector {
  readonly version = "controlled-offline-http-v1";
  calls = 0;
  constructor(
    private readonly result:
      HttpCollectionResponse | (() => Promise<HttpCollectionResponse>),
  ) {}
  async get(): Promise<HttpCollectionResponse> {
    this.calls += 1;
    return typeof this.result === "function" ? this.result() : this.result;
  }
}

const execute = async (
  collector: HttpCollector,
  env: Readonly<Record<string, string | undefined>> = approvedEnv,
) =>
  createMarketplaceCardRuntime({ collector, env }).execute({
    task,
    environment: "test",
    observedAt: OBSERVED_AT,
  });

describe("policy-gated marketplace live runtime", () => {
  it("collects one approved card into claimed transient Property + Offer", async () => {
    const collector = new ControlledCollector({
      status: 200,
      finalUrl: CARD_URL,
      contentType: "text/html; charset=utf-8",
      body: await html(),
    });
    const result = await execute(collector);
    expect(result.status, JSON.stringify(result.rawResult)).toBe("success");
    expect(collector.calls).toBe(1);
    expect(result.candidate?.persistence).toBe("transient_only");
    expect(result.candidate?.propertyCandidate.identity.property_id).not.toBe(
      result.candidate?.offerCandidate.offer_id,
    );
    expect(result.candidate?.offerCandidate.property_id).toBe(
      result.candidate?.propertyCandidate.identity.property_id,
    );
    expect(result.candidate?.offerCandidate.listing_price?.amount).toBe(
      "9100000",
    );
    expect(
      result.candidate?.evidence.every((item) =>
        ["claimed", "unknown"].includes(item.verification_status),
      ),
    ).toBe(true);
    expect(result.rawResult.raw_payload_reference).toBeNull();
  });

  it("does not call a denied source when approval config is absent", async () => {
    const collector = new ControlledCollector({
      status: 200,
      finalUrl: CARD_URL,
      contentType: "text/html",
      body: await html(),
    });
    const result = await execute(collector, {});
    expect(result.status).toBe("blocked");
    expect(result.errorCode).toBe("POLICY_DENIED");
    expect(collector.calls).toBe(0);
  });

  it("uses the preserved Cian adapter only with its own scoped approvals", async () => {
    const cianUrl = "https://tula.cian.ru/sale/flat/308625197/";
    const collector = new ControlledCollector({
      status: 200,
      finalUrl: cianUrl,
      contentType: "text/html",
      body: await readFile(
        new URL(
          "../../data/examples/cian-fixtures/cian-newbuilding-308625197.html",
          import.meta.url,
        ),
        "utf8",
      ),
    });
    const result = await createMarketplaceCardRuntime({
      collector,
      env: {
        REDS_CIAN_LIVE_METHOD: "http",
        REDS_CIAN_CARD_HTTP_ACCESS_APPROVED: "true",
        REDS_CIAN_NORMALIZED_DATA_USE_APPROVED: "true",
      },
    }).execute({
      task: {
        ...task,
        task_id: "task_src_mkt_01_308625197",
        source_id: "src_mkt_01",
        target_urls: [cianUrl],
      },
      environment: "test",
      observedAt: OBSERVED_AT,
    });
    expect(result.status, JSON.stringify(result.rawResult)).toBe("success");
    expect(result.rawResult.external_record_id).toBe("308625197");
    expect(result.candidate?.offerCandidate.verification_status).toBe(
      "claimed",
    );
  });

  it.each([
    [403, "AUTH_REQUIRED", "blocked"],
    [429, "RATE_LIMITED", "blocked"],
    [404, "FETCH_FAILED", "unavailable"],
  ] as const)("fails closed on HTTP %i", async (status, code, outcome) => {
    const result = await execute(
      new ControlledCollector({
        status,
        finalUrl: CARD_URL,
        contentType: "text/html",
        body: "",
      }),
    );
    expect(result.status).toBe(outcome);
    expect(result.errorCode).toBe(code);
  });

  it.each([
    new HttpTransportError("TIMEOUT", "HTTP collection timed out."),
    new HttpTransportError("REDIRECT_DENIED", "Redirect denied."),
    new HttpTransportError("FETCH_FAILED", "URL unavailable."),
  ])("diagnoses transport refusal without a second request", async (error) => {
    const collector = new ControlledCollector(async () => {
      throw error;
    });
    const result = await execute(collector);
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(
      error.code === "TIMEOUT" ? "TIMEOUT" : "FETCH_FAILED",
    );
    expect(collector.calls).toBe(1);
  });

  it("stops on a challenge page and never parses it", async () => {
    const result = await execute(
      new ControlledCollector({
        status: 200,
        finalUrl: CARD_URL,
        contentType: "text/html",
        body: "<html>captcha: verify you are human</html>",
      }),
    );
    expect(result.status).toBe("blocked");
    expect(result.errorCode).toBe("AUTH_REQUIRED");
  });

  it("rejects fields outside the policy allowlist before collection", async () => {
    const collector = new ControlledCollector({
      status: 200,
      finalUrl: CARD_URL,
      contentType: "text/html",
      body: await html(),
    });
    const result = await createMarketplaceCardRuntime({
      collector,
      env: approvedEnv,
    }).execute({
      task: { ...task, requested_fields: ["seller.name"] },
      environment: "test",
      observedAt: OBSERVED_AT,
    });
    expect(result.status).toBe("blocked");
    expect(collector.calls).toBe(0);
  });

  it("keeps the runtime field set aligned with the adapter allowlist", () => {
    expect(AVITO_SUPPORTED_FIELDS).not.toContain("seller.name");
    expect(AVITO_SUPPORTED_FIELDS).not.toContain("media.photos");
    expect(AVITO_SUPPORTED_FIELDS).not.toContain("listing.description");
  });
});
