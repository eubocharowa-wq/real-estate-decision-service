import { describe, expect, it } from "vitest";

import * as expertRequestRoute from "../../app/api/expert-requests/route";
import {
  EXPERT_CONTEXT_PACKAGE_VERSION,
  calculateExpertPriority,
  canAccessSessionDocumentReference,
  createSessionDocumentReference,
  evaluateExpertContextFreshness,
  expertResultSchema,
  expertRequestTransitions,
  routeExpertRequest,
  type ExpertRequestType,
} from "../../src/expert";
import { loadPilotDataset } from "../../src/pilot-dataset";
import {
  NOW,
  OWNER,
  advanceToInProgress,
  createHarness,
  makeCreateInput,
  makeResult,
} from "./helpers";

const boundaryDataset = loadPilotDataset();
const boundaryUserRequest = boundaryDataset.userRequests[0]!;
const boundaryProperty = boundaryDataset.properties[0]!;

const postBoundaryRequest = async (body: unknown) =>
  expertRequestRoute.POST(
    new Request("http://localhost/api/expert-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("TASK-016 deterministic routing", () => {
  it.each([
    ["document_review", "document_question", "document", "lawyer"],
    [
      "information_verification",
      "financing_uncertainty",
      "financing",
      "mortgage_specialist",
    ],
    [
      "choice_assistance",
      "comparison_uncertainty",
      "comparison",
      "real_estate_expert",
    ],
    [
      "onsite_check",
      "onsite_needed",
      "physical_condition",
      "property_inspector",
    ],
    [
      "onsite_check",
      "onsite_needed",
      "structural_engineering",
      "technical_specialist",
    ],
  ] as const)(
    "%s + %s routes to %s",
    (requestType, triggerType, questionCategory, expected) => {
      expect(
        routeExpertRequest({ requestType, triggerType, questionCategory })
          .specialistType,
      ).toBe(expected);
    },
  );

  it("rejects an unsupported request type", () => {
    expect(() =>
      routeExpertRequest({
        requestType: "unsupported" as ExpertRequestType,
        triggerType: "user_requested",
        questionCategory: "general",
      }),
    ).toThrow();
  });
});

describe("TASK-016 priority and state machine", () => {
  it("uses centralized non-commercial factors", () => {
    const decision = calculateExpertPriority({
      preDecision: true,
      mustCriterion: true,
      financialImpact: true,
      unresolvedConflict: true,
      transactionDeadline: null,
      explicitUrgency: "normal",
      calculatedAt: NOW,
    });
    expect(decision.priority).toBe("critical");
    expect(decision.reasonCodes).toContain("MUST_CRITERION");
    expect(Object.keys(decision)).not.toContain("commission");
  });

  it("declares the required happy path and waiting transitions", () => {
    expect(expertRequestTransitions.draft).toContain("submitted");
    expect(expertRequestTransitions.submitted).toContain("queued");
    expect(expertRequestTransitions.queued).toContain("assigned");
    expect(expertRequestTransitions.assigned).toContain("in_progress");
    expect(expertRequestTransitions.in_progress).toContain("completed");
    expect(expertRequestTransitions.in_progress).toContain("waiting_for_user");
    expect(expertRequestTransitions.in_progress).toContain(
      "waiting_for_external_info",
    );
    expect(expertRequestTransitions.in_progress).toContain(
      "unable_to_complete",
    );
  });

  it("rejects draft to completed and keeps cancellation final", () => {
    const harness = createHarness();
    const created = harness.service.createDraft(makeCreateInput());
    expect(() =>
      harness.service.transition({
        requestId: created.request.request_id,
        status: "completed",
        actorType: "admin",
        actorRef: null,
        reasonCode: "INVALID",
      }),
    ).toThrow("INVALID_EXPERT_REQUEST_TRANSITION");
    harness.service.cancel(created.request.request_id, OWNER);
    expect(() =>
      harness.service.submit(created.request.request_id, OWNER),
    ).toThrow("INVALID_EXPERT_REQUEST_TRANSITION");
  });
});

describe("TASK-016 context, validation, queue and dedup", () => {
  it("builds a minimized, versioned context with relevant domain projections", () => {
    const harness = createHarness();
    const created = harness.service.createDraft(makeCreateInput());
    const context = harness.repository.getContext(
      created.request.context_package_id,
    )!;
    expect(context.package_version).toBe(EXPERT_CONTEXT_PACKAGE_VERSION);
    expect(context.properties).toHaveLength(1);
    expect(context.match_results).toHaveLength(1);
    expect(context.data_quality).toHaveLength(1);
    expect(context.critical_unknowns).toHaveLength(1);
    expect(context.source_evidence_refs).toContain(
      "evidence_family_mortgage_claim",
    );
    expect(context.user_question).toBe(created.request.question);
    expect(context.structured_questions).toHaveLength(1);
    expect(context.user_request_summary).not.toHaveProperty("household");
    expect(context).not.toHaveProperty("raw_source_content");
  });

  it("supports 3-finalist choice context with trade-offs and decision drivers", () => {
    const harness = createHarness();
    const created = harness.service.createDraft(
      makeCreateInput({
        requestType: "choice_assistance",
        triggerType: "comparison_uncertainty",
        questionCategory: "comparison",
        propertyCount: 3,
        question: "Помогите выбрать лучший компромисс между тремя финалистами.",
      }),
    );
    const context = harness.repository.getContext(
      created.request.context_package_id,
    )!;
    expect(context.properties).toHaveLength(3);
    expect(context.choice_context?.finalist_property_ids).toHaveLength(3);
    expect(context.choice_context?.trade_offs).toHaveLength(1);
    expect(context.choice_context?.decision_drivers).toContain("Бюджет");
  });

  it("implements document-review and onsite boundaries without engines", () => {
    const documentHarness = createHarness();
    const document = documentHarness.service.createDraft(
      makeCreateInput({
        requestType: "document_review",
        triggerType: "document_question",
        questionCategory: "document",
        question:
          "Проверьте условие об изменении цены в приложенном документе.",
        documentRefs: ["document_fixture_1"],
      }),
    );
    expect(document.request.required_specialist).toBe("lawyer");
    expect(
      documentHarness.repository.getContext(document.request.context_package_id)
        ?.document_refs,
    ).toEqual(["document_fixture_1"]);

    const onsiteHarness = createHarness();
    const onsite = onsiteHarness.service.createDraft(
      makeCreateInput({
        requestType: "onsite_check",
        triggerType: "onsite_needed",
        questionCategory: "physical_condition",
        question: "Проверьте на месте фактическое подключение газа к дому.",
        useHouse: true,
      }),
    );
    expect(
      onsiteHarness.repository.getContext(onsite.request.context_package_id)
        ?.onsite_context?.boundary_notice,
    ).toMatch(/не является/);
  });

  it("returns an existing active request for the same question and allows a different question", () => {
    const harness = createHarness();
    const input = makeCreateInput();
    const first = harness.service.createDraft(input);
    const duplicate = harness.service.createDraft(input);
    const different = harness.service.createDraft(
      makeCreateInput({
        question:
          "Подтвердите точную цену предложения на дату принятия решения.",
      }),
    );
    expect(duplicate.created).toBe(false);
    expect(duplicate.request.request_id).toBe(first.request.request_id);
    expect(different.created).toBe(true);
    expect(different.request.request_id).not.toBe(first.request.request_id);
  });

  it("queues, assigns and records privacy-safe audit metadata", async () => {
    const harness = createHarness();
    const created = harness.service.createDraft(makeCreateInput());
    harness.service.submit(created.request.request_id, OWNER);
    expect(harness.repository.listQueued()).toHaveLength(1);
    await harness.service.assignExpertRequest({
      requestId: created.request.request_id,
      specialistRef: "specialist_fixture_1",
      specialistType: "mortgage_specialist",
    });
    expect(harness.assignmentCalls).toEqual([created.request.request_id]);
    const audit = harness.repository.listAudit(created.request.request_id);
    expect(audit.map((event) => event.event_type)).toEqual([
      "request_created",
      "request_submitted",
      "request_queued",
      "request_assigned",
    ]);
    expect(JSON.stringify(audit)).not.toContain(created.request.question);
  });

  it("orders the minimal work queue by semantic priority", () => {
    const harness = createHarness();
    const critical = harness.service.createDraft(makeCreateInput());
    harness.service.submit(critical.request.request_id, OWNER);
    const base = makeCreateInput({
      question: "Уточните дополнительную некритичную характеристику объекта.",
    });
    const low = harness.service.createDraft({
      ...base,
      priority: {
        preDecision: false,
        mustCriterion: false,
        financialImpact: false,
        unresolvedConflict: false,
        transactionDeadline: null,
        explicitUrgency: "low",
      },
    });
    harness.service.submit(low.request.request_id, OWNER);
    expect(
      harness.repository.listQueued().map((item) => item.priority),
    ).toEqual(["critical", "low"]);
  });

  it("rejects a generic callback lead and marks newer source data as stale context", () => {
    const harness = createHarness();
    expect(() =>
      harness.service.createDraft(
        makeCreateInput({ question: "Свяжитесь со мной" }),
      ),
    ).toThrow("EMPTY_EXPERT_LEAD_NOT_ALLOWED");
    const input = makeCreateInput({
      question: "Подтвердите текущую доступность выбранного предложения.",
    });
    const created = harness.service.createDraft({
      ...input,
      context: {
        ...input.context,
        latestSourceDataAt: "2026-08-23T13:00:00.000Z",
      },
    });
    expect(
      harness.repository.getContext(created.request.context_package_id)?.stale,
    ).toBe(true);
  });

  it("reports later source updates without mutating or replacing an in-progress snapshot", async () => {
    const harness = createHarness();
    const request = await advanceToInProgress(harness);
    const original = harness.repository.getContext(request.context_package_id)!;
    const presented = evaluateExpertContextFreshness(
      original,
      "2026-08-24T12:00:00.000Z",
    );
    expect(presented.stale).toBe(true);
    expect(original.stale).toBe(false);
    expect(() =>
      harness.repository.replaceContext(
        request.request_id,
        {
          ...original,
          context_package_id: "context_replacement_fixture",
        },
        NOW,
      ),
    ).toThrow("CONTEXT_SNAPSHOT_LOCKED_AFTER_WORK_START");
  });
});

describe("TASK-016 structured completion pipeline", () => {
  it("integrates expert evidence, requests canonical update and recomputation", async () => {
    const harness = createHarness();
    const request = await advanceToInProgress(harness);
    const outcome = await harness.completion.complete(
      makeResult(request.request_id),
    );
    expect(outcome.request.status).toBe("completed");
    expect(harness.evidence.calls).toBe(1);
    expect(harness.canonical.calls).toBe(1);
    expect(harness.recompute.calls).toBe(1);
    expect(outcome.recompute.dataQualityRequestIds).toHaveLength(1);
    expect(outcome.recompute.matchResultRequestIds).toHaveLength(1);
    expect(
      harness.repository
        .listAudit(request.request_id)
        .map((event) => event.event_type),
    ).toEqual(
      expect.arrayContaining([
        "evidence_created",
        "canonical_update_requested",
        "recompute_requested",
        "result_saved",
      ]),
    );
  });

  it("records explicit price-conflict resolution instead of a silent winner", async () => {
    const harness = createHarness();
    const request = await advanceToInProgress(
      harness,
      makeCreateInput({
        triggerType: "critical_conflict",
        questionCategory: "price",
        withConflict: true,
        question: "Проверьте конфликт точной цены по двум источникам.",
      }),
    );
    await harness.completion.complete(
      makeResult(request.request_id, {
        specialist: {
          specialist_ref: "specialist_fixture_1",
          specialist_type: "real_estate_expert",
        },
        conflicts: [
          {
            conflict_id: "conflict_expert_price",
            field: "listing_price",
            outcome: "resolution_requested",
            reason: "Получено датированное подтверждение продавца",
            resolved_value: { amount: "9800000", currency: "RUB" },
            evidence_refs: ["evidence_candidate_fixture_1"],
          },
        ],
      }),
    );
    expect(harness.canonical.lastInput?.conflictResolutions[0]).toMatchObject({
      conflictId: "conflict_expert_price",
      resolvedBy: "specialist_fixture_1",
      resolutionReason: "Получено датированное подтверждение продавца",
    });
  });

  it("supports conditional choice assistance without replacing Match Score", async () => {
    const harness = createHarness();
    const request = await advanceToInProgress(
      harness,
      makeCreateInput({
        requestType: "choice_assistance",
        triggerType: "comparison_uncertainty",
        questionCategory: "comparison",
        propertyCount: 3,
        question: "Помогите выбрать лучший компромисс между тремя финалистами.",
      }),
    );
    const result = makeResult(request.request_id, {
      specialist: {
        specialist_ref: "specialist_fixture_1",
        specialist_type: "real_estate_expert",
      },
      confirmed: [],
      findings: [],
      evidence_candidates: [],
      checked_items: [
        {
          item_id: "checked_item_choice",
          subject: "Trade-offs финалистов",
          method: "Сопоставление с подтверждённым UserRequest",
          outcome: "unconfirmed",
          evidence_refs: [],
          note: "Выбор зависит от срока заселения",
        },
      ],
      choice_assistance: {
        status: "conditional",
        preferred_property_id: request.property_ids[0]!,
        conditions: ["Подтвердить срок передачи ключей"],
        unresolved_questions: ["Финальная цена на дату сделки"],
      },
    });
    expect(expertResultSchema.parse(result)).not.toHaveProperty("match_score");
    const outcome = await harness.completion.complete(result);
    expect(outcome.result.choice_assistance?.status).toBe("conditional");
  });

  it("keeps an unknown visible when the expert is unable to verify", async () => {
    const harness = createHarness();
    const request = await advanceToInProgress(harness);
    const outcome = await harness.completion.complete(
      makeResult(request.request_id, {
        status: "unable_to_verify",
        checked_items: [
          {
            item_id: "checked_item_unable",
            subject: "Применимость семейной ипотеки",
            method: "Запрос внешнему источнику",
            outcome: "unable_to_verify",
            evidence_refs: [],
            note: "Ответ не получен",
          },
        ],
        findings: [],
        confirmed: [],
        unconfirmed: [
          {
            entity_id: request.property_ids[0]!,
            field: "financing.family_mortgage",
            outcome: "unable_to_verify",
            reason: "Ответ банка не получен",
            evidence_refs: [],
          },
        ],
        evidence_candidates: [],
      }),
    );
    expect(outcome.request.status).toBe("unable_to_complete");
    expect(harness.canonical.calls).toBe(0);
    expect(harness.recompute.calls).toBe(0);
  });

  it("rejects direct Match Score mutation and keeps a completed result immutable", async () => {
    const harness = createHarness();
    const request = await advanceToInProgress(harness);
    expect(() =>
      expertResultSchema.parse({
        ...makeResult(request.request_id),
        match_score: 99,
      }),
    ).toThrow();
    await harness.completion.complete(makeResult(request.request_id));
    await expect(
      harness.completion.complete(makeResult(request.request_id)),
    ).rejects.toThrow("EXPERT_REQUEST_NOT_IN_PROGRESS");
    expect(harness.repository.getResult(request.request_id)).not.toBeNull();
  });
});

describe("TASK-016 document and onsite application boundaries", () => {
  const baseSubmission = {
    propertyIds: [boundaryProperty.identity.property_id],
    comparisonRef: null,
    userRequestRef: boundaryUserRequest.user_request_id,
    field: null,
    userQuestion: "Проверьте конкретный вопрос в переданном контексте.",
  };

  it("accepts document_review with an accessible opaque document reference", async () => {
    const response = await postBoundaryRequest({
      owner: {
        owner_type: "anonymous",
        owner_id: "anonymous_document_boundary",
      },
      userRequest: boundaryUserRequest,
      submission: {
        ...baseSubmission,
        requestType: "document_review",
        triggerType: "document_question",
        questionCategory: "document",
        questionCode: "review_existing_document",
        documentRefs: [
          "document_ref:anonymous:anonymous_document_boundary:contract_1",
        ],
        onsite: null,
      },
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      status: "queued",
      required_specialist: "lawyer",
      created: true,
    });
  });

  it("rejects document_review without a document reference", async () => {
    const response = await postBoundaryRequest({
      owner: {
        owner_type: "anonymous",
        owner_id: "anonymous_document_missing",
      },
      userRequest: boundaryUserRequest,
      submission: {
        ...baseSubmission,
        requestType: "document_review",
        triggerType: "document_question",
        questionCategory: "document",
        questionCode: "review_missing_document",
        documentRefs: [],
        onsite: null,
      },
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "INVALID_EXPERT_REQUEST",
    });
  });

  it("rejects a document reference outside the request owner namespace", async () => {
    const response = await postBoundaryRequest({
      owner: {
        owner_type: "anonymous",
        owner_id: "anonymous_document_owner",
      },
      userRequest: boundaryUserRequest,
      submission: {
        ...baseSubmission,
        requestType: "document_review",
        triggerType: "document_question",
        questionCategory: "document",
        questionCode: "review_inaccessible_document",
        documentRefs: ["document_ref:anonymous:another_owner:contract_1"],
        onsite: null,
      },
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "EXPERT_REQUEST_REJECTED",
    });
  });

  it("rejects the same owner_id when owner_type differs", () => {
    const documentRef = createSessionDocumentReference(
      {
        owner_type: "anonymous",
        owner_id: "shared_document_owner",
      },
      "contract_1",
    );

    expect(
      canAccessSessionDocumentReference({
        owner: {
          owner_type: "session",
          owner_id: "shared_document_owner",
        },
        documentRef,
      }),
    ).toBe(false);
  });

  it("accepts onsite_check with scope and minimal optional context", async () => {
    const response = await postBoundaryRequest({
      owner: {
        owner_type: "anonymous",
        owner_id: "anonymous_onsite_boundary",
      },
      userRequest: boundaryUserRequest,
      submission: {
        ...baseSubmission,
        requestType: "onsite_check",
        triggerType: "onsite_needed",
        questionCategory: "physical_condition",
        questionCode: "check_property_onsite",
        documentRefs: [],
        onsite: {
          scope: "visual_physical",
        },
      },
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      status: "queued",
      required_specialist: "property_inspector",
      created: true,
    });
  });

  it("rejects onsite_check without scope", async () => {
    const response = await postBoundaryRequest({
      owner: {
        owner_type: "anonymous",
        owner_id: "anonymous_onsite_missing",
      },
      userRequest: boundaryUserRequest,
      submission: {
        ...baseSubmission,
        requestType: "onsite_check",
        triggerType: "onsite_needed",
        questionCategory: "physical_condition",
        questionCode: "check_property_without_scope",
        documentRefs: [],
        onsite: null,
      },
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "INVALID_EXPERT_REQUEST",
    });
  });

  it("exposes no upload, analysis, or scheduling endpoint", () => {
    expect(Object.keys(expertRequestRoute).sort()).toEqual(["POST", "runtime"]);
  });
});
