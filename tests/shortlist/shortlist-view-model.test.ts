import { describe, expect, it } from "vitest";

import type { MatchResult } from "../../src/domain";
import {
  applyShortlistPolicy,
  buildShortlistItemView,
  buildShortlistView,
  SHORTLIST_POLICY_V1,
  type ShortlistCandidateInput,
} from "../../src/shortlist";
import { candidate, pilotAdapterResult, pilotRequest } from "./fixtures";

const withStatus = (
  source: ShortlistCandidateInput,
  status: MatchResult["eligibility_status"],
): ShortlistCandidateInput => ({
  ...source,
  match: {
    ...source.match,
    match_result: { ...source.match.match_result, eligibility_status: status },
  },
});

const withScore = (
  source: ShortlistCandidateInput,
  matchScore: number,
  dataConfidenceScore: number | null,
): ShortlistCandidateInput => ({
  ...source,
  match: {
    ...source.match,
    match_result: { ...source.match.match_result, match_score: matchScore },
  },
  dataQuality:
    dataConfidenceScore === null || source.dataQuality === null
      ? null
      : {
          ...source.dataQuality,
          data_quality: {
            ...source.dataQuality.data_quality,
            data_confidence_score: dataConfidenceScore,
          },
        },
});

describe("TASK-009 shortlist policy", () => {
  it("excludes hard_fail, matching-unavailable, and unavailable offers centrally", () => {
    const eligible = candidate("prop_nb_001");
    const hardFail = withStatus(candidate("prop_nb_002"), "hard_fail");
    const unavailable = withStatus(candidate("prop_nb_003"), "unavailable");
    const sold: ShortlistCandidateInput = {
      ...candidate("prop_nb_004"),
      offer: {
        ...candidate("prop_nb_004").offer!,
        availability: "sold",
      },
    };

    expect(
      applyShortlistPolicy(
        [eligible, hardFail, unavailable, sold],
        pilotRequest.result_limit,
      ).map((item) => item.property.identity.property_id),
    ).toEqual(["prop_nb_001"]);
  });

  it("includes eligible_with_unknowns and possible_match alongside eligible", () => {
    const possible = withStatus(candidate("prop_nb_001"), "possible_match");
    const unknowns = withStatus(
      candidate("prop_nb_002"),
      "eligible_with_unknowns",
    );
    const eligible = withStatus(candidate("prop_nb_003"), "eligible");

    expect(
      applyShortlistPolicy([possible, unknowns, eligible], 10)
        .map((item) => item.match.match_result.eligibility_status)
        .toSorted(),
    ).toEqual(["eligible", "eligible_with_unknowns", "possible_match"].sort());
  });

  it("orders by Match Score, then by Data Confidence as a tiebreaker — never by eligibility status or input order", () => {
    const base = candidate("prop_nb_001");
    // Same Match Score (100), different Data Confidence: the better-confirmed
    // one leads. This is the mechanism that keeps an object with a
    // confirmed city ahead of an otherwise identical one whose city isn't
    // confirmed — see src/shortlist/pilot-adapter.ts's matchesConfirmedScope
    // and src/geography — without this policy ever mentioning city.
    const betterConfirmed = withScore(
      {
        ...base,
        property: {
          ...base.property,
          identity: { ...base.property.identity, property_id: "prop_a" },
        },
      },
      100,
      80,
    );
    const lessConfirmed = withScore(
      {
        ...base,
        property: {
          ...base.property,
          identity: { ...base.property.identity, property_id: "prop_b" },
        },
      },
      100,
      20,
    );
    // Lower Match Score, even with perfect confidence, still sorts below
    // both of the above — Match Score always wins first.
    const lowerScore = withScore(
      {
        ...base,
        property: {
          ...base.property,
          identity: { ...base.property.identity, property_id: "prop_c" },
        },
      },
      50,
      100,
    );
    const noConfidenceResult = withScore(
      {
        ...base,
        property: {
          ...base.property,
          identity: { ...base.property.identity, property_id: "prop_d" },
        },
      },
      100,
      null,
    );

    expect(
      applyShortlistPolicy(
        [lowerScore, lessConfirmed, noConfidenceResult, betterConfirmed],
        10,
      ).map((item) => item.property.identity.property_id),
    ).toEqual(["prop_a", "prop_b", "prop_d", "prop_c"]);
    expect(SHORTLIST_POLICY_V1.ordering).toBe(
      "match_score_desc_then_data_confidence_desc",
    );
  });

  it("respects the user's five-result limit without padding failures", () => {
    const selected = applyShortlistPolicy(
      pilotAdapterResult.input.candidates,
      5,
    );
    expect(selected).toHaveLength(5);
    expect(selected.map((item) => item.property.identity.property_id)).toEqual([
      "prop_sec_001",
      "prop_nb_001",
      "prop_nb_003",
      "prop_sec_002",
      "prop_nb_004",
    ]);
  });
});

describe("TASK-009 shortlist view model", () => {
  it("shows pending confidence for partial data instead of inventing medium", () => {
    const source = candidate("prop_nb_003");
    const outcome = buildShortlistView({
      ...pilotAdapterResult.input,
      candidates: [{ ...source, dataQuality: null }],
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    expect(outcome.view.partial).toBe(true);
    expect(outcome.view.cards[0]?.confidence).toEqual({
      band: "pending",
      label: "Надёжность данных ещё не рассчитана",
    });
  });

  it("builds exact, price_from, old/new, unknown, and conflicting prices", () => {
    const source = candidate("prop_nb_003");
    expect(buildShortlistItemView(pilotRequest, source).price.kind).toBe(
      "exact",
    );

    const priceFrom: ShortlistCandidateInput = {
      ...source,
      offer: { ...source.offer!, price_from: true },
    };
    expect(buildShortlistItemView(pilotRequest, priceFrom).price).toMatchObject(
      { kind: "from", label: expect.stringMatching(/^от /) },
    );

    const evidenceTemplate = source.fieldEvidence[0]!;
    const oldNew: ShortlistCandidateInput = {
      ...source,
      fieldEvidence: [
        ...source.fieldEvidence,
        {
          ...evidenceTemplate,
          evidence_id: "evidence_shortlist_old_price",
          entity_type: "offer",
          entity_id: source.offer!.offer_id,
          field: "listing_price.old_price",
          value: { amount: "4900000.00", currency: "RUB" },
          raw_value: { amount: "4900000.00", currency: "RUB" },
          verification_status: "confirmed",
        },
      ],
    };
    expect(buildShortlistItemView(pilotRequest, oldNew).price).toMatchObject({
      kind: "old_new",
      previous: expect.stringContaining("4"),
    });

    const unknown: ShortlistCandidateInput = {
      ...source,
      offer: { ...source.offer!, listing_price: null },
    };
    expect(buildShortlistItemView(pilotRequest, unknown).price.kind).toBe(
      "unknown",
    );

    const qualityField = source.dataQuality!.field_results[0]!;
    const conflicting: ShortlistCandidateInput = {
      ...source,
      dataQuality: {
        ...source.dataQuality!,
        field_results: [
          {
            ...qualityField,
            field: "listing_price",
            conflict_status: "significant",
          },
        ],
      },
    };
    expect(
      buildShortlistItemView(pilotRequest, conflicting).price,
    ).toMatchObject({
      kind: "conflicting",
      label: "Цена требует уточнения",
      current: null,
    });
  });

  it("returns an empty primary shortlist instead of relaxing hard criteria", () => {
    const outcome = buildShortlistView({
      ...pilotAdapterResult.input,
      candidates: pilotAdapterResult.input.candidates.map((item) =>
        withStatus(item, "hard_fail"),
      ),
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    expect(outcome.view.cards).toEqual([]);
  });

  it("returns a controlled error for inconsistent references", () => {
    const source = candidate("prop_nb_003");
    const outcome = buildShortlistView({
      ...pilotAdapterResult.input,
      candidates: [
        {
          ...source,
          match: {
            ...source.match,
            match_result: {
              ...source.match.match_result,
              property_id: "prop_broken_reference",
            },
          },
        },
      ],
    });
    expect(outcome).toMatchObject({
      success: false,
      error: { code: "BROKEN_REFERENCE" },
    });
  });

  it("claims full certainty only when eligible — matchScore itself never changes", () => {
    const eligible = withStatus(candidate("prop_nb_003"), "eligible");
    const view = buildShortlistItemView(pilotRequest, eligible);
    expect(view.matchScore).toBe(eligible.match.match_result.match_score);
    expect(view.matchLabel).toBe(
      `${Math.round(eligible.match.match_result.match_score)}% подходит`,
    );
    expect(view.matchContext).toBe("Именно под ваши условия");
  });

  it.each(["eligible_with_unknowns", "possible_match"] as const)(
    "never claims '%s подходит' or 'Именно под ваши условия' when eligibility is %s — a hard criterion is unknown there, and unknown != confirmed",
    (status) => {
      const source = withStatus(candidate("prop_nb_003"), status);
      const view = buildShortlistItemView(pilotRequest, source);
      // Match Score the number is untouched — only the label/context text.
      expect(view.matchScore).toBe(source.match.match_result.match_score);
      expect(view.matchLabel).not.toContain("%");
      expect(view.matchLabel).not.toMatch(/подходит$/);
      expect(view.matchLabel).toBe("Подходит по известным данным");
      expect(view.matchContext).not.toBe("Именно под ваши условия");
      // What exactly is unconfirmed is shown separately, in criticalUnknowns
      // — the label/context only need to stop overclaiming, not repeat it.
      expect(view.matchContext).toMatch(/подтвержд/i);
    },
  );
});
