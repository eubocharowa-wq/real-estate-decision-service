import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

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
 * labelling; the real dataset directory stays empty until someone enters real
 * cards through the tool.
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

const withCuratedDirectory = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), "curated-matching-"));
  writeFileSync(
    path.join(directory, `${curatedObject.candidate_id}.json`),
    JSON.stringify(curatedObject),
    "utf8",
  );
  return directory;
};

const pilotApplication = () =>
  new BuyerJourneyApplication({
    clock: () => "2026-08-15T00:00:00.000Z",
    pilotRuntimeConfig: createPilotRuntimeConfig({ mode: "pilot" }),
  });

afterEach(() => {
  vi.restoreAllMocks();
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
    const directory = withCuratedDirectory();
    // The store reads the configured directory; point it at this one.
    vi.spyOn(process, "cwd").mockReturnValue(path.dirname(directory));
    const curatedModule =
      await import("../../src/pilot-hardening/curated-dataset");
    vi.spyOn(curatedModule, "loadCuratedPilotDataset").mockReturnValue({
      configured: true,
      candidates: [curatedObject],
      errors: [],
    });

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
    expect(CURATED_PILOT_DIRECTORY).toContain("real-pilot");
  });
});
