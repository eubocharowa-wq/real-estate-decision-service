import { DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

import { evidenceArtifactStorageKeySchema } from "../domain/evidence-artifact/schema";
import type {
  EvidenceArtifactBlobInventory,
  EvidenceArtifactInventoryPage,
} from "./orphan-reconciliation";
import {
  createS3EvidenceArtifactClient,
  isS3NotFoundError,
  parseS3EvidenceArtifactConfig,
  type S3EvidenceArtifactClient,
  type S3EvidenceArtifactConfig,
} from "./s3-client";

interface S3ListOutput {
  readonly Contents?: readonly {
    readonly Key?: unknown;
    readonly LastModified?: unknown;
    readonly Size?: unknown;
  }[];
  readonly IsTruncated?: unknown;
  readonly NextContinuationToken?: unknown;
}

/** Maintenance-only S3 inventory; no provider URL leaves this adapter. */
export class S3EvidenceArtifactBlobInventory implements EvidenceArtifactBlobInventory {
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

  async list(input: {
    readonly prefix: string;
    readonly cursor: string | null;
  }): Promise<EvidenceArtifactInventoryPage> {
    const prefix = evidenceArtifactStorageKeySchema.parse(input.prefix);
    let output: S3ListOutput;
    try {
      output = (await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(input.cursor === null ? {} : { ContinuationToken: input.cursor }),
        }),
      )) as S3ListOutput;
      const items = (output.Contents ?? []).map((object) => {
        const pathname = evidenceArtifactStorageKeySchema.parse(object.Key);
        if (!pathname.startsWith(prefix)) throw new Error("unexpected prefix");
        if (!(object.LastModified instanceof Date))
          throw new Error("invalid timestamp");
        if (!Number.isSafeInteger(object.Size) || (object.Size as number) < 0)
          throw new Error("invalid size");
        return {
          pathname,
          uploadedAt: object.LastModified.toISOString(),
          size: object.Size as number,
        };
      });
      const cursor =
        output.IsTruncated === true
          ? typeof output.NextContinuationToken === "string" &&
            output.NextContinuationToken.length > 0
            ? output.NextContinuationToken
            : (() => {
                throw new Error("missing continuation token");
              })()
          : null;
      return { items, cursor };
    } catch {
      throw new Error("EVIDENCE_ARTIFACT_INVENTORY_LIST_FAILED");
    }
  }

  async deletePathname(pathnameInput: string): Promise<void> {
    const pathname = evidenceArtifactStorageKeySchema.parse(pathnameInput);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: pathname }),
      );
    } catch (error) {
      if (isS3NotFoundError(error)) return;
      throw new Error("EVIDENCE_ARTIFACT_INVENTORY_DELETE_FAILED");
    }
  }
}
