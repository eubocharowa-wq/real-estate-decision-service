import {
  dataQualitySchema,
  matchResultSchema,
  sourceConflictSchema,
  type DataQuality,
  type MatchResult,
  type Offer,
  type Property,
  type PurchaseScenario,
  type SourceConflict,
} from "../../src/domain";
import {
  EXPERT_RESULT_VERSION,
  ExpertCompletionService,
  ExpertRequestService,
  InMemoryExpertRequestRepository,
  createSequentialExpertIdFactory,
  type CanonicalUpdateOutcome,
  type CreateExpertRequestInput,
  type ExpertCanonicalUpdateHook,
  type ExpertContextAccessPolicy,
  type ExpertEvidenceIntegrationHook,
  type ExpertEvidenceIntegrationOutcome,
  type ExpertRecomputeHook,
  type ExpertRecomputeOutcome,
  type ExpertResult,
  type ExpertRequestType,
  type ExpertQuestionCategory,
  type ExpertTriggerType,
} from "../../src/expert";
import { loadPilotDataset } from "../../src/pilot-dataset";

export const NOW = "2026-08-23T12:00:00.000Z";
export const OWNER = {
  owner_type: "anonymous" as const,
  owner_id: "anonymous_session_fixture",
};

const dataset = loadPilotDataset();

const selectedProperties = (count: number): readonly Property[] =>
  dataset.properties.slice(0, count);

const offersFor = (properties: readonly Property[]): readonly Offer[] => {
  const ids = new Set(properties.map((item) => item.identity.property_id));
  return properties
    .map((property) =>
      dataset.offers.find(
        (offer) => offer.property_id === property.identity.property_id,
      ),
    )
    .filter((offer): offer is Offer =>
      Boolean(offer && ids.has(offer.property_id)),
    );
};

const scenariosFor = (
  properties: readonly Property[],
  offers: readonly Offer[],
): readonly PurchaseScenario[] => {
  const propertyIds = new Set(
    properties.map((property) => property.identity.property_id),
  );
  const offerIds = new Set(offers.map((offer) => offer.offer_id));
  return dataset.purchaseScenarios.filter(
    (scenario) =>
      propertyIds.has(scenario.property_id) && offerIds.has(scenario.offer_id),
  );
};

export const makeMatch = (property: Property, index = 0): MatchResult =>
  matchResultSchema.parse({
    schema_version: "1.0",
    match_result_id: `match_expert_${index + 1}`,
    user_request_id: dataset.userRequests[0]!.user_request_id,
    property_id: property.identity.property_id,
    purchase_scenario_id: null,
    eligibility_status: "eligible_with_unknowns",
    match_score: 78 - index,
    property_fit_score: 80 - index,
    financing_fit_score: 72 - index,
    data_confidence_score: 61 - index,
    data_completeness_score: 74 - index,
    ranking_score: 100 - index,
    criteria_results: [],
    hard_failures: [],
    compromises: ["Цена выше комфортного уровня"],
    strengths: ["Подходит по локации"],
    unknown_critical: ["Применимость семейной ипотеки не подтверждена"],
    recommended_actions: ["Подтвердить программу у банка"],
    algorithm_version: "matching-v1",
    calculated_at: NOW,
  });

export const makeDataQuality = (property: Property, index = 0): DataQuality =>
  dataQualitySchema.parse({
    schema_version: "1.0",
    data_quality_id: `data_quality_expert_${index + 1}`,
    data_confidence_score: 61 - index,
    data_completeness_score: 74 - index,
    freshness_score: 80,
    confidence_status: "low",
    critical_unknown_count: 1,
    critical_conflict_count: index === 0 ? 1 : 0,
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

export const makeConflict = (property: Property): SourceConflict =>
  sourceConflictSchema.parse({
    schema_version: "1.0",
    conflict_id: "conflict_expert_price",
    entity_id: property.identity.property_id,
    field: "listing_price",
    evidence_ids: ["evidence_price_a", "evidence_price_b"],
    severity: "critical",
    status: "open",
    resolved_value: null,
    resolution_reason: null,
    resolved_by: null,
    resolved_at: null,
  });

export const makeCreateInput = (
  options: {
    readonly requestType?: ExpertRequestType;
    readonly triggerType?: ExpertTriggerType;
    readonly questionCategory?: ExpertQuestionCategory;
    readonly propertyCount?: number;
    readonly question?: string;
    readonly withConflict?: boolean;
    readonly documentRefs?: readonly string[];
    readonly useHouse?: boolean;
  } = {},
): CreateExpertRequestInput => {
  const requestType = options.requestType ?? "information_verification";
  const triggerType = options.triggerType ?? "critical_unknown";
  const questionCategory = options.questionCategory ?? "financing";
  const propertyCount = options.propertyCount ?? 1;
  const house = dataset.properties.find(
    (property) => property.property_type === "house",
  );
  const properties =
    options.useHouse && house ? [house] : selectedProperties(propertyCount);
  const offers = offersFor(properties);
  const scenarios = scenariosFor(properties, offers);
  const conflicts = options.withConflict ? [makeConflict(properties[0]!)] : [];
  return {
    owner: OWNER,
    requestType,
    triggerType,
    questionCategory,
    comparisonId:
      requestType === "choice_assistance" ? "comparison_expert_fixture" : null,
    question:
      options.question ??
      "Подтвердите применимость семейной ипотеки для выбранного предложения.",
    structuredQuestions: [
      {
        question_code: "check_family_mortgage",
        field: "financing.family_mortgage",
        entity_id: properties[0]!.identity.property_id,
        reason: "Критичный must-критерий пока имеет claimed status",
        priority: "critical",
      },
    ],
    priority: {
      preDecision: true,
      mustCriterion: true,
      financialImpact: true,
      unresolvedConflict: conflicts.length > 0,
      transactionDeadline: null,
      explicitUrgency: "normal",
    },
    context: {
      userRequest: dataset.userRequests[0]!,
      properties,
      selectedOffers: offers,
      selectedPurchaseScenarios: scenarios,
      matchResults: properties.map(makeMatch),
      dataQuality: properties.map((property, index) => ({
        propertyId: property.identity.property_id,
        dataQuality: makeDataQuality(property, index),
      })),
      criticalUnknowns: [
        {
          entityId: properties[0]!.identity.property_id,
          field: "financing.family_mortgage",
          reason: "Источник только заявляет применимость",
          mustCriterion: true,
          evidenceRefs: ["evidence_family_mortgage_claim"],
        },
      ],
      conflicts,
      recommendedChecks: [
        {
          checkCode: "confirm_family_mortgage",
          entityId: properties[0]!.identity.property_id,
          field: "financing.family_mortgage",
          reason: "Без проверки hard applicability остаётся unknown",
          priority: "critical",
        },
      ],
      sourceEvidenceRefs: ["evidence_family_mortgage_claim"],
      choice:
        requestType === "choice_assistance"
          ? {
              tradeoffs: [
                {
                  statement: "Цена против готовности к заселению",
                  propertyIds: properties.map(
                    (property) => property.identity.property_id,
                  ),
                },
              ],
              decisionDrivers: ["Бюджет", "Срок заселения"],
            }
          : null,
      documentRefs: [...(options.documentRefs ?? [])],
      onsite:
        requestType === "onsite_check"
          ? {
              scope:
                questionCategory === "structural_engineering"
                  ? "structural_engineering"
                  : "visual_physical",
              knownRisks: ["Статус подключения газа неизвестен"],
              itemsToCheck: ["Проверить фактическое подключение газа"],
            }
          : null,
      latestSourceDataAt: NOW,
    },
  };
};

export class AllowAllAccessPolicy implements ExpertContextAccessPolicy {
  async canAccess(): Promise<boolean> {
    return true;
  }
}

export class RecordingEvidenceHook implements ExpertEvidenceIntegrationHook {
  calls = 0;
  validate = true;
  validateExistingReferences(): boolean {
    return this.validate;
  }
  integrate(): ExpertEvidenceIntegrationOutcome {
    this.calls += 1;
    return {
      createdEvidenceIds: ["evidence_expert_confirmed"],
      affectedPropertyIds: [dataset.properties[0]!.identity.property_id],
      affectedOfferIds: [],
      affectedScenarioIds: [],
    };
  }
}

export class RecordingCanonicalHook implements ExpertCanonicalUpdateHook {
  calls = 0;
  lastInput:
    Parameters<ExpertCanonicalUpdateHook["requestCanonicalUpdate"]>[0] | null =
    null;
  requestCanonicalUpdate(
    input: Parameters<ExpertCanonicalUpdateHook["requestCanonicalUpdate"]>[0],
  ): CanonicalUpdateOutcome {
    this.calls += 1;
    this.lastInput = structuredClone(input);
    return {
      updateRequestIds: ["canonical_update_expert_1"],
      resolvedConflictIds: input.conflictResolutions.map(
        (resolution) => resolution.conflictId,
      ),
    };
  }
}

export class RecordingRecomputeHook implements ExpertRecomputeHook {
  calls = 0;
  requestRecompute(): ExpertRecomputeOutcome {
    this.calls += 1;
    return {
      dataQualityRequestIds: ["recompute_data_quality_1"],
      matchResultRequestIds: ["recompute_match_result_1"],
    };
  }
}

export const createHarness = () => {
  const repository = new InMemoryExpertRequestRepository();
  const createId = createSequentialExpertIdFactory("test_expert");
  const assignmentCalls: string[] = [];
  const service = new ExpertRequestService(
    repository,
    new AllowAllAccessPolicy(),
    {
      onAssigned: ({ requestId }) => {
        assignmentCalls.push(requestId);
      },
    },
    createId,
    () => NOW,
  );
  const evidence = new RecordingEvidenceHook();
  const canonical = new RecordingCanonicalHook();
  const recompute = new RecordingRecomputeHook();
  const completion = new ExpertCompletionService(
    repository,
    evidence,
    canonical,
    recompute,
    createId,
    () => NOW,
  );
  return {
    repository,
    service,
    completion,
    evidence,
    canonical,
    recompute,
    assignmentCalls,
  };
};

export const advanceToInProgress = async (
  harness: ReturnType<typeof createHarness>,
  input = makeCreateInput(),
) => {
  const created = await harness.service.createDraft(input);
  await harness.service.submit(created.request.request_id, OWNER);
  await harness.service.assignExpertRequest({
    requestId: created.request.request_id,
    specialistRef: "specialist_fixture_1",
    specialistType: created.request.required_specialist,
  });
  await harness.service.transition({
    requestId: created.request.request_id,
    status: "in_progress",
    actorType: "expert",
    actorRef: "specialist_fixture_1",
    reasonCode: "WORK_STARTED",
  });
  return (await harness.repository.get(created.request.request_id))!;
};

export const makeResult = (
  requestId: string,
  overrides: Partial<ExpertResult> = {},
): ExpertResult => ({
  result_version: EXPERT_RESULT_VERSION,
  expert_result_id: "expert_result_fixture_1",
  request_id: requestId,
  status: "completed",
  checked_items: [
    {
      item_id: "checked_item_fixture_1",
      subject: "Применимость семейной ипотеки",
      method: "Проверка официального ответа банка",
      outcome: "confirmed",
      evidence_refs: ["evidence_candidate_fixture_1"],
      note: null,
    },
  ],
  findings: [
    {
      finding_id: "finding_fixture_1",
      category: "financing",
      severity: "important",
      statement: "Программа применима к выбранному предложению.",
      related_entity_ids: [dataset.properties[0]!.identity.property_id],
      related_field: "financing.family_mortgage",
      evidence_refs: ["evidence_candidate_fixture_1"],
      verification_effect: "confirmed",
    },
  ],
  confirmed: [
    {
      entity_id: dataset.properties[0]!.identity.property_id,
      field: "financing.family_mortgage",
      value: true,
      evidence_refs: ["evidence_candidate_fixture_1"],
    },
  ],
  unconfirmed: [],
  conflicts: [],
  risks: [],
  recommendations: ["Сохранить подтверждение банка к сделке"],
  next_actions: ["Пересчитать сценарий покупки"],
  evidence_refs: [],
  evidence_candidates: [
    {
      evidence_candidate_id: "evidence_candidate_fixture_1",
      evidence_type: "manual_expert",
      entity_type: "property_financing_eligibility",
      entity_id: dataset.properties[0]!.identity.property_id,
      field: "financing.family_mortgage",
      value: true,
      verification_status: "confirmed",
      checked_at: NOW,
      checked_by: "specialist_fixture_1",
      method: "official_bank_response",
      supporting_reference: "bank_response_ref_1",
      note: null,
    },
  ],
  specialist: {
    specialist_ref: "specialist_fixture_1",
    specialist_type: "mortgage_specialist",
  },
  choice_assistance: null,
  disclaimer: null,
  completed_at: NOW,
  ...overrides,
});
