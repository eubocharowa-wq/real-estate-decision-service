import type { FieldEvidence } from "../domain";
import type {
  ExpertContextPackage,
  ExpertEvidenceCandidate,
  ExpertRequest,
  ExpertResult,
} from "./contracts";

export const EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH =
  "EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH";
export const EXPERT_EVIDENCE_ENTITY_OUTSIDE_CONTEXT =
  "EXPERT_EVIDENCE_ENTITY_OUTSIDE_CONTEXT";
export const EXPERT_EVIDENCE_FIELD_OUTSIDE_CONTEXT =
  "EXPERT_EVIDENCE_FIELD_OUTSIDE_CONTEXT";
export const EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH =
  "EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH";

type ConfirmedFact = ExpertResult["confirmed"][number];
type EvidenceBinding = Pick<
  ExpertEvidenceCandidate,
  "entity_type" | "entity_id" | "field" | "value" | "verification_status"
>;

const CONTEXT_FIELDS_BY_ENTITY_TYPE = Object.freeze({
  property: new Set([
    "physical.rooms",
    "physical.floor",
    "physical.total_area_m2",
    "timeline.handover_date",
  ]),
  offer: new Set([
    "listing_price",
    "price_from",
    "availability",
    "verification_status",
    "freshness_status",
  ]),
  purchase_scenario: new Set([
    "financing_program_id",
    "entry_cash",
    "monthly_payment",
    "total_payment",
    "terms_compatibility_status",
    "verification_status",
    "freshness_status",
  ]),
});

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
};

export const expertEvidenceValuesEqual = (
  left: unknown,
  right: unknown,
): boolean => stableJson(left) === stableJson(right);

const isContextualEntity = (input: {
  readonly request: ExpertRequest;
  readonly context: ExpertContextPackage;
  readonly entityType: string;
  readonly entityId: string;
}): boolean => {
  if (input.entityType === "property")
    return (
      input.request.property_ids.includes(input.entityId) &&
      input.context.properties.some(
        (property) => property.property_id === input.entityId,
      )
    );
  if (input.entityType === "offer")
    return (
      input.request.offer_ids.includes(input.entityId) &&
      input.context.selected_offers.some(
        (offer) => offer.offer_id === input.entityId,
      )
    );
  if (input.entityType === "purchase_scenario")
    return (
      input.request.purchase_scenario_ids.includes(input.entityId) &&
      input.context.selected_purchase_scenarios.some(
        (scenario) => scenario.scenario_id === input.entityId,
      )
    );

  // ExpertContextPackage has no financing-eligibility IDs or relationship
  // that could prove an eligibility row belongs to this request. Fail closed
  // until that relationship is explicitly added to the context contract.
  return false;
};

const isContextualField = (input: {
  readonly context: ExpertContextPackage;
  readonly entityType: string;
  readonly entityId: string;
  readonly field: string;
}): boolean => {
  if (input.entityType === "offer")
    return CONTEXT_FIELDS_BY_ENTITY_TYPE.offer.has(input.field);
  if (input.entityType === "purchase_scenario")
    return CONTEXT_FIELDS_BY_ENTITY_TYPE.purchase_scenario.has(input.field);
  if (input.entityType !== "property") return false;
  return (
    CONTEXT_FIELDS_BY_ENTITY_TYPE.property.has(input.field) ||
    [
      ...input.context.structured_questions,
      ...input.context.critical_unknowns,
      ...input.context.recommended_checks,
      ...input.context.conflicts,
    ].some(
      (contextItem) =>
        contextItem.entity_id === input.entityId &&
        contextItem.field === input.field,
    )
  );
};

export const assertExpertEvidenceCandidatesWithinContext = (input: {
  readonly request: ExpertRequest;
  readonly context: ExpertContextPackage;
  readonly candidates: readonly ExpertEvidenceCandidate[];
}): void => {
  const ids = new Set<string>();
  for (const candidate of input.candidates) {
    if (ids.has(candidate.evidence_candidate_id))
      throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);
    ids.add(candidate.evidence_candidate_id);
    if (
      !isContextualEntity({
        request: input.request,
        context: input.context,
        entityType: candidate.entity_type,
        entityId: candidate.entity_id,
      })
    )
      throw new Error(EXPERT_EVIDENCE_ENTITY_OUTSIDE_CONTEXT);
    if (
      !isContextualField({
        context: input.context,
        entityType: candidate.entity_type,
        entityId: candidate.entity_id,
        field: candidate.field,
      })
    )
      throw new Error(EXPERT_EVIDENCE_FIELD_OUTSIDE_CONTEXT);
  }
};

export const expertEvidenceSupportsConfirmedFact = (
  evidence: EvidenceBinding,
  fact: ConfirmedFact,
): boolean =>
  evidence.entity_id === fact.entity_id &&
  evidence.field === fact.field &&
  evidence.verification_status === "confirmed" &&
  expertEvidenceValuesEqual(evidence.value, fact.value);

const candidateIndex = (
  candidates: readonly ExpertEvidenceCandidate[],
): ReadonlyMap<string, ExpertEvidenceCandidate> =>
  new Map(
    candidates.map((candidate) => [candidate.evidence_candidate_id, candidate]),
  );

/** Protects direct completion callers that bypass the workbench draft API. */
export const assertDeclaredCandidateEvidenceIntegrity = (input: {
  readonly request: ExpertRequest;
  readonly context: ExpertContextPackage;
  readonly result: ExpertResult;
}): void => {
  assertExpertEvidenceCandidatesWithinContext({
    request: input.request,
    context: input.context,
    candidates: input.result.evidence_candidates,
  });
  const candidates = candidateIndex(input.result.evidence_candidates);
  for (const fact of input.result.confirmed)
    for (const ref of fact.evidence_refs) {
      const evidence = candidates.get(ref);
      if (evidence && !expertEvidenceSupportsConfirmedFact(evidence, fact))
        throw new Error(EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH);
    }

  for (const fact of input.result.unconfirmed)
    for (const ref of fact.evidence_refs) {
      const evidence = candidates.get(ref);
      if (
        evidence &&
        (evidence.entity_id !== fact.entity_id ||
          evidence.field !== fact.field ||
          evidence.verification_status === "confirmed")
      )
        throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);
    }

  const contextualConflicts = new Map(
    input.context.conflicts.map((conflict) => [conflict.conflict_id, conflict]),
  );
  for (const conflict of input.result.conflicts) {
    const contextual = contextualConflicts.get(conflict.conflict_id);
    if (!contextual || contextual.field !== conflict.field)
      throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);
    if (conflict.outcome === "remains_open") {
      if (
        conflict.evidence_refs.length !== contextual.evidence_refs.length ||
        conflict.evidence_refs.some(
          (reference) => !contextual.evidence_refs.includes(reference),
        )
      )
        throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);
      continue;
    }
    const evidence = conflict.evidence_refs.flatMap((ref) => {
      const candidate = candidates.get(ref);
      return candidate ? [candidate] : [];
    });
    if (
      evidence.some(
        (candidate) =>
          candidate.entity_id !== contextual.entity_id ||
          candidate.field !== contextual.field,
      )
    )
      throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);
    if (
      conflict.outcome === "resolution_requested" &&
      evidence.length > 0 &&
      !evidence.some(
        (candidate) =>
          candidate.verification_status === "confirmed" &&
          expertEvidenceValuesEqual(candidate.value, conflict.resolved_value),
      )
    )
      throw new Error(EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH);
  }

  for (const finding of input.result.findings)
    for (const ref of finding.evidence_refs) {
      const evidence = candidates.get(ref);
      if (
        evidence &&
        (!finding.related_entity_ids.includes(evidence.entity_id) ||
          (finding.related_field !== null &&
            finding.related_field !== evidence.field) ||
          (finding.verification_effect === "confirmed" &&
            evidence.verification_status !== "confirmed") ||
          (finding.verification_effect === "unconfirmed" &&
            evidence.verification_status === "confirmed"))
      )
        throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);
    }
};

const toBinding = (evidence: FieldEvidence): EvidenceBinding => evidence;

/**
 * Full semantic validation for the buyer-journey integration boundary.
 * Existing stored evidence and newly declared candidates follow the same
 * entity/field/value/status rules; merely knowing an evidence id is not enough.
 */
export const assertExpertResultEvidenceIntegrity = (input: {
  readonly request: ExpertRequest;
  readonly context: ExpertContextPackage;
  readonly result: ExpertResult;
  readonly existingEvidence: readonly FieldEvidence[];
}): void => {
  assertDeclaredCandidateEvidenceIntegrity(input);
  const candidates = candidateIndex(input.result.evidence_candidates);
  const existing = new Map(
    input.existingEvidence.map((evidence) => [evidence.evidence_id, evidence]),
  );
  for (const ref of candidates.keys())
    if (existing.has(ref))
      throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);

  const resolve = (ref: string): EvidenceBinding | null =>
    candidates.get(ref) ?? existing.get(ref) ?? null;
  const requireBindings = (
    refs: readonly string[],
    errorCode = EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH,
  ): readonly EvidenceBinding[] =>
    refs.map((ref) => {
      const evidence = resolve(ref);
      if (!evidence) throw new Error(errorCode);
      if (
        !isContextualEntity({
          request: input.request,
          context: input.context,
          entityType: evidence.entity_type,
          entityId: evidence.entity_id,
        })
      )
        throw new Error(EXPERT_EVIDENCE_ENTITY_OUTSIDE_CONTEXT);
      if (
        !isContextualField({
          context: input.context,
          entityType: evidence.entity_type,
          entityId: evidence.entity_id,
          field: evidence.field,
        })
      )
        throw new Error(EXPERT_EVIDENCE_FIELD_OUTSIDE_CONTEXT);
      return evidence;
    });

  for (const fact of input.result.confirmed) {
    const evidence = requireBindings(
      fact.evidence_refs,
      EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH,
    );
    if (
      evidence.length === 0 ||
      evidence.some((item) => !expertEvidenceSupportsConfirmedFact(item, fact))
    )
      throw new Error(EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH);
  }

  for (const fact of input.result.unconfirmed)
    for (const evidence of requireBindings(fact.evidence_refs))
      if (
        evidence.entity_id !== fact.entity_id ||
        evidence.field !== fact.field ||
        evidence.verification_status === "confirmed"
      )
        throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);

  const contextualConflicts = new Map(
    input.context.conflicts.map((conflict) => [conflict.conflict_id, conflict]),
  );
  for (const conflict of input.result.conflicts) {
    const contextual = contextualConflicts.get(conflict.conflict_id);
    if (!contextual || contextual.field !== conflict.field)
      throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);
    if (conflict.outcome === "remains_open") {
      if (
        conflict.evidence_refs.length !== contextual.evidence_refs.length ||
        conflict.evidence_refs.some(
          (reference) => !contextual.evidence_refs.includes(reference),
        )
      )
        throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);
      continue;
    }
    const evidence = requireBindings(conflict.evidence_refs);
    if (
      evidence.some(
        (item) =>
          item.entity_id !== contextual.entity_id ||
          item.field !== contextual.field,
      )
    )
      throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);
    if (
      conflict.outcome === "resolution_requested" &&
      !evidence.some(
        (item) =>
          item.verification_status === "confirmed" &&
          expertEvidenceValuesEqual(item.value, conflict.resolved_value),
      )
    )
      throw new Error(EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH);
  }

  for (const finding of input.result.findings)
    for (const evidence of requireBindings(finding.evidence_refs))
      if (
        !finding.related_entity_ids.includes(evidence.entity_id) ||
        (finding.related_field !== null &&
          finding.related_field !== evidence.field) ||
        (finding.verification_effect === "confirmed" &&
          evidence.verification_status !== "confirmed") ||
        (finding.verification_effect === "unconfirmed" &&
          evidence.verification_status === "confirmed")
      )
        throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);
};

export const findConfirmedFieldEvidence = (input: {
  readonly fact: ConfirmedFact;
  readonly evidence: readonly FieldEvidence[];
}): FieldEvidence | null =>
  input.evidence.find((evidence) =>
    expertEvidenceSupportsConfirmedFact(toBinding(evidence), input.fact),
  ) ?? null;
