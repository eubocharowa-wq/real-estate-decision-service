import { describe, expect, it, vi } from "vitest";

import {
  EXPERT_FIXTURE_ACTORS,
  EXPERT_FIXTURE_OWNER_ACTOR,
  ScopedExpertWorkbenchPermissionPolicy,
  buildFinalExpertResult,
  buildExpertResultReviewView,
  createExpertWorkbenchFixtureRuntime,
} from "../../src/expert-workbench";
import {
  advanceToInProgress,
  createHarness,
  makeResult,
} from "../expert/helpers";

describe("TASK-017 queue, permissions and workbench application", () => {
  it("orders active work by semantic priority and oldest submission", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const queue = runtime.application.listActiveQueue(
      EXPERT_FIXTURE_ACTORS.real_estate_expert,
    );
    expect(queue.items.map((item) => item.request.priority)).toEqual([
      "critical",
      "high",
      "normal",
      "low",
    ]);
    expect(
      [...queue.items]
        .filter((item) => item.request.priority === "critical")
        .map((item) => item.submittedAt),
    ).toEqual(
      [...queue.items]
        .filter((item) => item.request.priority === "critical")
        .map((item) => item.submittedAt)
        .sort(),
    );
    expect(
      queue.items.some((item) => item.request.status === "completed"),
    ).toBe(false);
  });

  it("fails closed for an unknown actor", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const request = runtime.repository.listAll()[0]!;
    const policy = new ScopedExpertWorkbenchPermissionPolicy();
    const unknown = { actor_type: "unknown" as const, actor_ref: null };
    expect(policy.canViewExpertRequest(unknown, request)).toBe(false);
    expect(policy.canEditExpertRequest(unknown, request)).toBe(false);
    expect(policy.canCompleteExpertRequest(unknown, request)).toBe(false);
    expect(() =>
      runtime.application.openWorkbench(unknown, request.request_id),
    ).toThrow("EXPERT_WORKBENCH_ACCESS_DENIED");
  });

  it("does not expose an unrelated lawyer request to another specialist", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const waitingId = runtime.scenarioRequestIds.waiting_for_user!;
    expect(
      runtime.application
        .listActiveQueue(EXPERT_FIXTURE_ACTORS.real_estate_expert)
        .items.some((item) => item.request.request_id === waitingId),
    ).toBe(false);
    expect(() =>
      runtime.application.openWorkbench(
        EXPERT_FIXTURE_ACTORS.real_estate_expert,
        waitingId,
      ),
    ).toThrow("EXPERT_WORKBENCH_ACCESS_DENIED");
  });

  it("opens only the saved context snapshot without fetch or hidden refresh", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId = runtime.scenarioRequestIds.waiting_for_user!;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const input = runtime.application.openWorkbench(
      EXPERT_FIXTURE_ACTORS.lawyer,
      requestId,
    );
    expect(input.contextPackage.expert_request_id).toBe(requestId);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      runtime.repository
        .listAudit(requestId)
        .some((event) => event.event_type === "expert_workbench_opened"),
    ).toBe(true);
    vi.unstubAllGlobals();
  });

  it("updates a check and adds a finding with privacy-safe audit", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const actor = EXPERT_FIXTURE_ACTORS.real_estate_expert;
    const requestId = runtime.scenarioRequestIds.queue_first!;
    await runtime.application.claimRequest(actor, requestId);
    runtime.application.transition({
      actor,
      requestId,
      status: "in_progress",
      reasonCode: "TEST_STARTED",
    });
    const workbench = runtime.application.openWorkbench(actor, requestId);
    const evidenceRef = workbench.contextPackage.source_evidence_refs[0]!;
    const item = {
      ...workbench.currentResultDraft.check_items[0]!,
      status: "checked_confirmed" as const,
      verification_method: "source_review" as const,
      evidence_refs: [evidenceRef],
    };
    runtime.application.updateCheckItem({ actor, requestId, item });
    runtime.application.addFinding({
      actor,
      requestId,
      finding: {
        finding_id: "finding_test_price",
        category: "fact",
        severity: "important",
        statement: "Цена относится к выбранному предложению на дату проверки.",
        related_entity_ids: workbench.expertRequest.property_ids,
        related_field: "listing_price",
        evidence_refs: [evidenceRef],
        verification_effect: "confirmed",
        requires_technical_specialist: false,
      },
    });
    const audit = runtime.repository.listAudit(requestId);
    expect(audit.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(["check_item_updated", "finding_added"]),
    );
    expect(JSON.stringify(audit)).not.toContain(
      workbench.contextPackage.user_question,
    );
  });

  it("blocks completion while required check statuses are missing", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const actor = EXPERT_FIXTURE_ACTORS.real_estate_expert;
    const requestId = runtime.scenarioRequestIds.queue_first!;
    await runtime.application.claimRequest(actor, requestId);
    runtime.application.transition({
      actor,
      requestId,
      status: "in_progress",
      reasonCode: "TEST_STARTED",
    });
    runtime.application.openWorkbench(actor, requestId);
    await expect(
      runtime.application.complete({ actor, requestId }),
    ).rejects.toThrow("INVALID_EXPERT_RESULT_DRAFT");
    expect(runtime.repository.getResult(requestId)).toBeNull();
  });

  it("does not let a draft rewrite the saved check plan or escape its context", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const actor = EXPERT_FIXTURE_ACTORS.real_estate_expert;
    const requestId = runtime.scenarioRequestIds.queue_first!;
    await runtime.application.claimRequest(actor, requestId);
    runtime.application.transition({
      actor,
      requestId,
      status: "in_progress",
      reasonCode: "TEST_STARTED",
    });
    const workbench = runtime.application.openWorkbench(actor, requestId);
    const first = workbench.currentResultDraft.check_items[0]!;
    expect(() =>
      runtime.application.updateCheckItem({
        actor,
        requestId,
        item: { ...first, subject: "Injected replacement check" },
      }),
    ).toThrow("EXPERT_CHECK_PLAN_IS_IMMUTABLE");
    expect(() =>
      runtime.application.saveDraft({
        actor,
        requestId,
        draft: {
          ...workbench.currentResultDraft,
          unconfirmed: [
            {
              entity_id: "property_outside_saved_context",
              field: "listing_price",
              outcome: "unconfirmed",
              reason: "Synthetic invalid context reference",
              evidence_refs: [],
            },
          ],
        },
      }),
    ).toThrow("EXPERT_DRAFT_ENTITY_OUTSIDE_CONTEXT");
    expect(() =>
      runtime.application.saveDraft({
        actor,
        requestId,
        draft: {
          ...workbench.currentResultDraft,
          conflicts: [
            {
              conflict_id: "conflict_outside_saved_context",
              field: "listing_price",
              outcome: "resolution_requested",
              reason: "Synthetic invalid conflict resolution",
              resolved_value: "1",
              evidence_refs: [
                workbench.contextPackage.source_evidence_refs[0]!,
              ],
            },
          ],
        },
      }),
    ).toThrow("EXPERT_CONFLICT_OUTSIDE_SAVED_CONTEXT");
  });

  it("resumes waiting_for_user through the existing state machine", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId = runtime.scenarioRequestIds.waiting_for_user!;
    const resumed = runtime.application.transition({
      actor: EXPERT_FIXTURE_ACTORS.lawyer,
      requestId,
      status: "in_progress",
      reasonCode: "USER_INFO_RECEIVED",
    });
    expect(resumed.status).toBe("in_progress");
    expect(
      runtime.repository.listAudit(requestId).at(-1)?.metadata.reason_code,
    ).toBe("USER_INFO_RECEIVED");
  });

  it("rejects an invalid waiting transition through the existing state machine", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const actor = EXPERT_FIXTURE_ACTORS.real_estate_expert;
    const requestId = runtime.scenarioRequestIds.queue_first!;
    await runtime.application.claimRequest(actor, requestId);
    expect(() =>
      runtime.application.transition({
        actor,
        requestId,
        status: "waiting_for_user",
        reasonCode: "INVALID_DIRECT_WAIT",
      }),
    ).toThrow("INVALID_EXPERT_REQUEST_TRANSITION");
  });
});

describe("TASK-017 result review integration scenarios", () => {
  it("provides all ten required deterministic scenario fixtures", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    expect(Object.keys(runtime.scenarioRequestIds)).toEqual(
      expect.arrayContaining([
        "financing_verification_completed",
        "price_conflict_resolved",
        "price_conflict_unresolved",
        "choice_assistance_clear",
        "choice_assistance_conditional",
        "choice_assistance_near_tie",
        "document_review_important",
        "onsite_unable_to_check",
        "technical_escalation",
        "waiting_for_user",
      ]),
    );
  });

  it("completes financing verification through recompute hooks and prepares review", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId =
      runtime.scenarioRequestIds.financing_verification_completed!;
    const input = runtime.application.openResultReview(
      EXPERT_FIXTURE_OWNER_ACTOR,
      requestId,
    );
    const view = buildExpertResultReviewView(input, null);
    expect(input.result?.confirmed[0]?.field).toBe("financing.family_mortgage");
    expect(input.recompute.status).toBe("pending");
    expect(view.confirmed.join(" ")).toContain("family_mortgage");
    expect(view.decisionImpact.match).toContain("нового пересчёта пока нет");
    expect(view.decisionImpact.confidence).toContain(
      "нового пересчёта пока нет",
    );
  });

  it("keeps unresolved price conflict visible and performs no canonical overwrite", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId = runtime.scenarioRequestIds.price_conflict_unresolved!;
    const input = runtime.application.openResultReview(
      EXPERT_FIXTURE_OWNER_ACTOR,
      requestId,
    );
    const view = buildExpertResultReviewView(input, null);
    expect(view.unresolvedConflicts.length).toBeGreaterThan(0);
    expect(
      runtime.canonicalHook.calls.some(
        (call) => call.request.request_id === requestId,
      ),
    ).toBe(false);
  });

  it("sends an evidence-backed resolved price conflict through the canonical hook", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId = runtime.scenarioRequestIds.price_conflict_resolved!;
    const call = runtime.canonicalHook.calls.find(
      (candidate) => candidate.request.request_id === requestId,
    );
    expect(call).toBeTruthy();
    expect(call?.conflictResolutions[0]).toEqual(
      expect.objectContaining({
        conflictId: "conflict_price_conflict_resolved",
        resolvedValue: 4_900_000,
      }),
    );
  });

  it("renders conditional choice assistance from a three-finalist snapshot", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId = runtime.scenarioRequestIds.choice_assistance_conditional!;
    const input = runtime.application.openResultReview(
      EXPERT_FIXTURE_OWNER_ACTOR,
      requestId,
    );
    const view = buildExpertResultReviewView(input, null);
    expect(
      input.contextPackage.choice_context?.finalist_property_ids,
    ).toHaveLength(3);
    expect(view.choice?.label).toBe("Выбор зависит от условия");
    expect(view.choice?.conditions).toContain(
      "Если подтвердится финансовое условие",
    );
  });

  it("does not force a winner for near_tie", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId = runtime.scenarioRequestIds.choice_assistance_near_tie!;
    const input = runtime.application.openResultReview(
      EXPERT_FIXTURE_OWNER_ACTOR,
      requestId,
    );
    const view = buildExpertResultReviewView(input, null);
    expect(view.choice?.label).toBe("Явного победителя нет");
    expect(view.choice?.preferredPropertyId).toBeNull();
  });

  it("validates clear and non-winner choice semantics before completion", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const clearId = runtime.scenarioRequestIds.choice_assistance_clear!;
    const clearRequest = runtime.repository.get(clearId)!;
    const clearDraft = runtime.drafts.get(clearId)!;
    expect(() =>
      buildFinalExpertResult({
        request: clearRequest,
        draft: {
          ...clearDraft,
          choice_assistance: {
            ...clearDraft.choice_assistance!,
            preferred_property_id: null,
          },
        },
        expertResultId: "result_invalid_clear_choice",
        completedAt: "2026-08-23T13:00:00.000Z",
      }),
    ).toThrow("CLEAR_CHOICE_REQUIRES_PREFERRED_PROPERTY");

    const tieId = runtime.scenarioRequestIds.choice_assistance_near_tie!;
    const tieRequest = runtime.repository.get(tieId)!;
    const tieDraft = runtime.drafts.get(tieId)!;
    expect(() =>
      buildFinalExpertResult({
        request: tieRequest,
        draft: {
          ...tieDraft,
          choice_assistance: {
            ...tieDraft.choice_assistance!,
            preferred_property_id: tieRequest.property_ids[0]!,
          },
        },
        expertResultId: "result_invalid_forced_tie",
        completedAt: "2026-08-23T13:00:00.000Z",
      }),
    ).toThrow("NON_WINNER_CHOICE_CANNOT_FORCE_PREFERRED_PROPERTY");
  });

  it("requires a concrete value before requesting canonical conflict resolution", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId = runtime.scenarioRequestIds.price_conflict_resolved!;
    const request = runtime.repository.get(requestId)!;
    const draft = runtime.drafts.get(requestId)!;
    expect(() =>
      buildFinalExpertResult({
        request,
        draft: {
          ...draft,
          conflicts: draft.conflicts.map((conflict) => ({
            ...conflict,
            resolved_value: null,
          })),
        },
        expertResultId: "result_invalid_empty_resolution",
        completedAt: "2026-08-23T13:00:00.000Z",
      }),
    ).toThrow("CONFLICT_RESOLUTION_VALUE_REQUIRED");
  });

  it("shows waiting_for_user honestly before a final result exists", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId = runtime.scenarioRequestIds.waiting_for_user!;
    const input = runtime.application.openResultReview(
      EXPERT_FIXTURE_OWNER_ACTOR,
      requestId,
    );
    const view = buildExpertResultReviewView(input, null);
    expect(input.result).toBeNull();
    expect(view.header.status).toBe("Ждём данные пользователя");
  });

  it("creates a prefilled technical escalation boundary without scheduling", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId = runtime.scenarioRequestIds.technical_escalation!;
    const input = runtime.application.openResultReview(
      EXPERT_FIXTURE_OWNER_ACTOR,
      requestId,
    );
    const href = runtime.application.buildTechnicalEscalationHref(input);
    expect(href).toContain("type=onsite_check");
    expect(href).toContain("onsite_scope=structural_engineering");
    expect(href).toContain(`property=${input.request.property_ids[0]}`);
    expect(href).not.toContain("schedule");
  });

  it("keeps a saved result when recomputation fails", async () => {
    const harness = createHarness();
    const request = await advanceToInProgress(harness);
    harness.recompute.requestRecompute = () => {
      throw new Error("fixture recompute failure");
    };
    const outcome = await harness.completion.complete(
      makeResult(request.request_id),
    );
    expect(outcome.recomputeStatus).toBe("failed");
    expect(outcome.recomputeErrorCode).toBe("RECOMPUTE_FAILED");
    expect(harness.repository.getResult(request.request_id)).not.toBeNull();
    expect(harness.repository.get(request.request_id)?.status).toBe(
      "completed",
    );
  });
});
