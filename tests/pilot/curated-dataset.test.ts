import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildEisjsCandidate,
  EISJS_DEVELOPER_NAME_FIELD,
  EISJS_EXPLICIT_UNKNOWN_FIELDS,
  EISJS_FLOORS_TOTAL_FIELD,
  EISJS_HANDOVER_QUARTER_FIELD,
} from "../../src/pilot-hardening/eisjs-candidate";
import {
  buildCuratedPilotManifest,
  loadCuratedPilotDataset,
} from "../../src/pilot-hardening/curated-dataset";
import { validateRealPilotDatasetManifest } from "../../src/pilot-hardening/real-pilot-dataset";

/**
 * The entry form, exercised on a deliberately synthetic card.
 *
 * The values below are invented for this test and are labelled as such; no
 * real ЕИСЖС object is described here. What is under test is the shape and
 * the provenance rules, not the data.
 */
const INPUT = {
  schema_version: "eisjs-candidate-input-v1",
  candidate_id: "test_declaration_fixture",
  source_url: "https://наш.дом.рф/test-fixture-card",
  collected_at: "2026-09-08T10:00:00.000Z",
  external_object_id: "TEST-FIXTURE-0001",
  developer_name: "Тестовый застройщик (фикстура)",
  property_type: "apartment",
  address: {
    country_code: "RU",
    region: "Тестовая область",
    city: "Тестгород",
    locality: null,
    district: "Тестовый район",
    street: "Тестовая улица",
    house_number: "1",
    postal_code: null,
  },
  cadastral_number: "00:00:0000000:0000",
  total_area_m2: 4212.5,
  floors_total: 17,
  rooms: null,
  floor: null,
  building_name: "Тестовый корпус 1",
  handover_quarter: {
    year: 2026,
    quarter: 4,
    as_published: "IV квартал 2026 г.",
  },
} as const;

const built = buildEisjsCandidate(INPUT);

describe("ЕИСЖС data entry", () => {
  it("produces a candidate the pilot validator accepts", () => {
    const manifest = buildCuratedPilotManifest({
      candidates: [built.candidate],
      createdAt: INPUT.collected_at,
    });
    const validation = validateRealPilotDatasetManifest(manifest, {
      now: "2026-09-08T12:00:00.000Z",
    });

    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
    expect(validation.configured).toBe(true);
    expect(built.candidate.origin).toBe("manual_curated");
    expect(built.candidate.automated_fetch_performed).toBe(false);
    expect(built.candidate.collection_mode).toBe("manual_curated");
  });

  it("records every fact as a document with the card and the check date", () => {
    for (const evidence of built.candidate.candidate.evidence) {
      expect(evidence.evidence_type).toBe("document");
      expect(evidence.source_url).toBe(INPUT.source_url);
      expect(evidence.collected_at).toBe(INPUT.collected_at);
      expect(evidence.source_id).toBe("src_gov_01");
    }
  });

  it("confirms filed facts and only claims commitments about the future", () => {
    const status = (field: string) =>
      built.candidate.candidate.evidence.find((item) => item.field === field)
        ?.verification_status;

    // Filed under 214-ФЗ: what the object is.
    expect(status("physical.total_area_m2")).toBe("confirmed");
    expect(status("building.floors_total")).toBe("confirmed");
    expect(status("location.address.city")).toBe("confirmed");
    expect(status("identity.cadastral_number")).toBe("confirmed");
    // A promise about the future stays claimed however official the filing.
    expect(status(EISJS_HANDOVER_QUARTER_FIELD)).toBe("claimed");
    expect(status("building.name")).toBe("claimed");
    expect(built.confirmedFieldCount).toBeGreaterThan(0);
    expect(built.claimedFieldCount).toBeGreaterThan(0);
  });

  it("keeps the handover quarter as its own representation", () => {
    const quarter = built.candidate.candidate.evidence.find(
      (item) => item.field === EISJS_HANDOVER_QUARTER_FIELD,
    );

    expect(quarter?.value).toBe("2026-Q4");
    expect(quarter?.raw_value).toBe("IV квартал 2026 г.");
    // The date is never invented from the quarter.
    expect(
      built.candidate.candidate.property.timeline.handover_date,
    ).toBeNull();
    expect(built.candidate.explicit_unknown_fields).toContain(
      "property.timeline.handover_date",
    );
  });

  it("states what a declaration does not contain instead of leaving it absent", () => {
    expect(built.candidate.explicit_unknown_fields).toEqual([
      ...EISJS_EXPLICIT_UNKNOWN_FIELDS,
    ]);
    for (const field of [
      "offer.listing_price",
      "offer.availability",
      "financing.eligibility_status",
      "mobility.user_destination",
      "property.condition.finishing_type",
      "property.physical.balcony",
    ])
      expect(built.candidate.explicit_unknown_fields).toContain(field);

    const offer = built.candidate.candidate.offer;
    expect(offer.listing_price).toBeNull();
    expect(offer.availability).toBe("unknown");
    expect(offer.availability).not.toBe(false);
  });

  it("refuses an entry form that still holds template markers", () => {
    expect(() =>
      buildEisjsCandidate({
        ...INPUT,
        source_url: "ТРЕБУЕТСЯ: адрес карточки",
      }),
    ).toThrow();
  });

  it("accepts a card that names no developer, like an address with gaps", () => {
    const noDeveloper = buildEisjsCandidate({
      ...INPUT,
      candidate_id: "test_declaration_fixture_no_developer",
      developer_name: null,
    });

    expect(noDeveloper.candidate.candidate.offer.seller.name).toBeNull();
    expect(noDeveloper.candidate.candidate.offer.seller.seller_type).toBe(
      "developer",
    );
    expect(noDeveloper.candidate.explicit_unknown_fields).toContain(
      EISJS_DEVELOPER_NAME_FIELD,
    );
    expect(noDeveloper.candidate.explicit_unknown_fields).toEqual([
      ...EISJS_EXPLICIT_UNKNOWN_FIELDS,
      EISJS_DEVELOPER_NAME_FIELD,
    ]);

    const manifest = buildCuratedPilotManifest({
      candidates: [noDeveloper.candidate],
      createdAt: INPUT.collected_at,
    });
    const validation = validateRealPilotDatasetManifest(manifest, {
      now: "2026-09-08T12:00:00.000Z",
    });
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("does not add the developer-name gap when the card names one", () => {
    expect(built.candidate.explicit_unknown_fields).not.toContain(
      EISJS_DEVELOPER_NAME_FIELD,
    );
    expect(built.candidate.candidate.offer.seller.name).toBe(
      INPUT.developer_name,
    );
  });

  it("still refuses listing price or availability as input, whatever the card shows", () => {
    // buildEisjsCandidate takes `unknown`, so these extra keys are only
    // caught at runtime by the strict schema, not by the type checker.
    expect(() =>
      buildEisjsCandidate({
        ...INPUT,
        listing_price: 5_227_652,
        availability_status: "reserved",
      }),
    ).toThrow(/Unrecognized key/);
  });

  it("still refuses living or kitchen area as input, whatever the card shows", () => {
    expect(() =>
      buildEisjsCandidate({
        ...INPUT,
        living_area_m2: 10.52,
        kitchen_area_m2: 13.95,
      }),
    ).toThrow(/Unrecognized key/);
  });

  it("accepts a card that states no floor count for its own building", () => {
    const noFloorsTotal = buildEisjsCandidate({
      ...INPUT,
      candidate_id: "test_declaration_fixture_no_floors_total",
      floors_total: null,
    });

    expect(
      noFloorsTotal.candidate.candidate.property.building.floors_total,
    ).toBeNull();
    expect(noFloorsTotal.candidate.explicit_unknown_fields).toContain(
      EISJS_FLOORS_TOTAL_FIELD,
    );
    expect(
      noFloorsTotal.candidate.candidate.evidence.some(
        (item) => item.field === "building.floors_total",
      ),
    ).toBe(false);

    const manifest = buildCuratedPilotManifest({
      candidates: [noFloorsTotal.candidate],
      createdAt: INPUT.collected_at,
    });
    const validation = validateRealPilotDatasetManifest(manifest, {
      now: "2026-09-08T12:00:00.000Z",
    });
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("never borrows a floor count from a different card's building", () => {
    // Two units of the same building, one card stating the height and one
    // not: the second must not inherit the first's value or evidence.
    const withFloors = buildEisjsCandidate({
      ...INPUT,
      candidate_id: "test_declaration_fixture_sibling_a",
    });
    const withoutFloors = buildEisjsCandidate({
      ...INPUT,
      candidate_id: "test_declaration_fixture_sibling_b",
      external_object_id: "TEST-FIXTURE-0002",
      floors_total: null,
    });

    expect(withFloors.candidate.candidate.property.building.floors_total).toBe(
      INPUT.floors_total,
    );
    expect(
      withoutFloors.candidate.candidate.property.building.floors_total,
    ).toBeNull();
    expect(withoutFloors.candidate.explicit_unknown_fields).toContain(
      EISJS_FLOORS_TOTAL_FIELD,
    );
  });

  it("does not add the floor-count gap when the card states one", () => {
    expect(built.candidate.explicit_unknown_fields).not.toContain(
      EISJS_FLOORS_TOTAL_FIELD,
    );
  });
});

describe("curated dataset store", () => {
  it("is simply not configured while nothing has been entered", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "curated-empty-"));

    expect(loadCuratedPilotDataset(empty)).toEqual({
      configured: false,
      candidates: [],
      errors: [],
    });
  });

  it("loads what the tool wrote", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "curated-"));
    writeFileSync(
      path.join(directory, `${built.candidate.candidate_id}.json`),
      JSON.stringify(built.candidate),
      "utf8",
    );

    const dataset = loadCuratedPilotDataset(directory, {
      now: "2026-09-08T12:00:00.000Z",
    });
    expect(dataset.configured).toBe(true);
    expect(dataset.candidates).toHaveLength(1);
  });

  it("trusts nothing from a directory holding an invalid object", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "curated-bad-"));
    writeFileSync(
      path.join(directory, "good.json"),
      JSON.stringify(built.candidate),
      "utf8",
    );
    writeFileSync(
      path.join(directory, "bad.json"),
      JSON.stringify({
        ...built.candidate,
        candidate_id: "candidate_broken",
        explicit_unknown_fields: [],
      }),
      "utf8",
    );

    const dataset = loadCuratedPilotDataset(directory, {
      now: "2026-09-08T12:00:00.000Z",
    });
    // A pilot must not run on a set where one object's provenance failed.
    expect(dataset.configured).toBe(false);
    expect(dataset.candidates).toEqual([]);
    expect(dataset.errors.length).toBeGreaterThan(0);
  });
});
