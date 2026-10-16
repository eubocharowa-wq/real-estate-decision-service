import { createHash } from "node:crypto";

import { evidenceArtifactStorageKeySchema } from "../domain/evidence-artifact/schema";

export interface EvidenceArtifactBlobHead {
  readonly storageKey: string;
  readonly byteSize: number;
  readonly sha256: string;
}

export interface EvidenceArtifactReadAuthorization {
  readonly decision: "allow";
  readonly artifactId: string;
  readonly actorRef: string;
}

export interface EvidenceArtifactBlobStore {
  putImmutable(input: {
    readonly storageKey: string;
    readonly bytes: Uint8Array;
    readonly expectedSha256: string;
  }): Promise<EvidenceArtifactBlobHead>;
  head(storageKey: string): Promise<EvidenceArtifactBlobHead | null>;
  getAuthorized(input: {
    readonly storageKey: string;
    readonly authorization: EvidenceArtifactReadAuthorization;
  }): Promise<Uint8Array>;
}

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

interface StoredBlob {
  readonly bytes: Uint8Array;
  readonly head: EvidenceArtifactBlobHead;
}

/** Offline adapter only. A production provider is intentionally out of scope. */
export class InMemoryEvidenceArtifactBlobStore implements EvidenceArtifactBlobStore {
  private readonly blobs = new Map<string, StoredBlob>();

  async putImmutable(input: {
    readonly storageKey: string;
    readonly bytes: Uint8Array;
    readonly expectedSha256: string;
  }): Promise<EvidenceArtifactBlobHead> {
    const storageKey = evidenceArtifactStorageKeySchema.parse(input.storageKey);
    const actualSha256 = sha256Hex(input.bytes);
    if (actualSha256 !== input.expectedSha256)
      throw new Error("EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH");
    const existing = this.blobs.get(storageKey);
    if (existing) {
      if (
        existing.head.sha256 !== actualSha256 ||
        existing.head.byteSize !== input.bytes.byteLength
      )
        throw new Error("EVIDENCE_ARTIFACT_STORAGE_KEY_CONFLICT");
      return structuredClone(existing.head);
    }
    const head: EvidenceArtifactBlobHead = {
      storageKey,
      byteSize: input.bytes.byteLength,
      sha256: actualSha256,
    };
    this.blobs.set(storageKey, {
      bytes: new Uint8Array(input.bytes),
      head,
    });
    return structuredClone(head);
  }

  async head(storageKey: string): Promise<EvidenceArtifactBlobHead | null> {
    const blob = this.blobs.get(storageKey);
    return blob ? structuredClone(blob.head) : null;
  }

  async getAuthorized(input: {
    readonly storageKey: string;
    readonly authorization: EvidenceArtifactReadAuthorization;
  }): Promise<Uint8Array> {
    if (input.authorization.decision !== "allow")
      throw new Error("EVIDENCE_ARTIFACT_ACCESS_DENIED");
    const blob = this.blobs.get(input.storageKey);
    if (!blob) throw new Error("EVIDENCE_ARTIFACT_BLOB_NOT_FOUND");
    return new Uint8Array(blob.bytes);
  }
}
