import { describe, expect, it, vi } from "vitest";

import type { EvidenceArtifact } from "../../src/domain";
import {
  createEvidenceArtifactOwnerContext,
  createTrustedInternalEvidenceArtifactContext,
  DefaultEvidenceArtifactAccessPolicy,
  EvidenceArtifactReadService,
  EvidenceArtifactService,
  InMemoryEvidenceArtifactBlobStore,
  InMemoryEvidenceArtifactRepository,
  sha256Hex,
  VercelPrivateEvidenceArtifactBlobStore,
  type EvidenceArtifactBlobStore,
  type EvidenceArtifactRepository,
  type VercelPrivateBlobClient,
} from "../../src/evidence-artifacts";
import { createSessionDocumentReference } from "../../src/expert";

const NOW = "2026-10-16T12:00:00.000Z";
const BYTES = new TextEncoder().encode("private artifact bytes");
const OWNER = { owner_type: "session" as const, owner_id: "owner_alpha" };
const OTHER_OWNER = {
  owner_type: "anonymous" as const,
  owner_id: "owner_alpha",
};
const STORAGE_KEY = "evidence/artifact_b1/content";

const streamFor = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

const makeClient = () => {
  const put = vi.fn(async () => ({
    pathname: STORAGE_KEY,
    url: "https://provider.example/private/secret-location",
  }));
  const head = vi.fn(async () => ({
    pathname: STORAGE_KEY,
    size: BYTES.byteLength,
  }));
  const get = vi.fn(async () => ({
    pathname: STORAGE_KEY,
    size: BYTES.byteLength,
    stream: streamFor(BYTES),
  }));
  const deleteBlob = vi.fn(async () => undefined);
  const client: VercelPrivateBlobClient = {
    put,
    head,
    get,
    delete: deleteBlob,
  };
  return { client, put, head, get, deleteBlob };
};

const userDocumentInput = () => ({
  artifactId: "artifact_b1",
  artifactKind: "user_document" as const,
  sourceId: "source_user_upload",
  sourceUrl: null,
  sourceReference: createSessionDocumentReference(OWNER, "document_b1"),
  collectedAt: NOW,
  mimeType: "application/pdf",
  bytes: BYTES,
  storageKey: STORAGE_KEY,
  retentionPolicy: "user_document" as const,
  retainUntil: "2027-10-16T12:00:00.000Z",
  actorType: "user" as const,
  actorRef: OWNER.owner_id,
  ownerContext: OWNER,
});

const setupUserDocument = async () => {
  const repository = new InMemoryEvidenceArtifactRepository();
  const blobStore = new InMemoryEvidenceArtifactBlobStore();
  const service = new EvidenceArtifactService({
    repository,
    blobStore,
    now: () => NOW,
    createEventId: () => "artifact_event_b1",
  });
  const artifact = await service.createQuarantinedArtifact(userDocumentInput());
  const readService = new EvidenceArtifactReadService({
    repository,
    blobStore,
  });
  return { repository, blobStore, artifact, readService };
};

describe("Vercel Private Blob adapter", () => {
  it("maps opaque storage_key to a private immutable pathname", async () => {
    const fake = makeClient();
    const store = new VercelPrivateEvidenceArtifactBlobStore(fake.client);

    await store.putImmutable({
      storageKey: STORAGE_KEY,
      bytes: BYTES,
      expectedSha256: sha256Hex(BYTES),
    });

    expect(fake.put).toHaveBeenCalledWith(STORAGE_KEY, BYTES, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    expect(fake.head).toHaveBeenCalledWith(STORAGE_KEY);
    expect(JSON.stringify(await store.head(STORAGE_KEY))).not.toContain(
      "provider.example",
    );
  });

  it("uses private authenticated reads and never returns a provider URL", async () => {
    const fake = makeClient();
    const store = new VercelPrivateEvidenceArtifactBlobStore(fake.client);

    expect(await store.get(STORAGE_KEY)).toEqual(BYTES);
    expect(fake.get).toHaveBeenCalledWith(STORAGE_KEY, {
      access: "private",
      useCache: false,
    });
  });

  it("does not persist the provider URL returned during upload", async () => {
    const fake = makeClient();
    const repository = new InMemoryEvidenceArtifactRepository();
    const service = new EvidenceArtifactService({
      repository,
      blobStore: new VercelPrivateEvidenceArtifactBlobStore(fake.client),
      now: () => NOW,
      createEventId: () => "artifact_event_provider_url",
    });

    const artifact =
      await service.createQuarantinedArtifact(userDocumentInput());
    expect(JSON.stringify(artifact)).not.toContain("provider.example");
    expect(
      JSON.stringify(await repository.getArtifact(artifact.artifact_id)),
    ).not.toContain("provider.example");
  });
});

describe("Evidence Artifact application authorization", () => {
  it("allows an owner to read their own user document", async () => {
    const { readService } = await setupUserDocument();
    await expect(
      readService.read({
        artifactId: "artifact_b1",
        context: createEvidenceArtifactOwnerContext(OWNER),
      }),
    ).resolves.toEqual(BYTES);
  });

  it("denies the same owner_id in another owner namespace", async () => {
    const { readService } = await setupUserDocument();
    await expect(
      readService.read({
        artifactId: "artifact_b1",
        context: createEvidenceArtifactOwnerContext(OTHER_OWNER),
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_ACCESS_DENIED");
  });

  it("denies malformed owner references and unknown actors", async () => {
    const policy = new DefaultEvidenceArtifactAccessPolicy();
    const { artifact } = await setupUserDocument();
    const malformed: EvidenceArtifact = {
      ...artifact,
      source_reference: "malformed_reference",
    };

    expect(
      policy.evaluate({
        artifact: malformed,
        context: createEvidenceArtifactOwnerContext(OWNER),
      }),
    ).toMatchObject({ decision: "deny" });
    expect(
      policy.evaluate({ artifact, context: { kind: "unknown" } }),
    ).toMatchObject({ decision: "deny" });
    expect(
      policy.evaluate({ artifact, context: { kind: "expert" } }),
    ).toMatchObject({ decision: "deny" });
    expect(
      policy.evaluate({ artifact, context: { kind: "public" } }),
    ).toMatchObject({ decision: "deny" });
  });

  it("does not treat a forged allow object as authorization", async () => {
    const { repository, blobStore } = await setupUserDocument();
    const get = vi.spyOn(blobStore, "get");
    const readService = new EvidenceArtifactReadService({
      repository,
      blobStore,
    });

    await expect(
      readService.read({
        artifactId: "artifact_b1",
        context: { decision: "allow", actorRef: OWNER.owner_id },
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_ACCESS_DENIED");
    expect(get).not.toHaveBeenCalled();
  });

  it("reads the blob only after policy approval", async () => {
    const { repository, blobStore } = await setupUserDocument();
    const get = vi.spyOn(blobStore, "get");
    const readService = new EvidenceArtifactReadService({
      repository,
      blobStore,
    });

    await readService.read({
      artifactId: "artifact_b1",
      context: createEvidenceArtifactOwnerContext(OWNER),
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("allows restricted_internal only for a trusted internal context", async () => {
    const repository = new InMemoryEvidenceArtifactRepository();
    const blobStore = new InMemoryEvidenceArtifactBlobStore();
    const service = new EvidenceArtifactService({
      repository,
      blobStore,
      now: () => NOW,
      createEventId: () => "artifact_event_internal",
    });
    await service.createQuarantinedArtifact({
      ...userDocumentInput(),
      artifactId: "artifact_internal",
      artifactKind: "source_snapshot",
      sourceUrl: "https://source.invalid/unit/1",
      sourceReference: null,
      ownerContext: undefined,
      storageKey: "evidence/artifact_internal/content",
      retentionPolicy: "standard",
      actorType: "service",
      actorRef: null,
    });
    const readService = new EvidenceArtifactReadService({
      repository,
      blobStore,
    });

    await expect(
      readService.read({
        artifactId: "artifact_internal",
        context: createEvidenceArtifactOwnerContext(OWNER),
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_ACCESS_DENIED");
    await expect(
      readService.read({
        artifactId: "artifact_internal",
        context: createTrustedInternalEvidenceArtifactContext({
          principalType: "operator",
          principalRef: "operator_test",
        }),
      }),
    ).resolves.toEqual(BYTES);
  });

  it("validates owner-scoped references during user_document creation", async () => {
    const repository = new InMemoryEvidenceArtifactRepository();
    const blobStore = new InMemoryEvidenceArtifactBlobStore();
    const service = new EvidenceArtifactService({ repository, blobStore });

    await expect(
      service.createQuarantinedArtifact({
        ...userDocumentInput(),
        ownerContext: OTHER_OWNER,
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_OWNER_REFERENCE_MISMATCH");
    expect(await repository.getArtifact("artifact_b1")).toBeNull();
  });
});

describe("Evidence Artifact orphan compensation", () => {
  const failingRepository = (): EvidenceArtifactRepository => {
    const delegate = new InMemoryEvidenceArtifactRepository();
    return {
      transaction: (work) => delegate.transaction(work),
      createQuarantinedArtifact: async () => {
        throw new Error("METADATA_WRITE_FAILED");
      },
      getArtifact: (artifactId) => delegate.getArtifact(artifactId),
      transitionArtifact: (artifactId, toState, event) =>
        delegate.transitionArtifact(artifactId, toState, event),
      linkArtifact: (link) => delegate.linkArtifact(link),
      listArtifactLinks: (artifactId) => delegate.listArtifactLinks(artifactId),
      listArtifactEvents: (artifactId) =>
        delegate.listArtifactEvents(artifactId),
    };
  };

  it("deletes the blob when metadata persistence fails", async () => {
    const blobStore = new InMemoryEvidenceArtifactBlobStore();
    const deleteBlob = vi.spyOn(blobStore, "delete");
    const service = new EvidenceArtifactService({
      repository: failingRepository(),
      blobStore,
    });

    await expect(
      service.createQuarantinedArtifact(userDocumentInput()),
    ).rejects.toThrow("METADATA_WRITE_FAILED");
    expect(deleteBlob).toHaveBeenCalledWith(STORAGE_KEY);
    await expect(blobStore.get(STORAGE_KEY)).rejects.toThrow(
      "EVIDENCE_ARTIFACT_BLOB_NOT_FOUND",
    );
  });

  it("returns a deterministic error when orphan cleanup also fails", async () => {
    const delegate = new InMemoryEvidenceArtifactBlobStore();
    const blobStore: EvidenceArtifactBlobStore = {
      putImmutable: (value) => delegate.putImmutable(value),
      head: (storageKey) => delegate.head(storageKey),
      get: (storageKey) => delegate.get(storageKey),
      delete: async () => {
        throw new Error("provider url and secret must not escape");
      },
    };
    const service = new EvidenceArtifactService({
      repository: failingRepository(),
      blobStore,
    });

    await expect(
      service.createQuarantinedArtifact(userDocumentInput()),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_ORPHAN_CLEANUP_FAILED");
  });

  it("does not delete a blob after successful metadata persistence", async () => {
    const blobStore = new InMemoryEvidenceArtifactBlobStore();
    const deleteBlob = vi.spyOn(blobStore, "delete");
    const service = new EvidenceArtifactService({
      repository: new InMemoryEvidenceArtifactRepository(),
      blobStore,
    });

    await service.createQuarantinedArtifact(userDocumentInput());
    expect(deleteBlob).not.toHaveBeenCalled();
  });
});
