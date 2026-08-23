import { describe, expect, it } from "vitest";

import {
  BuyerJourneyApplication,
  BuyerJourneyError,
  InMemoryBuyerJourneyRepository,
  buildComparisonFromState,
  loadJourneyDataset,
} from "../../src/buyer-journey";
import { requestConfirmationResultSchema } from "../../src/request-confirmation";
import {
  completeFamilyMortgageResult,
  confirmParsedJourney,
  createGoldenJourney,
  GOLDEN_RAW_REQUEST,
  MutableJourneyClock,
} from "./helpers";

describe("buyer journey versions and recovery", () => {
  it("returns a controlled missing-context error for direct routes", () => {
    const application = new BuyerJourneyApplication();
    expect(() => application.getShortlist("missing_journey")).toThrowError(
      expect.objectContaining({ code: "MISSING_JOURNEY_CONTEXT" }),
    );
  });

  it("does not relax a strict request when no property is eligible", async () => {
    const clock = new MutableJourneyClock();
    const application = new BuyerJourneyApplication({ clock: clock.now });
    const journey = application.startBuyerJourney({
      sessionId: "session_strict",
      rawRequestText:
        "Найди 5 квартир в Туле до 100 тысяч. Семейная ипотека обязательна. Первый этаж не рассматриваю.",
    });
    await confirmParsedJourney(application, journey);
    const result = application.runJourneyMatching(journey.journey_id);
    expect(result.shortlist.cards).toHaveLength(0);
    expect(result.journey.shortlist_state.status).toBe("no_eligible");
  });

  it("marks old results and comparison stale after an explicit request edit", async () => {
    const { application, journey, confirmation, matching } =
      await createGoldenJourney();
    const oldBundleId = matching.bundle.matching_bundle_id;
    const oldComparison = application.createJourneyComparison(
      journey.journey_id,
      ["prop_nb_002", "prop_nb_003"],
    ).state;
    application.beginRequestEdit(journey.journey_id);
    const edited = structuredClone(confirmation);
    edited.confirmed_at = "2026-08-15T02:00:00.000Z";
    edited.confirmed_request.budget.purchase_price.maximum = {
      amount: "6000000.00",
      currency: "RUB",
    };
    const budgetCriterion = edited.confirmed_request.must_have.find(
      (criterion) => criterion.field === "budget.purchase_price.maximum",
    )!;
    budgetCriterion.target = {
      amount: "6000000.00",
      currency: "RUB",
    };
    application.confirmBuyerRequest(
      journey.journey_id,
      requestConfirmationResultSchema.parse(edited),
    );
    expect(application.repository.getMatchingBundle(oldBundleId)?.stale).toBe(
      true,
    );
    expect(
      application.repository.getComparison(oldComparison.comparison_id)?.status,
    ).toBe("recompute_required");
    expect(() => application.getJourneyComparison(journey.journey_id)).toThrow(
      BuyerJourneyError,
    );

    const recomputed = application.runJourneyMatching(journey.journey_id);
    expect(recomputed.bundle.user_request_version).toBe(2);
    expect(recomputed.bundle.matching_bundle_id).not.toBe(oldBundleId);
    expect(
      application.getJourneySnapshot(journey.journey_id).decision_update,
    ).toMatchObject({ trigger_type: "user_request_changed" });
    expect(() =>
      buildComparisonFromState({
        repository: application.repository,
        confirmed: application.getJourneySnapshot(journey.journey_id)
          .confirmed_request!,
        bundle: recomputed.bundle,
        comparison: oldComparison,
      }),
    ).toThrowError(expect.objectContaining({ code: "STALE_REQUEST_VERSION" }));
  });

  it("retains a completed expert result when affected recompute fails", async () => {
    class FailingRepository extends InMemoryBuyerJourneyRepository {
      failBundles = false;
      override saveMatchingBundle(
        bundle: Parameters<
          InMemoryBuyerJourneyRepository["saveMatchingBundle"]
        >[0],
      ): void {
        if (this.failBundles) throw new Error("FIXTURE_RECOMPUTE_FAILURE");
        super.saveMatchingBundle(bundle);
      }
    }
    const repository = new FailingRepository();
    const { application, clock, journey } = await createGoldenJourney({
      repository,
    });
    application.openJourneyProperty(journey.journey_id, "prop_nb_002");
    const request = application.createJourneyExpertRequest(journey.journey_id, {
      requestType: "information_verification",
      triggerType: "critical_unknown",
      questionCategory: "financing",
      question: "Подтвердите применимость семейной ипотеки для решения.",
      propertyIds: ["prop_nb_002"],
      field: "financing.program_type",
    });
    const work = await application.startJourneyExpertWork({
      journeyId: journey.journey_id,
      specialistRef: "specialist_recompute_failure",
    });
    repository.failBundles = true;
    clock.value = "2026-08-15T01:00:00.000Z";
    const outcome = await application.applyExpertResultToJourney(
      journey.journey_id,
      completeFamilyMortgageResult({
        requestId: request.request_id,
        specialistRef: "specialist_recompute_failure",
        specialistType: work.required_specialist,
      }),
    );
    expect(outcome.recomputeStatus).toBe("failed");
    expect(application.getJourney(journey.journey_id)).toMatchObject({
      current_stage: "expert_result",
      recoverable_error: "MATCH_RECOMPUTE_FAILED",
    });
    expect(
      application.expertRepository.getResult(request.request_id)
        ?.expert_result_id,
    ).toBe("expert_result_family_eligibility");
  });

  it("preserves an unable-to-verify result and does not invent a resolution", async () => {
    const { application, journey } = await createGoldenJourney();
    application.openJourneyProperty(journey.journey_id, "prop_nb_002");
    const request = application.createJourneyExpertRequest(journey.journey_id, {
      requestType: "information_verification",
      triggerType: "critical_unknown",
      questionCategory: "financing",
      question: "Проверьте применимость программы, если это возможно.",
      propertyIds: ["prop_nb_002"],
      field: "financing.program_type",
    });
    const work = await application.startJourneyExpertWork({
      journeyId: journey.journey_id,
      specialistRef: "specialist_unable",
    });
    const outcome = await application.applyExpertResultToJourney(
      journey.journey_id,
      {
        result_version: "expert-result-v1",
        expert_result_id: "expert_result_unable",
        request_id: request.request_id,
        status: "unable_to_verify",
        checked_items: [
          {
            item_id: "check_unable",
            subject: "Применимость программы",
            method: "Ручная проверка",
            outcome: "unable_to_verify",
            evidence_refs: [],
            note: "Недостаточно evidence.",
          },
        ],
        findings: [],
        confirmed: [],
        unconfirmed: [
          {
            entity_id: "prop_nb_002",
            field: "financing.program_type",
            outcome: "unable_to_verify",
            reason: "Недостаточно evidence.",
            evidence_refs: [],
          },
        ],
        conflicts: [],
        risks: [],
        recommendations: ["Сохранить поле как неизвестное."],
        next_actions: [],
        evidence_refs: [],
        evidence_candidates: [],
        specialist: {
          specialist_ref: "specialist_unable",
          specialist_type: work.required_specialist,
        },
        choice_assistance: null,
        disclaimer: null,
        completed_at: "2026-08-15T01:00:00.000Z",
      },
    );
    expect(outcome.recomputeStatus).toBe("not_required");
    expect(outcome.request.status).toBe("unable_to_complete");
    const snapshot = application.getJourneySnapshot(journey.journey_id);
    expect(snapshot.decision_update?.new_results).toEqual([]);
    expect(
      snapshot.matching_bundle?.entries.find(
        (entry) => entry.property_id === "prop_nb_002",
      )?.match.match_result.unknown_critical.length,
    ).toBeGreaterThan(0);
    expect(
      loadJourneyDataset(application.repository).sourceConflicts.find(
        (conflict) => conflict.conflict_id === "conflict_prop_nb_002_price",
      )?.status,
    ).toBe("open");
  });

  it("rejects invalid stage transitions", () => {
    const application = new BuyerJourneyApplication();
    const journey = application.startBuyerJourney({
      sessionId: "session_invalid_transition",
      rawRequestText: GOLDEN_RAW_REQUEST,
    });
    expect(() =>
      application.createJourneyComparison(journey.journey_id, ["a", "b"]),
    ).toThrowError(
      expect.objectContaining({ code: "MISSING_JOURNEY_CONTEXT" }),
    );
  });
});
