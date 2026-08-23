import type {
  DataQuality,
  MatchResult,
  Offer,
  Property,
  PurchaseScenario,
  SourceConflict,
  UserRequest,
} from "../domain";
import {
  EXPERT_CONTEXT_PACKAGE_VERSION,
  expertContextPackageSchema,
  type ExpertContextPackage,
  type ExpertPriority,
  type ExpertQuestionCategory,
  type ExpertRequestType,
  type StructuredQuestion,
} from "./contracts";

export interface DataQualityContextInput {
  readonly propertyId: string;
  readonly dataQuality: DataQuality;
}

export interface CriticalUnknownInput {
  readonly entityId: string;
  readonly field: string;
  readonly reason: string;
  readonly mustCriterion: boolean;
  readonly evidenceRefs: readonly string[];
}

export interface RecommendedExpertCheckInput {
  readonly checkCode: string;
  readonly entityId: string;
  readonly field: string;
  readonly reason: string;
  readonly priority: ExpertPriority;
}

export interface ChoiceTradeoffInput {
  readonly statement: string;
  readonly propertyIds: readonly string[];
}

export interface ChoiceContextInput {
  readonly tradeoffs: readonly ChoiceTradeoffInput[];
  readonly decisionDrivers: readonly string[];
}

export interface OnsiteContextInput {
  readonly scope: "visual_physical" | "structural_engineering";
  readonly knownRisks: readonly string[];
  readonly itemsToCheck: readonly string[];
}

export interface ExpertContextBuildInput {
  readonly contextPackageId: string;
  readonly expertRequestId: string;
  readonly requestType: ExpertRequestType;
  readonly questionCategory: ExpertQuestionCategory;
  readonly userRequest: UserRequest;
  readonly properties: readonly Property[];
  readonly selectedOffers: readonly Offer[];
  readonly selectedPurchaseScenarios: readonly PurchaseScenario[];
  readonly matchResults: readonly MatchResult[];
  readonly dataQuality: readonly DataQualityContextInput[];
  readonly criticalUnknowns: readonly CriticalUnknownInput[];
  readonly conflicts: readonly SourceConflict[];
  readonly recommendedChecks: readonly RecommendedExpertCheckInput[];
  readonly sourceEvidenceRefs: readonly string[];
  readonly userQuestion: string;
  readonly structuredQuestions: readonly StructuredQuestion[];
  readonly choice: ChoiceContextInput | null;
  readonly documentRefs: readonly string[];
  readonly onsite: OnsiteContextInput | null;
  readonly createdAt: string;
  readonly latestSourceDataAt: string | null;
}

const locationLabel = (property: Property): string => {
  const address = property.location.address;
  const parts = [
    address.city,
    address.locality,
    address.district,
    address.street,
    address.house_number,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : "Локация не указана";
};

const requestCriteria = (userRequest: UserRequest) => [
  ...userRequest.must_have.map((criterion) => ({
    criterion_id: criterion.criterion_id,
    field: criterion.field,
    priority: "must" as const,
    target: criterion.target,
    user_expression: criterion.user_expression,
  })),
  ...userRequest.nice_to_have.map((criterion) => ({
    criterion_id: criterion.criterion_id,
    field: criterion.field,
    priority: "preferred" as const,
    target: criterion.target,
    user_expression: criterion.user_expression,
  })),
  ...userRequest.avoid.map((criterion) => ({
    criterion_id: criterion.criterion_id,
    field: criterion.field,
    priority:
      criterion.priority === "exclude"
        ? ("exclude" as const)
        : ("avoid" as const),
    target: criterion.target,
    user_expression: criterion.user_expression,
  })),
];

const needsFinancingContext = (
  requestType: ExpertRequestType,
  category: ExpertQuestionCategory,
): boolean =>
  category === "financing" ||
  requestType === "choice_assistance" ||
  requestType === "consultation";

const needsTimelineContext = (
  requestType: ExpertRequestType,
  category: ExpertQuestionCategory,
): boolean =>
  requestType === "choice_assistance" ||
  requestType === "transaction_question" ||
  category === "availability" ||
  category === "transaction";

const unique = (values: readonly string[]): string[] => [...new Set(values)];

export const buildExpertContextPackage = (
  input: ExpertContextBuildInput,
): ExpertContextPackage => {
  if (input.properties.length === 0)
    throw new Error("CONTEXT_REQUIRES_PROPERTY");
  if (input.requestType === "choice_assistance") {
    const count = unique(
      input.properties.map((property) => property.identity.property_id),
    ).length;
    if (count < 2 || count > 5)
      throw new Error("CHOICE_ASSISTANCE_REQUIRES_2_TO_5_FINALISTS");
    if (!input.choice) throw new Error("CHOICE_ASSISTANCE_REQUIRES_TRADEOFFS");
  }
  if (input.requestType !== "choice_assistance" && input.choice)
    throw new Error("CHOICE_CONTEXT_ONLY_ALLOWED_FOR_CHOICE_ASSISTANCE");
  if (
    input.requestType === "document_review" &&
    input.documentRefs.length === 0
  )
    throw new Error("DOCUMENT_REVIEW_REQUIRES_DOCUMENT_REFERENCE");
  if (input.requestType === "onsite_check" && !input.onsite)
    throw new Error("ONSITE_CHECK_REQUIRES_SCOPE");

  const propertyIds = new Set(
    input.properties.map((property) => property.identity.property_id),
  );
  const selectedOffers = input.selectedOffers.filter((offer) =>
    propertyIds.has(offer.property_id),
  );
  const offerIds = new Set(selectedOffers.map((offer) => offer.offer_id));
  const selectedScenarios = input.selectedPurchaseScenarios.filter(
    (scenario) =>
      propertyIds.has(scenario.property_id) && offerIds.has(scenario.offer_id),
  );
  const scenarioIds = new Set(
    selectedScenarios.map((scenario) => scenario.scenario_id),
  );
  const relevantEntityIds = new Set([
    ...propertyIds,
    ...offerIds,
    ...scenarioIds,
  ]);
  const sourceEvidenceRefs = unique([
    ...input.sourceEvidenceRefs,
    ...input.properties.flatMap((property) => property.metadata.evidence_refs),
    ...selectedOffers.flatMap((offer) => offer.evidence_refs),
    ...selectedScenarios.flatMap((scenario) => [
      ...scenario.compatibility_evidence_refs,
      ...scenario.assumptions.flatMap((assumption) => assumption.evidence_refs),
    ]),
  ]);
  const created = Date.parse(input.createdAt);
  const latest = input.latestSourceDataAt
    ? Date.parse(input.latestSourceDataAt)
    : null;

  return expertContextPackageSchema.parse({
    package_version: EXPERT_CONTEXT_PACKAGE_VERSION,
    context_package_id: input.contextPackageId,
    expert_request_id: input.expertRequestId,
    user_request_ref: input.userRequest.user_request_id,
    user_request_summary: {
      user_request_id: input.userRequest.user_request_id,
      intent: input.userRequest.intent,
      goal: input.userRequest.goal.description,
      criteria: requestCriteria(input.userRequest),
      financing_constraints: needsFinancingContext(
        input.requestType,
        input.questionCategory,
      )
        ? {
            purchase_methods: input.userRequest.financing.purchase_methods,
            required_program_types:
              input.userRequest.financing.required_program_types,
            initial_payment_max:
              input.userRequest.financing.initial_payment_max,
            monthly_payment_max:
              input.userRequest.financing.monthly_payment_max,
          }
        : null,
      material_timeline: needsTimelineContext(
        input.requestType,
        input.questionCategory,
      )
        ? {
            purchase_by: input.userRequest.timeline.purchase_by,
            move_in_by: input.userRequest.timeline.move_in_by,
            ready_now_required: input.userRequest.timeline.ready_now_required,
          }
        : null,
    },
    properties: input.properties.map((property) => ({
      property_id: property.identity.property_id,
      property_type: property.property_type,
      market_type: property.market_type,
      location_label: locationLabel(property),
      rooms: property.physical.rooms,
      total_area_m2: property.physical.total_area_m2,
      floor: property.physical.floor,
      handover_date: property.timeline.handover_date,
      evidence_refs: property.metadata.evidence_refs,
    })),
    selected_offers: selectedOffers.map((offer) => ({
      offer_id: offer.offer_id,
      property_id: offer.property_id,
      listing_price: offer.listing_price,
      price_from: offer.price_from,
      availability: offer.availability,
      verification_status: offer.verification_status,
      freshness_status: offer.freshness_status,
      evidence_refs: offer.evidence_refs,
    })),
    selected_purchase_scenarios: selectedScenarios.map((scenario) => ({
      scenario_id: scenario.scenario_id,
      property_id: scenario.property_id,
      offer_id: scenario.offer_id,
      financing_program_id: scenario.financing_program_id,
      entry_cash: scenario.entry_cash,
      monthly_payment: scenario.monthly_payment,
      total_payment: scenario.total_payment,
      terms_compatibility_status: scenario.terms_compatibility_status,
      verification_status: scenario.verification_status,
      evidence_refs: unique([
        ...scenario.compatibility_evidence_refs,
        ...scenario.assumptions.flatMap(
          (assumption) => assumption.evidence_refs,
        ),
      ]),
    })),
    match_results: input.matchResults
      .filter(
        (result) =>
          propertyIds.has(result.property_id) &&
          result.user_request_id === input.userRequest.user_request_id,
      )
      .map((result) => ({
        match_result_id: result.match_result_id,
        user_request_id: result.user_request_id,
        property_id: result.property_id,
        purchase_scenario_id: result.purchase_scenario_id,
        eligibility_status: result.eligibility_status,
        match_score: result.match_score,
        strengths: result.strengths,
        compromises: result.compromises,
        unknown_critical: result.unknown_critical,
        calculated_at: result.calculated_at,
      })),
    data_quality: input.dataQuality
      .filter((item) => propertyIds.has(item.propertyId))
      .map(({ propertyId, dataQuality }) => ({
        property_id: propertyId,
        data_quality_id: dataQuality.data_quality_id,
        data_confidence_score: dataQuality.data_confidence_score,
        data_completeness_score: dataQuality.data_completeness_score,
        critical_unknown_count: dataQuality.critical_unknown_count,
        critical_conflict_count: dataQuality.critical_conflict_count,
        confidence_status: dataQuality.confidence_status,
        recommended_checks: dataQuality.recommended_checks,
      })),
    critical_unknowns: input.criticalUnknowns
      .filter((unknown) => relevantEntityIds.has(unknown.entityId))
      .map((unknown) => ({
        entity_id: unknown.entityId,
        field: unknown.field,
        reason: unknown.reason,
        must_criterion: unknown.mustCriterion,
        evidence_refs: [...unknown.evidenceRefs],
      })),
    conflicts: input.conflicts
      .filter((conflict) => relevantEntityIds.has(conflict.entity_id))
      .map((conflict) => ({
        conflict_id: conflict.conflict_id,
        entity_id: conflict.entity_id,
        field: conflict.field,
        severity: conflict.severity,
        status: conflict.status,
        evidence_refs: conflict.evidence_ids,
      })),
    recommended_checks: input.recommendedChecks
      .filter((check) => relevantEntityIds.has(check.entityId))
      .map((check) => ({
        check_code: check.checkCode,
        entity_id: check.entityId,
        field: check.field,
        reason: check.reason,
        priority: check.priority,
      })),
    source_evidence_refs: sourceEvidenceRefs,
    user_question: input.userQuestion,
    structured_questions: input.structuredQuestions,
    choice_context:
      input.requestType === "choice_assistance" && input.choice
        ? {
            finalist_property_ids: input.properties.map(
              (property) => property.identity.property_id,
            ),
            trade_offs: input.choice.tradeoffs.map((tradeoff) => ({
              statement: tradeoff.statement,
              property_ids: [...tradeoff.propertyIds],
            })),
            decision_drivers: [...input.choice.decisionDrivers],
          }
        : null,
    document_refs: [...input.documentRefs],
    onsite_context: input.onsite
      ? {
          scope: input.onsite.scope,
          known_risks: [...input.onsite.knownRisks],
          items_to_check: [...input.onsite.itemsToCheck],
          boundary_notice:
            input.onsite.scope === "structural_engineering"
              ? "Экспертная проверка не заменяет формальное инженерно-техническое обследование."
              : "Визуальная проверка не является инженерно-техническим обследованием.",
        }
      : null,
    created_at: input.createdAt,
    latest_source_data_at: input.latestSourceDataAt,
    stale: latest !== null && latest > created,
  });
};

/** Presents freshness without mutating the auditable submitted snapshot. */
export const evaluateExpertContextFreshness = (
  contextPackage: ExpertContextPackage,
  currentDataUpdatedAt: string | null,
): ExpertContextPackage =>
  expertContextPackageSchema.parse({
    ...contextPackage,
    latest_source_data_at: currentDataUpdatedAt,
    stale:
      currentDataUpdatedAt !== null &&
      Date.parse(currentDataUpdatedAt) > Date.parse(contextPackage.created_at),
  });
