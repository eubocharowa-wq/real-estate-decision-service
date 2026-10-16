import {
  BlobNotFoundError,
  del as vercelDelete,
  get as vercelGet,
  head as vercelHead,
  put as vercelPut,
} from "@vercel/blob";

import { evidenceArtifactStorageKeySchema } from "../domain/evidence-artifact/schema";
import {
  sha256Hex,
  type EvidenceArtifactBlobHead,
  type EvidenceArtifactBlobStore,
} from "./blob-store";

interface ProviderPutResult {
  readonly pathname: string;
}

interface ProviderHeadResult {
  readonly pathname: string;
  readonly size: number;
}

interface ProviderGetResult {
  readonly pathname: string;
  readonly size: number;
  readonly stream: ReadableStream<Uint8Array>;
}

export interface VercelPrivateBlobClient {
  put(
    pathname: string,
    bytes: Uint8Array,
    options: {
      readonly access: "private";
      readonly addRandomSuffix: false;
      readonly allowOverwrite: false;
    },
  ): Promise<ProviderPutResult>;
  head(pathname: string): Promise<ProviderHeadResult | null>;
  get(
    pathname: string,
    options: { readonly access: "private"; readonly useCache: false },
  ): Promise<ProviderGetResult | null>;
  delete(pathname: string): Promise<void>;
}

const defaultClient: VercelPrivateBlobClient = {
  put: async (pathname, bytes, options) =>
    vercelPut(pathname, Buffer.from(bytes), options),
  head: async (pathname) => {
    try {
      return await vercelHead(pathname);
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  },
  get: async (pathname, options) => {
    const result = await vercelGet(pathname, options);
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream)
      throw new Error("EVIDENCE_ARTIFACT_BLOB_READ_FAILED");
    return {
      pathname: result.blob.pathname,
      size: result.blob.size,
      stream: result.stream,
    };
  },
  delete: async (pathname) => vercelDelete(pathname),
};

const readStream = async (
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      size += result.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

/**
 * Server-only Vercel Blob adapter. Authentication is resolved by the SDK;
 * production uses Vercel OIDC (`VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID`) and no
 * credential is accepted by or retained in this adapter.
 */
export class VercelPrivateEvidenceArtifactBlobStore implements EvidenceArtifactBlobStore {
  readonly capabilities = Object.freeze({
    provider: "vercel" as const,
    dataResidency: "NON_RU" as const,
  });

  constructor(
    private readonly client: VercelPrivateBlobClient = defaultClient,
  ) {}

  async putImmutable(input: {
    readonly storageKey: string;
    readonly bytes: Uint8Array;
    readonly expectedSha256: string;
  }): Promise<EvidenceArtifactBlobHead> {
    const storageKey = evidenceArtifactStorageKeySchema.parse(input.storageKey);
    const sha256 = sha256Hex(input.bytes);
    if (sha256 !== input.expectedSha256)
      throw new Error("EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH");

    const result = await this.client.put(storageKey, input.bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    try {
      if (result.pathname !== storageKey)
        throw new Error("EVIDENCE_ARTIFACT_BLOB_VERIFICATION_FAILED");

      const checked = await this.client.head(storageKey);
      if (
        !checked ||
        checked.pathname !== storageKey ||
        checked.size !== input.bytes.byteLength
      )
        throw new Error("EVIDENCE_ARTIFACT_BLOB_VERIFICATION_FAILED");

      return {
        storageKey,
        byteSize: checked.size,
        sha256,
      };
    } catch (error) {
      try {
        await this.client.delete(storageKey);
      } catch {
        throw new Error("EVIDENCE_ARTIFACT_ORPHAN_CLEANUP_FAILED");
      }
      throw error;
    }
  }

  async head(
    storageKeyInput: string,
  ): Promise<EvidenceArtifactBlobHead | null> {
    const storageKey = evidenceArtifactStorageKeySchema.parse(storageKeyInput);
    const result = await this.client.head(storageKey);
    if (!result) return null;
    if (result.pathname !== storageKey)
      throw new Error("EVIDENCE_ARTIFACT_BLOB_VERIFICATION_FAILED");
    return { storageKey, byteSize: result.size, sha256: null };
  }

  async get(storageKeyInput: string): Promise<Uint8Array> {
    const storageKey = evidenceArtifactStorageKeySchema.parse(storageKeyInput);
    const result = await this.client.get(storageKey, {
      access: "private",
      useCache: false,
    });
    if (!result) throw new Error("EVIDENCE_ARTIFACT_BLOB_NOT_FOUND");
    if (result.pathname !== storageKey)
      throw new Error("EVIDENCE_ARTIFACT_BLOB_VERIFICATION_FAILED");
    const bytes = await readStream(result.stream);
    if (bytes.byteLength !== result.size)
      throw new Error("EVIDENCE_ARTIFACT_BLOB_VERIFICATION_FAILED");
    return bytes;
  }

  async delete(storageKeyInput: string): Promise<void> {
    const storageKey = evidenceArtifactStorageKeySchema.parse(storageKeyInput);
    await this.client.delete(storageKey);
  }
}
