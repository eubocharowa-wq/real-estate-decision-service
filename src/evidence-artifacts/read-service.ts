import type { EvidenceArtifactBlobStore } from "./blob-store";
import {
  DefaultEvidenceArtifactAccessPolicy,
  type EvidenceArtifactAccessPolicy,
} from "./access-policy";
import { sha256Hex } from "./blob-store";
import type { EvidenceArtifactRepository } from "./repository";
import type { EvidenceArtifactRetentionRepository } from "./retention";

export interface EvidenceArtifactReadServiceDependencies {
  readonly repository: EvidenceArtifactRepository;
  readonly blobStore: EvidenceArtifactBlobStore;
  readonly retentionRepository: EvidenceArtifactRetentionRepository;
  readonly accessPolicy?: EvidenceArtifactAccessPolicy;
}

/** Application boundary: authorization is evaluated before any blob read. */
export class EvidenceArtifactReadService {
  private readonly accessPolicy: EvidenceArtifactAccessPolicy;

  constructor(
    private readonly dependencies: EvidenceArtifactReadServiceDependencies,
  ) {
    this.accessPolicy =
      dependencies.accessPolicy ?? new DefaultEvidenceArtifactAccessPolicy();
  }

  async read(input: {
    readonly artifactId: string;
    readonly context: unknown;
  }): Promise<Uint8Array> {
    const artifact = await this.dependencies.repository.getArtifact(
      input.artifactId,
    );
    if (!artifact) throw new Error("EVIDENCE_ARTIFACT_NOT_FOUND");

    const decision = this.accessPolicy.evaluate({
      artifact,
      context: input.context,
    });
    if (decision.decision !== "allow")
      throw new Error("EVIDENCE_ARTIFACT_ACCESS_DENIED");

    const retention = await this.dependencies.retentionRepository.getState(
      artifact.artifact_id,
    );
    if (!retention || retention.blob_state !== "present")
      throw new Error("EVIDENCE_ARTIFACT_BLOB_UNAVAILABLE");

    const bytes = await this.dependencies.blobStore.get(artifact.storage_key);
    if (
      bytes.byteLength !== artifact.byte_size ||
      sha256Hex(bytes) !== artifact.sha256
    )
      throw new Error("EVIDENCE_ARTIFACT_BLOB_VERIFICATION_FAILED");
    return bytes;
  }
}
