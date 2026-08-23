import { loadPilotDataset } from "../../src/pilot-dataset";
import type { PilotCandidate } from "../../src/pilot-hardening";

export const createSyntheticPilotCandidate = (): PilotCandidate => {
  const dataset = loadPilotDataset();
  const property = dataset.properties[0]!;
  const offer = dataset.offers.find(
    (candidate) => candidate.property_id === property.identity.property_id,
  )!;
  const source = dataset.sources.find(
    (candidate) => candidate.source_id === offer.source_reference.source_id,
  )!;
  const evidenceIds = new Set([
    ...property.metadata.evidence_refs,
    ...offer.evidence_refs,
    ...offer.source_reference.evidence_ids,
  ]);
  const evidence = dataset.fieldEvidence.filter((item) =>
    evidenceIds.has(item.evidence_id),
  );
  const sourceIds = new Set([
    offer.source_reference.source_id,
    ...evidence.map((item) => item.source_id),
  ]);
  return {
    schema_version: "pilot-candidate-v1",
    origin: "synthetic",
    property,
    offer,
    source,
    sources: dataset.sources.filter((item) => sourceIds.has(item.source_id)),
    evidence,
    financing_claims: [],
    observed_at: offer.updated_at ?? property.metadata.updated_at,
    environment: "test",
  };
};
