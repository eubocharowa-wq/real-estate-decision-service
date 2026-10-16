import { z } from "zod";

import { evidenceArtifactStorageKeySchema } from "../domain/evidence-artifact/schema";
import type { EvidenceArtifactRepository } from "./repository";

export interface EvidenceArtifactInventoryItem {
  readonly pathname: string;
  readonly uploadedAt: string;
  readonly size: number;
}

export interface EvidenceArtifactInventoryPage {
  readonly items: readonly EvidenceArtifactInventoryItem[];
  readonly cursor: string | null;
}

/** Maintenance-only provider inventory. It is intentionally not BlobStore. */
export interface EvidenceArtifactBlobInventory {
  list(input: {
    readonly prefix: string;
    readonly cursor: string | null;
  }): Promise<EvidenceArtifactInventoryPage>;
  deletePathname(pathname: string): Promise<void>;
}

const OPERATOR_CONTEXT_BRAND = Symbol("evidence-orphan-operator-context");
export type EvidenceArtifactOrphanOperatorContext = {
  readonly principalRef: string;
  readonly [OPERATOR_CONTEXT_BRAND]: true;
};

export const createEvidenceArtifactOrphanOperatorContext = (
  principalRef: string,
): EvidenceArtifactOrphanOperatorContext => {
  const value = { principalRef: z.string().trim().min(1).parse(principalRef) };
  Object.defineProperty(value, OPERATOR_CONTEXT_BRAND, {
    value: true,
    enumerable: false,
  });
  return Object.freeze(value) as EvidenceArtifactOrphanOperatorContext;
};

const isOperatorContext = (
  context: unknown,
): context is EvidenceArtifactOrphanOperatorContext =>
  typeof context === "object" &&
  context !== null &&
  OPERATOR_CONTEXT_BRAND in context;

export class EvidenceArtifactOrphanReconciler {
  constructor(
    private readonly dependencies: {
      readonly artifactRepository: EvidenceArtifactRepository;
      readonly inventory: EvidenceArtifactBlobInventory;
      readonly controlledPrefix: string;
      readonly now?: () => string;
    },
  ) {}

  async reconcile(input: {
    readonly prefix: string;
    readonly gracePeriodMs: number;
    readonly execute?: boolean;
    readonly context?: unknown;
  }): Promise<{
    readonly mode: "dry_run" | "execute";
    readonly candidates: readonly EvidenceArtifactInventoryItem[];
    readonly deletedPathnames: readonly string[];
  }> {
    const prefix = evidenceArtifactStorageKeySchema.parse(input.prefix);
    if (!prefix.endsWith("/"))
      throw new Error("EVIDENCE_ARTIFACT_ORPHAN_PREFIX_INVALID");
    if (prefix !== this.dependencies.controlledPrefix)
      throw new Error("EVIDENCE_ARTIFACT_ORPHAN_PREFIX_DENIED");
    if (!Number.isSafeInteger(input.gracePeriodMs) || input.gracePeriodMs <= 0)
      throw new Error("EVIDENCE_ARTIFACT_ORPHAN_GRACE_PERIOD_INVALID");
    if (input.execute === true && !isOperatorContext(input.context))
      throw new Error("EVIDENCE_ARTIFACT_ORPHAN_EXECUTION_DENIED");

    const cutoff =
      new Date(
        this.dependencies.now?.() ?? new Date().toISOString(),
      ).getTime() - input.gracePeriodMs;
    const candidates: EvidenceArtifactInventoryItem[] = [];
    let cursor: string | null = null;
    do {
      const page = await this.dependencies.inventory.list({ prefix, cursor });
      for (const raw of page.items) {
        const item = {
          pathname: evidenceArtifactStorageKeySchema.parse(raw.pathname),
          uploadedAt: z
            .string()
            .datetime({ offset: true })
            .parse(raw.uploadedAt),
          size: z.number().int().nonnegative().safe().parse(raw.size),
        };
        if (
          item.pathname.startsWith(prefix) &&
          new Date(item.uploadedAt).getTime() <= cutoff &&
          !(await this.dependencies.artifactRepository.hasStorageKey(
            item.pathname,
          ))
        )
          candidates.push(item);
      }
      cursor = page.cursor;
    } while (cursor !== null);

    const deletedPathnames: string[] = [];
    if (input.execute === true)
      for (const candidate of candidates) {
        await this.dependencies.inventory.deletePathname(candidate.pathname);
        deletedPathnames.push(candidate.pathname);
      }
    return {
      mode: input.execute === true ? "execute" : "dry_run",
      candidates,
      deletedPathnames,
    };
  }
}
