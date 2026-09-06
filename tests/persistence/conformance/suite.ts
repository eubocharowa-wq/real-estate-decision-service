import { beforeEach, describe, expect, it } from "vitest";

import type { RepositorySet } from "../../../src/persistence";
import {
  EXPERT_PRIORITY_VERSION,
  EXPERT_REQUEST_SCHEMA_VERSION,
  EXPERT_ROUTING_VERSION,
  expertContextPackageSchema,
} from "../../../src/expert/contracts";
import type {
  ExpertContextPackage,
  ExpertRequest,
} from "../../../src/expert/contracts";
import { calculateDataQuality, matchProperty } from "../../../src/matching";
import { loadPilotDataset } from "../../../src/pilot-dataset";
import {
  makeBundle,
  makeComparison,
  makeConfirmedRequest,
  makeDecisionUpdate,
  makeEvidence,
  makeJourney,
  makeOverlay,
  NOW,
} from "./fixtures";

/**
 * One suite, two backends.
 *
 * Everything here is behaviour the domain depends on, so both the in-memory
 * and the PostgreSQL implementation have to satisfy it identically — including
 * the error codes, which is the part that would otherwise silently diverge.
 *
 * Deliberately not asserted here: transactional rollback. The in-memory unit
 * of work runs the callback and nothing more, by design, so rollback is a
 * PostgreSQL-only guarantee and is tested separately.
 */
const dataset = loadPilotDataset();

/** A real engine result, so the stored document passes the read schemas. */
const realMatch = () => {
  const request = dataset.userRequests[0]!;
  for (const property of dataset.properties) {
    const propertyId = property.identity.property_id;
    const outcome = matchProperty({
      userRequest: request,
      property,
      offers: dataset.offers.filter(
        (offer) => offer.property_id === propertyId,
      ),
      purchaseScenarios: dataset.purchaseScenarios.filter(
        (scenario) => scenario.property_id === propertyId,
      ),
      financingEligibility: dataset.propertyFinancingEligibility.filter(
        (eligibility) => eligibility.property_id === propertyId,
      ),
      financingPrograms: dataset.financingPrograms,
      fieldEvidence: dataset.fieldEvidence,
      sourceConflicts: dataset.sourceConflicts,
      currentTime: NOW,
    });
    if (outcome.success) return outcome.result;
  }
  throw new Error("Pilot dataset produced no match result");
};

const realDataQuality = (match: ReturnType<typeof realMatch>) => {
  const request = dataset.userRequests[0]!;
  const propertyId = match.match_result.property_id;
  const offers = dataset.offers.filter(
    (offer) => offer.property_id === propertyId,
  );
  const scenarios = dataset.purchaseScenarios.filter(
    (scenario) => scenario.property_id === propertyId,
  );
  const outcome = calculateDataQuality({
    userRequest: request,
    matchResult: match.match_result,
    fieldEvidence: dataset.fieldEvidence,
    sourceConflicts: dataset.sourceConflicts,
    sources: dataset.sources,
    selectedOffer:
      offers.find((offer) => offer.offer_id === match.selected_offer_id) ??
      null,
    selectedPurchaseScenario:
      scenarios.find(
        (scenario) =>
          scenario.scenario_id === match.match_result.purchase_scenario_id,
      ) ?? null,
    selectedPromotion: null,
    currentTime: NOW,
  });
  if (!outcome.success)
    throw new Error("Pilot dataset produced no DataQuality");
  return outcome.result;
};

const makeExpertContext = (
  contextPackageId: string,
  requestId: string,
): ExpertContextPackage =>
  expertContextPackageSchema.parse({
    package_version: "expert-context-v1",
    context_package_id: contextPackageId,
    expert_request_id: requestId,
    user_request_ref: "ur_conformance",
    user_request_summary: {
      user_request_id: "ur_conformance",
      intent: "find",
      goal: null,
      criteria: [],
      financing_constraints: null,
      material_timeline: null,
    },
    properties: [
      {
        property_id: "prop_nb_002",
        property_type: "apartment",
        market_type: "new_build",
        location_label: "Тула",
        rooms: 2,
        total_area_m2: 62,
        floor: 5,
        handover_date: null,
        evidence_refs: [],
      },
    ],
    selected_offers: [],
    selected_purchase_scenarios: [],
    match_results: [],
    data_quality: [],
    critical_unknowns: [],
    conflicts: [],
    recommended_checks: [],
    structured_questions: [],
    source_evidence_refs: [],
    document_refs: [],
    user_question: "Подтвердите применимость семейной ипотеки.",
    choice_context: null,
    onsite_context: null,
    latest_source_data_at: NOW,
    stale: false,
    decision_snapshot: {
      journey_id: "journey_conformance_1",
      user_request_version: 1,
      matching_bundle_id: "bundle_conformance_1",
      match_result_ids: [],
      data_quality_ids: [],
      comparison_id: null,
      comparison_version: null,
    },
    created_at: NOW,
  });

const makeExpertRequest = (
  requestId: string,
  dedupKey: string,
  overrides: Partial<ExpertRequest> = {},
): ExpertRequest =>
  ({
    request_schema_version: EXPERT_REQUEST_SCHEMA_VERSION,
    request_id: requestId,
    owner: { owner_type: "session", owner_id: "session_conformance" },
    request_type: "information_verification",
    trigger_type: "critical_unknown",
    question_category: "financing",
    user_request_id: "ur_conformance",
    property_ids: ["prop_nb_002"],
    offer_ids: [],
    purchase_scenario_ids: [],
    comparison_id: null,
    document_refs: [],
    question: "Подтвердите применимость семейной ипотеки для этого объекта.",
    structured_questions: [],
    priority: "high",
    priority_score: 12,
    priority_policy_version: EXPERT_PRIORITY_VERSION,
    required_specialist: "mortgage_specialist",
    routing_version: EXPERT_ROUTING_VERSION,
    status: "queued",
    context_package_id: `${requestId}_context`,
    dedup_key: dedupKey,
    assigned_specialist_ref: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }) as ExpertRequest;

export interface ConformanceHarness {
  readonly set: RepositorySet;
  /** Empties the store between tests. */
  readonly reset: () => Promise<void>;
}

export const describeRepositoryConformance = (
  backendName: string,
  createHarness: () => Promise<ConformanceHarness>,
): void => {
  describe(`repository conformance (${backendName})`, () => {
    let harness: ConformanceHarness;
    let set: RepositorySet;

    beforeEach(async () => {
      harness ??= await createHarness();
      await harness.reset();
      set = harness.set;
    });

    describe("buyer journeys", () => {
      it("returns null for an unknown journey", async () => {
        expect(await set.repository.getJourney("missing")).toBeNull();
      });

      it("round-trips a journey and overwrites it on save", async () => {
        const journey = makeJourney();
        await set.repository.saveJourney(journey);
        expect(await set.repository.getJourney(journey.journey_id)).toEqual(
          journey,
        );

        const moved = makeJourney({
          current_stage: "request_confirmation",
          parsed_request_ref: "parsed_1",
          updated_at: "2026-08-15T01:00:00.000Z",
        });
        await set.repository.saveJourney(moved);
        expect(await set.repository.getJourney(journey.journey_id)).toEqual(
          moved,
        );
      });

      it("keeps a recoverable error code", async () => {
        const journey = makeJourney({
          recoverable_error: "STORAGE_UNAVAILABLE",
        });
        await set.repository.saveJourney(journey);
        expect(
          (await set.repository.getJourney(journey.journey_id))
            ?.recoverable_error,
        ).toBe("STORAGE_UNAVAILABLE");
      });
    });

    describe("confirmed requests", () => {
      it("addresses every version by its composite key", async () => {
        await set.repository.saveConfirmedRequest(makeConfirmedRequest(1));
        await set.repository.saveConfirmedRequest(makeConfirmedRequest(2));

        const first = await set.repository.getConfirmedRequest(
          makeConfirmedRequest(1).user_request_id,
          1,
        );
        const second = await set.repository.getConfirmedRequest(
          makeConfirmedRequest(2).user_request_id,
          2,
        );
        expect(first?.user_request_version).toBe(1);
        expect(first?.supersedes_version).toBeNull();
        expect(second?.user_request_version).toBe(2);
        expect(second?.supersedes_version).toBe(1);
      });

      it("returns null for a version that was never confirmed", async () => {
        expect(
          await set.repository.getConfirmedRequest("ur_missing", 7),
        ).toBeNull();
      });
    });

    describe("matching bundles", () => {
      it("round-trips a bundle whose confidence was never computed", async () => {
        await set.repository.saveConfirmedRequest(makeConfirmedRequest(1));
        const bundle = makeBundle(realMatch());
        await set.repository.saveMatchingBundle(bundle);

        const stored = await set.repository.getMatchingBundle(
          bundle.matching_bundle_id,
        );
        expect(stored?.entries).toHaveLength(1);
        // NULL confidence stays null; it is never coerced to a zero score.
        expect(stored?.entries[0]?.data_quality).toBeNull();
        expect(stored?.entries[0]?.match.match_result.match_score).toBe(
          bundle.entries[0]!.match.match_result.match_score,
        );
      });

      it("keeps match and confidence side by side when both exist", async () => {
        await set.repository.saveConfirmedRequest(makeConfirmedRequest(1));
        const match = realMatch();
        const quality = realDataQuality(match);
        const bundle = makeBundle(match);
        await set.repository.saveMatchingBundle({
          ...bundle,
          entries: [{ ...bundle.entries[0]!, data_quality: quality }],
        });

        const stored = await set.repository.getMatchingBundle(
          bundle.matching_bundle_id,
        );
        expect(stored?.entries[0]?.match.match_result.match_score).toBe(
          match.match_result.match_score,
        );
        expect(
          stored?.entries[0]?.data_quality?.data_quality.data_confidence_score,
        ).toBe(quality.data_quality.data_confidence_score);
      });

      it("marks a bundle stale", async () => {
        await set.repository.saveConfirmedRequest(makeConfirmedRequest(1));
        const bundle = makeBundle(realMatch());
        await set.repository.saveMatchingBundle(bundle);
        await set.repository.markMatchingBundleStale(bundle.matching_bundle_id);

        expect(
          (await set.repository.getMatchingBundle(bundle.matching_bundle_id))
            ?.stale,
        ).toBe(true);
      });

      it("returns null for an unknown bundle", async () => {
        expect(await set.repository.getMatchingBundle("missing")).toBeNull();
      });
    });

    describe("comparisons", () => {
      it("round-trips items in order", async () => {
        await set.repository.saveConfirmedRequest(makeConfirmedRequest(1));
        await set.repository.saveJourney(makeJourney());
        await set.repository.saveMatchingBundle(makeBundle(realMatch()));
        const comparison = makeComparison(["prop_b", "prop_a"]);
        await set.repository.saveComparison(comparison);

        const stored = await set.repository.getComparison(
          comparison.comparison_id,
        );
        expect(stored?.items.map((item) => item.property_id)).toEqual([
          "prop_b",
          "prop_a",
        ]);
        expect(stored?.status).toBe("active");
      });

      it("replaces the item set on save", async () => {
        await set.repository.saveConfirmedRequest(makeConfirmedRequest(1));
        await set.repository.saveJourney(makeJourney());
        await set.repository.saveMatchingBundle(makeBundle(realMatch()));
        await set.repository.saveComparison(makeComparison(["a", "b", "c"]));
        await set.repository.saveComparison(
          makeComparison(["a"], { version: 2, status: "recompute_required" }),
        );

        const stored = await set.repository.getComparison(
          "comparison_conformance_1",
        );
        expect(stored?.items).toHaveLength(1);
        expect(stored?.version).toBe(2);
        expect(stored?.status).toBe("recompute_required");
      });
    });

    describe("decision updates", () => {
      it("round-trips before and after metrics", async () => {
        await set.repository.saveConfirmedRequest(makeConfirmedRequest(1));
        await set.repository.saveJourney(makeJourney());
        await set.repository.saveMatchingBundle(makeBundle(realMatch()));
        const update = makeDecisionUpdate();
        await set.repository.saveDecisionUpdate(update);

        const stored = await set.repository.getDecisionUpdate(update.update_id);
        expect(stored?.previous_results).toEqual(update.previous_results);
        expect(stored?.new_results).toEqual(update.new_results);
        expect(stored?.resolved_unknowns).toEqual([
          "financing.family_mortgage",
        ]);
      });
    });

    describe("evidence", () => {
      it("is idempotent for an identical record", async () => {
        const evidence = makeEvidence();
        await set.repository.appendEvidence(evidence);
        await set.repository.appendEvidence(evidence);

        expect(await set.repository.listEvidence()).toEqual([evidence]);
      });

      it("rejects a different record under the same id", async () => {
        await set.repository.appendEvidence(makeEvidence());

        await expect(
          set.repository.appendEvidence(
            makeEvidence({ verification_status: "claimed" }),
          ),
        ).rejects.toThrow("EVIDENCE_ID_CONFLICT");
      });
    });

    describe("canonical overlays", () => {
      it("stores an overlay backed by evidence", async () => {
        await set.repository.appendEvidence(makeEvidence());
        const overlay = makeOverlay();
        await set.repository.saveCanonicalOverlay(overlay);

        expect(await set.repository.listCanonicalOverlays()).toEqual([overlay]);
      });

      it("is idempotent and rejects a changed overlay", async () => {
        await set.repository.appendEvidence(makeEvidence());
        await set.repository.saveCanonicalOverlay(makeOverlay());
        await set.repository.saveCanonicalOverlay(makeOverlay());

        await expect(
          set.repository.saveCanonicalOverlay(
            makeOverlay({ verification_status: "claimed" }),
          ),
        ).rejects.toThrow("CANONICAL_OVERLAY_ID_CONFLICT");
      });
    });

    describe("imported candidates", () => {
      it("refuses to attach a candidate that was never saved", async () => {
        await set.repository.saveJourney(makeJourney());

        await expect(
          set.repository.attachImportedCandidate(
            "journey_conformance_1",
            "ingestion_missing",
          ),
        ).rejects.toThrow("IMPORTED_CANDIDATE_NOT_FOUND");
      });

      it("lists nothing for a journey with no imports", async () => {
        await set.repository.saveJourney(makeJourney());
        expect(
          await set.repository.listImportedCandidates("journey_conformance_1"),
        ).toEqual([]);
      });
    });

    describe("unit of work", () => {
      it("returns the callback result", async () => {
        expect(
          await set.repository.transaction(async () => {
            await set.repository.saveJourney(makeJourney());
            return "done";
          }),
        ).toBe("done");
      });

      it("propagates a failure from inside", async () => {
        await expect(
          set.repository.transaction(async () => {
            throw new Error("WORK_FAILED");
          }),
        ).rejects.toThrow("WORK_FAILED");
      });
    });

    describe("expert requests", () => {
      const seed = async (requestId = "req_1", dedupKey = "dedup_1") => {
        const request = makeExpertRequest(requestId, dedupKey);
        const context = makeExpertContext(
          request.context_package_id,
          requestId,
        );
        return set.expertRepository.create(request, context);
      };

      it("creates a request with its context package", async () => {
        const outcome = await seed();

        expect(outcome.created).toBe(true);
        expect((await set.expertRepository.get("req_1"))?.status).toBe(
          "queued",
        );
        expect(
          await set.expertRepository.getContext("req_1_context"),
        ).not.toBeNull();
      });

      it("returns the existing request for a duplicate dedup key", async () => {
        await seed("req_1", "dedup_shared");
        const second = await seed("req_2", "dedup_shared");

        expect(second.created).toBe(false);
        expect(second.request.request_id).toBe("req_1");
        expect(await set.expertRepository.get("req_2")).toBeNull();
      });

      it("orders the queue by priority, then score, then age", async () => {
        await set.expertRepository.create(
          makeExpertRequest("req_low", "dedup_low", {
            priority: "low",
            priority_score: 1,
          }),
          makeExpertContext("req_low_context", "req_low"),
        );
        await set.expertRepository.create(
          makeExpertRequest("req_critical", "dedup_critical", {
            priority: "critical",
            priority_score: 20,
          }),
          makeExpertContext("req_critical_context", "req_critical"),
        );
        await set.expertRepository.create(
          makeExpertRequest("req_high", "dedup_high", {
            priority: "high",
            priority_score: 10,
          }),
          makeExpertContext("req_high_context", "req_high"),
        );

        expect(
          (await set.expertRepository.listQueued()).map(
            (request) => request.request_id,
          ),
        ).toEqual(["req_critical", "req_high", "req_low"]);
      });

      it("rejects an illegal status transition", async () => {
        await seed();

        await expect(
          set.expertRepository.updateStatus("req_1", "draft", NOW),
        ).rejects.toThrow();
      });

      it("refuses a second result for the same request", async () => {
        await seed();
        const result = {
          result_version: "expert-result-v1",
          expert_result_id: "res_1",
          request_id: "req_1",
          status: "completed",
          checked_items: [],
          findings: [],
          confirmed: [],
          unconfirmed: [],
          conflicts: [],
          risks: [],
          recommendations: [],
          next_actions: [],
          evidence_refs: [],
          evidence_candidates: [],
          specialist: {
            specialist_ref: "spec_1",
            specialist_type: "mortgage_specialist",
          },
          choice_assistance: null,
          disclaimer: null,
          completed_at: NOW,
        } as Parameters<typeof set.expertRepository.saveResult>[0];
        await set.expertRepository.saveResult(result);

        await expect(set.expertRepository.saveResult(result)).rejects.toThrow(
          "COMPLETED_RESULT_IS_IMMUTABLE",
        );
      });

      it("appends and lists audit events in order", async () => {
        await seed();
        for (const [index, eventType] of [
          "request_created",
          "request_submitted",
        ].entries())
          await set.expertRepository.appendAudit({
            event_id: `audit_${index}`,
            request_id: "req_1",
            event_type: eventType,
            actor_type: "system",
            actor_ref: null,
            metadata: {},
            created_at: new Date(Date.parse(NOW) + index * 1000).toISOString(),
          } as Parameters<typeof set.expertRepository.appendAudit>[0]);

        expect(
          (await set.expertRepository.listAudit("req_1")).map(
            (event) => event.event_type,
          ),
        ).toEqual(["request_created", "request_submitted"]);
      });
    });

    describe("pilot records", () => {
      it("stores and lists feedback for a journey", async () => {
        await set.repository.saveJourney(makeJourney());
        const feedback = {
          feedback_id: "feedback_1",
          journey_id: "journey_conformance_1",
          stage: "shortlist",
          question_code: "shortlist_relevance",
          answer: "partly",
          optional_comment: null,
          created_at: NOW,
        } as Parameters<typeof set.feedbackRepository.save>[0];
        await set.feedbackRepository.save(feedback);

        expect(
          await set.feedbackRepository.list("journey_conformance_1"),
        ).toEqual([feedback]);
      });

      it("records an application error and marks it recovered", async () => {
        await set.repository.saveJourney(makeJourney());
        const error = {
          error_id: "error_1",
          error_code: "MATCH_RECOMPUTE_FAILED",
          layer: "recompute",
          journey_id: "journey_conformance_1",
          stage: "matching",
          recoverable: true,
          user_visible: true,
          occurred_at: NOW,
          context_ids: { action: "confirm_and_match" },
          app_version: "test",
          recovered_at: null,
        } as Parameters<typeof set.errorRepository.record>[0];
        await set.errorRepository.record(error);
        await set.errorRepository.markRecovered(
          "error_1",
          "2026-08-15T02:00:00.000Z",
        );

        const stored = await set.errorRepository.list("journey_conformance_1");
        expect(stored).toHaveLength(1);
        expect(stored[0]?.recovered_at).toBe("2026-08-15T02:00:00.000Z");
      });

      it("keeps raw request text out of instrumentation", async () => {
        const journey = makeJourney();
        await set.repository.saveJourney(journey);
        await set.instrumentation.record({
          journey,
          eventType: "journey_started",
          occurredAt: NOW,
          metadata: {
            raw_request_text: "секретный текст",
            request_length_bucket: "short",
          },
        });

        const events = await set.instrumentation.list(journey.journey_id);
        expect(events).toHaveLength(1);
        expect(events[0]?.metadata).toEqual({ request_length_bucket: "short" });
      });
    });

    describe("expert result drafts", () => {
      it("returns null before a draft exists", async () => {
        expect(await set.draftRepository.get("req_1")).toBeNull();
      });
    });
  });
};
