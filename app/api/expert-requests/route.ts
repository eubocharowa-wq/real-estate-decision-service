import { z } from "zod";

import { entityIdSchema, userRequestSchema } from "../../../src/domain";
import {
  ExpertRequestService,
  canAccessSessionDocumentReference,
  createRandomExpertIdFactory,
  expertQuestionCategorySchema,
  expertRequestTypeSchema,
  expertTriggerTypeSchema,
  getExpertRequestRepository,
  requestOwnerSchema,
} from "../../../src/expert";
import { loadPilotDataset } from "../../../src/pilot-dataset";
import { loadCuratedPilotDataset } from "../../../src/pilot-hardening/curated-dataset";
import { resolvePilotRuntimeConfig } from "../../../src/pilot-hardening/config";
import {
  buildCuratedPropertyDetailInput,
  buildPilotPropertyDetailInput,
} from "../../../src/property-detail";

export const runtime = "nodejs";

const submissionSchema = z
  .strictObject({
    requestType: expertRequestTypeSchema,
    triggerType: expertTriggerTypeSchema,
    questionCategory: expertQuestionCategorySchema,
    propertyIds: z.array(entityIdSchema).min(1).max(5),
    comparisonRef: entityIdSchema.nullable(),
    userRequestRef: entityIdSchema.nullable(),
    field: z.string().nullable(),
    questionCode: entityIdSchema.nullable(),
    documentRefs: z.array(entityIdSchema).max(10),
    onsite: z
      .strictObject({
        scope: z.enum(["visual_physical", "structural_engineering"]),
        knownRisks: z.array(z.string().trim().min(1)).max(20).optional(),
        itemsToCheck: z.array(z.string().trim().min(1)).max(20).optional(),
      })
      .nullable(),
    userQuestion: z.string().trim().min(10),
  })
  .superRefine((submission, context) => {
    if (
      submission.requestType === "document_review" &&
      submission.documentRefs.length === 0
    )
      context.addIssue({
        code: "custom",
        path: ["documentRefs"],
        message:
          "Document review requires an existing opaque document reference",
      });
    if (
      submission.requestType !== "document_review" &&
      submission.documentRefs.length > 0
    )
      context.addIssue({
        code: "custom",
        path: ["documentRefs"],
        message: "Document references are accepted only for document review",
      });
    if (submission.requestType === "onsite_check" && submission.onsite === null)
      context.addIssue({
        code: "custom",
        path: ["onsite"],
        message: "Onsite check requires a scope",
      });
    if (submission.requestType !== "onsite_check" && submission.onsite !== null)
      context.addIssue({
        code: "custom",
        path: ["onsite"],
        message: "Onsite context is accepted only for onsite checks",
      });
  });

const apiRequestSchema = z.strictObject({
  owner: requestOwnerSchema,
  submission: submissionSchema,
  userRequest: userRequestSchema,
});

// The synthetic fixture dataset — demo mode only. See resolveExpertPropertyIds.
const dataset = loadPilotDataset();
const syntheticPropertyIds = new Set(
  dataset.properties.map((property) => property.identity.property_id),
);
const syntheticOfferIds = new Set(
  dataset.offers.map((offer) => offer.offer_id),
);
const syntheticScenarioIds = new Set(
  dataset.purchaseScenarios.map((scenario) => scenario.scenario_id),
);

/**
 * Which dataset this route resolves properties from follows
 * REDS_APPLICATION_MODE the same way runMatchingForConfirmedRequest already
 * does for the buyer-journey runtime: demo mode stays on the synthetic
 * fixture dataset, pilot/production resolve the manually curated real
 * ЕИСЖС objects instead. The two are mutually exclusive, not merged — a
 * restarted process must not suddenly show synthetic fixtures as real
 * pilot objects, or vice versa.
 */
const isDemoMode = (): boolean => resolvePilotRuntimeConfig().mode === "demo";

const resolveExpertPropertyIds = (): {
  readonly properties: ReadonlySet<string>;
  readonly offers: ReadonlySet<string>;
  readonly scenarios: ReadonlySet<string>;
} =>
  isDemoMode()
    ? {
        properties: syntheticPropertyIds,
        offers: syntheticOfferIds,
        scenarios: syntheticScenarioIds,
      }
    : (() => {
        const candidates = loadCuratedPilotDataset().candidates;
        return {
          properties: new Set(
            candidates.map(
              (item) => item.candidate.property.identity.property_id,
            ),
          ),
          offers: new Set(
            candidates.map((item) => item.candidate.offer.offer_id),
          ),
          // Curated candidates carry no purchase scenarios.
          scenarios: new Set<string>(),
        };
      })();

const resolveExpertPropertyDetail = (
  propertyId: string,
  userRequest: Parameters<
    typeof buildPilotPropertyDetailInput
  >[0]["userRequest"],
) =>
  isDemoMode()
    ? buildPilotPropertyDetailInput({ propertyId, userRequest })
    : buildCuratedPropertyDetailInput({ propertyId, userRequest });

/**
 * createSequentialExpertIdFactory restarts its counter at 1 in every new
 * process — fine for the in-memory repository it was designed for, since
 * that state never outlives the process either. Once the repository is
 * durably backed by PostgreSQL (getExpertRequestRepository, see
 * src/expert/web-runtime.ts), a restarted process would immediately collide
 * with request_ids a previous process already persisted. IDs from this route
 * must stay unique across restarts, so they use createRandomExpertIdFactory,
 * not the sequential one.
 */
const createWebExpertId = createRandomExpertIdFactory("web_expert");

// Built fresh per request, the same way the buyer-journey route resolves
// getBuyerJourneyRuntime() per request: the repository behind it is pinned to
// globalThis, but the service wrapping it must not cache a repository chosen
// before resetExpertRequestRepositoryForTests() (or a real env change) ran.
const buildExpertRequestService = (): ExpertRequestService =>
  new ExpertRequestService(
    getExpertRequestRepository(),
    {
      canAccess: async ({ owner, entityType, entityId }) => {
        const ids = resolveExpertPropertyIds();
        if (entityType === "property") return ids.properties.has(entityId);
        if (entityType === "offer") return ids.offers.has(entityId);
        if (entityType === "purchase_scenario")
          return ids.scenarios.has(entityId);
        if (entityType === "document")
          return canAccessSessionDocumentReference({
            owner,
            documentRef: entityId,
          });
        return true;
      },
    },
    { onAssigned: () => undefined },
    createWebExpertId,
    () => new Date().toISOString(),
  );

const priority = (
  value: "critical" | "high" | "medium" | "low",
): "critical" | "high" | "normal" | "low" =>
  value === "medium" ? "normal" : value;

const failure = (status: number, error: string, message: string): Response =>
  Response.json({ error, message }, { status });

export async function POST(request: Request): Promise<Response> {
  const service = buildExpertRequestService();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return failure(400, "INVALID_JSON", "Тело запроса должно быть JSON.");
  }
  const parsed = apiRequestSchema.safeParse(raw);
  if (!parsed.success)
    return failure(
      422,
      "INVALID_EXPERT_REQUEST",
      "Экспертный запрос или его контекст не прошёл validation.",
    );
  const { owner, submission, userRequest } = parsed.data;
  if (
    submission.userRequestRef !== null &&
    submission.userRequestRef !== userRequest.user_request_id
  )
    return failure(
      422,
      "USER_REQUEST_REFERENCE_MISMATCH",
      "Экспертный контекст относится к другой версии запроса.",
    );

  const details = [];
  for (const propertyId of submission.propertyIds) {
    const adapted = resolveExpertPropertyDetail(propertyId, userRequest);
    if (!adapted.success)
      return failure(404, adapted.error.code, adapted.error.message);
    if (!adapted.input.matching || !adapted.input.dataQuality)
      return failure(
        422,
        "DECISION_CONTEXT_UNAVAILABLE",
        "Для объекта нет MatchResult или DataQuality.",
      );
    details.push(adapted.input);
  }

  const selectedOffers = details.flatMap((detail) =>
    detail.selectedOffer ? [detail.selectedOffer] : [],
  );
  const selectedScenarios = details.flatMap((detail) =>
    detail.selectedPurchaseScenario ? [detail.selectedPurchaseScenario] : [],
  );
  const relevantEntityIds = new Set([
    ...submission.propertyIds,
    ...selectedOffers.map((offer) => offer.offer_id),
    ...selectedScenarios.map((scenario) => scenario.scenario_id),
  ]);
  // Curated real candidates carry no source conflicts of their own (single
  // manually entered source per object); only the synthetic demo dataset
  // models conflicting sources.
  const conflicts = isDemoMode()
    ? dataset.sourceConflicts.filter((conflict) =>
        relevantEntityIds.has(conflict.entity_id),
      )
    : [];
  const sourceEvidenceRefs = [
    ...new Set(
      details.flatMap((detail) =>
        detail.dataQuality!.field_results.flatMap(
          (field) => field.evidence_refs,
        ),
      ),
    ),
  ];
  const structuredQuestion = {
    question_code: submission.questionCode ?? "user_expert_question",
    field: submission.field,
    entity_id: submission.propertyIds[0]!,
    reason:
      submission.triggerType === "critical_conflict"
        ? "Нужно разрешить критичное расхождение evidence"
        : "Нужно проверить факт, влияющий на решение",
    priority: "critical" as const,
  };
  const latestSourceDataAt =
    details
      .flatMap((detail) =>
        detail.fieldEvidence.map((item) => item.collected_at),
      )
      .sort()
      .at(-1) ?? null;

  try {
    const created = await service.createDraft({
      owner,
      requestType: submission.requestType,
      triggerType: submission.triggerType,
      questionCategory: submission.questionCategory,
      comparisonId: submission.comparisonRef,
      question: submission.userQuestion,
      structuredQuestions: [structuredQuestion],
      priority: {
        preDecision:
          submission.requestType === "choice_assistance" ||
          submission.triggerType === "critical_unknown" ||
          submission.triggerType === "critical_conflict",
        mustCriterion: details.some(
          (detail) =>
            detail.dataQuality!.critical_unknowns.length > 0 ||
            detail.dataQuality!.critical_conflicts.length > 0,
        ),
        financialImpact:
          submission.questionCategory === "financing" ||
          submission.questionCategory === "price",
        unresolvedConflict: conflicts.some(
          (conflict) => conflict.status === "open",
        ),
        transactionDeadline: userRequest.timeline.purchase_by,
        explicitUrgency: "normal",
      },
      context: {
        userRequest,
        properties: details.map((detail) => detail.property),
        selectedOffers,
        selectedPurchaseScenarios: selectedScenarios,
        matchResults: details.map((detail) => detail.matching!.match_result),
        dataQuality: details.map((detail) => ({
          propertyId: detail.property.identity.property_id,
          dataQuality: detail.dataQuality!.data_quality,
        })),
        criticalUnknowns: details.flatMap((detail) =>
          detail.dataQuality!.critical_unknowns.map((unknown) => ({
            entityId: detail.property.identity.property_id,
            field: unknown.field,
            reason: unknown.reason,
            mustCriterion: true,
            evidenceRefs: unknown.recommended_check.evidence_refs,
          })),
        ),
        conflicts,
        recommendedChecks: details.flatMap((detail) =>
          detail.dataQuality!.recommended_checks.map((check) => ({
            checkCode: check.code.toLocaleLowerCase("en-US"),
            entityId: detail.property.identity.property_id,
            field: check.field,
            reason: `DataQuality recommends ${check.code}`,
            priority: priority(check.priority),
          })),
        ),
        sourceEvidenceRefs,
        choice:
          submission.requestType === "choice_assistance"
            ? {
                tradeoffs: details.map((detail) => ({
                  statement:
                    detail.matching!.match_result.compromises[0] ??
                    "Преимущества варианта нужно сопоставить с его неизвестными данными.",
                  propertyIds: [detail.property.identity.property_id],
                })),
                decisionDrivers: [
                  ...new Set(
                    [...userRequest.must_have, ...userRequest.nice_to_have].map(
                      (criterion) =>
                        criterion.user_expression ?? criterion.field,
                    ),
                  ),
                ],
              }
            : null,
        documentRefs: submission.documentRefs,
        onsite: submission.onsite
          ? {
              scope: submission.onsite.scope,
              knownRisks: submission.onsite.knownRisks ?? [],
              itemsToCheck:
                submission.onsite.itemsToCheck &&
                submission.onsite.itemsToCheck.length > 0
                  ? submission.onsite.itemsToCheck
                  : [
                      submission.field
                        ? `Проверить на месте: ${submission.field}`
                        : "Проверить на месте обозначенный пользователем физический факт",
                    ],
            }
          : null,
        latestSourceDataAt,
      },
    });
    const queued = created.created
      ? await service.submit(created.request.request_id, owner)
      : created.request;
    return Response.json(
      {
        request_id: queued.request_id,
        status: queued.status,
        priority: queued.priority,
        required_specialist: queued.required_specialist,
        created: created.created,
      },
      { status: created.created ? 201 : 200 },
    );
  } catch (error) {
    return failure(
      422,
      "EXPERT_REQUEST_REJECTED",
      error instanceof Error
        ? error.message
        : "Экспертный запрос отклонён validation layer.",
    );
  }
}
