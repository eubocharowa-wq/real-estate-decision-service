import { createHash } from "node:crypto";

import { evidenceArtifactStorageKeySchema } from "../domain/evidence-artifact/schema";

export interface EvidenceArtifactBlobHead {
  readonly storageKey: string;
  readonly byteSize: number;
  /** Null when the storage provider does not expose a content checksum. */
  readonly sha256: string | null;
}

export type EvidenceArtifactDataResidency = "RU" | "NON_RU" | "LOCAL_ONLY";
export type EvidenceArtifactBlobProvider = "s3" | "vercel" | "memory";

export interface EvidenceArtifactBlobCapabilities {
  readonly provider: EvidenceArtifactBlobProvider;
  readonly dataResidency: EvidenceArtifactDataResidency;
}

export interface EvidenceArtifactBlobStore {
  readonly capabilities: EvidenceArtifactBlobCapabilities;
  putImmutable(input: {
    readonly storageKey: string;
    readonly bytes: Uint8Array;
    readonly expectedSha256: string;
  }): Promise<EvidenceArtifactBlobHead>;
  head(storageKey: string): Promise<EvidenceArtifactBlobHead | null>;
  get(storageKey: string): Promise<Uint8Array>;
  delete(storageKey: string): Promise<void>;
}

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

interface StoredBlob {
  readonly bytes: Uint8Array;
  readonly head: EvidenceArtifactBlobHead;
}

/** Offline/test/demo adapter only. Production runtime selection rejects it. */
export class InMemoryEvidenceArtifactBlobStore implements EvidenceArtifactBlobStore {
  readonly capabilities = Object.freeze({
    provider: "memory" as const,
    dataResidency: "LOCAL_ONLY" as const,
  });

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

  async get(storageKeyInput: string): Promise<Uint8Array> {
    const storageKey = evidenceArtifactStorageKeySchema.parse(storageKeyInput);
    const blob = this.blobs.get(storageKey);
    if (!blob) throw new Error("EVIDENCE_ARTIFACT_BLOB_NOT_FOUND");
    return new Uint8Array(blob.bytes);
  }

  async delete(storageKeyInput: string): Promise<void> {
    const storageKey = evidenceArtifactStorageKeySchema.parse(storageKeyInput);
    this.blobs.delete(storageKey);
  }
}
