import { describe, expect, it } from "vitest";

import {
  DeterministicSourceDuplicateHook,
  createVneshstroiCollectionPipeline,
  type CanonicalState,
  type CollectionExecutionResult,
  type DuplicateHook,
} from "../../src/data-collection/source-adapters";
import {
  APPROVAL,
  FixtureHttpCollector,
  OBSERVED_AT,
  UNIT_URL,
  fixtureResponse,
  makeTask,
  readFixture,
} from "./helpers";

const execute = async ({
  html,
  observedAt = OBSERVED_AT,
  conditions = [APPROVAL],
  environment = "test",
  canonicalState,
  duplicateHook,
  task = makeTask(),
}: {
  readonly html: string;
  readonly observedAt?: string;
  readonly conditions?: readonly string[];
  readonly environment?: "development" | "test" | "pilot" | "production";
  readonly canonicalState?: CanonicalState;
  readonly duplicateHook?: DuplicateHook;
  readonly task?: ReturnType<typeof makeTask>;
}): Promise<{
  readonly result: CollectionExecutionResult;
  readonly collector: FixtureHttpCollector;
}> => {
  const collector = new FixtureHttpCollector(fixtureResponse(html));
  const pipeline = createVneshstroiCollectionPipeline({
    collector,
    duplicateHook,
  });
  const result = await pipeline.execute({
    task,
    environment,
    satisfiedConditions: conditions,
    observedAt,
    canonicalState,
  });
  return { result, collector };
};

const expectCandidate = (result: CollectionExecutionResult) => {
  expect(result.candidate).not.toBeNull();
  return result.candidate!;
};

describe("src_dev_02 policy-gated adapter pipeline", () => {
  it("runs the complete offline fixture pipeline into separated candidates", async () => {
    const html = await readFixture("vneshstroi-unit.html");
    const { result, collector } = await execute({ html });
    const candidate = expectCandidate(result);

    expect(collector.calls).toBe(1);
    expect(result.status).toBe("success");
    expect(result.policyAudit).toMatchObject({
      operation: "scheduled_collect",
      allowedMethod: "http",
      validatedTargetUrls: [UNIT_URL],
    });
    expect(result.policyAudit.reasonCodes).toContain("POLICY_ALLOWED");
    expect(result.rawResult.raw_payload_reference).toBeNull();
    expect(candidate).toMatchObject({
      persistence: "transient_only",
      snapshot: null,
      attribution: { label: "ВНЕШСТРОЙ", sourceUrl: UNIT_URL },
      duplicateDecision: { status: "new_property" },
      matchingReadiness: { ready: true, status: "ready" },
    });
    expect(candidate.propertyCandidate).toMatchObject({
      property_type: "apartment",
      market_type: "new_build",
      physical: { rooms: 2, floor: 7, total_area_m2: 54.2 },
      building: { name: "Синтетический квартал" },
      timeline: { handover_date: "2027-06-30" },
    });
    expect(candidate.offerCandidate).toMatchObject({
      property_id: candidate.propertyCandidate.identity.property_id,
      listing_price: { amount: "6420000", currency: "RUB" },
      price_from: false,
      availability: "available",
      verification_status: "claimed",
      source_reference: {
        source_id: "src_dev_02",
        source_url: UNIT_URL,
        snapshot_id: null,
      },
    });
    expect(candidate.propertyCandidate).not.toBe(candidate.offerCandidate);
    expect(candidate.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "listing_price",
          verification_status: "claimed",
          extraction_confidence: 0.97,
          snapshot_id: null,
          evidence_text: null,
        }),
        expect.objectContaining({
          field: "availability",
          verification_status: "claimed",
        }),
        expect.objectContaining({
          field: "timeline.handover_date",
          verification_status: "claimed",
        }),
      ]),
    );
    expect(
      candidate.evidence.some(
        (item) => item.verification_status === "confirmed",
      ),
    ).toBe(false);
    expect(result.log).toMatchObject({
      sourceId: "src_dev_02",
      method: "http",
      status: "success",
      recordsProcessed: 1,
      fieldsExtracted: 11,
      errorCode: null,
    });
    expect(result.metrics).toMatchObject({ attempts: 1, successes: 1 });
  });

  it("retains a partial candidate and explicit unknown availability", async () => {
    const html = await readFixture("vneshstroi-unit-partial.html");
    const { result } = await execute({ html });
    const candidate = expectCandidate(result);
    expect(result.status).toBe("partial");
    expect(candidate.offerCandidate.availability).toBe("unknown");
    expect(candidate.offerCandidate.availability).not.toBe(false);
    expect(candidate.matchingReadiness).toMatchObject({
      ready: true,
      status: "ready_with_unknowns",
    });
    expect(candidate.matchingReadiness.missingCriticalFields).toContain(
      "availability",
    );
    expect(
      candidate.evidence.find((item) => item.field === "availability"),
    ).toMatchObject({
      value: null,
      raw_value: null,
      verification_status: "unknown",
      extraction_confidence: null,
    });
  });

  it("keeps price-from as a lower bound and removed-like text as unknown", async () => {
    const html = await readFixture("vneshstroi-unit-price-from.html");
    const { result } = await execute({ html });
    const candidate = expectCandidate(result);
    expect(candidate.offerCandidate.listing_price).toEqual({
      amount: "6300000",
      currency: "RUB",
    });
    expect(candidate.offerCandidate.price_from).toBe(true);
    expect(candidate.offerCandidate.availability).toBe("unknown");
    expect(candidate.offerCandidate.availability).not.toBe("sold");
    expect(candidate.matchingReadiness.warnings).toContain(
      "Listing price is a lower bound, not an exact unit price.",
    );
  });

  it.each([
    ["missing approval", "test", []],
    ["pilot", "pilot", [APPROVAL]],
    ["production", "production", [APPROVAL]],
  ] as const)(
    "blocks before adapter invocation for %s",
    async (_case, environment, conditions) => {
      const html = await readFixture("vneshstroi-unit.html");
      const { result, collector } = await execute({
        html,
        environment,
        conditions,
      });
      expect(result).toMatchObject({
        status: "blocked",
        errorCode: "POLICY_DENIED",
        candidate: null,
        metrics: { attempts: 0 },
      });
      expect(result.rawResult.adapter_version).toBe("not-invoked");
      expect(collector.calls).toBe(0);
    },
  );

  it("blocks a catalog URL and a forbidden claim field before HTTP", async () => {
    const html = await readFixture("vneshstroi-unit.html");
    const catalog = await execute({
      html,
      task: makeTask({
        target_urls: ["https://vneshstroi.ru/kvartiry/"],
      }),
    });
    const forbidden = await execute({
      html,
      task: makeTask({
        requested_fields: [
          "identity.unit_id",
          "identity.property_type",
          "identity.market_type",
          "financing.family_mortgage",
        ],
      }),
    });
    expect(catalog.result.status).toBe("blocked");
    expect(catalog.collector.calls).toBe(0);
    expect(catalog.result.policyAudit.reasonCodes).toContain(
      "TARGET_URL_NOT_ALLOWED",
    );
    expect(forbidden.result.status).toBe("blocked");
    expect(forbidden.collector.calls).toBe(0);
    expect(forbidden.result.policyAudit.reasonCodes).toContain(
      "FIELD_NOT_ALLOWED",
    );
  });

  it("maps malformed normalized data to VALIDATION_FAILED", async () => {
    const html = (await readFixture("vneshstroi-unit.html")).replace(
      "6 420 000 ₽",
      "цена по запросу",
    );
    const { result } = await execute({ html });
    expect(result).toMatchObject({
      status: "failed",
      errorCode: "VALIDATION_FAILED",
      candidate: null,
    });
  });

  it("maps a critical structure change and keeps the candidate absent", async () => {
    const { result } = await execute({ html: "<html></html>" });
    expect(result).toMatchObject({
      status: "source_changed",
      errorCode: "SOURCE_CHANGED",
      candidate: null,
      metrics: { sourceChanged: 1 },
    });
  });

  it("uses stable source identity across repeat processing", async () => {
    const html = await readFixture("vneshstroi-unit.html");
    const first = expectCandidate((await execute({ html })).result);
    const second = expectCandidate(
      (
        await execute({
          html,
          observedAt: "2026-08-23T13:00:00.000Z",
        })
      ).result,
    );
    expect(second.propertyCandidate.identity.property_id).toBe(
      first.propertyCandidate.identity.property_id,
    );
    expect(second.offerCandidate.offer_id).toBe(first.offerCandidate.offer_id);
    expect(second.duplicateDecision.identityKey).toBe("src_dev_02:73124");
  });

  it("reuses a strongly matched Property and invokes the duplicate hook", async () => {
    const html = await readFixture("vneshstroi-unit.html");
    const first = expectCandidate((await execute({ html })).result);
    const existingProperty = {
      ...first.propertyCandidate,
      identity: {
        ...first.propertyCandidate.identity,
        property_id: "property_existing_73124",
      },
    };
    const delegate = new DeterministicSourceDuplicateHook();
    let calls = 0;
    const duplicateHook: DuplicateHook = {
      version: "spy-duplicate-hook-v1",
      evaluate(candidate, state) {
        calls += 1;
        return delegate.evaluate(candidate, state);
      },
    };
    const second = expectCandidate(
      (
        await execute({
          html,
          duplicateHook,
          canonicalState: {
            properties: [existingProperty],
            offers: [],
            evidence: first.evidence,
          },
        })
      ).result,
    );
    expect(calls).toBe(1);
    expect(second.duplicateDecision.status).toBe("reuse_property_new_offer");
    expect(second.propertyCandidate.identity.property_id).toBe(
      "property_existing_73124",
    );
    expect(second.offerCandidate.property_id).toBe("property_existing_73124");
  });

  it("creates SourceConflict for a changed canonical price", async () => {
    const html = await readFixture("vneshstroi-unit.html");
    const first = expectCandidate((await execute({ html })).result);
    const changedHtml = html.replace("6 420 000 ₽", "7 100 000 ₽");
    const oldAmount = first.offerCandidate.listing_price?.amount;
    const second = expectCandidate(
      (
        await execute({
          html: changedHtml,
          observedAt: "2026-08-23T13:00:00.000Z",
          canonicalState: {
            properties: [first.propertyCandidate],
            offers: [first.offerCandidate],
            evidence: first.evidence,
          },
        })
      ).result,
    );
    expect(second.duplicateDecision.status).toBe("reuse_property_update_offer");
    expect(second.conflicts).toEqual([
      expect.objectContaining({
        entity_id: first.offerCandidate.offer_id,
        field: "listing_price",
        status: "open",
        severity: "critical",
      }),
    ]);
    expect(second.conflicts[0].evidence_ids).toHaveLength(2);
    expect(first.offerCandidate.listing_price?.amount).toBe(oldAmount);
    expect(second.offerCandidate.listing_price?.amount).toBe("7100000");
    expect(second.warnings.join(" ")).toContain("require explicit resolution");
  });
});
