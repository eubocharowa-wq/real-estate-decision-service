import {
  dataQualitySchema,
  matchResultSchema,
  sourceConflictSchema,
  type Offer,
  type Property,
  type PurchaseScenario,
} from "../domain";
import {
  ExpertCompletionService,
  ExpertRequestService,
  InMemoryExpertRequestRepository,
  canAccessSessionDocumentReference,
  createSequentialExpertIdFactory,
  type CreateExpertRequestInput,
  type ExpertCanonicalUpdateHook,
  type ExpertContextAccessPolicy,
  type ExpertEvidenceIntegrationHook,
  type ExpertRecomputeHook,
  type ExpertRequestType,
  type ExpertQuestionCategory,
  type ExpertTriggerType,
  type SpecialistType,
} from "../expert";
import { loadPilotDataset } from "../pilot-dataset";
import { ExpertWorkbenchApplicationService } from "./application";
import type { ExpertResultDraft, ExpertWorkbenchActor } from "./contracts";
import { InMemoryExpertResultDraftRepository } from "./draft";
import { ScopedExpertWorkbenchPermissionPolicy } from "./permissions";

export const EXPERT_FIXTURE_OWNER = {
  owner_type: "anonymous" as const,
  owner_id: "anonymous_expert_workbench_fixture",
};

export const EXPERT_FIXTURE_ACTORS: Readonly<
  Record<
    SpecialistType,
    Extract<ExpertWorkbenchActor, { actor_type: "expert" }>
  >
> = Object.freeze({
  real_estate_expert: {
    actor_type: "expert",
    actor_ref: "fixture_real_estate_expert",
    specialist_type: "real_estate_expert",
  },
  lawyer: {
    actor_type: "expert",
    actor_ref: "fixture_lawyer",
    specialist_type: "lawyer",
  },
  mortgage_specialist: {
    actor_type: "expert",
    actor_ref: "fixture_mortgage_specialist",
    specialist_type: "mortgage_specialist",
  },
  property_inspector: {
    actor_type: "expert",
    actor_ref: "fixture_property_inspector",
    specialist_type: "property_inspector",
  },
  technical_specialist: {
    actor_type: "expert",
    actor_ref: "fixture_technical_specialist",
    specialist_type: "technical_specialist",
  },
});

export const EXPERT_FIXTURE_OWNER_ACTOR: ExpertWorkbenchActor = {
  actor_type: "owner",
  actor_ref: EXPERT_FIXTURE_OWNER.owner_id,
  owner: EXPERT_FIXTURE_OWNER,
};

const dataset = loadPilotDataset();
const FIXTURE_NOW = "2026-08-23T12:00:00.000Z";

const properties = (count: number): readonly Property[] =>
  dataset.properties.slice(0, count);

const offersFor = (selected: readonly Property[]): readonly Offer[] =>
  selected.flatMap((property) => {
    const offer = dataset.offers.find(
      (candidate) => candidate.property_id === property.identity.property_id,
    );
    return offer ? [offer] : [];
  });

const scenariosFor = (
  selected: readonly Property[],
  offers: readonly Offer[],
): readonly PurchaseScenario[] => {
  const propertyIds = new Set(
    selected.map((property) => property.identity.property_id),
  );
  const offerIds = new Set(offers.map((offer) => offer.offer_id));
  return dataset.purchaseScenarios.filter(
    (scenario) =>
      propertyIds.has(scenario.property_id) && offerIds.has(scenario.offer_id),
  );
};

const matchFor = (property: Property, index: number) =>
  matchResultSchema.parse({
    schema_version: "1.0",
    match_result_id: `match_workbench_${property.identity.property_id}`,
    user_request_id: dataset.userRequests[0]!.user_request_id,
    property_id: property.identity.property_id,
    purchase_scenario_id: null,
    eligibility_status: "eligible_with_unknowns",
    match_score: 88 - index * 3,
    property_fit_score: 90 - index * 3,
    financing_fit_score: 82 - index * 2,
    data_confidence_score: 68 - index * 4,
    data_completeness_score: 76 - index * 2,
    ranking_score: 90 - index,
    criteria_results: [],
    hard_failures: [],
    compromises: ["Есть компромисс по сроку или финансовому сценарию"],
    strengths: ["Проходит ключевые подтверждённые условия"],
    unknown_critical: ["Критичное условие требует экспертной проверки"],
    recommended_actions: ["Проверить критичное условие"],
    algorithm_version: "matching-v1",
    calculated_at: FIXTURE_NOW,
  });

const qualityFor = (property: Property, index: number) =>
  dataQualitySchema.parse({
    schema_version: "1.0",
    data_quality_id: `quality_workbench_${property.identity.property_id}`,
    data_confidence_score: 68 - index * 4,
    data_completeness_score: 76 - index * 2,
    freshness_score: 72,
    confidence_status: "low",
    critical_unknown_count: 1,
    critical_conflict_count: 0,
    critical_override: true,
    fields: [],
    recommended_checks: [
      {
        field: "financing.family_mortgage",
        priority: "critical",
        action: "Подтвердить применимость программы",
      },
    ],
    algorithm_version: "confidence-v1",
  });

interface FixtureRequestOptions {
  readonly scenarioId: string;
  readonly requestType?: ExpertRequestType;
  readonly triggerType?: ExpertTriggerType;
  readonly questionCategory?: ExpertQuestionCategory;
  readonly propertyCount?: number;
  readonly question: string;
  readonly withConflict?: boolean;
}

const makeInput = (
  options: FixtureRequestOptions,
  knownEvidence: Set<string>,
): CreateExpertRequestInput => {
  const requestType = options.requestType ?? "information_verification";
  const triggerType = options.triggerType ?? "critical_unknown";
  const questionCategory = options.questionCategory ?? "financing";
  const selected = properties(options.propertyCount ?? 1);
  const offers = offersFor(selected);
  const scenarios = scenariosFor(selected, offers);
  const evidenceRefs = [
    `evidence_${options.scenarioId}`,
    ...(options.withConflict
      ? [
          `evidence_${options.scenarioId}_price_a`,
          `evidence_${options.scenarioId}_price_b`,
        ]
      : []),
  ];
  evidenceRefs.forEach((ref) => knownEvidence.add(ref));
  const conflicts = options.withConflict
    ? [
        sourceConflictSchema.parse({
          schema_version: "1.0",
          conflict_id: `conflict_${options.scenarioId}`,
          entity_id: selected[0]!.identity.property_id,
          field: "listing_price",
          evidence_ids: evidenceRefs.slice(-2),
          severity: "critical",
          status: "open",
          resolved_value: null,
          resolution_reason: null,
          resolved_by: null,
          resolved_at: null,
        }),
      ]
    : [];
  const documentRefs =
    requestType === "document_review"
      ? [
          `document_ref:${EXPERT_FIXTURE_OWNER.owner_type}:${EXPERT_FIXTURE_OWNER.owner_id}:contract_fixture`,
        ]
      : [];
  return {
    owner: EXPERT_FIXTURE_OWNER,
    requestType,
    triggerType,
    questionCategory,
    comparisonId:
      requestType === "choice_assistance"
        ? `comparison_${options.scenarioId}`
        : null,
    question: options.question,
    structuredQuestions: [
      {
        question_code: `question_${options.scenarioId}`,
        field:
          questionCategory === "price"
            ? "listing_price"
            : "financing.family_mortgage",
        entity_id: selected[0]!.identity.property_id,
        reason: "Проверить критичный факт, который может изменить решение",
        priority: "critical",
      },
    ],
    priority: {
      preDecision: true,
      mustCriterion: true,
      financialImpact:
        questionCategory === "financing" || questionCategory === "price",
      unresolvedConflict: Boolean(options.withConflict),
      transactionDeadline: null,
      explicitUrgency: "normal",
    },
    context: {
      userRequest: dataset.userRequests[0]!,
      properties: selected,
      selectedOffers: offers,
      selectedPurchaseScenarios: scenarios,
      matchResults: selected.map(matchFor),
      dataQuality: selected.map((property, index) => ({
        propertyId: property.identity.property_id,
        dataQuality: qualityFor(property, index),
      })),
      criticalUnknowns: [
        {
          entityId: selected[0]!.identity.property_id,
          field:
            questionCategory === "price"
              ? "listing_price"
              : "financing.family_mortgage",
          reason: "Текущее значение не подтверждено для решения",
          mustCriterion: true,
          evidenceRefs: [evidenceRefs[0]!],
        },
      ],
      conflicts,
      recommendedChecks: [
        {
          checkCode: `check_${options.scenarioId}`,
          entityId: selected[0]!.identity.property_id,
          field:
            questionCategory === "price"
              ? "listing_price"
              : "financing.family_mortgage",
          reason: "Получить подтверждение по конкретному объекту",
          priority: "critical",
        },
      ],
      sourceEvidenceRefs: evidenceRefs,
      choice:
        requestType === "choice_assistance"
          ? {
              tradeoffs: [
                {
                  statement:
                    "Один вариант дешевле, другой лучше по сроку въезда",
                  propertyIds: selected.map(
                    (property) => property.identity.property_id,
                  ),
                },
              ],
              decisionDrivers: [
                "Обязательный бюджет",
                "Срок въезда",
                "Надёжность финансовых условий",
              ],
            }
          : null,
      documentRefs,
      onsite:
        requestType === "onsite_check"
          ? {
              scope:
                questionCategory === "structural_engineering"
                  ? "structural_engineering"
                  : "visual_physical",
              knownRisks: ["Физическое состояние нельзя подтвердить удалённо"],
              itemsToCheck: ["Проверить видимый физический признак на месте"],
            }
          : null,
      latestSourceDataAt: FIXTURE_NOW,
    },
  };
};

class FixtureAccessPolicy implements ExpertContextAccessPolicy {
  canAccess(
    input: Parameters<ExpertContextAccessPolicy["canAccess"]>[0],
  ): boolean {
    if (input.entityType === "document")
      return canAccessSessionDocumentReference({
        owner: input.owner,
        documentRef: input.entityId,
      });
    return true;
  }
}

class FixtureEvidenceHook implements ExpertEvidenceIntegrationHook {
  constructor(private readonly refs: Set<string>) {}
  validateExistingReferences(evidenceRefs: readonly string[]): boolean {
    return evidenceRefs.every((ref) => this.refs.has(ref));
  }
  integrate(input: Parameters<ExpertEvidenceIntegrationHook["integrate"]>[0]) {
    const createdEvidenceIds = input.candidates.map(
      (candidate) => `integrated_${candidate.evidence_candidate_id}`,
    );
    createdEvidenceIds.forEach((ref) => this.refs.add(ref));
    return {
      createdEvidenceIds,
      affectedPropertyIds: input.request.property_ids,
      affectedOfferIds: input.request.offer_ids,
      affectedScenarioIds: input.request.purchase_scenario_ids,
    };
  }
}

export class FixtureCanonicalHook implements ExpertCanonicalUpdateHook {
  readonly calls: Array<
    Parameters<ExpertCanonicalUpdateHook["requestCanonicalUpdate"]>[0]
  > = [];
  requestCanonicalUpdate(
    input: Parameters<ExpertCanonicalUpdateHook["requestCanonicalUpdate"]>[0],
  ) {
    this.calls.push(structuredClone(input));
    return {
      updateRequestIds: input.result.confirmed.map(
        (_, index) => `canonical_fixture_${this.calls.length}_${index + 1}`,
      ),
      resolvedConflictIds: input.conflictResolutions.map(
        (resolution) => resolution.conflictId,
      ),
    };
  }
}

class FixtureRecomputeHook implements ExpertRecomputeHook {
  requestRecompute(
    input: Parameters<ExpertRecomputeHook["requestRecompute"]>[0],
  ) {
    return {
      dataQualityRequestIds: input.propertyIds.map(
        (id) => `recompute_quality_${id}`,
      ),
      matchResultRequestIds: input.propertyIds.map(
        (id) => `recompute_match_${id}`,
      ),
    };
  }
}

export interface ExpertWorkbenchFixtureRuntime {
  readonly application: ExpertWorkbenchApplicationService;
  readonly repository: InMemoryExpertRequestRepository;
  readonly drafts: InMemoryExpertResultDraftRepository;
  readonly canonicalHook: FixtureCanonicalHook;
  readonly scenarioRequestIds: Readonly<Record<string, string>>;
}

const checkedDraft = (
  draft: ExpertResultDraft,
  evidenceRef: string,
): ExpertResultDraft => ({
  ...draft,
  check_items: draft.check_items.map((item) => ({
    ...item,
    status: "checked_confirmed",
    verification_method: "expert_analysis",
    evidence_refs: [evidenceRef],
  })),
  evidence_refs: [evidenceRef],
  recommendation: {
    statement:
      "Результат проверки нужно учитывать вместе с исходными условиями.",
    conditions: [],
    related_property_ids: [],
  },
  next_actions: ["recalculate_match"],
});

export const createExpertWorkbenchFixtureRuntime =
  async (): Promise<ExpertWorkbenchFixtureRuntime> => {
    const repository = new InMemoryExpertRequestRepository();
    const drafts = new InMemoryExpertResultDraftRepository();
    const createId = createSequentialExpertIdFactory("workbench_fixture");
    let tick = 0;
    const clock = () =>
      new Date(Date.parse(FIXTURE_NOW) + tick++ * 1000).toISOString();
    const knownEvidence = new Set<string>();
    const requestService = new ExpertRequestService(
      repository,
      new FixtureAccessPolicy(),
      { onAssigned: () => undefined },
      createId,
      clock,
    );
    const canonicalHook = new FixtureCanonicalHook();
    const completion = new ExpertCompletionService(
      repository,
      new FixtureEvidenceHook(knownEvidence),
      canonicalHook,
      new FixtureRecomputeHook(),
      createId,
      clock,
    );
    const application = new ExpertWorkbenchApplicationService(
      repository,
      drafts,
      requestService,
      completion,
      new ScopedExpertWorkbenchPermissionPolicy(),
      createId,
      clock,
    );
    const scenarioRequestIds: Record<string, string> = {};

    const createInProgress = async (options: FixtureRequestOptions) => {
      const created = requestService.createDraft(
        makeInput(options, knownEvidence),
      );
      requestService.submit(created.request.request_id, EXPERT_FIXTURE_OWNER);
      const actor = EXPERT_FIXTURE_ACTORS[created.request.required_specialist];
      await requestService.assignExpertRequest({
        requestId: created.request.request_id,
        specialistRef: actor.actor_ref,
        specialistType: actor.specialist_type,
      });
      requestService.transition({
        requestId: created.request.request_id,
        status: "in_progress",
        actorType: "expert",
        actorRef: actor.actor_ref,
        reasonCode: "FIXTURE_WORK_STARTED",
      });
      scenarioRequestIds[options.scenarioId] = created.request.request_id;
      return { request: repository.get(created.request.request_id)!, actor };
    };

    const completeScenario = async (
      options: FixtureRequestOptions,
      mutate: (
        draft: ExpertResultDraft,
        evidenceRef: string,
      ) => ExpertResultDraft,
    ) => {
      const { request, actor } = await createInProgress(options);
      const workbench = application.openWorkbench(actor, request.request_id);
      const evidenceRef = workbench.contextPackage.source_evidence_refs[0]!;
      drafts.save(
        mutate(
          checkedDraft(workbench.currentResultDraft, evidenceRef),
          evidenceRef,
        ),
      );
      await application.complete({ actor, requestId: request.request_id });
    };

    await completeScenario(
      {
        scenarioId: "financing_verification_completed",
        question: "Подтвердите применимость семейной ипотеки к этому объекту.",
      },
      (draft, evidenceRef) => ({
        ...draft,
        confirmed: [
          {
            entity_id: repository.listAll().at(-1)!.property_ids[0]!,
            field: "financing.family_mortgage",
            value: true,
            evidence_refs: [evidenceRef],
          },
        ],
        recommendation: {
          statement: "Программа подтверждена для выбранного предложения.",
          conditions: [],
          related_property_ids: repository.listAll().at(-1)!.property_ids,
        },
      }),
    );

    await completeScenario(
      {
        scenarioId: "price_conflict_resolved",
        triggerType: "critical_conflict",
        questionCategory: "price",
        question: "Разрешите конфликт актуальной цены между источниками.",
        withConflict: true,
      },
      (draft, evidenceRef) => ({
        ...draft,
        confirmed: [
          {
            entity_id: repository.listAll().at(-1)!.property_ids[0]!,
            field: "listing_price",
            value: 4_900_000,
            evidence_refs: [evidenceRef],
          },
        ],
        conflicts: draft.conflicts.map((conflict) => ({
          ...conflict,
          outcome: "resolution_requested",
          reason: "Цена подтверждена отдельным экспертным evidence",
          resolved_value: 4_900_000,
        })),
      }),
    );

    await completeScenario(
      {
        scenarioId: "price_conflict_unresolved",
        triggerType: "critical_conflict",
        questionCategory: "price",
        question:
          "Проверьте расхождение цены без выбора неподтверждённого значения.",
        withConflict: true,
      },
      (draft) => ({
        ...draft,
        check_items: draft.check_items.map((item) => ({
          ...item,
          status: "checked_conflicting",
          verification_method: "source_review",
        })),
        confirmed: [],
        recommendation: {
          statement: "Не принимать решение по цене до дополнительной проверки.",
          conditions: [],
          related_property_ids: repository.listAll().at(-1)!.property_ids,
        },
        next_actions: ["verify_again"],
      }),
    );

    for (const status of ["clear", "conditional", "near_tie"] as const) {
      await completeScenario(
        {
          scenarioId: `choice_assistance_${status}`,
          requestType: "choice_assistance",
          triggerType: "comparison_uncertainty",
          questionCategory: "comparison",
          propertyCount: 3,
          question: `Помогите выбрать между тремя финалистами: сценарий ${status}.`,
        },
        (draft) => ({
          ...draft,
          choice_assistance: {
            status,
            preferred_property_id:
              status === "near_tie"
                ? null
                : repository.listAll().at(-1)!.property_ids[0]!,
            conditions:
              status === "conditional"
                ? ["Если подтвердится финансовое условие"]
                : [],
            unresolved_questions:
              status === "clear" ? [] : ["Подтвердить финальный платёж"],
          },
        }),
      );
    }

    await completeScenario(
      {
        scenarioId: "document_review_important",
        requestType: "document_review",
        triggerType: "document_question",
        questionCategory: "document",
        question: "Проверьте существенное условие существующего документа.",
      },
      (draft, evidenceRef) => ({
        ...draft,
        findings: [
          {
            finding_id: "finding_document_important",
            category: "document",
            severity: "important",
            statement: "Срок в документе отличается от карточки объекта.",
            related_entity_ids: repository.listAll().at(-1)!.property_ids,
            related_field: "handover_date",
            evidence_refs: [evidenceRef],
            verification_effect: "conflicting",
            requires_technical_specialist: false,
          },
        ],
        next_actions: ["request_document"],
      }),
    );

    await completeScenario(
      {
        scenarioId: "onsite_unable_to_check",
        requestType: "onsite_check",
        triggerType: "onsite_needed",
        questionCategory: "physical_condition",
        question: "Проверьте визуально состояние выбранного объекта.",
      },
      (draft) => ({
        ...draft,
        check_items: draft.check_items.map((item) => ({
          ...item,
          status: "unable_to_check",
          verification_method: "visual_onsite",
          evidence_refs: [],
        })),
        confirmed: [],
        unable_to_complete_reason: "Доступ к объекту не был предоставлен.",
        recommendation: null,
        next_actions: ["onsite_check"],
      }),
    );

    await completeScenario(
      {
        scenarioId: "technical_escalation",
        requestType: "onsite_check",
        triggerType: "onsite_needed",
        questionCategory: "physical_condition",
        question:
          "Проверьте видимый дефект и определите необходимость эскалации.",
      },
      (draft, evidenceRef) => ({
        ...draft,
        findings: [
          {
            finding_id: "finding_requires_technical_specialist",
            category: "property_condition",
            severity: "critical",
            statement:
              "Наблюдается трещина; причина требует отдельной технической оценки.",
            related_entity_ids: repository.listAll().at(-1)!.property_ids,
            related_field: "condition.visible_crack",
            evidence_refs: [evidenceRef],
            verification_effect: "none",
            requires_technical_specialist: true,
          },
        ],
        next_actions: ["technical_inspection"],
      }),
    );

    const waiting = await createInProgress({
      scenarioId: "waiting_for_user",
      requestType: "document_review",
      triggerType: "document_question",
      questionCategory: "document",
      question: "Нужна дополнительная версия документа от пользователя.",
    });
    application.openWorkbench(waiting.actor, waiting.request.request_id);
    application.transition({
      actor: waiting.actor,
      requestId: waiting.request.request_id,
      status: "waiting_for_user",
      reasonCode: "FIXTURE_DOCUMENT_REQUIRED",
    });

    for (const [index, priority] of [
      "critical",
      "high",
      "normal",
      "low",
    ].entries()) {
      const base = makeInput(
        {
          scenarioId: `queue_${priority}`,
          triggerType: "user_requested",
          questionCategory: "price",
          question: `Проверьте дополнительный вопрос очереди уровня ${priority}.`,
        },
        knownEvidence,
      );
      const created = requestService.createDraft({
        ...base,
        priority: {
          preDecision: priority === "critical",
          mustCriterion: priority === "critical" || priority === "high",
          financialImpact:
            priority === "critical" ||
            priority === "high" ||
            priority === "normal",
          unresolvedConflict: false,
          transactionDeadline: null,
          explicitUrgency: "none",
        },
      });
      requestService.submit(created.request.request_id, EXPERT_FIXTURE_OWNER);
      if (index === 0)
        scenarioRequestIds.queue_first = created.request.request_id;
    }

    return {
      application,
      repository,
      drafts,
      canonicalHook,
      scenarioRequestIds: Object.freeze(scenarioRequestIds),
    };
  };

let runtimePromise: Promise<ExpertWorkbenchFixtureRuntime> | null = null;

export const getExpertWorkbenchFixtureRuntime = () => {
  runtimePromise ??= createExpertWorkbenchFixtureRuntime();
  return runtimePromise;
};
