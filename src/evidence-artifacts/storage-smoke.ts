import { randomUUID } from "node:crypto";

import { evidenceArtifactStorageKeySchema } from "../domain/evidence-artifact/schema";
import type { RequestOwner } from "../expert/contracts";
import { createSessionDocumentReference } from "../expert/opaque-reference-access";
import {
  createEvidenceArtifactOwnerContext,
  type EvidenceArtifactAccessContext,
} from "./access-policy";
import { sha256Hex, type EvidenceArtifactBlobStore } from "./blob-store";
import type { EvidenceArtifactBlobInventory } from "./orphan-reconciliation";
import {
  createEvidenceArtifactOrphanOperatorContext,
  EvidenceArtifactOrphanReconciler,
} from "./orphan-reconciliation";
import { EvidenceArtifactReadService } from "./read-service";
import type { EvidenceArtifactRepository } from "./repository";
import {
  EvidenceArtifactRetentionService,
  type EvidenceArtifactRetentionRepository,
} from "./retention";
import type { EvidenceArtifactBlobRuntime } from "./runtime";
import {
  parseS3EvidenceArtifactConfig,
  type S3EvidenceArtifactConfig,
} from "./s3-client";
import { EvidenceArtifactService } from "./service";

export const EVIDENCE_ARTIFACT_STORAGE_SMOKE_SCHEMA_VERSION =
  "evidence-artifact-storage-smoke-v1" as const;

const MAX_INVENTORY_PAGES = 100;
const ANONYMOUS_READ_TIMEOUT_MS = 10_000;
const SAFE_DIAGNOSTIC = /^EVIDENCE_ARTIFACT_[A-Z0-9_]+$/;

export type EvidenceArtifactStorageSmokeMode = "preflight" | "execute";

export interface EvidenceArtifactStorageSmokeOptions {
  readonly mode: EvidenceArtifactStorageSmokeMode;
  readonly orphanGracePeriodMs: number | null;
}

export type EvidenceArtifactStorageSmokeCheckId =
  | "runtime_configuration"
  | "database_schema"
  | "postgres_metadata_read_boundary"
  | "inventory_read_boundary"
  | "preflight_no_write"
  | "postgres_metadata_link"
  | "immutable_overwrite_denied"
  | "head_read_checksum"
  | "owner_authorized_read"
  | "foreign_owner_read_denied"
  | "anonymous_provider_read_denied"
  | "inventory_current_run"
  | "retention_delete"
  | "orphan_dry_run"
  | "orphan_execute"
  | "current_run_cleanup";

export interface EvidenceArtifactStorageSmokeCheck {
  readonly check_id: EvidenceArtifactStorageSmokeCheckId;
  readonly status: "pass" | "fail";
  readonly diagnostic_code: string;
}

export interface EvidenceArtifactStorageSmokeReport {
  readonly schema_version: typeof EVIDENCE_ARTIFACT_STORAGE_SMOKE_SCHEMA_VERSION;
  readonly mode: EvidenceArtifactStorageSmokeMode;
  readonly status: "pass" | "fail";
  readonly run_id: string;
  readonly evaluated_at: string;
  readonly provider: "s3" | "unavailable";
  readonly declared_data_residency: "RU" | "unavailable";
  readonly writes_performed: boolean;
  readonly checks: readonly EvidenceArtifactStorageSmokeCheck[];
  readonly limitations: readonly [
    "RU_RESIDENCY_REQUIRES_INDEPENDENT_PROVIDER_EVIDENCE",
    "RESULT_APPLIES_ONLY_TO_THE_CONFIGURED_BUCKET_AND_REVISION",
  ];
}

export interface EvidenceArtifactAnonymousReadProbe {
  isReadDenied(storageKey: string): Promise<boolean>;
}

export interface EvidenceArtifactStorageSmokeDatabaseReadiness {
  readonly reachable: boolean;
  readonly schemaCompatible: boolean;
}

export interface EvidenceArtifactStorageSmokeDependencies {
  readonly runtime: EvidenceArtifactBlobRuntime;
  readonly artifactRepository: EvidenceArtifactRepository;
  readonly retentionRepository: EvidenceArtifactRetentionRepository;
  readonly inspectDatabase: () => Promise<EvidenceArtifactStorageSmokeDatabaseReadiness>;
  readonly anonymousReadProbe: EvidenceArtifactAnonymousReadProbe;
  readonly now?: () => string;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly createRunId?: () => string;
}

const limitations = Object.freeze([
  "RU_RESIDENCY_REQUIRES_INDEPENDENT_PROVIDER_EVIDENCE",
  "RESULT_APPLIES_ONLY_TO_THE_CONFIGURED_BUCKET_AND_REVISION",
] as const);

const safeDiagnostic = (error: unknown): string => {
  if (
    error instanceof Error &&
    SAFE_DIAGNOSTIC.test(error.message) &&
    error.message.length <= 128
  )
    return error.message;
  return "EVIDENCE_ARTIFACT_STORAGE_SMOKE_FAILED";
};

const assertCondition: (
  condition: unknown,
  diagnostic: string,
) => asserts condition = (condition, diagnostic) => {
  if (!condition) throw new Error(diagnostic);
};

const expectError = async (
  work: () => Promise<unknown>,
  diagnostic: string,
): Promise<void> => {
  try {
    await work();
  } catch (error) {
    if (error instanceof Error && error.message === diagnostic) return;
    throw error;
  }
  throw new Error("EVIDENCE_ARTIFACT_STORAGE_SMOKE_EXPECTED_DENIAL_MISSING");
};

const listInventory = async (
  inventory: EvidenceArtifactBlobInventory,
  prefix: string,
) => {
  const items: {
    readonly pathname: string;
    readonly uploadedAt: string;
    readonly size: number;
  }[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < MAX_INVENTORY_PAGES; pageNumber += 1) {
    const page = await inventory.list({ prefix, cursor });
    items.push(...page.items);
    if (page.cursor === null) return items;
    if (seenCursors.has(page.cursor))
      throw new Error("EVIDENCE_ARTIFACT_STORAGE_SMOKE_CURSOR_LOOP");
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  }
  throw new Error("EVIDENCE_ARTIFACT_STORAGE_SMOKE_PAGE_LIMIT");
};

const makeReadTrackingStore = (
  delegate: EvidenceArtifactBlobStore,
  onGet: () => void,
): EvidenceArtifactBlobStore => ({
  capabilities: delegate.capabilities,
  putImmutable: (input) => delegate.putImmutable(input),
  head: (storageKey) => delegate.head(storageKey),
  get: (storageKey) => {
    onGet();
    return delegate.get(storageKey);
  },
  delete: (storageKey) => delegate.delete(storageKey),
});

const report = (input: {
  readonly mode: EvidenceArtifactStorageSmokeMode;
  readonly runId: string;
  readonly evaluatedAt: string;
  readonly checks: readonly EvidenceArtifactStorageSmokeCheck[];
  readonly writesPerformed: boolean;
  readonly runtime: EvidenceArtifactBlobRuntime;
}): EvidenceArtifactStorageSmokeReport =>
  Object.freeze({
    schema_version: EVIDENCE_ARTIFACT_STORAGE_SMOKE_SCHEMA_VERSION,
    mode: input.mode,
    status: input.checks.every((check) => check.status === "pass")
      ? "pass"
      : "fail",
    run_id: input.runId,
    evaluated_at: input.evaluatedAt,
    provider:
      input.runtime.capabilities.provider === "s3" ? "s3" : "unavailable",
    declared_data_residency:
      input.runtime.capabilities.dataResidency === "RU" ? "RU" : "unavailable",
    writes_performed: input.writesPerformed,
    checks: Object.freeze([...input.checks]),
    limitations,
  });

export const parseEvidenceArtifactStorageSmokeArguments = (
  arguments_: readonly string[],
): EvidenceArtifactStorageSmokeOptions => {
  let execute = false;
  let orphanGracePeriodMs: number | null = null;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--execute" && !execute) {
      execute = true;
      continue;
    }
    if (argument === "--orphan-grace-ms" && orphanGracePeriodMs === null) {
      const raw = arguments_[index + 1];
      if (raw === undefined)
        throw new Error("EVIDENCE_ARTIFACT_STORAGE_SMOKE_ARGUMENTS_INVALID");
      const parsed = Number(raw);
      if (!Number.isSafeInteger(parsed) || parsed <= 0)
        throw new Error("EVIDENCE_ARTIFACT_STORAGE_SMOKE_ARGUMENTS_INVALID");
      orphanGracePeriodMs = parsed;
      index += 1;
      continue;
    }
    throw new Error("EVIDENCE_ARTIFACT_STORAGE_SMOKE_ARGUMENTS_INVALID");
  }
  if (execute !== (orphanGracePeriodMs !== null))
    throw new Error("EVIDENCE_ARTIFACT_STORAGE_SMOKE_ARGUMENTS_INVALID");
  return {
    mode: execute ? "execute" : "preflight",
    orphanGracePeriodMs,
  };
};

/** Unsigned, redirect-free single-object probe used only by the operator smoke. */
export class S3AnonymousEvidenceArtifactReadProbe implements EvidenceArtifactAnonymousReadProbe {
  private readonly endpoint!: string;
  private readonly bucket!: string;
  private readonly fetchImpl!: typeof fetch;

  constructor(
    input: S3EvidenceArtifactConfig,
    fetchImpl: typeof fetch = globalThis.fetch,
  ) {
    const config = parseS3EvidenceArtifactConfig(input);
    Object.defineProperties(this, {
      endpoint: {
        value: config.endpoint,
        enumerable: false,
        configurable: false,
        writable: false,
      },
      bucket: {
        value: config.bucket,
        enumerable: false,
        configurable: false,
        writable: false,
      },
      fetchImpl: {
        value: fetchImpl,
        enumerable: false,
        configurable: false,
        writable: false,
      },
    });
  }

  async isReadDenied(storageKeyInput: string): Promise<boolean> {
    const storageKey = evidenceArtifactStorageKeySchema.parse(storageKeyInput);
    const target = new URL(this.endpoint);
    target.pathname = `/${[this.bucket, ...storageKey.split("/")]
      .map(encodeURIComponent)
      .join("/")}`;
    const response = await this.fetchImpl(target, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "manual",
      signal: AbortSignal.timeout(ANONYMOUS_READ_TIMEOUT_MS),
    });
    await response.body?.cancel().catch(() => undefined);
    return (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404
    );
  }
}

export const runEvidenceArtifactStorageSmoke = async (
  options: EvidenceArtifactStorageSmokeOptions,
  dependencies: EvidenceArtifactStorageSmokeDependencies,
): Promise<EvidenceArtifactStorageSmokeReport> => {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const runId =
    dependencies.createRunId?.() ??
    `smoke_${randomUUID().replaceAll("-", "_")}`;
  const evaluatedAt = now();
  const prefix = `evidence/smoke/${runId}/`;
  const primaryStorageKey = `${prefix}document`;
  const orphanStorageKey = `${prefix}orphan`;
  const artifactId = `artifact_${runId}`;
  const owner: RequestOwner = {
    owner_type: "session",
    owner_id: `owner_${runId}`,
  };
  const checks: EvidenceArtifactStorageSmokeCheck[] = [];
  let writesPerformed = false;
  let artifactCreated = false;
  let orphanWritten = false;

  const addCheck = async (
    checkId: EvidenceArtifactStorageSmokeCheckId,
    work: () => Promise<void> | void,
  ): Promise<boolean> => {
    try {
      await work();
      checks.push({
        check_id: checkId,
        status: "pass",
        diagnostic_code: "PASS",
      });
      return true;
    } catch (error) {
      checks.push({
        check_id: checkId,
        status: "fail",
        diagnostic_code: safeDiagnostic(error),
      });
      return false;
    }
  };

  const finish = (): EvidenceArtifactStorageSmokeReport =>
    report({
      mode: options.mode,
      runId,
      evaluatedAt,
      checks,
      writesPerformed,
      runtime: dependencies.runtime,
    });

  if (
    !(await addCheck("runtime_configuration", () => {
      assertCondition(
        dependencies.runtime.capabilities.provider === "s3" &&
          dependencies.runtime.capabilities.dataResidency === "RU" &&
          (dependencies.runtime.mode === "pilot" ||
            dependencies.runtime.mode === "production") &&
          dependencies.runtime.inventory !== null,
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_RUNTIME_DENIED",
      );
    }))
  )
    return finish();

  if (
    !(await addCheck("database_schema", async () => {
      const database = await dependencies.inspectDatabase();
      assertCondition(
        database.reachable && database.schemaCompatible,
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_DATABASE_NOT_READY",
      );
    }))
  )
    return finish();

  if (
    !(await addCheck("postgres_metadata_read_boundary", async () => {
      assertCondition(
        !(await dependencies.artifactRepository.hasStorageKey(
          primaryStorageKey,
        )),
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_RUN_COLLISION",
      );
    }))
  )
    return finish();

  const inventory = dependencies.runtime.inventory;
  if (!inventory) return finish();
  if (
    !(await addCheck("inventory_read_boundary", async () => {
      const existing = await listInventory(inventory, prefix);
      assertCondition(
        existing.length === 0,
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_RUN_COLLISION",
      );
    }))
  )
    return finish();

  if (options.mode === "preflight") {
    await addCheck("preflight_no_write", () => undefined);
    return finish();
  }

  const gracePeriodMs = options.orphanGracePeriodMs;
  if (gracePeriodMs === null) {
    await addCheck("current_run_cleanup", () => {
      throw new Error("EVIDENCE_ARTIFACT_STORAGE_SMOKE_ARGUMENTS_INVALID");
    });
    return finish();
  }

  const bytes = new TextEncoder().encode(
    JSON.stringify({
      schema_version: "1.0",
      kind: "synthetic_evidence_storage_smoke",
      run_id: runId,
    }),
  );
  const expectedSha256 = sha256Hex(bytes);
  const retainUntil = new Date(
    new Date(evaluatedAt).getTime() - 1_000,
  ).toISOString();
  const artifactService = new EvidenceArtifactService({
    repository: dependencies.artifactRepository,
    blobStore: dependencies.runtime.blobStore,
    applicationMode: dependencies.runtime.mode,
    now,
  });
  let retentionEvent = 0;
  const retentionService = new EvidenceArtifactRetentionService({
    repository: dependencies.retentionRepository,
    artifactRepository: dependencies.artifactRepository,
    blobStore: dependencies.runtime.blobStore,
    now,
    createEventId: () => `retention_smoke_${runId}_${(retentionEvent += 1)}`,
  });

  const cleanupCurrentRun = async (): Promise<boolean> => {
    let clean = true;
    if (orphanWritten)
      try {
        await dependencies.runtime.blobStore.delete(orphanStorageKey);
        orphanWritten = false;
      } catch {
        clean = false;
      }
    if (artifactCreated) {
      try {
        const outcome = await retentionService.deleteExpired({ artifactId });
        if (outcome.outcome === "retry_pending") clean = false;
      } catch {
        clean = false;
      }
    } else {
      try {
        await dependencies.runtime.blobStore.delete(primaryStorageKey);
      } catch {
        clean = false;
      }
    }
    try {
      const remaining = await listInventory(inventory, prefix);
      if (remaining.length > 0) clean = false;
    } catch {
      clean = false;
    }
    return clean;
  };

  const failWithCleanup =
    async (): Promise<EvidenceArtifactStorageSmokeReport> => {
      const cleaned = await cleanupCurrentRun();
      checks.push({
        check_id: "current_run_cleanup",
        status: cleaned ? "pass" : "fail",
        diagnostic_code: cleaned
          ? "PASS"
          : "EVIDENCE_ARTIFACT_STORAGE_SMOKE_CLEANUP_FAILED",
      });
      return finish();
    };

  writesPerformed = true;
  if (
    !(await addCheck("postgres_metadata_link", async () => {
      const artifact = await artifactService.createQuarantinedArtifact({
        artifactId,
        artifactKind: "user_document",
        sourceId: "source_storage_smoke",
        sourceUrl: null,
        sourceReference: createSessionDocumentReference(
          owner,
          `document_${runId}`,
        ),
        collectedAt: evaluatedAt,
        mimeType: "application/json",
        bytes,
        expectedSha256,
        storageKey: primaryStorageKey,
        retentionPolicy: "user_document",
        retainUntil,
        actorType: "operator",
        actorRef: `operator_${runId}`,
        ownerContext: owner,
        links: [
          {
            subjectType: "source_snapshot",
            subjectId: `snapshot_${runId}`,
            relation: "captures",
          },
        ],
      });
      artifactCreated = true;
      await dependencies.retentionRepository.initialize({
        artifactId,
        retainUntil: artifact.retain_until,
        retentionPolicy: artifact.retention_policy,
        occurredAt: artifact.created_at,
      });
      const persisted =
        await dependencies.artifactRepository.getArtifact(artifactId);
      const links =
        await dependencies.artifactRepository.listArtifactLinks(artifactId);
      const state = await dependencies.retentionRepository.getState(artifactId);
      assertCondition(
        persisted?.storage_key === primaryStorageKey &&
          persisted.sha256 === expectedSha256 &&
          links.length === 1 &&
          links[0]?.subject_id === `snapshot_${runId}` &&
          state?.blob_state === "present",
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_METADATA_MISMATCH",
      );
    }))
  )
    return failWithCleanup();

  if (
    !(await addCheck("immutable_overwrite_denied", async () => {
      await expectError(
        () =>
          dependencies.runtime.blobStore.putImmutable({
            storageKey: primaryStorageKey,
            bytes,
            expectedSha256,
          }),
        "EVIDENCE_ARTIFACT_STORAGE_KEY_CONFLICT",
      );
    }))
  )
    return failWithCleanup();

  if (
    !(await addCheck("head_read_checksum", async () => {
      const head = await dependencies.runtime.blobStore.head(primaryStorageKey);
      const read = await dependencies.runtime.blobStore.get(primaryStorageKey);
      assertCondition(
        head?.storageKey === primaryStorageKey &&
          head.byteSize === bytes.byteLength &&
          head.sha256 === expectedSha256 &&
          read.byteLength === bytes.byteLength &&
          sha256Hex(read) === expectedSha256,
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_CHECKSUM_MISMATCH",
      );
    }))
  )
    return failWithCleanup();

  let applicationBlobReads = 0;
  const readService = new EvidenceArtifactReadService({
    repository: dependencies.artifactRepository,
    retentionRepository: dependencies.retentionRepository,
    blobStore: makeReadTrackingStore(
      dependencies.runtime.blobStore,
      () => (applicationBlobReads += 1),
    ),
  });
  const ownerContext: EvidenceArtifactAccessContext =
    createEvidenceArtifactOwnerContext(owner);
  if (
    !(await addCheck("foreign_owner_read_denied", async () => {
      await expectError(
        () =>
          readService.read({
            artifactId,
            context: createEvidenceArtifactOwnerContext({
              owner_type: "anonymous",
              owner_id: owner.owner_id,
            }),
          }),
        "EVIDENCE_ARTIFACT_ACCESS_DENIED",
      );
      assertCondition(
        applicationBlobReads === 0,
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_UNAUTHORIZED_BLOB_READ",
      );
    }))
  )
    return failWithCleanup();

  if (
    !(await addCheck("owner_authorized_read", async () => {
      const read = await readService.read({
        artifactId,
        context: ownerContext,
      });
      assertCondition(
        applicationBlobReads === 1 && sha256Hex(read) === expectedSha256,
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_AUTHORIZED_READ_FAILED",
      );
    }))
  )
    return failWithCleanup();

  if (
    !(await addCheck("anonymous_provider_read_denied", async () => {
      assertCondition(
        await dependencies.anonymousReadProbe.isReadDenied(primaryStorageKey),
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_ANONYMOUS_READ_ALLOWED",
      );
    }))
  )
    return failWithCleanup();

  if (
    !(await addCheck("inventory_current_run", async () => {
      const items = await listInventory(inventory, prefix);
      assertCondition(
        items.length === 1 && items[0]?.pathname === primaryStorageKey,
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_INVENTORY_MISMATCH",
      );
    }))
  )
    return failWithCleanup();

  if (
    !(await addCheck("retention_delete", async () => {
      const outcome = await retentionService.deleteExpired({ artifactId });
      const state = await dependencies.retentionRepository.getState(artifactId);
      const artifact =
        await dependencies.artifactRepository.getArtifact(artifactId);
      const artifactEvents =
        await dependencies.artifactRepository.listArtifactEvents(artifactId);
      const retentionEvents =
        await dependencies.retentionRepository.listEvents(artifactId);
      assertCondition(
        outcome.outcome === "deleted" &&
          state?.blob_state === "deleted" &&
          artifact !== null &&
          artifactEvents.length >= 1 &&
          retentionEvents.some(
            (event) => event.event_type === "deletion_claimed",
          ) &&
          retentionEvents.some(
            (event) => event.event_type === "blob_deleted",
          ) &&
          (await dependencies.runtime.blobStore.head(primaryStorageKey)) ===
            null,
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_RETENTION_FAILED",
      );
    }))
  )
    return failWithCleanup();

  if (
    !(await addCheck("orphan_dry_run", async () => {
      await dependencies.runtime.blobStore.putImmutable({
        storageKey: orphanStorageKey,
        bytes,
        expectedSha256,
      });
      orphanWritten = true;
      const items = await listInventory(inventory, prefix);
      const orphan = items.find((item) => item.pathname === orphanStorageKey);
      assertCondition(
        orphan !== undefined,
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_ORPHAN_NOT_LISTED",
      );
      const eligibleAt =
        new Date(orphan.uploadedAt).getTime() + gracePeriodMs + 1;
      const waitMs = eligibleAt - new Date(now()).getTime();
      if (waitMs > 0) await sleep(waitMs);
      const dryRun = await new EvidenceArtifactOrphanReconciler({
        artifactRepository: dependencies.artifactRepository,
        inventory,
        controlledPrefix: prefix,
        now,
      }).reconcile({ prefix, gracePeriodMs });
      assertCondition(
        dryRun.mode === "dry_run" &&
          dryRun.deletedPathnames.length === 0 &&
          dryRun.candidates.length === 1 &&
          dryRun.candidates[0]?.pathname === orphanStorageKey,
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_ORPHAN_DRY_RUN_FAILED",
      );
    }))
  )
    return failWithCleanup();

  if (
    !(await addCheck("orphan_execute", async () => {
      const execution = await new EvidenceArtifactOrphanReconciler({
        artifactRepository: dependencies.artifactRepository,
        inventory,
        controlledPrefix: prefix,
        now,
      }).reconcile({
        prefix,
        gracePeriodMs,
        execute: true,
        context: createEvidenceArtifactOrphanOperatorContext(
          `operator_${runId}`,
        ),
      });
      assertCondition(
        execution.deletedPathnames.length === 1 &&
          execution.deletedPathnames[0] === orphanStorageKey &&
          (await dependencies.runtime.blobStore.head(orphanStorageKey)) ===
            null,
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_ORPHAN_EXECUTION_FAILED",
      );
      orphanWritten = false;
    }))
  )
    return failWithCleanup();

  await addCheck("current_run_cleanup", async () => {
    const remaining = await listInventory(inventory, prefix);
    assertCondition(
      remaining.length === 0,
      "EVIDENCE_ARTIFACT_STORAGE_SMOKE_CLEANUP_FAILED",
    );
  });
  return finish();
};
