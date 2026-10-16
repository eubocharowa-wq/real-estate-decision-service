import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  evidenceArtifactSha256Schema,
  evidenceArtifactStorageKeySchema,
} from "../domain/evidence-artifact/schema";
import {
  sha256Hex,
  type EvidenceArtifactBlobHead,
  type EvidenceArtifactBlobStore,
} from "./blob-store";
import {
  createS3EvidenceArtifactClient,
  isS3ConflictError,
  isS3NotFoundError,
  parseS3EvidenceArtifactConfig,
  type S3EvidenceArtifactClient,
  type S3EvidenceArtifactConfig,
} from "./s3-client";

const sha256Base64Schema = /^[A-Za-z0-9+/]{43}=$/;

const hexToBase64 = (hex: string): string =>
  Buffer.from(evidenceArtifactSha256Schema.parse(hex), "hex").toString(
    "base64",
  );

const base64ToHex = (value: unknown): string => {
  if (typeof value !== "string" || !sha256Base64Schema.test(value))
    throw new Error("EVIDENCE_ARTIFACT_BLOB_VERIFICATION_FAILED");
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength !== 32)
    throw new Error("EVIDENCE_ARTIFACT_BLOB_VERIFICATION_FAILED");
  return bytes.toString("hex");
};

const validByteSize = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error("EVIDENCE_ARTIFACT_BLOB_VERIFICATION_FAILED");
  return value as number;
};

interface S3HeadOutput {
  readonly ContentLength?: unknown;
  readonly ChecksumSHA256?: unknown;
}

interface S3GetOutput extends S3HeadOutput {
  readonly Body?: {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
}

/** Private S3-compatible object storage adapter for an RU-resident bucket. */
export class S3EvidenceArtifactBlobStore implements EvidenceArtifactBlobStore {
  readonly capabilities = Object.freeze({
    provider: "s3" as const,
    dataResidency: "RU" as const,
  });
  private readonly bucket: string;
  private readonly client!: S3EvidenceArtifactClient;

  constructor(
    input: S3EvidenceArtifactConfig,
    client?: S3EvidenceArtifactClient,
  ) {
    const config = parseS3EvidenceArtifactConfig(input);
    this.bucket = config.bucket;
    Object.defineProperty(this, "client", {
      value: client ?? createS3EvidenceArtifactClient(config),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  async putImmutable(input: {
    readonly storageKey: string;
    readonly bytes: Uint8Array;
    readonly expectedSha256: string;
  }): Promise<EvidenceArtifactBlobHead> {
    const storageKey = evidenceArtifactStorageKeySchema.parse(input.storageKey);
    const sha256 = sha256Hex(input.bytes);
    if (sha256 !== evidenceArtifactSha256Schema.parse(input.expectedSha256))
      throw new Error("EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH");

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Body: input.bytes,
          ContentLength: input.bytes.byteLength,
          ChecksumSHA256: hexToBase64(sha256),
          IfNoneMatch: "*",
        }),
      );
    } catch (error) {
      if (isS3ConflictError(error))
        throw new Error("EVIDENCE_ARTIFACT_STORAGE_KEY_CONFLICT");
      throw new Error("EVIDENCE_ARTIFACT_BLOB_WRITE_FAILED");
    }

    try {
      const checked = await this.head(storageKey);
      if (
        !checked ||
        checked.storageKey !== storageKey ||
        checked.byteSize !== input.bytes.byteLength ||
        checked.sha256 !== sha256
      )
        throw new Error("EVIDENCE_ARTIFACT_BLOB_VERIFICATION_FAILED");
      return checked;
    } catch (error) {
      try {
        await this.delete(storageKey);
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
    let output: S3HeadOutput;
    try {
      output = (await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          ChecksumMode: "ENABLED",
        }),
      )) as S3HeadOutput;
    } catch (error) {
      if (isS3NotFoundError(error)) return null;
      throw new Error("EVIDENCE_ARTIFACT_BLOB_HEAD_FAILED");
    }
    return {
      storageKey,
      byteSize: validByteSize(output.ContentLength),
      sha256: base64ToHex(output.ChecksumSHA256),
    };
  }

  async get(storageKeyInput: string): Promise<Uint8Array> {
    const storageKey = evidenceArtifactStorageKeySchema.parse(storageKeyInput);
    let output: S3GetOutput;
    try {
      output = (await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          ChecksumMode: "ENABLED",
        }),
      )) as S3GetOutput;
    } catch (error) {
      if (isS3NotFoundError(error))
        throw new Error("EVIDENCE_ARTIFACT_BLOB_NOT_FOUND");
      throw new Error("EVIDENCE_ARTIFACT_BLOB_READ_FAILED");
    }
    if (!output.Body?.transformToByteArray)
      throw new Error("EVIDENCE_ARTIFACT_BLOB_READ_FAILED");
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await output.Body.transformToByteArray());
    } catch {
      throw new Error("EVIDENCE_ARTIFACT_BLOB_READ_FAILED");
    }
    if (bytes.byteLength !== validByteSize(output.ContentLength))
      throw new Error("EVIDENCE_ARTIFACT_BLOB_VERIFICATION_FAILED");
    if (sha256Hex(bytes) !== base64ToHex(output.ChecksumSHA256))
      throw new Error("EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH");
    return bytes;
  }

  async delete(storageKeyInput: string): Promise<void> {
    const storageKey = evidenceArtifactStorageKeySchema.parse(storageKeyInput);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
    } catch (error) {
      if (isS3NotFoundError(error)) return;
      throw new Error("EVIDENCE_ARTIFACT_BLOB_DELETE_FAILED");
    }
  }
}
