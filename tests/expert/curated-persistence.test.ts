import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { BuyerJourneyApplication } from "../../src/buyer-journey";
import { createPilotRuntimeConfig } from "../../src/pilot-hardening/config";
import { buildEisjsCandidate } from "../../src/pilot-hardening/eisjs-candidate";
import { createPostgresRepositories, migrateUp } from "../../src/persistence";
import {
  createTestDatabase,
  dropTestDatabase,
  isDatabaseAvailable,
  type TestDatabase,
} from "../persistence/helpers";
import {
  confirmParsedJourney,
  GOLDEN_RAW_REQUEST,
} from "../buyer-journey/helpers";

/**
 * TASK-023: expert requests must use one coherent application/runtime
 * boundary, the correct pilot dataset and durable persistence — proven here
 * against a real curated pilot object, not a synthetic fixture, since that
 * was the specific gap: a curated property was not a valid expert-context
 * property, and even when it was, the request-id generator restarted its
 * counter at 1 on every new process and collided with PostgreSQL rows an
 * earlier process had already persisted.
 */
const curatedCandidateId = "test_expert_persistence_fixture";

const curatedObject = buildEisjsCandidate({
  schema_version: "eisjs-candidate-input-v1",
  candidate_id: curatedCandidateId,
  source_url: "https://наш.дом.рф/test-expert-persistence-card",
  collected_at: "2026-08-15T00:00:00.000Z",
  external_object_id: "TEST-EXPERT-PERSISTENCE-0001",
  developer_name: "Тестовый застройщик (фикстура)",
  property_type: "apartment",
  address: {
    country_code: "RU",
    region: "Тестовая область",
    city: "Пилотск",
    locality: null,
    district: "Центральный",
    street: "Тестовая улица",
    house_number: "1",
    postal_code: null,
  },
  cadastral_number: "00:00:0000000:0002",
  total_area_m2: 58.1,
  floors_total: 12,
  rooms: 2,
  floor: 4,
  building_name: "Тестовый корпус",
  handover_quarter: {
    year: 2027,
    quarter: 2,
    as_published: "II квартал 2027 г.",
  },
}).candidate;

const curatedPropertyId = curatedObject.candidate.property.identity.property_id;

let curatedPilotDirectory: string;

beforeEach(() => {
  curatedPilotDirectory = mkdtempSync(
    path.join(tmpdir(), "curated-expert-persistence-"),
  );
  writeFileSync(
    path.join(curatedPilotDirectory, `${curatedCandidateId}.json`),
    JSON.stringify(curatedObject),
    "utf8",
  );
});

afterEach(() => {
  rmSync(curatedPilotDirectory, { recursive: true, force: true });
});

describe.skipIf(!isDatabaseAvailable)(
  "curated pilot expert request — PostgreSQL persistence",
  () => {
    let database: TestDatabase | undefined;

    // No fixed clock override here: PostgresJourneyInstrumentation derives
    // its audit-event id from the real wall-clock timestamp precisely so two
    // application instances never collide (see its own comment) — a fixed
    // clock would defeat that and is not how a real restarted process runs.
    const openApplication = (mode: "demo" | "pilot") =>
      new BuyerJourneyApplication({
        ...createPostgresRepositories(database!.pool),
        pilotRuntimeConfig: createPilotRuntimeConfig({ mode }),
        curatedPilotDirectory,
      });

    afterAll(async () => {
      await dropTestDatabase(database);
    });

    it("survives re-instantiation of the application/runtime", async () => {
      database = await createTestDatabase("test_expert_curated_persistence");
      await migrateUp(database.pool);

      const first = openApplication("pilot");
      const journey = await first.startBuyerJourney({
        sessionId: "session_expert_persistence",
        rawRequestText: GOLDEN_RAW_REQUEST,
      });
      await confirmParsedJourney(first, journey);
      const { bundle } = await first.runJourneyMatching(journey.journey_id);

      // Exit criteria: a real curated pilot property can be selected in the
      // normal buyer journey — it must actually be in the computed bundle,
      // not just present on disk.
      expect(
        bundle.entries.some((entry) => entry.property_id === curatedPropertyId),
      ).toBe(true);

      const created = await first.createJourneyExpertRequest(
        journey.journey_id,
        {
          requestType: "information_verification",
          triggerType: "financing_uncertainty",
          questionCategory: "financing",
          question:
            "Подтвердите применимость семейной ипотеки для этого объекта.",
          propertyIds: [curatedPropertyId],
          field: "financing.family_mortgage",
          questionCode: "check_family_mortgage_persistence",
        },
      );
      expect(created.status).toBe("queued");

      // A brand-new process would create a brand-new BuyerJourneyApplication
      // with no memory of the first — this is exactly that, minus the
      // process boundary itself, which PostgreSQL does not know about either
      // way.
      const second = openApplication("pilot");
      const restored = await second.expertRepository.get(created.request_id);
      expect(restored).not.toBeNull();
      expect(restored?.status).toBe("queued");
      expect(restored?.property_ids).toEqual([curatedPropertyId]);

      const context = await second.expertRepository.getContext(
        restored!.context_package_id,
      );
      expect(context?.properties[0]?.property_id).toBe(curatedPropertyId);

      // A fresh instance must not restart an in-memory id counter that then
      // collides with the row the first instance already persisted. Reuses
      // the journey the first instance already confirmed and matched — this
      // test is scoped to the expert-request id generator specifically, not
      // to the (separate, pre-existing) buyer-journey id generator that a
      // brand new startBuyerJourney call would also exercise.
      const secondCreated = await second.createJourneyExpertRequest(
        journey.journey_id,
        {
          requestType: "information_verification",
          triggerType: "financing_uncertainty",
          questionCategory: "financing",
          question:
            "Подтвердите применимость семейной ипотеки для этого объекта (второй инстанс).",
          propertyIds: [curatedPropertyId],
          field: "financing.family_mortgage",
          questionCode: "check_family_mortgage_second_instance",
        },
      );
      expect(secondCreated.request_id).not.toBe(created.request_id);
    });
  },
);

describe("curated pilot expert request — demo/pilot mode isolation", () => {
  it("refuses expert-context access to a real curated property in demo mode", async () => {
    const demo = new BuyerJourneyApplication({
      clock: () => "2026-08-15T00:00:00.000Z",
      pilotRuntimeConfig: createPilotRuntimeConfig({ mode: "demo" }),
      curatedPilotDirectory,
    });
    const journey = await demo.startBuyerJourney({
      sessionId: "session_demo_isolation",
      rawRequestText: GOLDEN_RAW_REQUEST,
    });
    await confirmParsedJourney(demo, journey);
    const { bundle } = await demo.runJourneyMatching(journey.journey_id);

    // The curated object must not even reach the demo-mode bundle.
    expect(
      bundle.entries.some((entry) => entry.property_id === curatedPropertyId),
    ).toBe(false);

    // And directly requesting expert context for it — bypassing the
    // shortlist UI — must still be refused, not silently accepted because
    // the object happens to exist on disk. It is rejected here for not
    // being in the demo-mode bundle at all, which is a stronger guarantee
    // than an access-policy check alone: the property was never eligible to
    // be selected on this journey in the first place.
    await expect(
      demo.createJourneyExpertRequest(journey.journey_id, {
        requestType: "information_verification",
        triggerType: "financing_uncertainty",
        questionCategory: "financing",
        question:
          "Подтвердите применимость семейной ипотеки для этого объекта.",
        propertyIds: [curatedPropertyId],
        field: "financing.family_mortgage",
        questionCode: "check_family_mortgage_demo_isolation",
      }),
    ).rejects.toThrow(/absent from the current MatchingBundle/);
  });

  it("grants expert-context access to the same real curated property in pilot mode", async () => {
    const pilot = new BuyerJourneyApplication({
      clock: () => "2026-08-15T00:00:00.000Z",
      pilotRuntimeConfig: createPilotRuntimeConfig({ mode: "pilot" }),
      curatedPilotDirectory,
    });
    const journey = await pilot.startBuyerJourney({
      sessionId: "session_pilot_isolation",
      rawRequestText: GOLDEN_RAW_REQUEST,
    });
    await confirmParsedJourney(pilot, journey);
    await pilot.runJourneyMatching(journey.journey_id);

    const created = await pilot.createJourneyExpertRequest(journey.journey_id, {
      requestType: "information_verification",
      triggerType: "financing_uncertainty",
      questionCategory: "financing",
      question: "Подтвердите применимость семейной ипотеки для этого объекта.",
      propertyIds: [curatedPropertyId],
      field: "financing.family_mortgage",
      questionCode: "check_family_mortgage_pilot_isolation",
    });
    expect(created.status).toBe("queued");
    expect(created.property_ids).toEqual([curatedPropertyId]);
  });
});
