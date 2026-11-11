import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildCianStagingCandidate,
  CIAN_PROFILE,
  CIAN_SUPPORTED_FIELDS,
  CianCardError,
  createSourceCollectionPipeline,
  parseCianCardUrl,
  type CianStagingCandidate,
  type SourceAdapter,
} from "../../src/data-collection/source-adapters";
import { makeTask } from "./helpers";

/**
 * Offline only: every test reads a card the owner saved by hand into
 * data/examples/cian-fixtures. Nothing here reaches cian.ru.
 */
const FIXTURE_DIRECTORY = path.resolve(
  process.cwd(),
  "data/examples/cian-fixtures",
);
// The cards were saved on 10–11 November 2026 (see the fixtures README).
const COLLECTED_AT = "2026-11-10T00:00:00.000Z";

interface Card {
  readonly file: string;
  readonly url: string;
}

const NEW_BUILD: Card = {
  file: "cian-newbuilding-308625197.html",
  url: "https://tula.cian.ru/sale/flat/308625197/",
};
const SECONDARY: Card = {
  file: "cian-secondary-333509406.html",
  url: "https://tula.cian.ru/sale/flat/333509406/",
};
const HOUSE: Card = {
  file: "cian-house-327585364.html",
  url: "https://tula.cian.ru/sale/suburban/327585364/",
};
const ALL_CARDS = [NEW_BUILD, SECONDARY, HOUSE] as const;

const readCard = (card: Card): string =>
  readFileSync(path.join(FIXTURE_DIRECTORY, card.file), "utf8");

const candidateFor = (
  card: Card,
  html = readCard(card),
): CianStagingCandidate =>
  buildCianStagingCandidate({
    html,
    sourceUrl: card.url,
    collectedAt: COLLECTED_AT,
  });

const evidenceFor = (candidate: CianStagingCandidate, field: string) =>
  candidate.evidence.find((item) => item.field === field);

const errorCode = (run: () => unknown): string | null => {
  try {
    run();
  } catch (error) {
    return error instanceof CianCardError ? error.code : "NOT_A_CARD_ERROR";
  }
  return null;
};

describe("Cian card adapter: new-build flat", () => {
  const candidate = candidateFor(NEW_BUILD);

  it("extracts the exact facts of the card", () => {
    expect(candidate.facts).toEqual({
      listingId: "308625197",
      canonicalUrl: "https://tula.cian.ru/sale/flat/308625197/",
      category: "newBuildingFlatSale",
      propertyType: "apartment",
      marketType: "new_build",
      priceRub: "15700000",
      totalAreaM2: 78.5,
      rooms: 2,
      floor: 2,
      floorsTotal: 9,
      builtYear: null,
      materialType: null,
      landAreaSotka: null,
      address: {
        region: "Тульская область",
        city: "Тула",
        street: "переулок Шевченко",
        houseNumber: "5",
      },
      geoPoint: { latitude: 54.1673864487303, longitude: 37.6014522763336 },
      developmentName: "Традиции",
      developerName: "Совдел-Строй",
      handoverQuarter: { year: 2025, quarter: 4, isComplete: true },
    });
  });

  it("maps them onto a new-build apartment and its offer", () => {
    const { propertyCandidate: property, offerCandidate: offer } = candidate;
    expect(property.property_type).toBe("apartment");
    expect(property.market_type).toBe("new_build");
    expect(property.physical).toMatchObject({
      total_area_m2: 78.5,
      rooms: 2,
      floor: 2,
    });
    expect(property.building).toMatchObject({
      name: "Традиции",
      floors_total: 9,
      built_year: null,
    });
    expect(property.location.address).toEqual({
      country_code: null,
      region: "Тульская область",
      city: "Тула",
      locality: null,
      district: null,
      street: "переулок Шевченко",
      house_number: "5",
      postal_code: null,
    });
    expect(property.location.geo_point).toEqual({
      latitude: 54.1673864487303,
      longitude: 37.6014522763336,
    });
    expect(offer.listing_price).toEqual({
      amount: "15700000",
      currency: "RUB",
    });
    expect(offer.price_from).toBe(false);
  });

  it("carries the developer and the handover quarter as claims, never as a date", () => {
    expect(evidenceFor(candidate, "building.developer_name")).toMatchObject({
      value: "Совдел-Строй",
      verification_status: "claimed",
    });
    expect(evidenceFor(candidate, "timeline.handover_quarter")).toMatchObject({
      value: { quarter: "2025-Q4", is_complete: true },
      raw_value: { year: 2025, quarter: "fourth", isComplete: true },
      verification_status: "claimed",
    });
    expect(candidate.propertyCandidate.timeline).toEqual({
      planned_commissioning_date: null,
      handover_date: null,
      move_in_possible_date: null,
    });
  });

  it("leaves the build year unknown because the card does not state it", () => {
    expect(candidate.unresolvedFields).toEqual(["building.built_year"]);
    expect(evidenceFor(candidate, "building.built_year")).toMatchObject({
      value: null,
      verification_status: "unknown",
      extraction_confidence: null,
    });
  });
});

describe("Cian card adapter: secondary flat", () => {
  const candidate = candidateFor(SECONDARY);

  it("extracts the exact facts of the card", () => {
    expect(candidate.facts).toEqual({
      listingId: "333509406",
      canonicalUrl: "https://tula.cian.ru/sale/flat/333509406/",
      category: "flatSale",
      propertyType: "apartment",
      marketType: "secondary",
      priceRub: "7490000",
      totalAreaM2: 38,
      rooms: 1,
      floor: 1,
      floorsTotal: 10,
      builtYear: 2023,
      materialType: null,
      landAreaSotka: null,
      address: {
        region: "Тульская область",
        city: "Тула",
        street: "улица Купцов Гречихиных",
        houseNumber: "10",
      },
      geoPoint: { latitude: 54.247997, longitude: 37.596912 },
      developmentName: null,
      developerName: null,
      handoverQuarter: null,
    });
    expect(candidate.unresolvedFields).toEqual([]);
  });

  it("is a secondary-market apartment, unlike the new-build card", () => {
    const newBuild = candidateFor(NEW_BUILD);
    expect(candidate.propertyCandidate.property_type).toBe("apartment");
    expect(candidate.propertyCandidate.market_type).toBe("secondary");
    expect(newBuild.propertyCandidate.market_type).toBe("new_build");
    expect(candidate.propertyCandidate.building).toMatchObject({
      name: null,
      floors_total: 10,
      built_year: 2023,
    });
    expect(candidate.offerCandidate.listing_price).toEqual({
      amount: "7490000",
      currency: "RUB",
    });
    // New-build facts do not apply to a resale flat: they are not even asked.
    for (const field of [
      "identity.development_name",
      "building.developer_name",
      "timeline.handover_quarter",
    ]) {
      expect(evidenceFor(candidate, field)).toBeUndefined();
      expect(evidenceFor(newBuild, field)).toBeDefined();
    }
  });
});

describe("Cian card adapter: house", () => {
  const candidate = candidateFor(HOUSE);

  it("extracts the exact facts of the card", () => {
    expect(candidate.facts).toEqual({
      listingId: "327585364",
      canonicalUrl: "https://tula.cian.ru/sale/suburban/327585364/",
      category: "houseSale",
      propertyType: "house",
      marketType: "suburban",
      priceRub: "5600000",
      totalAreaM2: 80,
      rooms: null,
      floor: null,
      floorsTotal: 2,
      builtYear: 1998,
      materialType: "wood",
      landAreaSotka: 14,
      address: {
        region: "Тульская область",
        city: "Тула",
        street: "улица Малая Кулига",
        houseNumber: "15",
      },
      geoPoint: { latitude: 54.212277, longitude: 37.569683 },
      developmentName: null,
      developerName: null,
      handoverQuarter: null,
    });
  });

  it("is a house with a land plot, which the flats do not have", () => {
    const { propertyCandidate: property } = candidate;
    expect(property.property_type).toBe("house");
    expect(property.market_type).toBe("suburban");
    expect(property.land.area_sotka).toBe(14);
    expect(evidenceFor(candidate, "land.area_sotka")).toMatchObject({
      value: 14,
      raw_value: { area: "14.0", areaUnitType: "sotka" },
      verification_status: "claimed",
    });
    expect(evidenceFor(candidate, "building.material_type")).toMatchObject({
      value: "wood",
      verification_status: "claimed",
    });
    expect(property.building).toMatchObject({
      floors_total: 2,
      built_year: 1998,
    });
    for (const flat of [NEW_BUILD, SECONDARY]) {
      const flatCandidate = candidateFor(flat);
      expect(flatCandidate.propertyCandidate.land.area_sotka).toBeNull();
      expect(evidenceFor(flatCandidate, "land.area_sotka")).toBeUndefined();
    }
  });

  it("keeps what the card does not state unknown instead of filling it in", () => {
    expect(candidate.unresolvedFields).toEqual(["physical.rooms"]);
    expect(candidate.propertyCandidate.physical.rooms).toBeNull();
    expect(evidenceFor(candidate, "physical.rooms")).toMatchObject({
      value: null,
      verification_status: "unknown",
    });
    // A flat's floor is not a fact about a house at all.
    expect(candidate.propertyCandidate.physical.floor).toBeNull();
    expect(evidenceFor(candidate, "physical.floor")).toBeUndefined();
  });
});

describe("Cian card adapter: staging candidates", () => {
  it.each(ALL_CARDS)("marks every value of $file as claimed", (card) => {
    const candidate = candidateFor(card);
    expect(candidate.stage).toBe("staging");
    expect(candidate.persistence).toBe("transient_only");
    expect(candidate.sourceId).toBe("src_mkt_01");
    expect(candidate.attribution).toEqual({
      label: "ЦИАН",
      sourceUrl: card.url,
    });
    expect(candidate.evidence.length).toBeGreaterThan(0);
    for (const item of candidate.evidence) {
      expect(item.verification_status).toBe(
        item.value === null ? "unknown" : "claimed",
      );
      expect(item.source_id).toBe("src_mkt_01");
      expect(item.source_url).toBe(card.url);
      expect(item.collected_at).toBe(COLLECTED_AT);
      expect(item.evidence_text).toBeNull();
      expect(item.snapshot_id).toBeNull();
      expect(CIAN_SUPPORTED_FIELDS).toContain(item.field);
    }
    expect(candidate.offerCandidate.verification_status).toBe("claimed");
    expect(JSON.stringify(candidate)).not.toContain('"confirmed"');
  });

  it.each(ALL_CARDS)(
    "keeps the object and the offer of $file apart",
    (card) => {
      const { propertyCandidate, offerCandidate, evidence } =
        candidateFor(card);
      const propertyId = propertyCandidate.identity.property_id;
      expect(offerCandidate.offer_id).not.toBe(propertyId);
      expect(offerCandidate.property_id).toBe(propertyId);
      expect(offerCandidate.source_reference.source_url).toBe(card.url);
      // A listing ID names the offer; the physical identity stays unresolved.
      expect(propertyCandidate.identity.canonical_key).toBeNull();
      expect(propertyCandidate.identity.cadastral_number).toBeNull();
      expect(JSON.stringify(propertyCandidate)).not.toContain("listing_price");
      for (const item of evidence) {
        const offerFact =
          item.field === "listing_price" ||
          item.field === "identity.listing_id";
        expect(item.entity_type).toBe(offerFact ? "offer" : "property");
        expect(item.entity_id).toBe(
          offerFact ? offerCandidate.offer_id : propertyId,
        );
      }
      // Nothing the card does not publish as a fact is assumed about the offer.
      expect(offerCandidate.availability).toBe("unknown");
      expect(offerCandidate.published_at).toBeNull();
      expect(offerCandidate.financing_offer_ids).toEqual([]);
    },
  );

  it("leaves a missing price unknown rather than inventing one", () => {
    const html = readCard(SECONDARY).replaceAll('"priceTotalRur":7490000,', "");
    const candidate = candidateFor(SECONDARY, html);
    expect(candidate.offerCandidate.listing_price).toBeNull();
    expect(candidate.offerCandidate.price_from).toBeNull();
    expect(candidate.offerCandidate.verification_status).toBe("unknown");
    expect(candidate.unresolvedFields).toEqual(["listing_price"]);
    expect(evidenceFor(candidate, "listing_price")).toMatchObject({
      value: null,
      verification_status: "unknown",
    });
  });

  it("does not treat an unreadable value as a fact", () => {
    const html = readCard(HOUSE).replaceAll(
      '"areaUnitType":"sotka"',
      '"areaUnitType":"acre"',
    );
    const candidate = candidateFor(HOUSE, html);
    expect(candidate.propertyCandidate.land.area_sotka).toBeNull();
    expect(candidate.unresolvedFields).toContain("land.area_sotka");
    expect(candidate.warnings.join(" ")).toContain("land.area_sotka");
  });
});

describe("Cian card adapter: what it never extracts", () => {
  const keysOf = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.flatMap(keysOf)
      : value !== null && typeof value === "object"
        ? Object.entries(value).flatMap(([key, child]) => [
            key,
            ...keysOf(child),
          ])
        : [];

  it.each(ALL_CARDS)(
    "stores and emits no phone, listing text, photo or agent data from $file",
    (card) => {
      const html = readCard(card);
      const serialized = JSON.stringify(candidateFor(card));
      expect(html).not.toMatch(
        /phone|firstName|lastName|avatar|email|images\.cdn-cian|description/iu,
      );
      expect(serialized).not.toMatch(/cdn-cian|get-avatar|\.jpg|\.png/u);

      const keys = keysOf(JSON.parse(serialized));
      expect(
        keys.filter((key) =>
          /phone|photo|agent|avatar|email|^description$|^user/iu.test(key),
        ),
      ).toEqual([]);
    },
  );

  it.each(ALL_CARDS)("does not read who posted $file", (card) => {
    expect(candidateFor(card).offerCandidate.seller).toEqual({
      seller_type: "unknown",
      seller_id: null,
      name: null,
    });
  });
});

describe("Cian card adapter: card identity and URL", () => {
  it("accepts only a canonical card URL", () => {
    expect(parseCianCardUrl(NEW_BUILD.url)).toEqual({
      canonicalUrl: NEW_BUILD.url,
      listingId: "308625197",
      segment: "flat",
    });
    expect(parseCianCardUrl(HOUSE.url).segment).toBe("suburban");
    expect(parseCianCardUrl("https://www.cian.ru/sale/flat/1/").listingId).toBe(
      "1",
    );
  });

  it.each([
    "https://tula.cian.ru/sale/flat/308625197/?utm_source=x",
    "https://tula.cian.ru/sale/flat/308625197/?",
    "https://tula.cian.ru/sale/flat/308625197/#photos",
    "http://tula.cian.ru/sale/flat/308625197/",
    "https://tula.cian.ru/sale/flat/308625197",
    "https://tula.cian.ru/rent/flat/308625197/",
    "https://tula.cian.ru/cat.php?deal_type=sale",
    "https://tula.cian.ru/kupit-kvartiru/",
    "https://cian.ru.evil.example/sale/flat/308625197/",
    "https://user:secret@tula.cian.ru/sale/flat/308625197/",
    "not a url",
  ])("refuses %s", (url) => {
    expect(errorCode(() => parseCianCardUrl(url))).toBe("URL_NOT_CANONICAL");
    expect(
      errorCode(() =>
        buildCianStagingCandidate({
          html: readCard(NEW_BUILD),
          sourceUrl: url,
          collectedAt: COLLECTED_AT,
        }),
      ),
    ).toBe("URL_NOT_CANONICAL");
  });

  it("refuses a card that is not the listing the URL addresses", () => {
    expect(
      errorCode(() => candidateFor({ ...NEW_BUILD, url: SECONDARY.url })),
    ).toBe("IDENTITY_MISMATCH");
    expect(
      errorCode(() =>
        candidateFor({
          ...HOUSE,
          url: "https://tula.cian.ru/sale/flat/327585364/",
        }),
      ),
    ).toBe("IDENTITY_MISMATCH");
  });

  it("reports a changed page instead of guessing", () => {
    expect(errorCode(() => candidateFor(NEW_BUILD, ""))).toBe("SOURCE_CHANGED");
    expect(
      errorCode(() =>
        candidateFor(NEW_BUILD, "<html><body>Циан</body></html>"),
      ),
    ).toBe("SOURCE_CHANGED");
    expect(
      errorCode(() =>
        candidateFor(
          NEW_BUILD,
          readCard(NEW_BUILD).replaceAll('"key":"defaultState"', '"key":"x"'),
        ),
      ),
    ).toBe("SOURCE_CHANGED");
    expect(
      errorCode(() =>
        candidateFor(
          NEW_BUILD,
          readCard(NEW_BUILD).replaceAll(
            '"priceTotalRur":15700000',
            '"priceTotalRur":"15,7 млн"',
          ),
        ),
      ),
    ).toBe("SOURCE_CHANGED");
  });

  it("refuses a category it was not written for", () => {
    expect(
      errorCode(() =>
        candidateFor(
          SECONDARY,
          readCard(SECONDARY).replaceAll(
            '"category":"flatSale"',
            '"category":"flatRent"',
          ),
        ),
      ),
    ).toBe("UNSUPPORTED_CATEGORY");
  });
});

describe("Cian live collection", () => {
  it("limits a conditionally approved card fetch to development/test", () => {
    expect(CIAN_PROFILE.sourceId).toBe("src_mkt_01");
    expect(CIAN_PROFILE.collectionContract.environments).toEqual([
      "development",
      "test",
    ]);
    expect(CIAN_PROFILE.collectionContract.retention).toMatchObject({
      raw_content: "prohibited",
      raw_snapshots: "prohibited",
    });
  });

  it.each(["development", "test", "pilot", "production"] as const)(
    "is denied by policy in %s before any adapter runs",
    async (environment) => {
      const collect = vi.fn();
      const adapter: SourceAdapter = {
        sourceId: CIAN_PROFILE.sourceId,
        method: "http",
        version: "must-not-run",
        canHandle: () => true,
        collect,
      };
      const result = await createSourceCollectionPipeline({
        adapters: [adapter],
        profiles: [CIAN_PROFILE],
      }).execute({
        task: makeTask({
          task_id: "task_src_mkt_01_308625197",
          source_id: CIAN_PROFILE.sourceId,
          target_urls: [NEW_BUILD.url],
          requested_fields: [...CIAN_SUPPORTED_FIELDS],
        }),
        environment,
        satisfiedConditions: [],
        observedAt: COLLECTED_AT,
      });

      expect(result.status).toBe("blocked");
      expect(result.errorCode).toBe("POLICY_DENIED");
      expect(result.candidate).toBeNull();
      expect(result.policyAudit.allowedMethod).toBeNull();
      expect(collect).not.toHaveBeenCalled();
    },
  );

  it("does not turn test approvals into production permission", async () => {
    const collect = vi.fn();
    const adapter: SourceAdapter = {
      sourceId: CIAN_PROFILE.sourceId,
      method: "http",
      version: "must-not-run",
      canHandle: () => true,
      collect,
    };
    const result = await createSourceCollectionPipeline({
      adapters: [adapter],
      profiles: [CIAN_PROFILE],
    }).execute({
      task: makeTask({
        task_id: "task_src_mkt_01_production_denied",
        source_id: CIAN_PROFILE.sourceId,
        target_urls: [NEW_BUILD.url],
        requested_fields: [...CIAN_SUPPORTED_FIELDS],
      }),
      environment: "production",
      satisfiedConditions: [
        "CIAN_CARD_HTTP_ACCESS_APPROVED",
        "CIAN_NORMALIZED_DATA_USE_APPROVED",
      ],
      observedAt: COLLECTED_AT,
    });
    expect(result.status).toBe("blocked");
    expect(result.errorCode).toBe("POLICY_DENIED");
    expect(collect).not.toHaveBeenCalled();
  });
});
