import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

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
  NODE_ENV: "test",
  REDS_MARKETPLACE_REQUEST_STATE_BACKEND: "memory",
  REDS_AVITO_LIVE_METHOD: "http",
  REDS_AVITO_CARD_HTTP_ACCESS_APPROVED: "true",
  REDS_AVITO_NORMALIZED_DATA_USE_APPROVED: "true",
};

const configureRuntimeEnv = (
  env: Readonly<Record<string, string | undefined>>,
) => {
  for (const key of [
    "NODE_ENV",
    "REDS_APPLICATION_MODE",
    "REDS_MARKETPLACE_REQUEST_STATE_BACKEND",
    "REDS_CIAN_LIVE_METHOD",
    "REDS_CIAN_CARD_HTTP_ACCESS_APPROVED",
    "REDS_CIAN_NORMALIZED_DATA_USE_APPROVED",
    "REDS_AVITO_LIVE_METHOD",
    "REDS_AVITO_CARD_HTTP_ACCESS_APPROVED",
    "REDS_AVITO_NORMALIZED_DATA_USE_APPROVED",
  ])
    vi.stubEnv(key, env[key]);
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
) => {
  configureRuntimeEnv(env);
  return createMarketplaceCardRuntime({ collector }).execute({
    task,
    observedAt: OBSERVED_AT,
  });
};

describe("policy-gated marketplace live runtime", () => {
  afterEach(() => vi.unstubAllEnvs());

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
    const result = await execute(collector, {
      NODE_ENV: "test",
      REDS_MARKETPLACE_REQUEST_STATE_BACKEND: "memory",
    });
    expect(result.status).toBe("blocked");
    expect(result.errorCode).toBe("POLICY_DENIED");
    expect(collector.calls).toBe(0);
  });

  it("does not call an approved source without a configured request-state backend", async () => {
    const collector = new ControlledCollector({
      status: 200,
      finalUrl: CARD_URL,
      contentType: "text/html",
      body: await html(),
    });
    const result = await execute(collector, {
      ...approvedEnv,
      REDS_MARKETPLACE_REQUEST_STATE_BACKEND: "disabled",
    });
    expect(result.status).toBe("blocked");
    expect(result.errorCode).toBe("RATE_LIMITED");
    expect(result.rawResult.warnings).toContain(
      "The shared request guard is unavailable; no request was made.",
    );
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
    configureRuntimeEnv({
      NODE_ENV: "test",
      REDS_MARKETPLACE_REQUEST_STATE_BACKEND: "memory",
      REDS_CIAN_LIVE_METHOD: "http",
      REDS_CIAN_CARD_HTTP_ACCESS_APPROVED: "true",
      REDS_CIAN_NORMALIZED_DATA_USE_APPROVED: "true",
    });
    const result = await createMarketplaceCardRuntime({ collector }).execute({
      task: {
        ...task,
        task_id: "task_src_mkt_01_308625197",
        source_id: "src_mkt_01",
        target_urls: [cianUrl],
      },
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

  it("stops when valid hydration data coexists with an explicit CAPTCHA", async () => {
    const collector = new ControlledCollector({
      status: 200,
      finalUrl: CARD_URL,
      contentType: "text/html",
      body: `${await html()}<form id="captcha-form"><h1>Verify you are human</h1></form>`,
    });
    configureRuntimeEnv(approvedEnv);
    const runtime = createMarketplaceCardRuntime({ collector });
    const first = await runtime.execute({ task, observedAt: OBSERVED_AT });
    expect(first.status).toBe("blocked");
    expect(first.errorCode).toBe("AUTH_REQUIRED");

    const second = await runtime.execute({
      task: { ...task, task_id: "task_src_mkt_04_after_captcha" },
      observedAt: "2026-11-11T12:00:01.000Z",
    });
    expect(second.status).toBe("blocked");
    expect(second.errorCode).toBe("AUTH_REQUIRED");
    expect(collector.calls).toBe(1);
  });

  it("does not treat passive CAPTCHA strings in application code as a challenge", async () => {
    const collector = new ControlledCollector({
      status: 200,
      finalUrl: CARD_URL,
      contentType: "text/html",
      body: `${await html()}<script>window.uiLabels = ["captcha", "access denied"];</script>`,
    });
    const result = await execute(collector);
    expect(result.status, JSON.stringify(result.rawResult)).toBe("success");
    expect(collector.calls).toBe(1);
  });

  it("rejects fields outside the policy allowlist before collection", async () => {
    const collector = new ControlledCollector({
      status: 200,
      finalUrl: CARD_URL,
      contentType: "text/html",
      body: await html(),
    });
    configureRuntimeEnv(approvedEnv);
    const result = await createMarketplaceCardRuntime({ collector }).execute({
      task: { ...task, requested_fields: ["seller.name"] },
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

  it("uses trusted production mode even when execute carries a forged test field", async () => {
    const collector = new ControlledCollector({
      status: 200,
      finalUrl: CARD_URL,
      contentType: "text/html",
      body: await html(),
    });
    configureRuntimeEnv({
      ...approvedEnv,
      NODE_ENV: "production",
      REDS_APPLICATION_MODE: "demo",
    });
    expect(() => createMarketplaceCardRuntime({ collector })).toThrow(
      "MARKETPLACE_TEST_COLLECTOR_FORBIDDEN",
    );
    const runtime = createMarketplaceCardRuntime();
    const result = await runtime.execute({
      task,
      observedAt: OBSERVED_AT,
      environment: "test",
    } as Parameters<typeof runtime.execute>[0] & { environment: "test" });
    expect(result.status).toBe("blocked");
    expect(result.errorCode).toBe("POLICY_DENIED");
    expect(result.policyAudit.allowedMethod).toBeNull();
  });

  it("rate-limits subsequent requests for the same source", async () => {
    const collector = new ControlledCollector({
      status: 200,
      finalUrl: CARD_URL,
      contentType: "text/html",
      body: await html(),
    });
    configureRuntimeEnv(approvedEnv);
    const runtime = createMarketplaceCardRuntime({ collector });
    expect(
      (await runtime.execute({ task, observedAt: OBSERVED_AT })).status,
    ).toBe("success");
    const second = await runtime.execute({
      task: { ...task, task_id: "task_src_mkt_04_rate_limited" },
      observedAt: "2026-11-11T12:00:01.000Z",
    });
    expect(second.status).toBe("blocked");
    expect(second.errorCode).toBe("RATE_LIMITED");
    expect(collector.calls).toBe(1);
  });

  it.each([
    [403, "<html></html>", "AUTH_REQUIRED"],
    [429, "<html></html>", "RATE_LIMITED"],
    [200, "<html>captcha: verify you are human</html>", "AUTH_REQUIRED"],
  ] as const)(
    "stops later source attempts after terminal response %i",
    async (status, body, expectedCode) => {
      const collector = new ControlledCollector({
        status,
        finalUrl: CARD_URL,
        contentType: "text/html",
        body,
      });
      configureRuntimeEnv(approvedEnv);
      const runtime = createMarketplaceCardRuntime({ collector });
      const first = await runtime.execute({ task, observedAt: OBSERVED_AT });
      expect(first.errorCode).toBe(expectedCode);
      const second = await runtime.execute({
        task: { ...task, task_id: `task_src_mkt_04_stopped_${status}` },
        observedAt: "2026-11-11T12:00:01.000Z",
      });
      expect(second.status).toBe("blocked");
      expect(second.errorCode).toBe(expectedCode);
      expect(collector.calls).toBe(1);
    },
  );
});
