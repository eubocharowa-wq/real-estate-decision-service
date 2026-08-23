import { describe, expect, it } from "vitest";

import {
  HttpTransportError,
  VneshstroiHttpAdapter,
  rawCollectionResultSchema,
  validateRawCollectionResult,
} from "../../src/data-collection/source-adapters";
import { sourcePolicyEngine } from "../../src/data-collection/source-registry";
import {
  APPROVAL,
  FixtureHttpCollector,
  OBSERVED_AT,
  REQUESTED_FIELDS,
  UNIT_URL,
  fixtureResponse,
  makeTask,
  readFixture,
} from "./helpers";

const plan = () =>
  sourcePolicyEngine.resolveCollectionPlan({
    sourceId: "src_dev_02",
    operation: "scheduled_collect",
    environment: "test",
    entityType: "offer",
    requestedMethod: "http",
    targetUrls: [UNIT_URL],
    requestedFields: REQUESTED_FIELDS,
    discovery: false,
    followLinks: false,
    pagination: false,
    sitemap: false,
    authentication: false,
    challengeAction: "stop",
    satisfiedConditions: [APPROVAL],
    decidedAt: OBSERVED_AT,
  });

const collect = async (
  body: string,
  responseOverrides: Partial<
    import("../../src/data-collection/source-adapters").HttpCollectionResponse
  > = {},
) => {
  const collector = new FixtureHttpCollector(
    fixtureResponse(body, responseOverrides),
  );
  const adapter = new VneshstroiHttpAdapter(collector);
  const task = makeTask();
  const result = await adapter.collect(task, {
    collectionRunId: "collection_run_unit_test",
    observedAt: OBSERVED_AT,
    plan: plan(),
  });
  return { adapter, collector, result, task };
};

describe("VneshstroiHttpAdapter", () => {
  it("extracts the approved factual field scope and no raw HTML reference", async () => {
    const html = await readFixture("vneshstroi-unit.html");
    const { result } = await collect(html);
    expect(result.status).toBe("success");
    expect(result.external_record_id).toBe("73124");
    expect(result.raw_payload_reference).toBeNull();
    expect(result.extracted_fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "identity.unit_id",
          raw_value: "73124",
        }),
        expect.objectContaining({
          field: "physical.rooms",
          raw_value: "2-комн.",
        }),
        expect.objectContaining({
          field: "physical.total_area_m2",
          raw_value: "54,2 м²",
        }),
        expect.objectContaining({
          field: "physical.floor",
          raw_value: "7 этаж",
        }),
        expect.objectContaining({
          field: "listing_price",
          raw_value: "6 420 000 ₽",
          semantics: "source_claim",
        }),
        expect.objectContaining({
          field: "availability",
          raw_value: "В продаже",
        }),
        expect.objectContaining({
          field: "timeline.handover_date",
          raw_value: "2027-06-30",
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("<!doctype html>");
  });

  it("preserves an explicit lower-bound price semantic", async () => {
    const html = await readFixture("vneshstroi-unit-price-from.html");
    const { result } = await collect(html);
    expect(
      result.extracted_fields.find((item) => item.field === "listing_price"),
    ).toMatchObject({ semantics: "lower_bound", raw_value: "от 6 300 000 ₽" });
  });

  it("refuses a task for another source", async () => {
    const html = await readFixture("vneshstroi-unit.html");
    const adapter = new VneshstroiHttpAdapter(
      new FixtureHttpCollector(fixtureResponse(html)),
    );
    expect(adapter.canHandle(makeTask({ source_id: "src_dev_03" }))).toBe(
      false,
    );
  });

  it.each([
    ["empty page", ""],
    ["missing unit marker", "<html><body>unit</body></html>"],
    [
      "missing payload",
      '<html><main data-vneshstroi-page="unit"></main></html>',
    ],
  ])("maps %s to SOURCE_CHANGED", async (_case, body) => {
    const { result } = await collect(body);
    expect(result).toMatchObject({
      status: "source_changed",
      error_code: "SOURCE_CHANGED",
    });
  });

  it("lets validation reject a malformed price instead of guessing", async () => {
    const html = (await readFixture("vneshstroi-unit.html")).replace(
      "6 420 000 ₽",
      "цена по запросу",
    );
    const { result, task } = await collect(html);
    expect(result.status).toBe("success");
    expect(validateRawCollectionResult(result, task)).toMatchObject({
      success: false,
    });
  });

  it("maps timeout without retrying", async () => {
    const collector = new FixtureHttpCollector(async () => {
      throw new HttpTransportError("TIMEOUT", "synthetic timeout");
    });
    const adapter = new VneshstroiHttpAdapter(collector);
    const result = await adapter.collect(makeTask(), {
      collectionRunId: "collection_run_timeout",
      observedAt: OBSERVED_AT,
      plan: plan(),
    });
    expect(result).toMatchObject({ status: "failed", error_code: "TIMEOUT" });
    expect(collector.calls).toBe(1);
  });

  it("stops on challenge content and never attempts a bypass", async () => {
    const { result } = await collect(
      "<html><body>Verify you are human CAPTCHA</body></html>",
    );
    expect(result).toMatchObject({
      status: "blocked",
      error_code: "AUTH_REQUIRED",
    });
  });

  it("rejects unexpected content type and a changed final URL", async () => {
    const html = await readFixture("vneshstroi-unit.html");
    const content = await collect(html, { contentType: "application/pdf" });
    const redirect = await collect(html, {
      finalUrl: "https://vneshstroi.ru/kvartiry/99999/",
    });
    expect(content.result.error_code).toBe("UNEXPECTED_CONTENT_TYPE");
    expect(redirect.result.error_code).toBe("FETCH_FAILED");
  });

  it("treats an unavailable page as unknown, never as sold", async () => {
    const { result } = await collect("", { status: 404 });
    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain('"sold"');
  });

  it("rejects any attempt to add raw HTML to the strict raw contract", async () => {
    const html = await readFixture("vneshstroi-unit.html");
    const { result } = await collect(html);
    expect(
      rawCollectionResultSchema.safeParse({ ...result, raw_html: html })
        .success,
    ).toBe(false);
  });
});
