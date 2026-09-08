import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BuyerJourneyApplication } from "../../src/buyer-journey";
import { createPilotRuntimeConfig } from "../../src/pilot-hardening/config";
import { buildEisjsCandidate } from "../../src/pilot-hardening/eisjs-candidate";
import { CURATED_PILOT_DIRECTORY } from "../../src/pilot-hardening/curated-dataset";
import {
  confirmParsedJourney,
  GOLDEN_RAW_REQUEST,
} from "../buyer-journey/helpers";

/**
 * The bug this covers: the dataset type could not describe real objects
 * entered by hand, so a pilot shortlist of real Tula objects was labelled
 * demonstration data.
 *
 * The object below is a deliberately synthetic stand-in used to exercise the
 * labelling. It is written into an isolated temporary directory injected via
 * `curatedPilotDirectory`, never into the real dataset at
 * `data/examples/real-pilot/candidates` — that directory holds real objects
 * entered through `pilot:candidate`, and this suite's outcome must not depend
 * on how many of them happen to exist when it runs.
 */
const curatedObject = buildEisjsCandidate({
  schema_version: "eisjs-candidate-input-v1",
  candidate_id: "test_matching_fixture",
  source_url: "https://наш.дом.рф/test-matching-card",
  collected_at: "2026-08-15T00:00:00.000Z",
  external_object_id: "TEST-MATCHING-0001",
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
  cadastral_number: "00:00:0000000:0001",
  total_area_m2: 62.4,
  floors_total: 17,
  rooms: 2,
  floor: 7,
  building_name: "Тестовый корпус",
  handover_quarter: {
    year: 2026,
    quarter: 4,
    as_published: "IV квартал 2026 г.",
  },
}).candidate;

let curatedPilotDirectory: string;

beforeEach(() => {
  curatedPilotDirectory = mkdtempSync(path.join(tmpdir(), "curated-matching-"));
});

afterEach(() => {
  rmSync(curatedPilotDirectory, { recursive: true, force: true });
});

const writeCuratedObject = (): void => {
  writeFileSync(
    path.join(curatedPilotDirectory, `${curatedObject.candidate_id}.json`),
    JSON.stringify(curatedObject),
    "utf8",
  );
};

const pilotApplication = () =>
  new BuyerJourneyApplication({
    clock: () => "2026-08-15T00:00:00.000Z",
    pilotRuntimeConfig: createPilotRuntimeConfig({ mode: "pilot" }),
    // Isolated per test by beforeEach/afterEach above — never the real
    // CURATED_PILOT_DIRECTORY on disk.
    curatedPilotDirectory,
  });

describe("dataset type for a curated pilot set", () => {
  it("labels an empty pilot as empty, not as demonstration data", async () => {
    const application = pilotApplication();
    const journey = await application.startBuyerJourney({
      sessionId: "session_curated_empty",
      rawRequestText: GOLDEN_RAW_REQUEST,
    });
    await confirmParsedJourney(application, journey);
    const matching = await application.runJourneyMatching(journey.journey_id);

    expect(matching.bundle.dataset_snapshot.dataset_type).toBe("empty_pilot");
  });

  it("names a curated set for what it is and says what the source omits", async () => {
    writeCuratedObject();

    const application = pilotApplication();
    const journey = await application.startBuyerJourney({
      sessionId: "session_curated",
      rawRequestText: GOLDEN_RAW_REQUEST,
    });
    await confirmParsedJourney(application, journey);
    const matching = await application.runJourneyMatching(journey.journey_id);

    expect(matching.bundle.dataset_snapshot.dataset_type).toBe(
      "manual_curated_pilot",
    );
    expect(
      matching.bundle.entries.every(
        (entry) => entry.origin === "manual_curated",
      ),
    ).toBe(true);
    const notice = matching.shortlist.datasetNotice ?? "";
    expect(notice).toContain("manual_curated_pilot");
    expect(notice).not.toContain("Демонстрационные данные");
    // The buyer is told which decisions this set cannot support.
    expect(notice).toContain("цена");
    // The production default is still the real, checked-in dataset — only
    // this suite's own runs are redirected away from it.
    expect(CURATED_PILOT_DIRECTORY).toContain("real-pilot");
  });
});
