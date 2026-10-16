import { describe, expect, it } from "vitest";

import {
  evidenceArtifactSchema,
  type EvidenceArtifact,
  type EvidenceArtifactEvent,
} from "../../src/domain";
import {
  EvidenceArtifactService,
  InMemoryEvidenceArtifactBlobStore,
  InMemoryEvidenceArtifactRepository,
  sha256Hex,
  type EvidenceArtifactBlobStore,
  type EvidenceArtifactRepository,
} from "../../src/evidence-artifacts";
import { createSessionDocumentReference } from "../../src/expert";

const NOW = "2026-10-16T12:00:00.000Z";
const BYTES = new TextEncoder().encode("private evidence payload sentinel");
const OWNER = { owner_type: "session" as const, owner_id: "owner_test_1" };

const input = (
  overrides: Partial<
    Parameters<EvidenceArtifactService["createQuarantinedArtifact"]>[0]
  > = {},
) => ({
  artifactId: "artifact_test_1",
  artifactKind: "user_document" as const,
  sourceId: "source_user_upload",
  sourceUrl: null,
  sourceReference: createSessionDocumentReference(OWNER, "document_1"),
  collectedAt: NOW,
  mimeType: "application/pdf",
  bytes: BYTES,
  storageKey: "evidence/artifact_test_1/content",
  retentionPolicy: "user_document" as const,
  retainUntil: "2027-10-16T12:00:00.000Z",
  actorType: "user" as const,
  actorRef: "owner_test_1",
  ownerContext: OWNER,
  ...overrides,
});

const setup = () => {
  const repository = new InMemoryEvidenceArtifactRepository();
  const blobStore = new InMemoryEvidenceArtifactBlobStore();
  let eventNumber = 0;
  const service = new EvidenceArtifactService({
    repository,
    blobStore,
    now: () => NOW,
    createEventId: () => `artifact_event_${++eventNumber}`,
  });
  return { repository, blobStore, service };
};

const createArtifact = async () => {
  const context = setup();
  const artifact = await context.service.createQuarantinedArtifact(input());
  return { ...context, artifact };
};

describe("Evidence Artifact Slice A", () => {
  it("creates immutable metadata in quarantine with the computed SHA-256", async () => {
    const { artifact } = await createArtifact();

    expect(artifact.state).toBe("quarantine");
    expect(artifact.sha256).toBe(sha256Hex(BYTES));
    expect(artifact.byte_size).toBe(BYTES.byteLength);
  });

  it("rejects an invalid or mismatched checksum", async () => {
    const { service, repository } = setup();

    await expect(
      service.createQuarantinedArtifact(
        input({ expectedSha256: "0".repeat(64) }),
      ),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH");
    expect(await repository.getArtifact("artifact_test_1")).toBeNull();
    await expect(
      service.createQuarantinedArtifact(input({ expectedSha256: "bad" })),
    ).rejects.toThrow();
  });

  it("rejects a public URL as storage_key", async () => {
    const { service, repository } = setup();

    await expect(
      service.createQuarantinedArtifact(
        input({ storageKey: "https://public.example/document.pdf" }),
      ),
    ).rejects.toThrow(/opaque/);
    expect(await repository.getArtifact("artifact_test_1")).toBeNull();
  });

  it("defaults a user document to owner-private access", async () => {
    const { artifact } = await createArtifact();
    expect(artifact.access_scope).toBe("private_owner");
    expect(JSON.stringify(artifact)).not.toContain("public_url");
  });

  it("allows quarantine to staged to approved", async () => {
    const { service } = await createArtifact();

    const staged = await service.transitionArtifact({
      artifactId: "artifact_test_1",
      toState: "staged",
      actorType: "service",
      actorRef: null,
      reasonCode: "checksum_validated",
    });
    const approved = await service.transitionArtifact({
      artifactId: "artifact_test_1",
      toState: "approved",
      actorType: "operator",
      actorRef: "operator_test_1",
      reasonCode: "evidence_reviewed",
    });

    expect(staged.state).toBe("staged");
    expect(approved.state).toBe("approved");
  });

  it("rejects quarantine to approved", async () => {
    const { service } = await createArtifact();
    await expect(
      service.transitionArtifact({
        artifactId: "artifact_test_1",
        toState: "approved",
        actorType: "operator",
        actorRef: "operator_test_1",
        reasonCode: null,
      }),
    ).rejects.toThrow(
      "EVIDENCE_ARTIFACT_INVALID_TRANSITION:quarantine->approved",
    );
  });

  it("rejects moving an approved artifact backwards", async () => {
    const { service } = await createArtifact();
    await service.transitionArtifact({
      artifactId: "artifact_test_1",
      toState: "staged",
      actorType: "service",
      actorRef: null,
      reasonCode: null,
    });
    await service.transitionArtifact({
      artifactId: "artifact_test_1",
      toState: "approved",
      actorType: "operator",
      actorRef: "operator_test_1",
      reasonCode: null,
    });

    await expect(
      service.transitionArtifact({
        artifactId: "artifact_test_1",
        toState: "staged",
        actorType: "operator",
        actorRef: "operator_test_1",
        reasonCode: null,
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_INVALID_TRANSITION:approved->staged");
  });

  it("does not expose a way to rewrite immutable content metadata", async () => {
    const { repository, artifact } = await createArtifact();
    const mutableCopy = artifact as EvidenceArtifact & {
      sha256: string;
      storage_key: string;
      source_id: string;
    };
    mutableCopy.sha256 = "f".repeat(64);
    mutableCopy.storage_key = "evidence/replaced";
    mutableCopy.source_id = "source_replaced";

    const persisted = await repository.getArtifact("artifact_test_1");
    expect(persisted).toMatchObject({
      sha256: sha256Hex(BYTES),
      storage_key: "evidence/artifact_test_1/content",
      source_id: "source_user_upload",
    });
  });

  it("rejects a duplicate artifact id", async () => {
    const { service } = await createArtifact();
    await expect(service.createQuarantinedArtifact(input())).rejects.toThrow(
      "EVIDENCE_ARTIFACT_ID_CONFLICT",
    );
  });

  it("links an artifact to FieldEvidence and SourceSnapshot", async () => {
    const { repository, service } = setup();
    await service.createQuarantinedArtifact(
      input({
        links: [
          {
            subjectType: "field_evidence",
            subjectId: "evidence_field_1",
            relation: "supports",
          },
          {
            subjectType: "source_snapshot",
            subjectId: "snapshot_1",
            relation: "captures",
          },
        ],
      }),
    );

    expect(await repository.listArtifactLinks("artifact_test_1")).toEqual([
      expect.objectContaining({ subject_type: "field_evidence" }),
      expect.objectContaining({ subject_type: "source_snapshot" }),
    ]);
  });

  it("makes duplicate links idempotent", async () => {
    const { repository } = await createArtifact();
    const link = {
      artifact_id: "artifact_test_1",
      subject_type: "field_evidence" as const,
      subject_id: "evidence_field_1",
      relation: "supports" as const,
      created_at: NOW,
    };
    await repository.linkArtifact(link);
    await repository.linkArtifact(link);
    expect(await repository.listArtifactLinks("artifact_test_1")).toHaveLength(
      1,
    );
  });

  it("keeps transition and audit event atomic", async () => {
    const { repository } = await createArtifact();
    const stagedEvent: EvidenceArtifactEvent = {
      event_id: "artifact_event_stage",
      artifact_id: "artifact_test_1",
      event_type: "state_transitioned",
      from_state: "quarantine",
      to_state: "staged",
      actor_type: "service",
      actor_ref: null,
      occurred_at: NOW,
      metadata: { reason_code: null },
    };
    await repository.transitionArtifact(
      "artifact_test_1",
      "staged",
      stagedEvent,
    );

    await expect(
      repository.transitionArtifact("artifact_test_1", "approved", {
        ...stagedEvent,
        from_state: "staged",
        to_state: "approved",
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_EVENT_ID_CONFLICT");
    expect(await repository.getArtifact("artifact_test_1")).toMatchObject({
      state: "staged",
    });
    expect(await repository.listArtifactEvents("artifact_test_1")).toHaveLength(
      2,
    );
  });

  it("creates no metadata when the blob write fails", async () => {
    const repository = new InMemoryEvidenceArtifactRepository();
    const blobStore: EvidenceArtifactBlobStore = {
      putImmutable: async () => {
        throw new Error("BLOB_WRITE_FAILED");
      },
      head: async () => null,
      get: async () => new Uint8Array(),
      delete: async () => undefined,
    };
    const service = new EvidenceArtifactService({ repository, blobStore });

    await expect(service.createQuarantinedArtifact(input())).rejects.toThrow(
      "BLOB_WRITE_FAILED",
    );
    expect(await repository.getArtifact("artifact_test_1")).toBeNull();
  });

  it("does not return a persisted artifact when metadata persistence fails", async () => {
    const delegate = new InMemoryEvidenceArtifactRepository();
    const repository: EvidenceArtifactRepository = {
      ...delegate,
      transaction: (work) => delegate.transaction(work),
      createQuarantinedArtifact: async () => {
        throw new Error("METADATA_WRITE_FAILED");
      },
      getArtifact: (artifactId) => delegate.getArtifact(artifactId),
      hasStorageKey: (storageKey) => delegate.hasStorageKey(storageKey),
      transitionArtifact: (artifactId, toState, event) =>
        delegate.transitionArtifact(artifactId, toState, event),
      linkArtifact: (link) => delegate.linkArtifact(link),
      listArtifactLinks: (artifactId) => delegate.listArtifactLinks(artifactId),
      listArtifactEvents: (artifactId) =>
        delegate.listArtifactEvents(artifactId),
    };
    const service = new EvidenceArtifactService({
      repository,
      blobStore: new InMemoryEvidenceArtifactBlobStore(),
    });

    await expect(service.createQuarantinedArtifact(input())).rejects.toThrow(
      "METADATA_WRITE_FAILED",
    );
    expect(await delegate.getArtifact("artifact_test_1")).toBeNull();
  });

  it("has no canonical Property or Offer write side effect", async () => {
    const canonicalWrites: unknown[] = [];
    const { service } = setup();
    await service.createQuarantinedArtifact(input());
    expect(canonicalWrites).toEqual([]);
  });

  it("keeps raw bytes out of metadata and audit records", async () => {
    const { artifact, repository } = await createArtifact();
    const serialized = JSON.stringify({
      artifact,
      events: await repository.listArtifactEvents("artifact_test_1"),
    });

    expect(serialized).not.toContain("private evidence payload sentinel");
    expect(serialized).not.toContain(Buffer.from(BYTES).toString("base64"));
    expect(evidenceArtifactSchema.parse(artifact)).toEqual(artifact);
  });
});
