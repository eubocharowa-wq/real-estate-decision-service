import {
  EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH,
  EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH,
  assertExpertEvidenceCandidatesWithinContext,
  expertEvidenceValuesEqual,
  expertEvidenceSupportsConfirmedFact,
  type ExpertContextPackage,
  type ExpertEvidenceCandidate,
  type ExpertRequest,
} from "../expert";
import type { ExpertResultDraft } from "./contracts";

const candidatesFor = (
  refs: readonly string[],
  candidates: ReadonlyMap<string, ExpertEvidenceCandidate>,
): readonly ExpertEvidenceCandidate[] =>
  refs.flatMap((ref) => {
    const candidate = candidates.get(ref);
    return candidate ? [candidate] : [];
  });

/** Draft-time validation; stored evidence is revalidated at completion. */
export const assertExpertDraftEvidenceIntegrity = (input: {
  readonly request: ExpertRequest;
  readonly context: ExpertContextPackage;
  readonly draft: ExpertResultDraft;
}): void => {
  assertExpertEvidenceCandidatesWithinContext({
    request: input.request,
    context: input.context,
    candidates: input.draft.evidence_candidates,
  });
  const candidates = new Map(
    input.draft.evidence_candidates.map((candidate) => [
      candidate.evidence_candidate_id,
      candidate,
    ]),
  );

  for (const fact of input.draft.confirmed)
    for (const candidate of candidatesFor(fact.evidence_refs, candidates))
      if (!expertEvidenceSupportsConfirmedFact(candidate, fact))
        throw new Error(EXPERT_CONFIRMED_FACT_EVIDENCE_MISMATCH);

  for (const fact of input.draft.unconfirmed)
    for (const candidate of candidatesFor(fact.evidence_refs, candidates))
      if (
        candidate.entity_id !== fact.entity_id ||
        candidate.field !== fact.field ||
        candidate.verification_status === "confirmed"
      )
        throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);

  const conflicts = new Map(
    input.context.conflicts.map((conflict) => [conflict.conflict_id, conflict]),
  );
  for (const conflict of input.draft.conflicts) {
    const contextual = conflicts.get(conflict.conflict_id);
    if (!contextual || contextual.field !== conflict.field)
      throw new Error("EXPERT_CONFLICT_OUTSIDE_SAVED_CONTEXT");
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
    const evidence = candidatesFor(conflict.evidence_refs, candidates);
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

  for (const finding of input.draft.findings)
    for (const candidate of candidatesFor(finding.evidence_refs, candidates))
      if (
        !finding.related_entity_ids.includes(candidate.entity_id) ||
        (finding.related_field !== null &&
          finding.related_field !== candidate.field)
      )
        throw new Error(EXPERT_RESULT_EVIDENCE_BINDING_MISMATCH);
};
