import { describe, expect, it } from "vitest";

import { BuyerJourneyApplication } from "../../src/buyer-journey";
import { fieldEvidenceSchema } from "../../src/domain";
import {
  EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH,
  EXPERT_EVIDENCE_ENTITY_OUTSIDE_CONTEXT,
  EXPERT_EVIDENCE_FIELD_OUTSIDE_CONTEXT,
  EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH,
} from "../../src/expert";
import {
  buildFinalExpertResult,
  createRealExpertWorkbenchRuntime,
  type ExpertResultDraft,
  type ExpertWorkbenchActor,
} from "../../src/expert-workbench";
import { createPilotRuntimeConfig } from "../../src/pilot-hardening/config";
import { createInMemoryRepositorySet } from "../../src/persistence";
import {
  confirmParsedJourney,
  GOLDEN_RAW_REQUEST,
} from "../buyer-journey/helpers";

const NOW = "2026-09-20T10:00:00.000Z";
const ACTOR: Extract<ExpertWorkbenchActor, { actor_type: "expert" }> = {
  actor_type: "expert",
  actor_ref: "specialist_evidence_integrity",
  specialist_type: "real_estate_expert",
};
const PRICE = { amount: "4525000.00", currency: "RUB" };

const setup = async () => {
  const repositories = createInMemoryRepositorySet();
  const application = new BuyerJourneyApplication({
    repository: repositories.repository,
    expertRepository: repositories.expertRepository,
    instrumentation: repositories.instrumentation,
    feedbackRepository: repositories.feedbackRepository,
    errorRepository: repositories.errorRepository,
    pilotRuntimeConfig: createPilotRuntimeConfig({ mode: "demo" }),
    clock: () => NOW,
  });
  const journey = await application.startBuyerJourney({
    sessionId: "session_evidence_integrity",
    rawRequestText: GOLDEN_RAW_REQUEST,
  });
  await confirmParsedJourney(application, journey);
  await application.runJourneyMatching(journey.journey_id);
  await application.openJourneyProperty(journey.journey_id, "prop_nb_002");
  const request = await application.createJourneyExpertRequest(
    journey.journey_id,
    {
      requestType: "information_verification",
      triggerType: "user_requested",
      questionCategory: "price",
      question: "Подтвердите цену выбранного предложения.",
      propertyIds: ["prop_nb_002"],
      field: "listing_price",
      questionCode: "verify_selected_offer_price_integrity",
    },
  );
  const runtime = createRealExpertWorkbenchRuntime({
    repositories,
    buyerApplication: application,
    actor: ACTOR,
    clock: () => NOW,
  });
  await runtime.application.claimRequest(ACTOR, request.request_id);
  await runtime.application.transition({
    actor: ACTOR,
    requestId: request.request_id,
    status: "in_progress",
    reasonCode: "EVIDENCE_INTEGRITY_TEST_STARTED",
  });
  const input = await runtime.application.openWorkbench(
    ACTOR,
    request.request_id,
  );
  return {
    application,
    repositories,
    runtime,
    journeyId: journey.journey_id,
    request: input.expertRequest,
    context: input.contextPackage,
    draft: input.currentResultDraft,
    propertyId: input.expertRequest.property_ids[0]!,
    offerId: input.expertRequest.offer_ids[0]!,
    scenarioId: input.expertRequest.purchase_scenario_ids[0]!,
  };
};

const priceDraft = (
  draft: ExpertResultDraft,
  offerId: string,
  overrides: Partial<ExpertResultDraft["evidence_candidates"][number]> = {},
): ExpertResultDraft => {
  const evidenceCandidate = {
    evidence_candidate_id: "candidate_price_integrity",
    evidence_type: "manual_expert" as const,
    entity_type: "offer",
    entity_id: offerId,
    field: "listing_price",
    value: PRICE,
    verification_status: "confirmed" as const,
    checked_at: NOW,
    checked_by: ACTOR.actor_ref,
    method: "manual_offer_verification",
    supporting_reference: null,
    note: "Synthetic offline integrity evidence.",
    ...overrides,
  };
  return {
    ...draft,
    check_items: draft.check_items.map((item) => ({
      ...item,
      status: "checked_confirmed" as const,
      verification_method: "expert_analysis" as const,
      evidence_refs: [evidenceCandidate.evidence_candidate_id],
    })),
    confirmed: [
      {
        entity_id: offerId,
        field: "listing_price",
        value: PRICE,
        evidence_refs: [evidenceCandidate.evidence_candidate_id],
      },
    ],
    evidence_candidates: [evidenceCandidate],
    updated_at: NOW,
  };
};

describe("TASK-025A expert evidence integrity", () => {
  it.each(["claimed", "unconfirmed"] as const)(
    "rejects a confirmed fact backed by %s evidence",
    async (verificationStatus) => {
      const fixture = await setup();
      await expect(
        fixture.runtime.application.saveDraft({
          actor: ACTOR,
          requestId: fixture.request.request_id,
          draft: priceDraft(fixture.draft, fixture.offerId, {
            verification_status: verificationStatus,
          }),
        }),
      ).rejects.toThrow(EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH);
    },
  );

  it("rejects cross-entity evidence substitution", async () => {
    const fixture = await setup();
    await expect(
      fixture.runtime.application.saveDraft({
        actor: ACTOR,
        requestId: fixture.request.request_id,
        draft: priceDraft(fixture.draft, fixture.offerId, {
          entity_type: "property",
          entity_id: fixture.propertyId,
        }),
      }),
    ).rejects.toThrow(EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH);
  });

  it("rejects cross-field evidence substitution", async () => {
    const fixture = await setup();
    await expect(
      fixture.runtime.application.saveDraft({
        actor: ACTOR,
        requestId: fixture.request.request_id,
        draft: priceDraft(fixture.draft, fixture.offerId, {
          field: "availability",
        }),
      }),
    ).rejects.toThrow(EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH);
  });

  it("rejects cross-value evidence substitution", async () => {
    const fixture = await setup();
    await expect(
      fixture.runtime.application.saveDraft({
        actor: ACTOR,
        requestId: fixture.request.request_id,
        draft: priceDraft(fixture.draft, fixture.offerId, {
          value: { amount: "4525001.00", currency: "RUB" },
        }),
      }),
    ).rejects.toThrow(EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH);
  });

  it.each([
    ["property", "prop_outside_expert_context"],
    ["offer", "offer_outside_expert_context"],
    ["purchase_scenario", "scenario_outside_expert_context"],
  ] as const)(
    "rejects an evidence candidate for a contextual type outside the saved %s scope",
    async (entityType, entityId) => {
      const fixture = await setup();
      const draft = priceDraft(fixture.draft, fixture.offerId, {
        entity_type: entityType,
        entity_id: entityId,
      });
      await expect(
        fixture.runtime.application.saveDraft({
          actor: ACTOR,
          requestId: fixture.request.request_id,
          draft: { ...draft, confirmed: [] },
        }),
      ).rejects.toThrow(EXPERT_EVIDENCE_ENTITY_OUTSIDE_CONTEXT);
    },
  );

  it("fails closed for financing eligibility without an explicit context relationship", async () => {
    const fixture = await setup();
    const draft = priceDraft(fixture.draft, fixture.offerId, {
      entity_type: "property_financing_eligibility",
      entity_id: "elig_nb_002_family",
      field: "eligibility_status",
      value: "confirmed",
    });
    await expect(
      fixture.runtime.application.saveDraft({
        actor: ACTOR,
        requestId: fixture.request.request_id,
        draft: { ...draft, confirmed: [] },
      }),
    ).rejects.toThrow(EXPERT_EVIDENCE_ENTITY_OUTSIDE_CONTEXT);
  });

  it("rejects an evidence field outside the saved entity context", async () => {
    const fixture = await setup();
    const draft = priceDraft(fixture.draft, fixture.offerId, {
      field: "developer_marketing_claim",
    });
    await expect(
      fixture.runtime.application.saveDraft({
        actor: ACTOR,
        requestId: fixture.request.request_id,
        draft: { ...draft, confirmed: [] },
      }),
    ).rejects.toThrow(EXPERT_EVIDENCE_FIELD_OUTSIDE_CONTEXT);
  });

  it("accepts exact confirmed evidence, creates its overlay and recomputes", async () => {
    const fixture = await setup();
    await fixture.runtime.application.saveDraft({
      actor: ACTOR,
      requestId: fixture.request.request_id,
      draft: priceDraft(fixture.draft, fixture.offerId),
    });
    const completion = await fixture.runtime.application.complete({
      actor: ACTOR,
      requestId: fixture.request.request_id,
    });
    expect(completion.recomputeStatus).toBe("completed");
    const overlays =
      await fixture.repositories.repository.listCanonicalOverlays();
    expect(overlays).toEqual([
      expect.objectContaining({
        entity_type: "offer",
        entity_id: fixture.offerId,
        field: "listing_price",
        value: PRICE,
        verification_status: "confirmed",
      }),
    ]);
  });

  it("never creates a confirmed overlay from non-confirmed evidence even if draft saving is bypassed", async () => {
    const fixture = await setup();
    const draft = priceDraft(fixture.draft, fixture.offerId, {
      verification_status: "claimed",
    });
    const result = buildFinalExpertResult({
      request: fixture.request,
      draft: { ...draft, conflicts: [] },
      expertResultId: "result_bypassed_claimed_evidence",
      completedAt: NOW,
    });
    await expect(
      fixture.application.applyExpertResultToJourney(fixture.journeyId, result),
    ).rejects.toThrow(EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH);
    expect(
      await fixture.repositories.repository.listCanonicalOverlays(),
    ).toEqual([]);
    expect(await fixture.repositories.repository.listEvidence()).toEqual([]);
  });

  it("applies the same semantic checks to an existing stored evidence reference", async () => {
    const fixture = await setup();
    const evidenceId = "existing_claimed_price_evidence";
    await fixture.repositories.repository.appendEvidence(
      fieldEvidenceSchema.parse({
        schema_version: "1.0",
        evidence_id: evidenceId,
        entity_type: "offer",
        entity_id: fixture.offerId,
        field: "listing_price",
        value: PRICE,
        raw_value: PRICE,
        source_id: "source_manual_expert_journey",
        snapshot_id: null,
        source_url: null,
        collected_at: NOW,
        verification_status: "claimed",
        freshness_status: "fresh",
        extraction_confidence: null,
        evidence_type: "manual_expert",
        evidence_text: "Synthetic stored evidence.",
        evidence_reference: null,
      }),
    );
    const draft = priceDraft(fixture.draft, fixture.offerId);
    const result = buildFinalExpertResult({
      request: fixture.request,
      draft: {
        ...draft,
        conflicts: [],
        check_items: draft.check_items.map((item) => ({
          ...item,
          evidence_refs: [evidenceId],
        })),
        confirmed: draft.confirmed.map((fact) => ({
          ...fact,
          evidence_refs: [evidenceId],
        })),
        evidence_refs: [evidenceId],
        evidence_candidates: [],
      },
      expertResultId: "result_existing_claimed_evidence",
      completedAt: NOW,
    });
    await expect(
      fixture.application.applyExpertResultToJourney(fixture.journeyId, result),
    ).rejects.toThrow(EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH);
    expect(
      await fixture.repositories.repository.listCanonicalOverlays(),
    ).toEqual([]);
  });

  it("rejects cross-field candidate substitution for an unconfirmed fact", async () => {
    const fixture = await setup();
    const draft = priceDraft(fixture.draft, fixture.offerId, {
      verification_status: "unconfirmed",
    });
    await expect(
      fixture.runtime.application.saveDraft({
        actor: ACTOR,
        requestId: fixture.request.request_id,
        draft: {
          ...draft,
          confirmed: [],
          unconfirmed: [
            {
              entity_id: fixture.offerId,
              field: "availability",
              outcome: "unconfirmed",
              reason: "Недостаточно подтверждения.",
              evidence_refs: ["candidate_price_integrity"],
            },
          ],
        },
      }),
    ).rejects.toThrow(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);
  });
});
