import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  AVITO_PROFILE,
  AVITO_SUPPORTED_FIELDS,
  parseAvitoOfferCard,
} from "../../src/data-collection/source-adapters";

const FIXTURE_ROOT = new URL(
  "../../data/examples/avito-fixtures/",
  import.meta.url,
);

const CARDS = [
  {
    file: "avito-secondary-8437781969.html",
    url: "https://www.avito.ru/tula/kvartiry/2-k._kvartira_473_m_716_et._8437781969",
    expected: {
      category: "secondary_flat",
      listingId: "8437781969",
      priceRub: "9100000",
      totalAreaM2: 47.3,
      rooms: 2,
      floor: 7,
      floorsTotal: 16,
      materialType: "монолитный",
    },
  },
  {
    file: "avito-newbuilding-8083315215.html",
    url: "https://www.avito.ru/tula/kvartiry/2-k._kvartira_1019_m_17_et._8083315215",
    expected: {
      category: "new_build_flat",
      listingId: "8083315215",
      priceRub: "8710029",
      totalAreaM2: 101.9,
      rooms: 2,
      floor: 1,
      floorsTotal: 7,
      developmentName: "ЖК «Первый парковый»",
    },
  },
  {
    file: "avito-house-8093402924.html",
    url: "https://www.avito.ru/tula/doma_dachi_kottedzhi/dom_128_m_na_uchastke_8_sot._8093402924",
    expected: {
      category: "house",
      listingId: "8093402924",
      priceRub: "7680000",
      totalAreaM2: 128,
      rooms: 4,
      floorsTotal: 1,
      landAreaSotka: 8,
      materialType: "газоблоки",
    },
  },
] as const;

describe("Avito card parser", () => {
  it.each(CARDS)("extracts allow-listed facts from $file", async (card) => {
    const parsed = parseAvitoOfferCard({
      html: await readFile(new URL(card.file, FIXTURE_ROOT), "utf8"),
      sourceUrl: card.url,
    });
    expect(parsed.facts).toMatchObject(card.expected);
    expect(parsed.facts.canonicalUrl).toBe(card.url);
    expect(
      parsed.observations.every((item) =>
        AVITO_SUPPORTED_FIELDS.includes(item.field),
      ),
    ).toBe(true);
  });

  it("keeps missing facts unknown instead of inventing defaults", async () => {
    const parsed = parseAvitoOfferCard({
      html: await readFile(new URL(CARDS[2].file, FIXTURE_ROOT), "utf8"),
      sourceUrl: CARDS[2].url,
    });
    expect(parsed.facts.floor).toBeNull();
    expect(parsed.facts.builtYear).toBeNull();
    expect(parsed.facts.developmentName).toBeNull();
  });

  it("contains no seller, contact, media or listing-prose payload", async () => {
    const text = (
      await Promise.all(
        CARDS.map((card) => readFile(new URL(card.file, FIXTURE_ROOT), "utf8")),
      )
    ).join("\n");
    for (const forbidden of [
      /seller/iu,
      /phone/iu,
      /avatar/iu,
      /user_hash/iu,
      /description\s*:\s*"(?![0-9])/iu,
      /\.(?:jpg|jpeg|png)(?:\?|"|$)/iu,
    ])
      expect(text).not.toMatch(forbidden);
  });

  it("fails closed on identity mismatch or non-card URLs", async () => {
    const html = await readFile(new URL(CARDS[0].file, FIXTURE_ROOT), "utf8");
    expect(() =>
      parseAvitoOfferCard({
        html,
        sourceUrl: "https://www.avito.ru/tula/kvartiry/other-card_8437781970",
      }),
    ).toThrow(/does not describe/iu);
    expect(() =>
      parseAvitoOfferCard({
        html,
        sourceUrl: "https://www.avito.ru/tula/kvartiry?query=flat",
      }),
    ).toThrow(/canonical Avito property-card/iu);
  });

  it("declares only transient private staging retention", () => {
    expect(AVITO_PROFILE.collectionContract).toMatchObject({
      method: "http",
      environments: ["development", "test"],
      maximumTargetUrls: 1,
      retention: {
        normalized_facts: "transient_only",
        evidence_metadata: "transient_only",
        raw_content: "prohibited",
        raw_snapshots: "prohibited",
      },
    });
  });
});
