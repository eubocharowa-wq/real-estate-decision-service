import { describe, expect, it, vi } from "vitest";

import {
  createEvidenceArtifactOrphanOperatorContext,
  createEvidenceArtifactOwnerContext,
  createEvidenceArtifactRetentionContext,
  EvidenceArtifactOrphanReconciler,
  EvidenceArtifactReadService,
  EvidenceArtifactRetentionService,
  EvidenceArtifactService,
  InMemoryEvidenceArtifactBlobStore,
  InMemoryEvidenceArtifactRepository,
  InMemoryEvidenceArtifactRetentionRepository,
  VercelPrivateEvidenceArtifactBlobInventory,
  type EvidenceArtifactBlobInventory,
  type EvidenceArtifactBlobStore,
  type VercelPrivateBlobInventoryClient,
} from "../../src/evidence-artifacts";
import { createSessionDocumentReference } from "../../src/expert";

const NOW = "2026-10-17T12:00:00.000Z";
const EXPIRED = "2026-10-16T12:00:00.000Z";
const OWNER = { owner_type: "session" as const, owner_id: "owner_retention" };
const BYTES = new TextEncoder().encode("retention fixture");

const setup = async (input?: {
  retainUntil?: string | null;
  legalHold?: boolean;
}) => {
  const artifactRepository = new InMemoryEvidenceArtifactRepository();
  const retentionRepository = new InMemoryEvidenceArtifactRetentionRepository();
  const blobStore = new InMemoryEvidenceArtifactBlobStore();
  const artifact = await new EvidenceArtifactService({
    repository: artifactRepository,
    blobStore,
    now: () => NOW,
    createEventId: () => "artifact_event_retention",
  }).createQuarantinedArtifact({
    artifactId: "artifact_retention",
    artifactKind: "user_document",
    sourceId: "source_user_upload",
    sourceUrl: null,
    sourceReference: createSessionDocumentReference(
      OWNER,
      "document_retention",
    ),
    collectedAt: NOW,
    mimeType: "application/pdf",
    bytes: BYTES,
    storageKey: "evidence/artifact_retention/content",
    retentionPolicy: input?.legalHold ? "legal_hold" : "user_document",
    retainUntil: input?.retainUntil === undefined ? EXPIRED : input.retainUntil,
    actorType: "user",
    actorRef: OWNER.owner_id,
    ownerContext: OWNER,
  });
  await retentionRepository.initialize({
    artifactId: artifact.artifact_id,
    retainUntil: artifact.retain_until,
    retentionPolicy: artifact.retention_policy,
    occurredAt: artifact.created_at,
  });
  let event = 0;
  const service = new EvidenceArtifactRetentionService({
    artifactRepository,
    repository: retentionRepository,
    blobStore,
    now: () => NOW,
    createEventId: () => `retention_event_${++event}`,
  });
  return {
    artifact,
    artifactRepository,
    retentionRepository,
    blobStore,
    service,
  };
};

describe("Evidence Artifact retention and legal hold", () => {
  it("initializes legal_hold as active and only extends retention forward", async () => {
    const { retentionRepository, service } = await setup({ legalHold: true });
    expect(
      await retentionRepository.getState("artifact_retention"),
    ).toMatchObject({
      legal_hold_active: true,
      blob_state: "present",
    });
    await expect(
      service.extendRetention({
        artifactId: "artifact_retention",
        retainUntil: "2026-10-15T12:00:00.000Z",
        context: createEvidenceArtifactRetentionContext({
          principalType: "system",
          principalRef: "system_retention",
        }),
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_RETENTION_MUST_EXTEND_FORWARD");
    await expect(
      service.extendRetention({
        artifactId: "artifact_retention",
        retainUntil: "2027-10-17T12:00:00.000Z",
        context: createEvidenceArtifactRetentionContext({
          principalType: "operator",
          principalRef: "operator_retention",
        }),
      }),
    ).resolves.toMatchObject({
      effective_retain_until: "2027-10-17T12:00:00.000Z",
    });
  });

  it("denies owner/expert/unknown hold contexts and limits release to operator", async () => {
    const { service } = await setup();
    for (const context of [
      createEvidenceArtifactOwnerContext(OWNER),
      { kind: "expert" },
      { kind: "unknown" },
    ])
      await expect(
        service.placeLegalHold({ artifactId: "artifact_retention", context }),
      ).rejects.toThrow("EVIDENCE_ARTIFACT_RETENTION_ACCESS_DENIED");

    await service.placeLegalHold({
      artifactId: "artifact_retention",
      context: createEvidenceArtifactRetentionContext({
        principalType: "system",
        principalRef: "system_retention",
      }),
    });
    await expect(
      service.releaseLegalHold({
        artifactId: "artifact_retention",
        context: createEvidenceArtifactRetentionContext({
          principalType: "system",
          principalRef: "system_retention",
        }),
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_RETENTION_ACCESS_DENIED");
    await expect(
      service.releaseLegalHold({
        artifactId: "artifact_retention",
        context: createEvidenceArtifactRetentionContext({
          principalType: "operator",
          principalRef: "operator_retention",
        }),
      }),
    ).resolves.toMatchObject({ legal_hold_active: false });
  });

  it("blocks held/null retention and performs the two-phase deletion", async () => {
    const held = await setup({ legalHold: true });
    await expect(
      held.service.deleteExpired({ artifactId: "artifact_retention" }),
    ).resolves.toEqual({ outcome: "not_eligible" });
    const noExpiry = await setup({ retainUntil: null });
    await expect(
      noExpiry.service.deleteExpired({ artifactId: "artifact_retention" }),
    ).resolves.toEqual({ outcome: "not_eligible" });
    await expect(
      noExpiry.service.extendRetention({
        artifactId: "artifact_retention",
        retainUntil: "2027-10-17T12:00:00.000Z",
        context: createEvidenceArtifactRetentionContext({
          principalType: "operator",
          principalRef: "operator_retention",
        }),
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_RETENTION_MUST_EXTEND_FORWARD");

    const expired = await setup();
    await expect(
      expired.service.deleteExpired({ artifactId: "artifact_retention" }),
    ).resolves.toEqual({ outcome: "deleted" });
    expect(
      await expired.retentionRepository.getState("artifact_retention"),
    ).toMatchObject({ blob_state: "deleted" });
    expect(
      await expired.artifactRepository.getArtifact("artifact_retention"),
    ).not.toBeNull();
    expect(
      await expired.retentionRepository.listEvents("artifact_retention"),
    ).toHaveLength(3);
  });

  it("leaves failed deletion pending and retries idempotently", async () => {
    const base = await setup();
    let attempts = 0;
    const blobStore: EvidenceArtifactBlobStore = {
      ...base.blobStore,
      putImmutable: (input) => base.blobStore.putImmutable(input),
      head: (key) => base.blobStore.head(key),
      get: (key) => base.blobStore.get(key),
      delete: async (key) => {
        attempts += 1;
        if (attempts === 1) throw new Error("provider failure");
        await base.blobStore.delete(key);
      },
    };
    const service = new EvidenceArtifactRetentionService({
      repository: base.retentionRepository,
      artifactRepository: base.artifactRepository,
      blobStore,
      now: () => NOW,
      createEventId: () => `retry_event_${attempts}`,
    });
    await expect(
      service.deleteExpired({ artifactId: "artifact_retention" }),
    ).resolves.toEqual({ outcome: "retry_pending" });
    expect(
      await base.retentionRepository.getState("artifact_retention"),
    ).toMatchObject({ blob_state: "deletion_pending" });
    await expect(
      service.deleteExpired({ artifactId: "artifact_retention" }),
    ).resolves.toEqual({ outcome: "deleted" });
  });

  it("denies reads while deletion is pending or complete", async () => {
    const base = await setup();
    await base.retentionRepository.claimDeletion({
      artifactId: "artifact_retention",
      now: NOW,
      eventId: "claim_for_read",
    });
    const read = new EvidenceArtifactReadService({
      repository: base.artifactRepository,
      retentionRepository: base.retentionRepository,
      blobStore: base.blobStore,
    });
    await expect(
      read.read({
        artifactId: "artifact_retention",
        context: createEvidenceArtifactOwnerContext(OWNER),
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_BLOB_UNAVAILABLE");
    await base.retentionRepository.markBlobDeleted({
      artifactId: "artifact_retention",
      occurredAt: NOW,
      eventId: "deleted_for_read",
    });
    await expect(
      read.read({
        artifactId: "artifact_retention",
        context: createEvidenceArtifactOwnerContext(OWNER),
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_BLOB_UNAVAILABLE");
  });
});

describe("Evidence Artifact orphan reconciliation", () => {
  const inventory = (
    items: { pathname: string; uploadedAt: string; size: number }[],
  ) => {
    const deletePathname = vi.fn(async () => undefined);
    const value: EvidenceArtifactBlobInventory = {
      list: vi.fn(async () => ({ items, cursor: null })),
      deletePathname,
    };
    return { value, deletePathname };
  };

  it("dry-runs by default and excludes referenced or fresh blobs", async () => {
    const base = await setup();
    const fake = inventory([
      {
        pathname: "evidence/artifact_retention/content",
        uploadedAt: "2026-10-01T00:00:00.000Z",
        size: 1,
      },
      {
        pathname: "evidence/orphan_old/content",
        uploadedAt: "2026-10-01T00:00:00.000Z",
        size: 2,
      },
      {
        pathname: "evidence/orphan_fresh/content",
        uploadedAt: NOW,
        size: 3,
      },
      {
        pathname: "other/orphan_old/content",
        uploadedAt: "2026-10-01T00:00:00.000Z",
        size: 4,
      },
    ]);
    const result = await new EvidenceArtifactOrphanReconciler({
      artifactRepository: base.artifactRepository,
      inventory: fake.value,
      controlledPrefix: "evidence/",
      now: () => NOW,
    }).reconcile({ prefix: "evidence/", gracePeriodMs: 60_000 });
    expect(result.candidates.map((item) => item.pathname)).toEqual([
      "evidence/orphan_old/content",
    ]);
    expect(fake.deletePathname).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/https?:|secret|bytes/i);
  });

  it("requires an issued operator context and deletes only eligible orphans", async () => {
    const base = await setup();
    const fake = inventory([
      {
        pathname: "evidence/orphan_old/content",
        uploadedAt: "2026-10-01T00:00:00.000Z",
        size: 2,
      },
    ]);
    const reconciler = new EvidenceArtifactOrphanReconciler({
      artifactRepository: base.artifactRepository,
      inventory: fake.value,
      controlledPrefix: "evidence/",
      now: () => NOW,
    });
    await expect(
      reconciler.reconcile({
        prefix: "evidence/",
        gracePeriodMs: 60_000,
        execute: true,
        context: { principalRef: "operator_forged" },
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_ORPHAN_EXECUTION_DENIED");
    const result = await reconciler.reconcile({
      prefix: "evidence/",
      gracePeriodMs: 60_000,
      execute: true,
      context: createEvidenceArtifactOrphanOperatorContext("operator_real"),
    });
    expect(result.deletedPathnames).toEqual(["evidence/orphan_old/content"]);
    expect(fake.deletePathname).toHaveBeenCalledTimes(1);
  });

  it("uses private Vercel inventory and strips provider URLs", async () => {
    const list = vi.fn(async () => ({
      blobs: [
        {
          pathname: "evidence/orphan_old/content",
          uploadedAt: new Date("2026-10-01T00:00:00.000Z"),
          size: 2,
          url: "https://provider.example/private-location",
        },
      ],
      hasMore: false,
    }));
    const client: VercelPrivateBlobInventoryClient = {
      list,
      delete: vi.fn(async () => undefined),
    };
    const page = await new VercelPrivateEvidenceArtifactBlobInventory(
      client,
    ).list({ prefix: "evidence/", cursor: null });
    expect(list).toHaveBeenCalledWith({
      prefix: "evidence/",
      access: "private",
    });
    expect(JSON.stringify(page)).not.toContain("provider.example");
  });
});
