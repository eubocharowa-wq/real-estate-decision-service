import type { FieldEvidence, Offer, Property } from "../../domain";
import type { SourcePolicyEngine } from "../source-registry";
import { sourcePolicyEngine } from "../source-registry";
import { SourceAdapterRegistry } from "./adapter-registry";
import { VneshstroiHttpAdapter } from "./adapters/vneshstroi/adapter";
import {
  VNESHSTROI_APPROVAL_CONDITION,
  VNESHSTROI_NORMALIZATION_VERSION,
  VNESHSTROI_SOURCE_ID,
} from "./config";
import type {
  CanonicalCandidate,
  CollectionErrorCode,
  CollectionExecutionInput,
  CollectionExecutionResult,
  CollectionLog,
  CollectionMetrics,
  CollectionResultStatus,
  CollectionTask,
  DuplicateDecision,
  DuplicateHook,
  PolicyAudit,
  RawCollectionResult,
  TransientNormalizedCandidate,
} from "./contracts";
import { collectionTaskSchema, rawCollectionResultSchema } from "./contracts";
import { DeterministicSourceDuplicateHook } from "./duplicate-hook";
import { SecureHttpCollector } from "./http";
import { normalizeVneshstroiResult } from "./normalization";
import { validateRawCollectionResult } from "./validation";

const emptyState = { properties: [], offers: [], evidence: [] } as const;

const stableToken = (value: string): string => {
  let hash = 2_166_136_261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const policyAudit = (
  plan: ReturnType<SourcePolicyEngine["resolveCollectionPlan"]>,
): PolicyAudit => ({
  registryVersion: plan.registryVersion,
  policyVersion: plan.policyVersion,
  operation: "scheduled_collect",
  allowedMethod: plan.preferredMethod === "http" ? "http" : null,
  validatedTargetUrls: plan.validatedTargetUrls,
  validatedRequestedFields: plan.validatedRequestedFields,
  reasonCodes: plan.reasonCodes,
  decidedAt: plan.decidedAt,
});

const blockedRawResult = ({
  task,
  collectionRunId,
  observedAt,
  warnings,
}: {
  readonly task: CollectionTask;
  readonly collectionRunId: string;
  readonly observedAt: string;
  readonly warnings: readonly string[];
}): RawCollectionResult =>
  rawCollectionResultSchema.parse({
    schema_version: "1.0",
    collection_run_id: collectionRunId,
    task_id: task.task_id,
    source_id: task.source_id,
    source_url: task.target_urls[0],
    canonical_url: task.target_urls[0],
    collected_at: observedAt,
    http_status: null,
    content_type: null,
    raw_payload_reference: null,
    external_record_id: null,
    extracted_fields: [],
    missing_fields: task.requested_fields,
    warnings: [...warnings],
    adapter_version: "not-invoked",
    parser_version: "not-invoked",
    collector_version: "not-invoked",
    status: "blocked",
    error_code: "POLICY_DENIED",
  });

const failedValidationResult = (
  raw: RawCollectionResult,
  errorCode: "VALIDATION_FAILED" | "NORMALIZATION_FAILED",
  message: string,
): RawCollectionResult =>
  rawCollectionResultSchema.parse({
    ...raw,
    status: "failed",
    error_code: errorCode,
    warnings: [...raw.warnings, message],
  });

const executionLog = ({
  task,
  raw,
  durationMs,
  recordsProcessed,
}: {
  readonly task: CollectionTask;
  readonly raw: RawCollectionResult;
  readonly durationMs: number;
  readonly recordsProcessed: number;
}): CollectionLog => ({
  collectionRunId: raw.collection_run_id,
  sourceId: task.source_id,
  taskId: task.task_id,
  method: "http",
  status: raw.status,
  durationMs,
  recordsProcessed,
  fieldsExtracted: raw.extracted_fields.length,
  warnings: raw.warnings,
  errorCode: raw.error_code,
});

const executionMetrics = ({
  status,
  durationMs,
  attempted,
}: {
  readonly status: CollectionResultStatus;
  readonly durationMs: number;
  readonly attempted: boolean;
}): CollectionMetrics => ({
  attempts: attempted ? 1 : 0,
  successes: status === "success" ? 1 : 0,
  partials: status === "partial" ? 1 : 0,
  failures: ["failed", "blocked", "unavailable", "source_changed"].includes(
    status,
  )
    ? 1
    : 0,
  sourceChanged: status === "source_changed" ? 1 : 0,
  durationMs,
});

const rebindEvidence = (
  evidence: readonly FieldEvidence[],
  propertyId: string,
  offerId: string,
): FieldEvidence[] =>
  evidence.map((item) => ({
    ...item,
    entity_id: item.entity_type === "offer" ? offerId : propertyId,
  }));

const rebindProperty = (
  property: Property,
  propertyId: string,
  evidence: readonly FieldEvidence[],
): Property => ({
  ...property,
  identity: { ...property.identity, property_id: propertyId },
  metadata: {
    ...property.metadata,
    evidence_refs: evidence
      .filter((item) => item.entity_type === "property")
      .map((item) => item.evidence_id),
  },
});

const rebindOffer = (
  offer: Offer,
  decision: DuplicateDecision,
  evidence: readonly FieldEvidence[],
): Offer => ({
  ...offer,
  offer_id: decision.offerId,
  property_id: decision.propertyId,
  source_reference: {
    ...offer.source_reference,
    evidence_ids: evidence
      .filter((item) => item.entity_type === "offer")
      .map((item) => item.evidence_id),
  },
  evidence_refs: evidence
    .filter((item) => item.entity_type === "offer")
    .map((item) => item.evidence_id),
});

const canonicalCandidate = (
  normalized: TransientNormalizedCandidate,
  duplicateHook: DuplicateHook,
  state: CollectionExecutionInput["canonicalState"],
): CanonicalCandidate => {
  const duplicate = duplicateHook.evaluate(normalized, state ?? emptyState);
  const evidence = rebindEvidence(
    normalized.evidence,
    duplicate.decision.propertyId,
    duplicate.decision.offerId,
  );
  const conflictWarnings =
    duplicate.conflicts.length > 0
      ? [
          `${duplicate.conflicts.length} conflicting field(s) require explicit resolution.`,
        ]
      : [];
  const reviewWarnings = duplicate.decision.reasonCodes.includes(
    "LOWER_CONFIDENCE_UPDATE_REQUIRES_REVIEW",
  )
    ? ["A lower-confidence update was retained for review, not applied."]
    : [];
  const warnings = [
    ...new Set([
      ...normalized.warnings,
      ...conflictWarnings,
      ...reviewWarnings,
    ]),
  ];
  const matchingReadiness = {
    ...normalized.matchingReadiness,
    status:
      warnings.length > 0 && normalized.matchingReadiness.ready
        ? ("ready_with_unknowns" as const)
        : normalized.matchingReadiness.status,
    warnings,
  };
  return {
    schemaVersion: "1.0",
    normalizationVersion: VNESHSTROI_NORMALIZATION_VERSION,
    persistence: "transient_only",
    propertyCandidate: rebindProperty(
      normalized.property,
      duplicate.decision.propertyId,
      evidence,
    ),
    offerCandidate: rebindOffer(normalized.offer, duplicate.decision, evidence),
    evidence,
    snapshot: null,
    attribution: {
      label: "ВНЕШСТРОЙ",
      sourceUrl: normalized.offer.source_reference.source_url!,
    },
    duplicateDecision: duplicate.decision,
    conflicts: duplicate.conflicts,
    matchingReadiness,
    unresolvedFields: normalized.unresolvedFields,
    warnings,
  };
};

const scopedPlanContractSatisfied = (
  plan: ReturnType<SourcePolicyEngine["resolveCollectionPlan"]>,
  environment: CollectionExecutionInput["environment"],
): boolean =>
  plan.allowed &&
  (environment === "development" || environment === "test") &&
  plan.sourceId === VNESHSTROI_SOURCE_ID &&
  plan.operation === "scheduled_collect" &&
  plan.preferredMethod === "http" &&
  plan.fallbackMethods.length === 0 &&
  plan.validatedTargetUrls.length === 1 &&
  plan.requiredConditions.includes(VNESHSTROI_APPROVAL_CONDITION) &&
  plan.storagePolicy.rawContent.allowed === false &&
  plan.storagePolicy.normalizedData.allowed &&
  plan.storagePolicy.evidenceMetadata.allowed &&
  plan.storagePolicy.snapshots.allowed === false &&
  plan.displayPolicy.normalizedFacts.allowed &&
  plan.displayPolicy.sourceLink.allowed &&
  plan.displayPolicy.rawContent.allowed === false &&
  plan.displayPolicy.evidenceSnippet.allowed === false &&
  plan.displayPolicy.imageMedia.allowed === false &&
  plan.retentionPolicy.normalized_facts === "transient_only" &&
  plan.retentionPolicy.evidence_metadata === "transient_only" &&
  plan.retentionPolicy.raw_content === "prohibited" &&
  plan.retentionPolicy.raw_snapshots === "prohibited" &&
  plan.attributionPolicy.attribution_required &&
  plan.attributionPolicy.attribution_label === "ВНЕШСТРОЙ" &&
  plan.attributionPolicy.link_required;

export class SourceCollectionPipeline {
  constructor(
    private readonly policyEngine: SourcePolicyEngine,
    private readonly adapters: SourceAdapterRegistry,
    private readonly duplicateHook: DuplicateHook,
  ) {}

  async execute(
    input: CollectionExecutionInput,
  ): Promise<CollectionExecutionResult> {
    const task = collectionTaskSchema.parse(input.task);
    const collectionRunId = `collection_run_${stableToken(
      `${task.task_id}:${input.observedAt}`,
    )}`;
    const startedAt = Date.now();
    const plan = this.policyEngine.resolveCollectionPlan({
      sourceId: task.source_id,
      operation: "scheduled_collect",
      environment: input.environment,
      entityType: task.entity_type,
      requestedMethod: "http",
      targetUrls: task.target_urls,
      requestedFields: task.requested_fields,
      discovery: false,
      followLinks: false,
      pagination: false,
      sitemap: false,
      authentication: false,
      challengeAction: "stop",
      satisfiedConditions: input.satisfiedConditions,
      decidedAt: input.observedAt,
    });
    const audit = policyAudit(plan);
    const adapter = scopedPlanContractSatisfied(plan, input.environment)
      ? this.adapters.find(task, "http")
      : null;
    if (!adapter) {
      const raw = blockedRawResult({
        task,
        collectionRunId,
        observedAt: input.observedAt,
        warnings: [
          ...plan.reasonCodes,
          "No adapter was invoked because the scoped policy contract denied execution.",
        ],
      });
      const durationMs = Date.now() - startedAt;
      return {
        schemaVersion: "1.0",
        collectionRunId,
        status: raw.status,
        errorCode: raw.error_code,
        policyAudit: audit,
        rawResult: raw,
        candidate: null,
        log: executionLog({ task, raw, durationMs, recordsProcessed: 0 }),
        metrics: executionMetrics({
          status: raw.status,
          durationMs,
          attempted: false,
        }),
      };
    }

    const adapterRaw = await adapter.collect(task, {
      collectionRunId,
      observedAt: input.observedAt,
      plan,
    });
    let raw = adapterRaw;
    let candidate: CanonicalCandidate | null = null;
    if (raw.status === "success" || raw.status === "partial") {
      const validation = validateRawCollectionResult(raw, task);
      if (!validation.success)
        raw = failedValidationResult(
          raw,
          "VALIDATION_FAILED",
          validation.message,
        );
      else {
        try {
          const normalized = normalizeVneshstroiResult(validation.value, plan);
          candidate = canonicalCandidate(
            normalized,
            this.duplicateHook,
            input.canonicalState,
          );
        } catch (error) {
          raw = failedValidationResult(
            raw,
            "NORMALIZATION_FAILED",
            error instanceof Error ? error.message : "Normalization failed.",
          );
        }
      }
    }
    const durationMs = Date.now() - startedAt;
    const recordsProcessed = candidate ? 1 : 0;
    return {
      schemaVersion: "1.0",
      collectionRunId,
      status: raw.status,
      errorCode: raw.error_code as CollectionErrorCode | null,
      policyAudit: audit,
      rawResult: raw,
      candidate,
      log: executionLog({ task, raw, durationMs, recordsProcessed }),
      metrics: executionMetrics({
        status: raw.status,
        durationMs,
        attempted: true,
      }),
    };
  }
}

export const createVneshstroiCollectionPipeline = ({
  collector = new SecureHttpCollector(),
  policyEngine = sourcePolicyEngine,
  duplicateHook = new DeterministicSourceDuplicateHook(),
}: {
  readonly collector?: ConstructorParameters<typeof VneshstroiHttpAdapter>[0];
  readonly policyEngine?: SourcePolicyEngine;
  readonly duplicateHook?: DuplicateHook;
} = {}): SourceCollectionPipeline =>
  new SourceCollectionPipeline(
    policyEngine,
    new SourceAdapterRegistry([new VneshstroiHttpAdapter(collector)]),
    duplicateHook,
  );
