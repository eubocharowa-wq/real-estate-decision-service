import type { EvidenceArtifactState } from "../domain/evidence-artifact/schema";

const ALLOWED_TRANSITIONS: Readonly<
  Record<EvidenceArtifactState, readonly EvidenceArtifactState[]>
> = Object.freeze({
  quarantine: ["staged"],
  staged: ["approved"],
  approved: [],
});

export const canTransitionEvidenceArtifact = (
  from: EvidenceArtifactState,
  to: EvidenceArtifactState,
): boolean => ALLOWED_TRANSITIONS[from].includes(to);

export const assertEvidenceArtifactTransition = (
  from: EvidenceArtifactState,
  to: EvidenceArtifactState,
): void => {
  if (!canTransitionEvidenceArtifact(from, to))
    throw new Error(`EVIDENCE_ARTIFACT_INVALID_TRANSITION:${from}->${to}`);
};
