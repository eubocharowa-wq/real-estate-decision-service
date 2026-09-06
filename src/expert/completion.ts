import {
  expertAuditEventSchema,
  expertResultSchema,
  type ExpertAuditEvent,
  type ExpertEvidenceCandidate,
  type ExpertRequest,
  type ExpertResult,
} from "./contracts";
import type { ExpertClock, ExpertIdFactory } from "./service";
import type { ExpertRequestRepository } from "./repository";

export interface ExpertEvidenceIntegrationOutcome {
  readonly createdEvidenceIds: readonly string[];
  readonly affectedPropertyIds: readonly string[];
  readonly affectedOfferIds: readonly string[];
  readonly affectedScenarioIds: readonly string[];
}

export interface ExpertEvidenceIntegrationHook {
  validateExistingReferences(
    evidenceRefs: readonly string[],
  ): boolean | Promise<boolean>;
  integrate(input: {
    readonly request: ExpertRequest;
    readonly candidates: readonly ExpertEvidenceCandidate[];
    readonly idempotencyKey: string;
  }):
    | ExpertEvidenceIntegrationOutcome
    | Promise<ExpertEvidenceIntegrationOutcome>;
}

export interface CanonicalUpdateOutcome {
  readonly updateRequestIds: readonly string[];
  readonly resolvedConflictIds: readonly string[];
}

export interface ExpertCanonicalUpdateHook {
  requestCanonicalUpdate(input: {
    readonly request: ExpertRequest;
    readonly result: ExpertResult;
    readonly evidenceIds: readonly string[];
    readonly conflictResolutions: readonly {
      readonly conflictId: string;
      readonly resolvedValue: unknown;
      readonly resolutionReason: string;
      readonly resolvedBy: string;
      readonly resolvedAt: string;
      readonly evidenceRefs: readonly string[];
    }[];
  }): CanonicalUpdateOutcome | Promise<CanonicalUpdateOutcome>;
}

export interface ExpertRecomputeOutcome {
  readonly dataQualityRequestIds: readonly string[];
  readonly matchResultRequestIds: readonly string[];
}

export interface ExpertRecomputeHook {
  requestRecompute(input: {
    readonly userRequestId: string;
    readonly propertyIds: readonly string[];
    readonly offerIds: readonly string[];
    readonly scenarioIds: readonly string[];
    readonly evidenceIds: readonly string[];
    readonly canonicalUpdateRequestIds: readonly string[];
  }): ExpertRecomputeOutcome | Promise<ExpertRecomputeOutcome>;
}

export interface CompleteExpertRequestOutcome {
  readonly request: ExpertRequest;
  readonly result: ExpertResult;
  readonly evidence: ExpertEvidenceIntegrationOutcome;
  readonly canonical: CanonicalUpdateOutcome;
  readonly recompute: ExpertRecomputeOutcome;
  readonly recomputeStatus: "not_required" | "completed" | "failed";
  readonly recomputeErrorCode: "RECOMPUTE_FAILED" | null;
}

const EMPTY_EVIDENCE: ExpertEvidenceIntegrationOutcome = Object.freeze({
  createdEvidenceIds: [],
  affectedPropertyIds: [],
  affectedOfferIds: [],
  affectedScenarioIds: [],
});
const EMPTY_CANONICAL: CanonicalUpdateOutcome = Object.freeze({
  updateRequestIds: [],
  resolvedConflictIds: [],
});
const EMPTY_RECOMPUTE: ExpertRecomputeOutcome = Object.freeze({
  dataQualityRequestIds: [],
  matchResultRequestIds: [],
});

const unique = (values: readonly string[]): string[] => [...new Set(values)];

export class ExpertCompletionService {
  constructor(
    private readonly repository: ExpertRequestRepository,
    private readonly evidenceHook: ExpertEvidenceIntegrationHook,
    private readonly canonicalHook: ExpertCanonicalUpdateHook,
    private readonly recomputeHook: ExpertRecomputeHook,
    private readonly createId: ExpertIdFactory,
    private readonly clock: ExpertClock,
  ) {}

  async complete(
    candidate: ExpertResult,
  ): Promise<CompleteExpertRequestOutcome> {
    const result = expertResultSchema.parse(candidate);
    const request = await this.repository.get(result.request_id);
    if (!request) throw new Error("EXPERT_REQUEST_NOT_FOUND");
    if (request.status !== "in_progress")
      throw new Error("EXPERT_REQUEST_NOT_IN_PROGRESS");
    if (
      request.assigned_specialist_ref !== result.specialist.specialist_ref ||
      request.required_specialist !== result.specialist.specialist_type
    )
      throw new Error("RESULT_SPECIALIST_DOES_NOT_MATCH_ASSIGNMENT");
    if (
      request.request_type === "choice_assistance" &&
      !result.choice_assistance
    )
      throw new Error("CHOICE_ASSISTANCE_RESULT_REQUIRED");
    if (
      request.request_type !== "choice_assistance" &&
      result.choice_assistance
    )
      throw new Error("CHOICE_RESULT_NOT_ALLOWED_FOR_REQUEST_TYPE");
    if (
      ["document_review", "transaction_question"].includes(
        request.request_type,
      ) &&
      !result.disclaimer
    )
      throw new Error("LEGAL_BOUNDARY_DISCLAIMER_REQUIRED");
    if (
      !(await this.evidenceHook.validateExistingReferences(
        result.evidence_refs,
      ))
    )
      throw new Error("UNKNOWN_EVIDENCE_REFERENCE");
    if (
      result.evidence_candidates.some(
        (candidate) =>
          candidate.checked_by !== result.specialist.specialist_ref ||
          Date.parse(candidate.checked_at) > Date.parse(result.completed_at),
      )
    )
      throw new Error("INVALID_EXPERT_EVIDENCE_PROVENANCE");

    let evidence: ExpertEvidenceIntegrationOutcome = EMPTY_EVIDENCE;
    let canonical: CanonicalUpdateOutcome = EMPTY_CANONICAL;
    let recompute: ExpertRecomputeOutcome = EMPTY_RECOMPUTE;
    let recomputeStatus: CompleteExpertRequestOutcome["recomputeStatus"] =
      "not_required";
    let recomputeErrorCode: CompleteExpertRequestOutcome["recomputeErrorCode"] =
      null;
    let recomputeInput:
      Parameters<ExpertRecomputeHook["requestRecompute"]>[0] | null = null;

    if (result.evidence_candidates.length > 0) {
      evidence = await this.evidenceHook.integrate({
        request,
        candidates: result.evidence_candidates,
        idempotencyKey: `${request.request_id}:${result.expert_result_id}:${result.result_version}`,
      });
      await this.appendAudit(request.request_id, {
        event_type: "evidence_created",
        actor_type: "expert",
        actor_ref: result.specialist.specialist_ref,
        metadata: {
          evidence_count: evidence.createdEvidenceIds.length,
        },
      });
    }

    if (result.status !== "unable_to_verify") {
      const conflictResolutions = result.conflicts
        .filter((conflict) => conflict.outcome === "resolution_requested")
        .map((conflict) => ({
          conflictId: conflict.conflict_id,
          resolvedValue: conflict.resolved_value,
          resolutionReason: conflict.reason,
          resolvedBy: result.specialist.specialist_ref,
          resolvedAt: result.completed_at,
          evidenceRefs: conflict.evidence_refs,
        }));
      if (result.confirmed.length > 0 || conflictResolutions.length > 0) {
        canonical = await this.canonicalHook.requestCanonicalUpdate({
          request,
          result,
          evidenceIds: unique([
            ...result.evidence_refs,
            ...evidence.createdEvidenceIds,
          ]),
          conflictResolutions,
        });
        await this.appendAudit(request.request_id, {
          event_type: "canonical_update_requested",
          actor_type: "system",
          actor_ref: null,
          metadata: {
            update_request_count: canonical.updateRequestIds.length,
            conflict_resolution_count: canonical.resolvedConflictIds.length,
          },
        });
      }
      const propertyIds = unique([
        ...request.property_ids,
        ...evidence.affectedPropertyIds,
      ]);
      if (
        evidence.createdEvidenceIds.length > 0 ||
        canonical.updateRequestIds.length > 0
      ) {
        recomputeInput = {
          userRequestId: request.user_request_id,
          propertyIds,
          offerIds: unique([
            ...request.offer_ids,
            ...evidence.affectedOfferIds,
          ]),
          scenarioIds: unique([
            ...request.purchase_scenario_ids,
            ...evidence.affectedScenarioIds,
          ]),
          evidenceIds: evidence.createdEvidenceIds,
          canonicalUpdateRequestIds: canonical.updateRequestIds,
        };
      }
    }

    await this.repository.saveResult(result);
    await this.appendAudit(request.request_id, {
      event_type: "result_saved",
      actor_type: "expert",
      actor_ref: result.specialist.specialist_ref,
      metadata: {
        result_status: result.status,
        result_version: result.result_version,
      },
    });
    const nextStatus =
      result.status === "unable_to_verify" ? "unable_to_complete" : "completed";
    const updated = await this.repository.updateStatus(
      request.request_id,
      nextStatus,
      this.clock(),
    );
    await this.appendAudit(request.request_id, {
      event_type: "status_changed",
      actor_type: "expert",
      actor_ref: result.specialist.specialist_ref,
      metadata: {
        status: nextStatus,
        reason_code:
          nextStatus === "completed"
            ? "EXPERT_RESULT_COMPLETED"
            : "EXPERT_UNABLE_TO_VERIFY",
      },
    });
    await this.appendAudit(request.request_id, {
      event_type: "result_completed",
      actor_type: "expert",
      actor_ref: result.specialist.specialist_ref,
      metadata: {
        result_status: result.status,
        result_version: result.result_version,
      },
    });

    if (recomputeInput) {
      try {
        recompute = await this.recomputeHook.requestRecompute(recomputeInput);
        recomputeStatus = "completed";
        await this.appendAudit(request.request_id, {
          event_type: "recompute_requested",
          actor_type: "system",
          actor_ref: null,
          metadata: {
            data_quality_requests: recompute.dataQualityRequestIds.length,
            match_result_requests: recompute.matchResultRequestIds.length,
          },
        });
      } catch {
        recomputeStatus = "failed";
        recomputeErrorCode = "RECOMPUTE_FAILED";
        await this.appendAudit(request.request_id, {
          event_type: "recompute_failed",
          actor_type: "system",
          actor_ref: null,
          metadata: { error_code: recomputeErrorCode },
        });
      }
    }
    return {
      request: updated,
      result,
      evidence,
      canonical,
      recompute,
      recomputeStatus,
      recomputeErrorCode,
    };
  }

  private async appendAudit(
    requestId: string,
    input: Omit<ExpertAuditEvent, "event_id" | "request_id" | "created_at">,
  ): Promise<void> {
    await this.repository.appendAudit(
      expertAuditEventSchema.parse({
        event_id: this.createId("audit"),
        request_id: requestId,
        created_at: this.clock(),
        ...input,
      }),
    );
  }
}
