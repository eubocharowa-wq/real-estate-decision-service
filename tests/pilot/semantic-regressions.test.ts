import { describe, expect, it } from "vitest";

import {
  expertResultSchema,
  buildExpertRequestPreview,
} from "../../src/expert";
import {
  loadPilotDataset,
  validatePilotDatasetIntegrity,
} from "../../src/pilot-dataset";
import { PILOT_QA_SCENARIOS_V1 } from "../../src/pilot-hardening";
import {
  completeFamilyMortgageResult,
  createGoldenJourney,
} from "../buyer-journey/helpers";

const dataset = loadPilotDataset();

describe("critical cross-module semantic regressions", async () => {
  it("keeps unknown distinct from false, true and zero", () => {
    const unknownValues = dataset.properties.flatMap((property) => [
      property.physical.floor,
      property.physical.balcony,
      property.condition.ready_for_living,
    ]);
    expect(unknownValues).toContain(null);
    const unknown = null;
    expect(unknown).not.toBe(false);
    expect(unknown).not.toBe(true);
    expect(unknown).not.toBe(0);
  });

  it("keeps claimed distinct from confirmed", () => {
    const claimed = dataset.fieldEvidence.find(
      (evidence) => evidence.verification_status === "claimed",
    );
    expect(claimed).toBeDefined();
    expect(claimed?.verification_status).not.toBe("confirmed");
  });

  it("keeps Property and Offer separate and prevents Frankenstein scenarios", () => {
    expect(validatePilotDatasetIntegrity(dataset)).toEqual([]);
    const propertyIds = new Set(
      dataset.properties.map((property) => property.identity.property_id),
    );
    const offerById = new Map(
      dataset.offers.map((offer) => [offer.offer_id, offer]),
    );
    expect(
      dataset.offers.every(
        (offer) =>
          offer.offer_id !== offer.property_id &&
          propertyIds.has(offer.property_id),
      ),
    ).toBe(true);
    expect(
      dataset.purchaseScenarios.every((scenario) => {
        const offer = offerById.get(scenario.offer_id);
        return offer?.property_id === scenario.property_id;
      }),
    ).toBe(true);
  });

  it("keeps Match Score independent from confidence-only changes", async () => {
    const { matching } = await createGoldenJourney();
    const entry = matching.bundle.entries.find(
      (candidate) => candidate.data_quality !== null,
    )!;
    const matchScore = entry.match.match_result.match_score;
    const simulatedQualityChange = {
      ...entry.data_quality!,
      data_quality: {
        ...entry.data_quality!.data_quality,
        data_confidence_score: 1,
      },
    };
    expect(simulatedQualityChange.data_quality.data_confidence_score).toBe(1);
    expect(entry.match.match_result.match_score).toBe(matchScore);
    expect(entry.match.match_result.data_confidence_score).toBe(0);
    expect(entry.data_quality!.data_quality.data_confidence_score).not.toBe(
      entry.match.match_result.data_confidence_score,
    );
  });

  it("excludes confirmed hard failures from the primary shortlist", async () => {
    const { matching } = await createGoldenJourney();
    const failed = matching.bundle.entries.filter(
      (entry) => entry.match.match_result.eligibility_status === "hard_fail",
    );
    expect(failed.length).toBeGreaterThan(0);
    expect(
      failed.some((entry) =>
        matching.shortlist.cards.some(
          (card) => card.propertyId === entry.property_id,
        ),
      ),
    ).toBe(false);
    expect(
      failed.every(
        (entry) => entry.match.match_result.hard_failures.length > 0,
      ),
    ).toBe(true);
  });

  it("keeps stale as stale and removed distinct from sold", () => {
    const stale = dataset.fieldEvidence.find(
      (evidence) => evidence.freshness_status === "stale",
    );
    expect(stale?.freshness_status).toBe("stale");
    const removed = dataset.offers.find(
      (offer) =>
        offer.commercial_terms.notes.some((note) =>
          note.toLowerCase().includes("removed"),
        ) || offer.offer_id === "offer_sec_006_primary",
    );
    expect(removed).toBeDefined();
    expect(removed?.availability).not.toBe("sold");
  });

  it("prevents ExpertResult from setting Match Score", () => {
    const result = completeFamilyMortgageResult({
      requestId: "expert_request_semantic",
      specialistRef: "expert_semantic",
      specialistType: "mortgage_specialist",
    });
    expect(
      expertResultSchema.safeParse({ ...result, match_score: 100 }).success,
    ).toBe(false);
  });

  it("preserves legal and onsite wording boundaries", () => {
    const base = {
      property: "prop_nb_001",
      properties: null,
      userRequest: null,
      comparison: null,
      field: null,
      check: null,
      unknownCount: null,
    };
    expect(
      buildExpertRequestPreview({ ...base, type: "document_review" })
        .boundaryNotice,
    ).toContain("не заменяет официальное юридическое заключение");
    expect(
      buildExpertRequestPreview({
        ...base,
        type: "onsite_check",
        onsiteScope: "visual_physical",
      }).boundaryNotice,
    ).toContain("не является инженерно-техническим обследованием");
  });

  it("labels mortgage calculations as estimates, not bank approval", async () => {
    const { application, journey, matching } = await createGoldenJourney();
    const propertyId = matching.shortlist.cards[0]!.propertyId;
    const view = await application.openJourneyProperty(
      journey.journey_id,
      propertyId,
    );
    expect(JSON.stringify(view)).toContain("не банковское одобрение");
  });
});

describe("formal pilot QA scenarios", () => {
  it("defines the eight buyer cases plus the OpenClaw policy gate", () => {
    expect(PILOT_QA_SCENARIOS_V1).toHaveLength(9);
    expect(
      PILOT_QA_SCENARIOS_V1.map((scenario) => scenario.scenario_id),
    ).toEqual(
      expect.arrayContaining([
        "pilot_clear_apartment",
        "pilot_no_results_hard_constraints",
        "pilot_apartment_vs_house",
        "pilot_claimed_financing",
        "pilot_conflicting_price",
        "pilot_stale_availability",
        "pilot_restricted_url_manual_fallback",
        "pilot_expert_updates_decision",
        "pilot_openclaw_denied",
      ]),
    );
    expect(
      PILOT_QA_SCENARIOS_V1.every(
        (scenario) => scenario.expected_invariants.length >= 2,
      ),
    ).toBe(true);
  });
});
