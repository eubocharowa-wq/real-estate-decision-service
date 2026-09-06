import { describe, expect, it } from "vitest";

import {
  createSequentialBuyerJourneyIdFactory,
  loadJourneyDataset,
  runMatchingForConfirmedRequest,
} from "../../src/buyer-journey";
import {
  completeFamilyMortgageResult,
  createGoldenJourney,
  GOLDEN_RAW_REQUEST,
} from "./helpers";

describe("golden buyer journey", async () => {
  it("propagates one confirmed request through decision and expert recompute", async () => {
    const { application, clock, journey, confirmation, matching } =
      await createGoldenJourney();

    expect(
      (await application.getJourney(journey.journey_id)).raw_request_text,
    ).toBe(GOLDEN_RAW_REQUEST);
    expect(confirmation.confirmed_request.must_have).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "budget.purchase_price.maximum",
          priority: "must",
        }),
        expect.objectContaining({
          field: "financing.program_type",
          priority: "must",
          critical_if_unknown: true,
        }),
      ]),
    );
    expect(confirmation.confirmed_request.property_features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "property.floor.is_first",
          priority: "exclude",
        }),
      ]),
    );
    expect(matching.bundle.dataset_snapshot.dataset_type).toBe(
      "synthetic_pilot",
    );
    expect(matching.shortlist.cards).toHaveLength(5);
    const repeated = await runMatchingForConfirmedRequest({
      repository: application.repository,
      confirmed: (await application.getJourneySnapshot(journey.journey_id))
        .confirmed_request!,
      previousBundle: null,
      importedCandidateIds: [],
      generatedAt: matching.bundle.generated_at,
      createId: createSequentialBuyerJourneyIdFactory("determinism_check"),
    });
    expect(
      repeated.entries.map((entry) => [
        entry.property_id,
        entry.match.match_result.match_score,
      ]),
    ).toEqual(
      matching.bundle.entries.map((entry) => [
        entry.property_id,
        entry.match.match_result.match_score,
      ]),
    );

    const claimedBefore = matching.bundle.entries.find(
      (entry) => entry.property_id === "prop_nb_002",
    );
    expect(claimedBefore).toBeDefined();
    expect(claimedBefore!.match.match_result.match_score).toBe(100);
    expect(claimedBefore!.match.match_result.unknown_critical).toContain(
      confirmation.confirmed_request.must_have.find(
        (criterion) => criterion.field === "financing.program_type",
      )!.criterion_id,
    );
    expect(
      claimedBefore!.data_quality!.critical_unknowns.some(
        (unknown) => unknown.field === "financing.program_type",
      ),
    ).toBe(true);
    const familyCriterionId = confirmation.confirmed_request.must_have.find(
      (criterion) => criterion.field === "financing.program_type",
    )!.criterion_id;
    expect(
      claimedBefore!.match.match_result.criteria_results.find(
        (criterion) => criterion.criterion_id === familyCriterionId,
      ),
    ).toMatchObject({ status: "unknown" });

    const detail = await application.openJourneyProperty(
      journey.journey_id,
      "prop_nb_002",
    );
    expect(detail.selectedOfferId).toBe("offer_nb_002_primary");
    expect(detail.selectedScenarioId).toBe("scenario_nb_002_claimed");

    const comparison = await application.createJourneyComparison(
      journey.journey_id,
      ["prop_nb_002", "prop_nb_003"],
    );
    expect(comparison.state.user_request_version).toBe(1);
    expect(
      comparison.state.items.every(
        (item) =>
          item.matching_bundle_id === matching.bundle.matching_bundle_id,
      ),
    ).toBe(true);

    const expertRequest = await application.createJourneyExpertRequest(
      journey.journey_id,
      {
        requestType: "information_verification",
        triggerType: "critical_unknown",
        questionCategory: "financing",
        question: "Подтвердите применимость семейной ипотеки к этому объекту.",
        propertyIds: ["prop_nb_002"],
        field: "financing.program_type",
      },
    );
    const context = (await application.getJourneySnapshot(journey.journey_id))
      .expert!.context;
    expect(context.user_request_ref).toBe(
      confirmation.confirmed_request.user_request_id,
    );
    expect(context.decision_snapshot).toMatchObject({
      journey_id: journey.journey_id,
      user_request_version: 1,
      matching_bundle_id: matching.bundle.matching_bundle_id,
      comparison_id: comparison.state.comparison_id,
      comparison_version: 1,
    });
    expect(context.selected_offers[0]?.offer_id).toBe("offer_nb_002_primary");
    expect(context.selected_purchase_scenarios[0]?.scenario_id).toBe(
      "scenario_nb_002_claimed",
    );

    const work = await application.startJourneyExpertWork({
      journeyId: journey.journey_id,
      specialistRef: "specialist_mortgage_golden",
    });
    clock.value = "2026-08-15T01:00:00.000Z";
    const completion = await application.applyExpertResultToJourney(
      journey.journey_id,
      completeFamilyMortgageResult({
        requestId: expertRequest.request_id,
        specialistRef: "specialist_mortgage_golden",
        specialistType: work.required_specialist,
      }),
    );
    expect(completion.recomputeStatus).toBe("completed");

    const final = await application.getJourneySnapshot(journey.journey_id);
    expect(
      (await application.getJourney(journey.journey_id)).current_stage,
    ).toBe("updated_decision");
    expect(final.expert?.result?.expert_result_id).toBe(
      "expert_result_family_eligibility",
    );
    expect(final.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_id: "elig_nb_002_family",
          field: "eligibility_status",
          verification_status: "confirmed",
          evidence_type: "manual_expert",
        }),
      ]),
    );
    const before = final.decision_update!.previous_results[0]!;
    const after = final.decision_update!.new_results[0]!;
    expect(after.match_result_ref).not.toBe(before.match_result_ref);
    expect(after.data_quality_ref).not.toBe(before.data_quality_ref);
    expect(after.match_score).toBe(before.match_score);
    expect(after.data_confidence_score).toBeGreaterThan(
      before.data_confidence_score!,
    );
    expect(after.data_completeness_score).toBeGreaterThan(
      before.data_completeness_score!,
    );
    expect(final.decision_update!.resolved_unknowns).toContain(
      confirmation.confirmed_request.must_have.find(
        (criterion) => criterion.field === "financing.program_type",
      )!.criterion_id,
    );
    expect(final.decision_update!.unresolved_unknowns.length).toBeGreaterThan(
      0,
    );
    expect(
      final.matching_bundle!.entries.find(
        (entry) => entry.property_id === "prop_nb_003",
      ),
    ).toEqual(
      matching.bundle.entries.find(
        (entry) => entry.property_id === "prop_nb_003",
      ),
    );

    const dataset = await loadJourneyDataset(application.repository);
    for (const entry of final.matching_bundle!.entries) {
      const property =
        dataset.properties.find(
          (item) => item.identity.property_id === entry.property_id,
        ) ??
        final.imported_candidates.find(
          (item) =>
            item.propertyCandidate.identity.property_id === entry.property_id,
        )?.propertyCandidate;
      expect(property).toBeDefined();
      if (entry.selected_offer_id) {
        const offer =
          dataset.offers.find(
            (item) => item.offer_id === entry.selected_offer_id,
          ) ??
          final.imported_candidates.find(
            (item) => item.offerCandidate.offer_id === entry.selected_offer_id,
          )?.offerCandidate;
        expect(offer?.property_id).toBe(entry.property_id);
      }
      if (entry.selected_purchase_scenario_id) {
        const scenario = dataset.purchaseScenarios.find(
          (item) => item.scenario_id === entry.selected_purchase_scenario_id,
        );
        expect(scenario?.property_id).toBe(entry.property_id);
        expect(scenario?.offer_id).toBe(entry.selected_offer_id);
      }
    }

    const eventTypes = (
      await application.instrumentation.list(journey.journey_id)
    ).map((event) => event.event_type);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        "journey_started",
        "request_parsed",
        "request_confirmed",
        "matching_completed",
        "property_opened",
        "comparison_created",
        "expert_request_created",
        "expert_result_completed",
        "decision_recomputed",
      ]),
    );
    expect(
      (await application.instrumentation.list(journey.journey_id)).some(
        (event) => "raw_request_text" in event.metadata,
      ),
    ).toBe(false);
  });
});
