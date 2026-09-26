import type { BuyerJourneyApplication } from "../buyer-journey/application";
import { getBuyerJourneyRuntime } from "../buyer-journey/runtime";
import {
  ExpertCompletionService,
  ExpertRequestService,
  createRandomExpertIdFactory,
  specialistTypeSchema,
  type CompleteExpertRequestOutcome,
  type ExpertRequest,
  type ExpertResult,
} from "../expert";
import {
  getApplicationRepositorySet,
  type RepositorySet,
} from "../persistence";
import { ExpertWorkbenchApplicationService } from "./application";
import type { ExpertWorkbenchActor, RecomputePresentation } from "./contracts";
import { ScopedExpertWorkbenchPermissionPolicy } from "./permissions";

export interface ExpertWorkbenchRuntimeEnvironment {
  readonly [key: string]: string | undefined;
  readonly REDS_EXPERT_ACTOR_REF?: string;
  readonly REDS_EXPERT_SPECIALIST_TYPE?: string;
}

export interface RealExpertWorkbenchRuntime {
  readonly application: ExpertWorkbenchApplicationService;
  readonly actor: ExpertWorkbenchActor;
  readonly repository: RepositorySet["expertRepository"];
  readonly drafts: RepositorySet["draftRepository"];
}

export interface RealExpertWorkbenchRuntimeDependencies {
  readonly repositories?: RepositorySet;
  readonly buyerApplication?: BuyerJourneyApplication;
  readonly actor?: ExpertWorkbenchActor;
  readonly environment?: ExpertWorkbenchRuntimeEnvironment;
  readonly clock?: () => string;
}

export const resolveExpertWorkbenchActor = (
  environment: ExpertWorkbenchRuntimeEnvironment = process.env,
): ExpertWorkbenchActor => {
  const actorRef = environment.REDS_EXPERT_ACTOR_REF?.trim();
  const specialistType = specialistTypeSchema.safeParse(
    environment.REDS_EXPERT_SPECIALIST_TYPE,
  );
  if (!actorRef || !specialistType.success)
    return { actor_type: "unknown", actor_ref: null };
  return {
    actor_type: "expert",
    actor_ref: actorRef,
    specialist_type: specialistType.data,
  };
};

const metricFor = (
  metrics: readonly {
    readonly property_id: string;
    readonly match_score: number;
    readonly data_confidence_score: number | null;
  }[],
  propertyIds: readonly string[],
) =>
  propertyIds
    .map((propertyId) =>
      metrics.find((metric) => metric.property_id === propertyId),
    )
    .find((metric) => metric !== undefined) ?? null;

const resolvePersistedRecompute = async (input: {
  readonly buyerApplication: BuyerJourneyApplication;
  readonly request: ExpertRequest;
  readonly result: ExpertResult | null;
  readonly journeyId: string;
}): Promise<RecomputePresentation | null> => {
  if (!input.result) return null;
  const [journey, snapshot] = await Promise.all([
    input.buyerApplication.getJourney(input.journeyId),
    input.buyerApplication.getJourneySnapshot(input.journeyId),
  ]);
  const update = snapshot.decision_update;
  if (
    !update ||
    update.trigger_type !== "expert_result" ||
    update.trigger_ref !== input.result.expert_result_id
  )
    return {
      status:
        journey.recoverable_error === "MATCH_RECOMPUTE_FAILED"
          ? "failed"
          : "pending",
      old_match_score:
        snapshot.expert?.context.match_results[0]?.match_score ?? null,
      new_match_score: null,
      old_data_confidence_score:
        snapshot.expert?.context.data_quality[0]?.data_confidence_score ?? null,
      new_data_confidence_score: null,
      message:
        journey.recoverable_error === "MATCH_RECOMPUTE_FAILED"
          ? "Проверка сохранена, но пересчёт данных пока не выполнен."
          : "Проверка сохранена. Пересчёт решения ещё не завершён.",
    };

  const previous = metricFor(
    update.previous_results,
    input.request.property_ids,
  );
  const next = metricFor(update.new_results, input.request.property_ids);
  return {
    status: update.status,
    old_match_score: previous?.match_score ?? null,
    new_match_score: next?.match_score ?? null,
    old_data_confidence_score: previous?.data_confidence_score ?? null,
    new_data_confidence_score: next?.data_confidence_score ?? null,
    message:
      update.status === "completed"
        ? next
          ? "Экспертные evidence сохранены, решение пересчитано."
          : "Проверка сохранена; фактические входы решения не изменились."
        : update.status === "failed"
          ? "Проверка сохранена, но пересчёт данных пока не выполнен."
          : "Проверка сохранена. Пересчёт решения ещё не завершён.",
  };
};

const completeStandaloneRequest = async (input: {
  readonly repository: RepositorySet["expertRepository"];
  readonly result: ExpertResult;
  readonly createId: ReturnType<typeof createRandomExpertIdFactory>;
  readonly clock: () => string;
}): Promise<CompleteExpertRequestOutcome> => {
  const request = await input.repository.get(input.result.request_id);
  const context = request
    ? await input.repository.getContext(request.context_package_id)
    : null;
  if (!request || !context) throw new Error("EXPERT_CONTEXT_NOT_FOUND");
  if (
    input.result.evidence_candidates.length > 0 ||
    input.result.confirmed.length > 0 ||
    input.result.conflicts.some(
      (conflict) => conflict.outcome === "resolution_requested",
    )
  )
    throw new Error("EXPERT_JOURNEY_CONTEXT_REQUIRED_FOR_EVIDENCE_UPDATE");
  const knownEvidence = new Set([
    ...context.source_evidence_refs,
    ...context.document_refs,
  ]);
  const completion = new ExpertCompletionService(
    input.repository,
    {
      validateExistingReferences: (refs) =>
        refs.every((reference) => knownEvidence.has(reference)),
      integrate: () => {
        throw new Error("EXPERT_JOURNEY_CONTEXT_REQUIRED_FOR_EVIDENCE_UPDATE");
      },
    },
    {
      requestCanonicalUpdate: () => {
        throw new Error("EXPERT_JOURNEY_CONTEXT_REQUIRED_FOR_EVIDENCE_UPDATE");
      },
    },
    {
      requestRecompute: () => {
        throw new Error("EXPERT_JOURNEY_CONTEXT_REQUIRED_FOR_RECOMPUTE");
      },
    },
    input.createId,
    input.clock,
  );
  return completion.complete(input.result);
};

export const createRealExpertWorkbenchRuntime = (
  dependencies: RealExpertWorkbenchRuntimeDependencies = {},
): RealExpertWorkbenchRuntime => {
  const repositories =
    dependencies.repositories ?? getApplicationRepositorySet();
  const buyerApplication =
    dependencies.buyerApplication ?? getBuyerJourneyRuntime();
  if (buyerApplication.expertRepository !== repositories.expertRepository)
    throw new Error("EXPERT_RUNTIME_REPOSITORY_MISMATCH");
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const createId = createRandomExpertIdFactory("expert_workbench");
  const requestService = new ExpertRequestService(
    repositories.expertRepository,
    { canAccess: async () => false },
    { onAssigned: () => undefined },
    createId,
    clock,
  );
  const completionPort = {
    complete: async (
      result: ExpertResult,
    ): Promise<CompleteExpertRequestOutcome> => {
      const request = await repositories.expertRepository.get(
        result.request_id,
      );
      if (!request) throw new Error("EXPERT_REQUEST_NOT_FOUND");
      const context = await repositories.expertRepository.getContext(
        request.context_package_id,
      );
      const journeyId = context?.decision_snapshot?.journey_id;
      return journeyId
        ? buyerApplication.applyExpertResultToJourney(journeyId, result)
        : completeStandaloneRequest({
            repository: repositories.expertRepository,
            result,
            createId,
            clock,
          });
    },
  };
  const application = new ExpertWorkbenchApplicationService(
    repositories.expertRepository,
    repositories.draftRepository,
    requestService,
    completionPort,
    new ScopedExpertWorkbenchPermissionPolicy(),
    createId,
    clock,
    {
      transition: async ({ actor, request, status, reasonCode }) => {
        if (actor.actor_type !== "expert")
          throw new Error("EXPERT_REQUEST_EDIT_DENIED");
        const context = await repositories.expertRepository.getContext(
          request.context_package_id,
        );
        if (
          status === "in_progress" &&
          request.status === "assigned" &&
          context?.decision_snapshot?.journey_id
        )
          return buyerApplication.startJourneyExpertWork({
            journeyId: context.decision_snapshot.journey_id,
            specialistRef: actor.actor_ref,
          });
        return requestService.transition({
          requestId: request.request_id,
          status,
          actorType: "expert",
          actorRef: actor.actor_ref,
          reasonCode,
        });
      },
      resolveRecompute: async ({ request, context, result }) => {
        const journeyId = context.decision_snapshot?.journey_id;
        return journeyId
          ? resolvePersistedRecompute({
              buyerApplication,
              request,
              result,
              journeyId,
            })
          : null;
      },
    },
  );
  return {
    application,
    actor:
      dependencies.actor ??
      resolveExpertWorkbenchActor(dependencies.environment),
    repository: repositories.expertRepository,
    drafts: repositories.draftRepository,
  };
};

export const getRealExpertWorkbenchRuntime = (): RealExpertWorkbenchRuntime =>
  createRealExpertWorkbenchRuntime();
