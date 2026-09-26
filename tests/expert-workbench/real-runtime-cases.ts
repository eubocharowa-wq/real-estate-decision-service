import { expect } from "vitest";

import { BuyerJourneyApplication } from "../../src/buyer-journey";
import {
  createRealExpertWorkbenchRuntime,
  type ExpertResultDraft,
  type ExpertWorkbenchActor,
} from "../../src/expert-workbench";
import { createPilotRuntimeConfig } from "../../src/pilot-hardening/config";
import type { RepositorySet } from "../../src/persistence";
import {
  confirmParsedJourney,
  GOLDEN_RAW_REQUEST,
} from "../buyer-journey/helpers";

const SESSION_ID = "session_real_expert_runtime";
const CHECKED_AT = "2026-09-20T10:00:00.000Z";
const ACTOR: Extract<ExpertWorkbenchActor, { actor_type: "expert" }> = {
  actor_type: "expert",
  actor_ref: "specialist_real_runtime",
  specialist_type: "real_estate_expert",
};

export interface RealExpertRuntimeFactory {
  open(): {
    readonly application: BuyerJourneyApplication;
    readonly repositories: RepositorySet;
  };
}

const verifiedPriceDraft = (
  draft: ExpertResultDraft,
  offerId: string,
): ExpertResultDraft => {
  const priceEvidenceId = "expert_candidate_verified_price";
  const statusEvidenceId = "expert_candidate_verified_offer_status";
  const evidenceRefs = [priceEvidenceId, statusEvidenceId];
  return {
    ...draft,
    check_items: draft.check_items.map((item) => ({
      ...item,
      status: "checked_confirmed",
      verification_method: "expert_analysis",
      evidence_refs: evidenceRefs,
      note: "Проверено вручную по сохранённому контексту теста.",
    })),
    confirmed: [
      {
        entity_id: offerId,
        field: "listing_price",
        value: { amount: "4525000.00", currency: "RUB" },
        evidence_refs: [priceEvidenceId],
      },
      {
        entity_id: offerId,
        field: "verification_status",
        value: "confirmed",
        evidence_refs: [statusEvidenceId],
      },
    ],
    recommendation: {
      statement: "Учитывать подтверждённую цену выбранного предложения.",
      conditions: [],
      related_property_ids: ["prop_nb_002"],
    },
    next_actions: ["recalculate_match"],
    evidence_candidates: [
      {
        evidence_candidate_id: priceEvidenceId,
        evidence_type: "manual_expert",
        entity_type: "offer",
        entity_id: offerId,
        field: "listing_price",
        value: { amount: "4525000.00", currency: "RUB" },
        verification_status: "confirmed",
        checked_at: CHECKED_AT,
        checked_by: ACTOR.actor_ref,
        method: "manual_offer_verification",
        supporting_reference: null,
        note: "Synthetic offline regression evidence.",
      },
      {
        evidence_candidate_id: statusEvidenceId,
        evidence_type: "manual_expert",
        entity_type: "offer",
        entity_id: offerId,
        field: "verification_status",
        value: "confirmed",
        verification_status: "confirmed",
        checked_at: CHECKED_AT,
        checked_by: ACTOR.actor_ref,
        method: "manual_offer_verification",
        supporting_reference: null,
        note: "Synthetic offline regression evidence.",
      },
    ],
    updated_at: CHECKED_AT,
  };
};

export const runRealExpertRuntimeGoldenFlow = async (
  factory: RealExpertRuntimeFactory,
) => {
  const first = factory.open();
  const journey = await first.application.startBuyerJourney({
    sessionId: SESSION_ID,
    rawRequestText: GOLDEN_RAW_REQUEST,
  });
  await confirmParsedJourney(first.application, journey);
  const matching = await first.application.runJourneyMatching(
    journey.journey_id,
  );
  await first.application.openJourneyProperty(
    journey.journey_id,
    "prop_nb_002",
  );
  const request = await first.application.createJourneyExpertRequest(
    journey.journey_id,
    {
      requestType: "information_verification",
      triggerType: "user_requested",
      questionCategory: "price",
      question: "Подтвердите цену выбранного предложения перед решением.",
      propertyIds: ["prop_nb_002"],
      field: "listing_price",
      questionCode: "verify_selected_offer_price",
    },
  );
  expect(request.status).toBe("queued");

  const second = factory.open();
  const workbench = createRealExpertWorkbenchRuntime({
    repositories: second.repositories,
    buyerApplication: second.application,
    actor: ACTOR,
  });
  const queue = await workbench.application.listActiveQueue(ACTOR);
  expect(queue.items.map((item) => item.request.request_id)).toContain(
    request.request_id,
  );
  await workbench.application.claimRequest(ACTOR, request.request_id);
  await workbench.application.transition({
    actor: ACTOR,
    requestId: request.request_id,
    status: "in_progress",
    reasonCode: "EXPERT_STARTED_WORK",
  });
  const input = await workbench.application.openWorkbench(
    ACTOR,
    request.request_id,
  );
  expect(input.contextPackage.decision_snapshot?.journey_id).toBe(
    journey.journey_id,
  );
  const offerId = input.expertRequest.offer_ids[0]!;
  await workbench.application.saveDraft({
    actor: ACTOR,
    requestId: request.request_id,
    draft: verifiedPriceDraft(input.currentResultDraft, offerId),
  });
  const completion = await workbench.application.complete({
    actor: ACTOR,
    requestId: request.request_id,
  });
  expect(completion.recomputeStatus).toBe("completed");

  await expect(
    workbench.application.openResultReview(
      {
        actor_type: "owner",
        actor_ref: "another_session",
        owner: { owner_type: "session", owner_id: "another_session" },
      },
      request.request_id,
    ),
  ).rejects.toThrow("EXPERT_RESULT_ACCESS_DENIED");

  const third = factory.open();
  const resultRuntime = createRealExpertWorkbenchRuntime({
    repositories: third.repositories,
    buyerApplication: third.application,
    actor: ACTOR,
  });
  const review = await resultRuntime.application.openResultReview(
    {
      actor_type: "owner",
      actor_ref: SESSION_ID,
      owner: { owner_type: "session", owner_id: SESSION_ID },
    },
    request.request_id,
  );
  expect(review.result?.request_id).toBe(request.request_id);
  expect(review.recompute.status).toBe("completed");

  const restoredJourney = await third.application.getJourney(
    journey.journey_id,
  );
  const restored = await third.application.getJourneySnapshot(
    journey.journey_id,
  );
  expect(restoredJourney.current_stage).toBe("updated_decision");
  expect(restored.expert?.result?.request_id).toBe(request.request_id);
  expect(restored.decision_update).toMatchObject({
    trigger_type: "expert_result",
    trigger_ref: review.result?.expert_result_id,
    status: "completed",
  });
  expect(restored.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entity_id: offerId,
        field: "listing_price",
        verification_status: "confirmed",
        evidence_type: "manual_expert",
      }),
    ]),
  );
  const before = restored.decision_update!.previous_results.find(
    (metric) => metric.property_id === "prop_nb_002",
  )!;
  const after = restored.decision_update!.new_results.find(
    (metric) => metric.property_id === "prop_nb_002",
  )!;
  expect(after.match_result_ref).not.toBe(before.match_result_ref);
  expect(after.data_quality_ref).not.toBe(before.data_quality_ref);
  expect(after.match_score).toBe(before.match_score);
  expect(after.data_confidence_score).toBeGreaterThanOrEqual(
    before.data_confidence_score!,
  );
  const affectedAfter = restored.matching_bundle!.entries.find(
    (entry) => entry.property_id === "prop_nb_002",
  )!;
  expect(after.critical_unknowns).toEqual(
    affectedAfter.match.match_result.unknown_critical,
  );
  expect(affectedAfter.data_quality?.critical_conflicts).toEqual(
    expect.any(Array),
  );
  expect(restored.decision_update!.new_conflicts).toEqual(expect.any(Array));
  expect(restored.decision_update!.resolved_conflicts).toEqual(
    expect.any(Array),
  );
  expect(affectedAfter.match.match_result.recommended_actions).toEqual(
    expect.any(Array),
  );
  expect(affectedAfter.data_quality?.recommended_checks).toEqual(
    expect.any(Array),
  );
  const unaffectedBefore = matching.bundle.entries.find(
    (entry) => entry.property_id === "prop_nb_003",
  );
  const unaffectedAfter = restored.matching_bundle!.entries.find(
    (entry) => entry.property_id === "prop_nb_003",
  );
  expect(unaffectedAfter).toEqual(unaffectedBefore);
  expect(
    (await third.repositories.expertRepository.listAudit(request.request_id))
      .map((event) => event.event_type)
      .filter((event) => event === "result_completed"),
  ).toHaveLength(1);
  expect(
    await third.repositories.draftRepository.get(request.request_id),
  ).not.toBeNull();
  return { journey, request, review, restored };
};

export const demoRuntimeConfig = createPilotRuntimeConfig({ mode: "demo" });
