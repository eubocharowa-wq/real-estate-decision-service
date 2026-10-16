import { del as vercelDelete, list as vercelList } from "@vercel/blob";

import type {
  EvidenceArtifactBlobInventory,
  EvidenceArtifactInventoryPage,
} from "./orphan-reconciliation";

export interface VercelPrivateBlobInventoryClient {
  list(input: {
    readonly prefix: string;
    readonly cursor?: string;
    readonly access: "private";
  }): Promise<{
    readonly blobs: readonly {
      readonly pathname: string;
      readonly uploadedAt: Date;
      readonly size: number;
    }[];
    readonly cursor?: string;
    readonly hasMore: boolean;
  }>;
  delete(pathname: string): Promise<void>;
}

const defaultClient: VercelPrivateBlobInventoryClient = {
  list: async (input) => vercelList(input),
  delete: async (pathname) => vercelDelete(pathname),
};

/** Private authenticated inventory adapter; provider URLs are discarded. */
export class VercelPrivateEvidenceArtifactBlobInventory implements EvidenceArtifactBlobInventory {
  constructor(
    private readonly client: VercelPrivateBlobInventoryClient = defaultClient,
  ) {}

  async list(input: {
    prefix: string;
    cursor: string | null;
  }): Promise<EvidenceArtifactInventoryPage> {
    let page: Awaited<ReturnType<VercelPrivateBlobInventoryClient["list"]>>;
    try {
      page = await this.client.list({
        prefix: input.prefix,
        ...(input.cursor === null ? {} : { cursor: input.cursor }),
        access: "private",
      });
    } catch {
      throw new Error("EVIDENCE_ARTIFACT_INVENTORY_LIST_FAILED");
    }
    return {
      items: page.blobs.map((blob) => ({
        pathname: blob.pathname,
        uploadedAt: blob.uploadedAt.toISOString(),
        size: blob.size,
      })),
      cursor: page.hasMore ? (page.cursor ?? null) : null,
    };
  }

  async deletePathname(pathname: string): Promise<void> {
    try {
      await this.client.delete(pathname);
    } catch {
      throw new Error("EVIDENCE_ARTIFACT_INVENTORY_DELETE_FAILED");
    }
  }
}
