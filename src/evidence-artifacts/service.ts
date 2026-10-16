import { randomUUID } from "node:crypto";

import {
  EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  evidenceArtifactLinkSchema,
  evidenceArtifactSchema,
  evidenceArtifactSha256Schema,
  type EvidenceArtifact,
  type EvidenceArtifactAccessScope,
  type EvidenceArtifactActorType,
  type EvidenceArtifactKind,
  type EvidenceArtifactLinkRelation,
  type EvidenceArtifactLinkSubjectType,
  type EvidenceArtifactRetentionPolicy,
  type EvidenceArtifactReasonCode,
  type EvidenceArtifactState,
} from "../domain/evidence-artifact/schema";
import { sha256Hex, type EvidenceArtifactBlobStore } from "./blob-store";
import type { EvidenceArtifactRepository } from "./repository";

export interface EvidenceArtifactServiceDependencies {
  readonly repository: EvidenceArtifactRepository;
  readonly blobStore: EvidenceArtifactBlobStore;
  readonly now?: () => string;
  readonly createEventId?: () => string;
}

export interface CreateEvidenceArtifactInput {
  readonly artifactId: string;
  readonly artifactKind: EvidenceArtifactKind;
  readonly sourceId: string;
  readonly sourceUrl: string | null;
  readonly sourceReference: string | null;
  readonly collectedAt: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly expectedSha256?: string;
  readonly storageKey: string;
  readonly accessScope?: EvidenceArtifactAccessScope;
  readonly retentionPolicy: EvidenceArtifactRetentionPolicy;
  readonly retainUntil: string | null;
  readonly actorType: EvidenceArtifactActorType;
  readonly actorRef: string | null;
  readonly links?: readonly {
    readonly subjectType: EvidenceArtifactLinkSubjectType;
    readonly subjectId: string;
    readonly relation: EvidenceArtifactLinkRelation;
  }[];
}

export class EvidenceArtifactService {
  private readonly now: () => string;
  private readonly createEventId: () => string;

  constructor(
    private readonly dependencies: EvidenceArtifactServiceDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.createEventId =
      dependencies.createEventId ??
      (() => `artifact_event_${randomUUID().replaceAll("-", "_")}`);
  }

  async createQuarantinedArtifact(
    input: CreateEvidenceArtifactInput,
  ): Promise<EvidenceArtifact> {
    const computedSha256 = sha256Hex(input.bytes);
    if (
      input.expectedSha256 !== undefined &&
      evidenceArtifactSha256Schema.parse(input.expectedSha256) !==
        computedSha256
    )
      throw new Error("EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH");

    const stored = await this.dependencies.blobStore.putImmutable({
      storageKey: input.storageKey,
      bytes: input.bytes,
      expectedSha256: computedSha256,
    });
    const checked = await this.dependencies.blobStore.head(input.storageKey);
    if (
      !checked ||
      checked.storageKey !== stored.storageKey ||
      checked.sha256 !== computedSha256 ||
      checked.byteSize !== input.bytes.byteLength
    )
      throw new Error("EVIDENCE_ARTIFACT_BLOB_VERIFICATION_FAILED");

    const createdAt = this.now();
    const artifact = evidenceArtifactSchema.parse({
      artifact_id: input.artifactId,
      schema_version: EVIDENCE_ARTIFACT_SCHEMA_VERSION,
      artifact_kind: input.artifactKind,
      source_id: input.sourceId,
      source_url: input.sourceUrl,
      source_reference: input.sourceReference,
      collected_at: input.collectedAt,
      mime_type: input.mimeType,
      byte_size: stored.byteSize,
      sha256: stored.sha256,
      storage_key: stored.storageKey,
      state: "quarantine",
      access_scope:
        input.accessScope ??
        (input.artifactKind === "user_document"
          ? "private_owner"
          : "restricted_internal"),
      retention_policy: input.retentionPolicy,
      retain_until: input.retainUntil,
      created_at: createdAt,
    });

    return this.dependencies.repository.transaction(async () => {
      const created =
        await this.dependencies.repository.createQuarantinedArtifact(artifact, {
          event_id: this.createEventId(),
          artifact_id: artifact.artifact_id,
          event_type: "artifact_created",
          from_state: null,
          to_state: "quarantine",
          actor_type: input.actorType,
          actor_ref: input.actorRef,
          occurred_at: createdAt,
          metadata: { reason_code: null },
        });
      for (const link of input.links ?? [])
        await this.dependencies.repository.linkArtifact(
          evidenceArtifactLinkSchema.parse({
            artifact_id: artifact.artifact_id,
            subject_type: link.subjectType,
            subject_id: link.subjectId,
            relation: link.relation,
            created_at: createdAt,
          }),
        );
      return created;
    });
  }

  async transitionArtifact(input: {
    readonly artifactId: string;
    readonly toState: EvidenceArtifactState;
    readonly actorType: EvidenceArtifactActorType;
    readonly actorRef: string | null;
    readonly reasonCode: EvidenceArtifactReasonCode | null;
  }): Promise<EvidenceArtifact> {
    return this.dependencies.repository.transaction(async () => {
      const current = await this.dependencies.repository.getArtifact(
        input.artifactId,
      );
      if (!current) throw new Error("EVIDENCE_ARTIFACT_NOT_FOUND");
      const occurredAt = this.now();
      return this.dependencies.repository.transitionArtifact(
        input.artifactId,
        input.toState,
        {
          event_id: this.createEventId(),
          artifact_id: input.artifactId,
          event_type: "state_transitioned",
          from_state: current.state,
          to_state: input.toState,
          actor_type: input.actorType,
          actor_ref: input.actorRef,
          occurred_at: occurredAt,
          metadata: { reason_code: input.reasonCode },
        },
      );
    });
  }
}
