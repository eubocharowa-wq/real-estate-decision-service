import { fieldEvidenceSchema, type FieldEvidence } from "../domain";
import { requestConfirmationResultSchema } from "../request-confirmation";
import {
  ExpertCompletionService,
  ExpertRequestService,
  InMemoryExpertRequestRepository,
  createSequentialExpertIdFactory,
  type CompleteExpertRequestOutcome,
  type ExpertQuestionCategory,
  type ExpertRequest,
  type ExpertRequestRepository,
  type ExpertRequestType,
  type ExpertResult,
  type ExpertTriggerType,
  type RequestOwner,
} from "../expert";
import type { ComparisonView } from "../comparison";
import type { PropertyDetailView } from "../property-detail";
import {
  InMemoryRefreshQueueRepository,
  RefreshTaskService,
  RegistryRefreshPolicyGateway,
  type RefreshEnqueueAudit,
  type RefreshResult,
} from "../data-collection/refresh";
import type { SourceEnvironment } from "../data-collection/source-registry";
import type { ShortlistView } from "../shortlist";
import { parseNormalizedUserUrlCandidate } from "../user-url-ingestion";
import {
  parseUserRequest,
  type UserRequestParserOutcome,
} from "../user-request-parser";
import { buildComparisonFromState, createComparisonState } from "./comparison";
import { isJourneyCanonicalFieldAllowed } from "./config";
import {
  BUYER_JOURNEY_SCHEMA_VERSION,
  CONFIRMED_REQUEST_RECORD_VERSION,
  type BuyerJourney,
  type CanonicalDecisionOverlay,
  type ComparisonState,
  type ConfirmedRequestRecord,
  type DecisionUpdate,
  type DecisionUpdateTrigger,
  type JourneyDataSnapshot,
  type MatchingBundle,
} from "./contracts";
import { buildDecisionUpdate } from "./decision-update";
import { BuyerJourneyError } from "./errors";
import {
  createSequentialBuyerJourneyIdFactory,
  type BuyerJourneyIdFactory,
} from "./id";
import {
  InMemoryJourneyInstrumentation,
  type JourneyInstrumentation,
} from "./instrumentation";
import {
  buildPropertyViewFromMatchingBundle,
  buildShortlistFromMatchingBundle,
  loadJourneyDataset,
  resolveBundlePropertyDetail,
  runMatchingForConfirmedRequest,
} from "./matching";
import {
  InMemoryBuyerJourneyRepository,
  type BuyerJourneyRepository,
} from "./repository";
import { assertBuyerJourneyTransition } from "./state-machine";

export interface BuyerJourneyApplicationDependencies {
  readonly repository?: BuyerJourneyRepository;
  readonly expertRepository?: ExpertRequestRepository;
  readonly instrumentation?: JourneyInstrumentation;
  readonly createId?: BuyerJourneyIdFactory;
  readonly clock?: () => string;
  readonly parse?: (input: unknown) => Promise<UserRequestParserOutcome>;
}

export interface CreateJourneyExpertRequestInput {
  readonly requestType: ExpertRequestType;
  readonly triggerType: ExpertTriggerType;
  readonly questionCategory: ExpertQuestionCategory;
  readonly question: string;
  readonly propertyIds?: readonly string[];
  readonly field?: string | null;
  readonly questionCode?: string | null;
}

export interface JourneyRefreshRequestOutcome {
  readonly status: "queued" | "blocked";
  readonly error_code: "SOURCE_POLICY_BLOCKED" | null;
  readonly audit: RefreshEnqueueAudit;
}

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const ownerForJourney = (journey: BuyerJourney): RequestOwner => ({
  owner_type: "session",
  owner_id: journey.session_id,
});

const activeRequest = (
  repository: BuyerJourneyRepository,
  journey: BuyerJourney,
): ConfirmedRequestRecord => {
  if (
    journey.confirmed_user_request_id === null ||
    journey.confirmed_user_request_version === null
  )
    throw new BuyerJourneyError(
      "MISSING_JOURNEY_CONTEXT",
      "Confirmed request is missing",
      true,
    );
  const confirmed = repository.getConfirmedRequest(
    journey.confirmed_user_request_id,
    journey.confirmed_user_request_version,
  );
  if (!confirmed)
    throw new BuyerJourneyError(
      "MISSING_JOURNEY_CONTEXT",
      "Confirmed request record is missing",
      true,
    );
  return confirmed;
};

const activeBundle = (
  repository: BuyerJourneyRepository,
  journey: BuyerJourney,
  confirmed: ConfirmedRequestRecord,
): MatchingBundle => {
  const bundleId = journey.shortlist_state.matching_bundle_id;
  const bundle = bundleId ? repository.getMatchingBundle(bundleId) : null;
  if (!bundle)
    throw new BuyerJourneyError(
      "MISSING_JOURNEY_CONTEXT",
      "MatchingBundle is missing",
      true,
    );
  if (
    bundle.stale ||
    bundle.user_request_id !== confirmed.user_request_id ||
    bundle.user_request_version !== confirmed.user_request_version
  )
    throw new BuyerJourneyError(
      "STALE_REQUEST_VERSION",
      "MatchingBundle belongs to another request version",
      true,
    );
  return bundle;
};

const priority = (value: "critical" | "high" | "medium" | "low") =>
  value === "medium" ? ("normal" as const) : value;

export class BuyerJourneyApplication {
  readonly repository: BuyerJourneyRepository;
  readonly expertRepository: ExpertRequestRepository;
  readonly instrumentation: JourneyInstrumentation;
  private readonly createId: BuyerJourneyIdFactory;
  private readonly clock: () => string;
  private readonly parse: (input: unknown) => Promise<UserRequestParserOutcome>;
  private readonly expertService: ExpertRequestService;
  private readonly expertCreateId =
    createSequentialExpertIdFactory("journey_expert");

  constructor(dependencies: BuyerJourneyApplicationDependencies = {}) {
    this.repository =
      dependencies.repository ?? new InMemoryBuyerJourneyRepository();
    this.expertRepository =
      dependencies.expertRepository ?? new InMemoryExpertRequestRepository();
    this.instrumentation =
      dependencies.instrumentation ?? new InMemoryJourneyInstrumentation();
    this.createId =
      dependencies.createId ?? createSequentialBuyerJourneyIdFactory();
    this.clock = dependencies.clock ?? (() => new Date().toISOString());
    this.parse = dependencies.parse ?? parseUserRequest;
    this.expertService = new ExpertRequestService(
      this.expertRepository,
      {
        canAccess: ({ owner, entityType, entityId }) => {
          if (entityType === "document") return false;
          if (entityType === "user_request")
            return [...this.listJourneysForSession(owner.owner_id)].some(
              (journey) => journey.confirmed_user_request_id === entityId,
            );
          if (entityType === "comparison")
            return [...this.listJourneysForSession(owner.owner_id)].some(
              (journey) => journey.comparison_id === entityId,
            );
          const dataset = loadJourneyDataset(this.repository);
          if (entityType === "property")
            return (
              dataset.properties.some(
                (property) => property.identity.property_id === entityId,
              ) ||
              [...this.listJourneysForSession(owner.owner_id)].some((journey) =>
                this.repository
                  .listImportedCandidates(journey.journey_id)
                  .some(
                    (candidate) =>
                      candidate.propertyCandidate.identity.property_id ===
                      entityId,
                  ),
              )
            );
          if (entityType === "offer")
            return (
              dataset.offers.some((offer) => offer.offer_id === entityId) ||
              [...this.listJourneysForSession(owner.owner_id)].some((journey) =>
                this.repository
                  .listImportedCandidates(journey.journey_id)
                  .some(
                    (candidate) =>
                      candidate.offerCandidate.offer_id === entityId,
                  ),
              )
            );
          return dataset.purchaseScenarios.some(
            (scenario) => scenario.scenario_id === entityId,
          );
        },
      },
      { onAssigned: () => undefined },
      this.expertCreateId,
      this.clock,
    );
  }

  startBuyerJourney(input: {
    readonly sessionId: string;
    readonly rawRequestText: string;
  }): BuyerJourney {
    if (!input.sessionId.trim() || !input.rawRequestText.trim())
      throw new BuyerJourneyError(
        "MISSING_JOURNEY_CONTEXT",
        "Session and raw request text are required",
        true,
      );
    const now = this.clock();
    const journey: BuyerJourney = {
      schema_version: BUYER_JOURNEY_SCHEMA_VERSION,
      journey_id: this.createId("journey"),
      session_id: input.sessionId,
      raw_request_text: input.rawRequestText,
      parsed_request_ref: null,
      confirmed_user_request_id: null,
      confirmed_user_request_version: null,
      shortlist_state: {
        status: "not_started",
        matching_bundle_id: null,
        property_ids: [],
        update_available: false,
      },
      selected_property_id: null,
      selected_offer_id: null,
      selected_purchase_scenario_id: null,
      comparison_id: null,
      comparison_property_ids: [],
      expert_request_ids: [],
      active_expert_request_id: null,
      last_recompute_at: null,
      current_stage: "request_entry",
      latest_decision_update_id: null,
      recoverable_error: null,
      created_at: now,
      updated_at: now,
    };
    this.repository.saveJourney(journey);
    this.record(journey, "journey_started", {});
    return journey;
  }

  async parseBuyerRequest(
    journeyId: string,
  ): Promise<UserRequestParserOutcome> {
    const journey = this.requireJourney(journeyId);
    if (journey.current_stage !== "request_entry")
      throw new BuyerJourneyError(
        "INVALID_TRANSITION",
        "Parser can run only from request_entry",
        true,
      );
    const outcome = await this.parse({
      schema_version: "1.0",
      raw_text: journey.raw_request_text,
      locale: "ru-RU",
      context: {
        continuation: false,
        previous_request: null,
        reference_date: this.clock().slice(0, 10),
      },
    });
    if (!outcome.success) return outcome;
    const parsedRef = this.createId("parsed_request");
    this.repository.saveParsedRequest(parsedRef, outcome.result);
    const updated = this.transition(journey, "request_confirmation", {
      parsed_request_ref: parsedRef,
    });
    this.record(updated, "request_parsed", {
      parser_version: outcome.result.parser_version,
      parsed_request_ref: parsedRef,
    });
    return outcome;
  }

  beginRequestEdit(journeyId: string): BuyerJourney {
    const journey = this.requireJourney(journeyId);
    if (journey.current_stage !== "request_confirmation")
      return this.transition(journey, "request_confirmation", {
        recoverable_error: null,
      });
    return journey;
  }

  confirmBuyerRequest(
    journeyId: string,
    confirmationValue: unknown,
  ): ConfirmedRequestRecord {
    const journey = this.requireJourney(journeyId);
    if (journey.current_stage !== "request_confirmation")
      throw new BuyerJourneyError(
        "INVALID_TRANSITION",
        "Request can be confirmed only from request_confirmation",
        true,
      );
    const confirmation =
      requestConfirmationResultSchema.safeParse(confirmationValue);
    if (!confirmation.success)
      throw new BuyerJourneyError(
        "INVALID_TRANSITION",
        "Confirmation result is invalid",
        true,
      );
    if (confirmation.data.original_raw_text !== journey.raw_request_text)
      throw new BuyerJourneyError(
        "STALE_REQUEST_VERSION",
        "Confirmation belongs to another raw request",
        true,
      );
    const version = (journey.confirmed_user_request_version ?? 0) + 1;
    const previousBundleId = journey.shortlist_state.matching_bundle_id;
    if (previousBundleId)
      this.repository.markMatchingBundleStale(previousBundleId);
    if (journey.comparison_id) {
      const comparison = this.repository.getComparison(journey.comparison_id);
      if (comparison)
        this.repository.saveComparison({
          ...comparison,
          status: "recompute_required",
          updated_at: this.clock(),
        });
    }
    const record: ConfirmedRequestRecord = {
      record_version: CONFIRMED_REQUEST_RECORD_VERSION,
      user_request_id: confirmation.data.confirmed_request.user_request_id,
      user_request_version: version,
      request: confirmation.data.confirmed_request,
      confirmed_at: confirmation.data.confirmed_at,
      supersedes_version: journey.confirmed_user_request_version,
    };
    this.repository.saveConfirmedRequest(record);
    const updated = this.transition(journey, "matching", {
      confirmed_user_request_id: record.user_request_id,
      confirmed_user_request_version: version,
      shortlist_state: {
        ...journey.shortlist_state,
        status: "recompute_required",
        update_available: false,
      },
      recoverable_error: null,
    });
    this.record(updated, "request_confirmed", {
      user_request_id: record.user_request_id,
      user_request_version: version,
    });
    return record;
  }

  runJourneyMatching(journeyId: string): {
    readonly journey: BuyerJourney;
    readonly bundle: MatchingBundle;
    readonly shortlist: ShortlistView;
  } {
    const journey = this.requireJourney(journeyId);
    if (journey.current_stage !== "matching")
      throw new BuyerJourneyError(
        "INVALID_TRANSITION",
        "Matching can run only after confirmation",
        true,
      );
    const confirmed = activeRequest(this.repository, journey);
    const previousBundleId = journey.shortlist_state.matching_bundle_id;
    const previousBundle = previousBundleId
      ? this.repository.getMatchingBundle(previousBundleId)
      : null;
    const generatedAt = this.clock();
    const imported = this.repository.listImportedCandidates(journeyId);
    const bundle = runMatchingForConfirmedRequest({
      repository: this.repository,
      confirmed,
      previousBundle,
      importedCandidateIds: imported.map((item) => item.ingestionId),
      generatedAt,
      createId: this.createId,
    });
    this.repository.saveMatchingBundle(bundle);
    const shortlist = buildShortlistFromMatchingBundle({
      repository: this.repository,
      confirmed,
      bundle,
    });
    let updated = this.transition(journey, "shortlist", {
      shortlist_state: {
        status: shortlist.cards.length > 0 ? "ready" : "no_eligible",
        matching_bundle_id: bundle.matching_bundle_id,
        property_ids: shortlist.cards.map((card) => card.propertyId),
        update_available: previousBundle !== null,
      },
      last_recompute_at: generatedAt,
      recoverable_error: null,
    });
    if (previousBundle) {
      const affected = unique([
        ...previousBundle.entries.map((entry) => entry.property_id),
        ...bundle.entries.map((entry) => entry.property_id),
      ]);
      const decisionUpdate = buildDecisionUpdate({
        journeyId,
        triggerType: "user_request_changed",
        triggerRef: `${confirmed.user_request_id}:v${confirmed.user_request_version}`,
        previousBundle,
        nextBundle: bundle,
        affectedPropertyIds: affected,
        now: generatedAt,
        createId: this.createId,
      });
      this.repository.saveDecisionUpdate(decisionUpdate);
      updated = this.updateJourney(updated, {
        latest_decision_update_id: decisionUpdate.update_id,
      });
    }
    this.record(updated, "matching_completed", {
      matching_bundle_id: bundle.matching_bundle_id,
      candidate_count: bundle.entries.length,
      request_version: bundle.user_request_version,
      dataset_type: bundle.dataset_snapshot.dataset_type,
    });
    return { journey: updated, bundle, shortlist };
  }

  getShortlist(journeyId: string): ShortlistView {
    const journey = this.requireJourney(journeyId);
    const confirmed = activeRequest(this.repository, journey);
    const bundle = activeBundle(this.repository, journey, confirmed);
    const view = buildShortlistFromMatchingBundle({
      repository: this.repository,
      confirmed,
      bundle,
    });
    this.record(journey, "shortlist_viewed", { card_count: view.cards.length });
    return view;
  }

  openJourneyProperty(
    journeyId: string,
    propertyId: string,
  ): PropertyDetailView {
    const journey = this.requireJourney(journeyId);
    const confirmed = activeRequest(this.repository, journey);
    const bundle = activeBundle(this.repository, journey, confirmed);
    const entry = bundle.entries.find(
      (item) => item.property_id === propertyId,
    );
    if (!entry)
      throw new BuyerJourneyError(
        "ENTITY_NOT_FOUND",
        "Property not found",
        false,
      );
    const view = buildPropertyViewFromMatchingBundle({
      repository: this.repository,
      confirmed,
      bundle,
      propertyId,
    });
    const updated = this.transition(journey, "property_detail", {
      selected_property_id: propertyId,
      selected_offer_id: entry.selected_offer_id,
      selected_purchase_scenario_id: entry.selected_purchase_scenario_id,
    });
    this.record(updated, "property_opened", {
      property_id: propertyId,
      offer_id: entry.selected_offer_id,
      purchase_scenario_id: entry.selected_purchase_scenario_id,
    });
    return view;
  }

  createJourneyComparison(
    journeyId: string,
    propertyIds: readonly string[],
  ): { readonly state: ComparisonState; readonly view: ComparisonView } {
    const journey = this.requireJourney(journeyId);
    const confirmed = activeRequest(this.repository, journey);
    const bundle = activeBundle(this.repository, journey, confirmed);
    const previous = journey.comparison_id
      ? this.repository.getComparison(journey.comparison_id)
      : null;
    const state = createComparisonState({
      repository: this.repository,
      journeyId,
      confirmed,
      bundle,
      propertyIds,
      previous,
      now: this.clock(),
      createId: this.createId,
    });
    this.repository.saveComparison(state);
    const view = buildComparisonFromState({
      repository: this.repository,
      confirmed,
      bundle,
      comparison: state,
    });
    const updated = this.transition(journey, "comparison", {
      comparison_id: state.comparison_id,
      comparison_property_ids: state.items.map((item) => item.property_id),
    });
    this.record(
      updated,
      previous ? "comparison_updated" : "comparison_created",
      {
        comparison_id: state.comparison_id,
        comparison_version: state.version,
        property_count: state.items.length,
      },
    );
    return { state, view };
  }

  getJourneyComparison(journeyId: string): ComparisonView {
    const journey = this.requireJourney(journeyId);
    const confirmed = activeRequest(this.repository, journey);
    const bundle = activeBundle(this.repository, journey, confirmed);
    const comparison = journey.comparison_id
      ? this.repository.getComparison(journey.comparison_id)
      : null;
    if (!comparison)
      throw new BuyerJourneyError(
        "MISSING_JOURNEY_CONTEXT",
        "Comparison is missing",
        true,
      );
    return buildComparisonFromState({
      repository: this.repository,
      confirmed,
      bundle,
      comparison,
    });
  }

  addUserUrlCandidate(
    journeyId: string,
    candidateValue: unknown,
  ): { readonly bundle: MatchingBundle; readonly update: DecisionUpdate } {
    this.requireJourney(journeyId);
    const candidate = parseNormalizedUserUrlCandidate(candidateValue);
    if (!candidate || candidate.matchingReadiness.status === "not_ready")
      throw new BuyerJourneyError(
        "INGESTION_FAILED",
        "Normalized URL candidate is not ready for matching",
        true,
      );
    this.repository.saveImportedCandidate(candidate);
    this.repository.attachImportedCandidate(journeyId, candidate.ingestionId);
    const result = this.recomputeAffected({
      journeyId,
      triggerType: "user_url_ingestion",
      triggerRef: candidate.ingestionId,
      affectedPropertyIds: [candidate.propertyCandidate.identity.property_id],
    });
    return result;
  }

  createJourneyExpertRequest(
    journeyId: string,
    input: CreateJourneyExpertRequestInput,
  ): ExpertRequest {
    const journey = this.requireJourney(journeyId);
    const confirmed = activeRequest(this.repository, journey);
    const bundle = activeBundle(this.repository, journey, confirmed);
    const comparison = journey.comparison_id
      ? this.repository.getComparison(journey.comparison_id)
      : null;
    const propertyIds =
      input.requestType === "choice_assistance"
        ? (comparison?.items.map((item) => item.property_id) ?? [])
        : [
            ...(input.propertyIds ??
              [journey.selected_property_id].filter(
                (propertyId): propertyId is string => propertyId !== null,
              )),
          ];
    if (propertyIds.length === 0)
      throw new BuyerJourneyError(
        "MISSING_JOURNEY_CONTEXT",
        "Expert request requires a selected property",
        true,
      );
    if (
      input.requestType === "choice_assistance" &&
      (!comparison || comparison.status !== "active")
    )
      throw new BuyerJourneyError(
        "EXPERT_CONTEXT_STALE",
        "Choice assistance requires the active comparison",
        true,
      );
    const details = propertyIds.map((propertyId) =>
      resolveBundlePropertyDetail({
        repository: this.repository,
        confirmed,
        bundle,
        propertyId,
      }),
    );
    const selectedOffers = details.flatMap((detail) =>
      detail.selectedOffer ? [detail.selectedOffer] : [],
    );
    const selectedScenarios = details.flatMap((detail) =>
      detail.selectedPurchaseScenario ? [detail.selectedPurchaseScenario] : [],
    );
    const relevantEntityIds = new Set([
      ...propertyIds,
      ...selectedOffers.map((offer) => offer.offer_id),
      ...selectedScenarios.map((scenario) => scenario.scenario_id),
    ]);
    const dataset = loadJourneyDataset(this.repository);
    const conflicts = dataset.sourceConflicts.filter((conflict) =>
      relevantEntityIds.has(conflict.entity_id),
    );
    const sourceEvidenceRefs = unique(
      details.flatMap((detail) => [
        ...(detail.matching?.match_result.criteria_results.flatMap(
          (criterion) => criterion.evidence_refs,
        ) ?? []),
        ...(detail.dataQuality?.field_results.flatMap(
          (field) => field.evidence_refs,
        ) ?? []),
      ]),
    );
    const relevantEvidence = dataset.fieldEvidence.filter((evidence) =>
      sourceEvidenceRefs.includes(evidence.evidence_id),
    );
    this.currentAccessJourney = journey;
    let created: ReturnType<ExpertRequestService["createDraft"]>;
    try {
      created = this.expertService.createDraft({
        owner: ownerForJourney(journey),
        requestType: input.requestType,
        triggerType: input.triggerType,
        questionCategory: input.questionCategory,
        comparisonId:
          input.requestType === "choice_assistance"
            ? (comparison?.comparison_id ?? null)
            : null,
        question: input.question,
        structuredQuestions: [
          {
            question_code: input.questionCode ?? "journey_expert_question",
            field: input.field ?? null,
            entity_id: propertyIds[0]!,
            reason:
              "Проверить конкретный факт, влияющий на решение пользователя",
            priority: "critical",
          },
        ],
        priority: {
          preDecision: journey.current_stage === "comparison",
          mustCriterion: details.some(
            (detail) => (detail.dataQuality?.critical_unknowns.length ?? 0) > 0,
          ),
          financialImpact: input.questionCategory === "financing",
          unresolvedConflict: conflicts.some(
            (conflict) => conflict.status === "open",
          ),
          transactionDeadline: confirmed.request.timeline.purchase_by,
          explicitUrgency: "normal",
        },
        context: {
          userRequest: confirmed.request,
          properties: details.map((detail) => detail.property),
          selectedOffers,
          selectedPurchaseScenarios: selectedScenarios,
          matchResults: details.map((detail) => detail.matching!.match_result),
          dataQuality: details.flatMap((detail) =>
            detail.dataQuality
              ? [
                  {
                    propertyId: detail.property.identity.property_id,
                    dataQuality: detail.dataQuality.data_quality,
                  },
                ]
              : [],
          ),
          criticalUnknowns: details.flatMap((detail) =>
            (detail.dataQuality?.critical_unknowns ?? []).map((unknown) => ({
              entityId: detail.property.identity.property_id,
              field: unknown.field,
              reason: unknown.reason,
              mustCriterion: true,
              evidenceRefs: unknown.recommended_check.evidence_refs,
            })),
          ),
          conflicts,
          recommendedChecks: details.flatMap((detail) =>
            (detail.dataQuality?.recommended_checks ?? []).map((check) => ({
              checkCode: check.code.toLocaleLowerCase("en-US"),
              entityId: detail.property.identity.property_id,
              field: check.field,
              reason: `DataQuality recommends ${check.code}`,
              priority: priority(check.priority),
            })),
          ),
          sourceEvidenceRefs,
          choice:
            input.requestType === "choice_assistance"
              ? {
                  tradeoffs: details.map((detail) => ({
                    statement:
                      detail.matching!.match_result.compromises[0] ??
                      "Нужно сопоставить подтверждённые сильные стороны и неизвестные.",
                    propertyIds: [detail.property.identity.property_id],
                  })),
                  decisionDrivers: unique(
                    [
                      ...confirmed.request.must_have,
                      ...confirmed.request.nice_to_have,
                    ].map(
                      (criterion) =>
                        criterion.user_expression ?? criterion.field,
                    ),
                  ),
                }
              : null,
          documentRefs: [],
          onsite: null,
          latestSourceDataAt:
            relevantEvidence
              .map((evidence) => evidence.collected_at)
              .sort()
              .at(-1) ?? null,
          decisionSnapshot: {
            journeyId,
            userRequestVersion: confirmed.user_request_version,
            matchingBundleId: bundle.matching_bundle_id,
            matchResultIds: details.map(
              (detail) => detail.matching!.match_result.match_result_id,
            ),
            dataQualityIds: details.flatMap((detail) =>
              detail.dataQuality
                ? [detail.dataQuality.data_quality.data_quality_id]
                : [],
            ),
            comparisonId: comparison?.comparison_id ?? null,
            comparisonVersion: comparison?.version ?? null,
          },
        },
      });
    } finally {
      this.currentAccessJourney = null;
    }
    const request = created.created
      ? this.expertService.submit(
          created.request.request_id,
          ownerForJourney(journey),
        )
      : created.request;
    const updated = this.transition(journey, "expert_request", {
      expert_request_ids: unique([
        ...journey.expert_request_ids,
        request.request_id,
      ]),
      active_expert_request_id: request.request_id,
    });
    this.record(updated, "expert_request_created", {
      expert_request_id: request.request_id,
      request_type: request.request_type,
      context_package_id: request.context_package_id,
    });
    return request;
  }

  async startJourneyExpertWork(input: {
    readonly journeyId: string;
    readonly specialistRef: string;
  }): Promise<ExpertRequest> {
    const journey = this.requireJourney(input.journeyId);
    if (!journey.active_expert_request_id)
      throw new BuyerJourneyError(
        "MISSING_JOURNEY_CONTEXT",
        "Expert request is missing",
        true,
      );
    const request = this.expertRepository.get(journey.active_expert_request_id);
    if (!request)
      throw new BuyerJourneyError(
        "ENTITY_NOT_FOUND",
        "Expert request not found",
        false,
      );
    await this.expertService.assignExpertRequest({
      requestId: request.request_id,
      specialistRef: input.specialistRef,
      specialistType: request.required_specialist,
    });
    const inProgress = this.expertService.transition({
      requestId: request.request_id,
      status: "in_progress",
      actorType: "expert",
      actorRef: input.specialistRef,
      reasonCode: "EXPERT_STARTED_WORK",
    });
    this.transition(journey, "expert_in_progress", {});
    return inProgress;
  }

  async applyExpertResultToJourney(
    journeyId: string,
    candidate: ExpertResult,
  ): Promise<CompleteExpertRequestOutcome> {
    const journey = this.requireJourney(journeyId);
    if (
      journey.current_stage !== "expert_in_progress" ||
      journey.active_expert_request_id !== candidate.request_id
    )
      throw new BuyerJourneyError(
        "INVALID_TRANSITION",
        "Expert result does not belong to the active in-progress request",
        true,
      );
    const request = this.expertRepository.get(candidate.request_id);
    const context = request
      ? this.expertRepository.getContext(request.context_package_id)
      : null;
    const confirmed = activeRequest(this.repository, journey);
    if (
      !request ||
      !context?.decision_snapshot ||
      context.decision_snapshot.user_request_version !==
        confirmed.user_request_version ||
      context.decision_snapshot.matching_bundle_id !==
        journey.shortlist_state.matching_bundle_id
    )
      throw new BuyerJourneyError(
        "EXPERT_CONTEXT_STALE",
        "Expert context does not match the active decision version",
        true,
      );

    const evidenceIdByCandidate = new Map<string, string>();
    let lastDecisionUpdate: DecisionUpdate | null = null;
    const completion = new ExpertCompletionService(
      this.expertRepository,
      {
        validateExistingReferences: (refs) => {
          const dataset = loadJourneyDataset(this.repository);
          const known = new Set([
            ...dataset.fieldEvidence.map((evidence) => evidence.evidence_id),
            ...this.repository
              .listEvidence()
              .map((evidence) => evidence.evidence_id),
          ]);
          return refs.every((ref) => known.has(ref));
        },
        integrate: ({ candidates }) => {
          const dataset = loadJourneyDataset(this.repository);
          const createdEvidenceIds: string[] = [];
          const affectedPropertyIds: string[] = [];
          const affectedOfferIds: string[] = [];
          const affectedScenarioIds: string[] = [];
          for (const evidenceCandidate of candidates) {
            const evidenceId = this.createId("evidence");
            evidenceIdByCandidate.set(
              evidenceCandidate.evidence_candidate_id,
              evidenceId,
            );
            const evidence: FieldEvidence = fieldEvidenceSchema.parse({
              schema_version: "1.0",
              evidence_id: evidenceId,
              entity_type: evidenceCandidate.entity_type,
              entity_id: evidenceCandidate.entity_id,
              field: evidenceCandidate.field,
              value: evidenceCandidate.value,
              raw_value: evidenceCandidate.value,
              source_id: "source_manual_expert_journey",
              snapshot_id: null,
              source_url: null,
              collected_at: evidenceCandidate.checked_at,
              verification_status: evidenceCandidate.verification_status,
              freshness_status: "fresh",
              extraction_confidence: null,
              evidence_type: "manual_expert",
              evidence_text: evidenceCandidate.note,
              evidence_reference: evidenceCandidate.supporting_reference,
            });
            this.repository.appendEvidence(evidence);
            createdEvidenceIds.push(evidenceId);
            if (evidenceCandidate.entity_type === "property")
              affectedPropertyIds.push(evidenceCandidate.entity_id);
            if (evidenceCandidate.entity_type === "offer") {
              affectedOfferIds.push(evidenceCandidate.entity_id);
              const offer = dataset.offers.find(
                (item) => item.offer_id === evidenceCandidate.entity_id,
              );
              if (offer) affectedPropertyIds.push(offer.property_id);
            }
            if (evidenceCandidate.entity_type === "purchase_scenario") {
              affectedScenarioIds.push(evidenceCandidate.entity_id);
              const scenario = dataset.purchaseScenarios.find(
                (item) => item.scenario_id === evidenceCandidate.entity_id,
              );
              if (scenario) affectedPropertyIds.push(scenario.property_id);
            }
            if (
              evidenceCandidate.entity_type === "property_financing_eligibility"
            ) {
              const eligibility = dataset.propertyFinancingEligibility.find(
                (item) => item.eligibility_id === evidenceCandidate.entity_id,
              );
              if (eligibility)
                affectedPropertyIds.push(eligibility.property_id);
            }
          }
          return {
            createdEvidenceIds,
            affectedPropertyIds: unique(affectedPropertyIds),
            affectedOfferIds: unique(affectedOfferIds),
            affectedScenarioIds: unique(affectedScenarioIds),
          };
        },
      },
      {
        requestCanonicalUpdate: ({ result, conflictResolutions }) => {
          const updateRequestIds: string[] = [];
          for (const fact of result.confirmed) {
            const evidenceId =
              fact.evidence_refs
                .map((ref) => evidenceIdByCandidate.get(ref) ?? ref)
                .find(Boolean) ?? null;
            const evidenceCandidate = result.evidence_candidates.find(
              (item) =>
                item.entity_id === fact.entity_id && item.field === fact.field,
            );
            const entityType = evidenceCandidate?.entity_type;
            if (
              !evidenceId ||
              !entityType ||
              ![
                "property",
                "offer",
                "purchase_scenario",
                "property_financing_eligibility",
              ].includes(entityType) ||
              !isJourneyCanonicalFieldAllowed(
                entityType as CanonicalDecisionOverlay["entity_type"],
                fact.field,
              )
            )
              continue;
            const overlayId = this.createId("canonical_overlay");
            this.repository.saveCanonicalOverlay({
              overlay_id: overlayId,
              entity_type:
                entityType as CanonicalDecisionOverlay["entity_type"],
              entity_id: fact.entity_id,
              field: fact.field,
              value: fact.value,
              verification_status: "confirmed",
              evidence_id: evidenceId,
              created_at: result.completed_at,
            });
            updateRequestIds.push(overlayId);
            if (
              entityType === "property_financing_eligibility" &&
              fact.field === "eligibility_status"
            ) {
              for (const [field, value] of [
                ["verification_status", "confirmed"],
                ["freshness_status", "fresh"],
                ["applicability_evidence_refs", [evidenceId]],
              ] as const) {
                const derivedOverlayId = this.createId("canonical_overlay");
                this.repository.saveCanonicalOverlay({
                  overlay_id: derivedOverlayId,
                  entity_type: "property_financing_eligibility",
                  entity_id: fact.entity_id,
                  field,
                  value,
                  verification_status: "confirmed",
                  evidence_id: evidenceId,
                  created_at: result.completed_at,
                });
                updateRequestIds.push(derivedOverlayId);
              }
            }
          }
          return {
            updateRequestIds,
            resolvedConflictIds: conflictResolutions.map(
              (resolution) => resolution.conflictId,
            ),
          };
        },
      },
      {
        requestRecompute: ({ propertyIds }) => {
          const recomputed = this.recomputeAffected({
            journeyId,
            triggerType: "expert_result",
            triggerRef: candidate.expert_result_id,
            affectedPropertyIds: propertyIds,
          });
          lastDecisionUpdate = recomputed.update;
          return {
            dataQualityRequestIds: recomputed.update.new_results.flatMap(
              (item) => (item.data_quality_id ? [item.data_quality_id] : []),
            ),
            matchResultRequestIds: recomputed.update.new_results.map(
              (item) => item.match_result_id,
            ),
          };
        },
      },
      this.expertCreateId,
      this.clock,
    );
    const outcome = await completion.complete(candidate);
    let updated = this.transition(
      this.requireJourney(journeyId),
      "expert_result",
      {
        recoverable_error:
          outcome.recomputeStatus === "failed"
            ? "MATCH_RECOMPUTE_FAILED"
            : null,
      },
    );
    this.record(updated, "expert_result_completed", {
      expert_result_id: outcome.result.expert_result_id,
      recompute_status: outcome.recomputeStatus,
    });
    if (outcome.recomputeStatus === "not_required") {
      const bundle = activeBundle(this.repository, updated, confirmed);
      const noChange = buildDecisionUpdate({
        journeyId,
        triggerType: "expert_result",
        triggerRef: outcome.result.expert_result_id,
        previousBundle: bundle,
        nextBundle: null,
        affectedPropertyIds: request.property_ids,
        status: "completed",
        now: this.clock(),
        createId: this.createId,
      });
      this.repository.saveDecisionUpdate(noChange);
      lastDecisionUpdate = noChange;
      updated = this.updateJourney(updated, {
        latest_decision_update_id: noChange.update_id,
      });
    }
    if (outcome.recomputeStatus !== "failed" && lastDecisionUpdate) {
      updated = this.transition(updated, "updated_decision", {
        latest_decision_update_id: lastDecisionUpdate.update_id,
        recoverable_error: null,
      });
    }
    return outcome;
  }

  requestJourneyRefresh(input: {
    readonly journeyId: string;
    readonly propertyId: string;
    readonly offerId: string;
    readonly targetUrl: string;
    readonly fieldPaths: readonly string[];
    readonly environment?: SourceEnvironment;
  }): JourneyRefreshRequestOutcome {
    const journey = this.requireJourney(input.journeyId);
    const queue = new InMemoryRefreshQueueRepository();
    const policy = new RegistryRefreshPolicyGateway();
    const service = new RefreshTaskService(queue, policy);
    const requestedAt = this.clock();
    const audit = service.enqueue(
      {
        entityType: "offer",
        entityId: input.offerId,
        sourceId: "src_dev_02",
        targetUrls: [input.targetUrl],
        fieldPaths: input.fieldPaths,
        criticalFieldPaths: input.fieldPaths,
        reason: "PRE_DECISION_CHECK",
        priorityInput: {
          reason: "PRE_DECISION_CHECK",
          userRequestPriority: "high",
          fieldCriticality: "critical",
          freshness: "stale",
          conflict: "none",
          journeyStage: "pre_decision",
          sourceHealth: "unknown",
          volatility: "V1",
          explicitUserAction: true,
        },
        journeyStage: "pre_decision",
        requestedAt,
        requestedBy: "user",
      },
      {
        environment: input.environment ?? "test",
        satisfiedConditions: ["TARGETED_UNIT_HTTP_POC_APPROVED"],
      },
    );
    const blocked = !audit.policyAllowedAtEnqueue;
    const updated = this.updateJourney(journey, {
      recoverable_error: blocked ? "SOURCE_POLICY_BLOCKED" : "REFRESH_PENDING",
    });
    this.record(updated, "refresh_requested", {
      refresh_task_id: audit.enqueueResult.task.refresh_task_id,
      policy_allowed: audit.policyAllowedAtEnqueue,
      property_id: input.propertyId,
    });
    return {
      status: blocked ? "blocked" : "queued",
      error_code: blocked ? "SOURCE_POLICY_BLOCKED" : null,
      audit,
    };
  }

  applyRefreshResultToJourney(
    journeyId: string,
    result: RefreshResult,
  ): {
    readonly bundle: MatchingBundle;
    readonly update: DecisionUpdate;
  } | null {
    const journey = this.requireJourney(journeyId);
    if (result.status === "blocked" || result.error_code === "POLICY_DENIED") {
      this.updateJourney(journey, {
        recoverable_error: "SOURCE_POLICY_BLOCKED",
      });
      return null;
    }
    if (!["succeeded", "partial"].includes(result.status)) {
      this.updateJourney(journey, { recoverable_error: "REFRESH_PENDING" });
      return null;
    }
    const affected = result.affected_entities.affected_property_ids;
    const recomputed = this.recomputeAffected({
      journeyId,
      triggerType: "refresh_result",
      triggerRef: result.refresh_task_id,
      affectedPropertyIds: affected,
      newConflicts: result.new_conflict_ids,
      resolvedConflicts: result.resolved_conflict_ids,
    });
    this.record(this.requireJourney(journeyId), "refresh_completed", {
      refresh_task_id: result.refresh_task_id,
      changed_field_count: result.changed_fields.length,
    });
    return recomputed;
  }

  getJourneySnapshot(journeyId: string): JourneyDataSnapshot {
    const journey = this.requireJourney(journeyId);
    const confirmed =
      journey.confirmed_user_request_id &&
      journey.confirmed_user_request_version !== null
        ? this.repository.getConfirmedRequest(
            journey.confirmed_user_request_id,
            journey.confirmed_user_request_version,
          )
        : null;
    const bundle = journey.shortlist_state.matching_bundle_id
      ? this.repository.getMatchingBundle(
          journey.shortlist_state.matching_bundle_id,
        )
      : null;
    const comparison = journey.comparison_id
      ? this.repository.getComparison(journey.comparison_id)
      : null;
    const update = journey.latest_decision_update_id
      ? this.repository.getDecisionUpdate(journey.latest_decision_update_id)
      : null;
    const request = journey.active_expert_request_id
      ? this.expertRepository.get(journey.active_expert_request_id)
      : null;
    const context = request
      ? this.expertRepository.getContext(request.context_package_id)
      : null;
    return {
      parsed_request: journey.parsed_request_ref
        ? this.repository.getParsedRequest(journey.parsed_request_ref)
        : null,
      confirmed_request: confirmed,
      matching_bundle: bundle,
      comparison,
      decision_update: update,
      imported_candidates: this.repository.listImportedCandidates(journeyId),
      expert:
        request && context
          ? {
              request,
              context,
              result: this.expertRepository.getResult(request.request_id),
            }
          : null,
      evidence: this.repository.listEvidence(),
    };
  }

  getJourney(journeyId: string): BuyerJourney {
    return this.requireJourney(journeyId);
  }

  private recomputeAffected(input: {
    readonly journeyId: string;
    readonly triggerType: DecisionUpdateTrigger;
    readonly triggerRef: string;
    readonly affectedPropertyIds: readonly string[];
    readonly newConflicts?: readonly string[];
    readonly resolvedConflicts?: readonly string[];
  }): { readonly bundle: MatchingBundle; readonly update: DecisionUpdate } {
    const journey = this.requireJourney(input.journeyId);
    const confirmed = activeRequest(this.repository, journey);
    const previous = activeBundle(this.repository, journey, confirmed);
    const generatedAt = this.clock();
    const imported = this.repository.listImportedCandidates(input.journeyId);
    const bundle = runMatchingForConfirmedRequest({
      repository: this.repository,
      confirmed,
      previousBundle: previous,
      importedCandidateIds: imported.map((item) => item.ingestionId),
      generatedAt,
      createId: this.createId,
      affectedPropertyIds: input.affectedPropertyIds,
    });
    this.repository.saveMatchingBundle(bundle);
    this.repository.markMatchingBundleStale(previous.matching_bundle_id);
    const update = buildDecisionUpdate({
      journeyId: input.journeyId,
      triggerType: input.triggerType,
      triggerRef: input.triggerRef,
      previousBundle: previous,
      nextBundle: bundle,
      affectedPropertyIds: input.affectedPropertyIds,
      newConflicts: input.newConflicts,
      resolvedConflicts: input.resolvedConflicts,
      now: generatedAt,
      createId: this.createId,
    });
    this.repository.saveDecisionUpdate(update);
    this.updateJourney(journey, {
      shortlist_state: {
        ...journey.shortlist_state,
        matching_bundle_id: bundle.matching_bundle_id,
        property_ids: bundle.entries.map((entry) => entry.property_id),
        update_available: true,
      },
      last_recompute_at: generatedAt,
      latest_decision_update_id: update.update_id,
      recoverable_error: null,
    });
    this.record(this.requireJourney(input.journeyId), "decision_recomputed", {
      decision_update_id: update.update_id,
      trigger_type: input.triggerType,
      affected_property_count: input.affectedPropertyIds.length,
    });
    return { bundle, update };
  }

  private requireJourney(journeyId: string): BuyerJourney {
    const journey = this.repository.getJourney(journeyId);
    if (!journey)
      throw new BuyerJourneyError(
        "MISSING_JOURNEY_CONTEXT",
        `BuyerJourney ${journeyId} was not found`,
        true,
      );
    return journey;
  }

  private transition(
    journey: BuyerJourney,
    stage: BuyerJourney["current_stage"],
    patch: Partial<BuyerJourney>,
  ): BuyerJourney {
    assertBuyerJourneyTransition(journey.current_stage, stage);
    return this.updateJourney(journey, { ...patch, current_stage: stage });
  }

  private updateJourney(
    journey: BuyerJourney,
    patch: Partial<BuyerJourney>,
  ): BuyerJourney {
    const updated: BuyerJourney = {
      ...journey,
      ...patch,
      journey_id: journey.journey_id,
      session_id: journey.session_id,
      schema_version: journey.schema_version,
      created_at: journey.created_at,
      updated_at: this.clock(),
    };
    this.repository.saveJourney(updated);
    return updated;
  }

  private record(
    journey: BuyerJourney,
    eventType: Parameters<JourneyInstrumentation["record"]>[0]["eventType"],
    metadata: Readonly<Record<string, string | number | boolean | null>>,
  ): void {
    this.instrumentation.record({
      journey,
      eventType,
      occurredAt: this.clock(),
      metadata,
    });
  }

  private *listJourneysForSession(sessionId: string): Iterable<BuyerJourney> {
    // The repository deliberately has no cross-session listing API. IDs known
    // to the current expert service are resolved from their owning journeys.
    for (const request of this.expertRepository.listAll()) {
      if (
        request.owner.owner_type === "session" &&
        request.owner.owner_id === sessionId
      ) {
        const context = this.expertRepository.getContext(
          request.context_package_id,
        );
        const journeyId = context?.decision_snapshot?.journey_id;
        const journey = journeyId
          ? this.repository.getJourney(journeyId)
          : null;
        if (journey) yield journey;
      }
    }
    // Before the first expert request, access validation is scoped by the
    // explicit owner passed from createJourneyExpertRequest; keep that journey
    // discoverable without exposing a repository-wide list operation.
    const active = this.activeJourneyForSession(sessionId);
    if (active) yield active;
  }

  private activeJourneyForSession(sessionId: string): BuyerJourney | null {
    // In-memory pilot repositories are intentionally session-scoped by their
    // application instance. The current create call records this temporary ref.
    return this.currentAccessJourney?.session_id === sessionId
      ? this.currentAccessJourney
      : null;
  }

  private currentAccessJourney: BuyerJourney | null = null;
}

export const createDefaultBuyerJourneyApplication = () =>
  new BuyerJourneyApplication();
