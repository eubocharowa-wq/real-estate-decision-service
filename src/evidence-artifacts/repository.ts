import {
  evidenceArtifactEventSchema,
  evidenceArtifactLinkSchema,
  evidenceArtifactSchema,
  type EvidenceArtifact,
  type EvidenceArtifactEvent,
  type EvidenceArtifactLink,
  type EvidenceArtifactState,
} from "../domain/evidence-artifact/schema";
import { assertEvidenceArtifactTransition } from "./lifecycle";

export interface EvidenceArtifactRepository {
  transaction<T>(work: () => Promise<T>): Promise<T>;
  createQuarantinedArtifact(
    artifact: EvidenceArtifact,
    event: EvidenceArtifactEvent,
  ): Promise<EvidenceArtifact>;
  getArtifact(artifactId: string): Promise<EvidenceArtifact | null>;
  transitionArtifact(
    artifactId: string,
    toState: EvidenceArtifactState,
    event: EvidenceArtifactEvent,
  ): Promise<EvidenceArtifact>;
  linkArtifact(link: EvidenceArtifactLink): Promise<void>;
  listArtifactLinks(
    artifactId: string,
  ): Promise<readonly EvidenceArtifactLink[]>;
  listArtifactEvents(
    artifactId: string,
  ): Promise<readonly EvidenceArtifactEvent[]>;
}

const clone = <T>(value: T): T => structuredClone(value);

const linkKey = (link: EvidenceArtifactLink): string =>
  [link.artifact_id, link.subject_type, link.subject_id, link.relation].join(
    "\u0000",
  );

export class InMemoryEvidenceArtifactRepository implements EvidenceArtifactRepository {
  private artifacts = new Map<string, EvidenceArtifact>();
  private links = new Map<string, EvidenceArtifactLink>();
  private events = new Map<string, EvidenceArtifactEvent>();
  private transactionDepth = 0;

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.transactionDepth > 0) return work();
    const snapshot = {
      artifacts: clone(this.artifacts),
      links: clone(this.links),
      events: clone(this.events),
    };
    this.transactionDepth += 1;
    try {
      return await work();
    } catch (error) {
      this.artifacts = snapshot.artifacts;
      this.links = snapshot.links;
      this.events = snapshot.events;
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  async createQuarantinedArtifact(
    artifactInput: EvidenceArtifact,
    eventInput: EvidenceArtifactEvent,
  ): Promise<EvidenceArtifact> {
    const artifact = evidenceArtifactSchema.parse(artifactInput);
    const event = evidenceArtifactEventSchema.parse(eventInput);
    if (artifact.state !== "quarantine")
      throw new Error("EVIDENCE_ARTIFACT_MUST_START_IN_QUARANTINE");
    if (
      event.artifact_id !== artifact.artifact_id ||
      event.event_type !== "artifact_created" ||
      event.from_state !== null ||
      event.to_state !== "quarantine"
    )
      throw new Error("EVIDENCE_ARTIFACT_CREATED_EVENT_MISMATCH");
    if (this.artifacts.has(artifact.artifact_id))
      throw new Error("EVIDENCE_ARTIFACT_ID_CONFLICT");
    if (this.events.has(event.event_id))
      throw new Error("EVIDENCE_ARTIFACT_EVENT_ID_CONFLICT");
    this.artifacts.set(artifact.artifact_id, clone(artifact));
    this.events.set(event.event_id, clone(event));
    return clone(artifact);
  }

  async getArtifact(artifactId: string): Promise<EvidenceArtifact | null> {
    const artifact = this.artifacts.get(artifactId);
    return artifact ? clone(artifact) : null;
  }

  async transitionArtifact(
    artifactId: string,
    toState: EvidenceArtifactState,
    eventInput: EvidenceArtifactEvent,
  ): Promise<EvidenceArtifact> {
    const current = this.artifacts.get(artifactId);
    if (!current) throw new Error("EVIDENCE_ARTIFACT_NOT_FOUND");
    assertEvidenceArtifactTransition(current.state, toState);
    const event = evidenceArtifactEventSchema.parse(eventInput);
    if (
      event.artifact_id !== artifactId ||
      event.event_type !== "state_transitioned" ||
      event.from_state !== current.state ||
      event.to_state !== toState
    )
      throw new Error("EVIDENCE_ARTIFACT_TRANSITION_EVENT_MISMATCH");
    if (this.events.has(event.event_id))
      throw new Error("EVIDENCE_ARTIFACT_EVENT_ID_CONFLICT");

    const transitioned = evidenceArtifactSchema.parse({
      ...current,
      state: toState,
    });
    this.artifacts.set(artifactId, clone(transitioned));
    this.events.set(event.event_id, clone(event));
    return clone(transitioned);
  }

  async linkArtifact(linkInput: EvidenceArtifactLink): Promise<void> {
    const link = evidenceArtifactLinkSchema.parse(linkInput);
    if (!this.artifacts.has(link.artifact_id))
      throw new Error("EVIDENCE_ARTIFACT_NOT_FOUND");
    const key = linkKey(link);
    if (!this.links.has(key)) this.links.set(key, clone(link));
  }

  async listArtifactLinks(
    artifactId: string,
  ): Promise<readonly EvidenceArtifactLink[]> {
    return [...this.links.values()]
      .filter((link) => link.artifact_id === artifactId)
      .sort(
        (left, right) =>
          left.created_at.localeCompare(right.created_at) ||
          linkKey(left).localeCompare(linkKey(right)),
      )
      .map(clone);
  }

  async listArtifactEvents(
    artifactId: string,
  ): Promise<readonly EvidenceArtifactEvent[]> {
    return [...this.events.values()]
      .filter((event) => event.artifact_id === artifactId)
      .sort(
        (left, right) =>
          left.occurred_at.localeCompare(right.occurred_at) ||
          left.event_id.localeCompare(right.event_id),
      )
      .map(clone);
  }
}
