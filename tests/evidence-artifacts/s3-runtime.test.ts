import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import {
  EvidenceArtifactService,
  InMemoryEvidenceArtifactBlobStore,
  InMemoryEvidenceArtifactRepository,
  resolveEvidenceArtifactBlobRuntime,
  S3EvidenceArtifactBlobInventory,
  S3EvidenceArtifactBlobStore,
  sha256Hex,
  VercelPrivateEvidenceArtifactBlobStore,
  type S3EvidenceArtifactClient,
  type S3EvidenceArtifactConfig,
  type EvidenceArtifactBlobStore,
} from "../../src/evidence-artifacts";
import { createSessionDocumentReference } from "../../src/expert";

const NOW = "2026-10-17T12:00:00.000Z";
const STORAGE_KEY = "evidence/artifact_s3/content";
const BYTES = new TextEncoder().encode("s3 private evidence bytes");
const OWNER = { owner_type: "session" as const, owner_id: "owner_s3" };
const S3_CONFIG: S3EvidenceArtifactConfig = {
  endpoint: "https://s3.storage.example",
  region: "ru-test-1",
  bucket: "reds-private-evidence",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
};

const checksumBase64 = (bytes: Uint8Array): string =>
  Buffer.from(sha256Hex(bytes), "hex").toString("base64");

const notFound = (): Error & { $metadata: { httpStatusCode: number } } =>
  Object.assign(new Error("provider endpoint and credential sentinel"), {
    name: "NoSuchKey",
    $metadata: { httpStatusCode: 404 },
  });

const conflict = (): Error & { $metadata: { httpStatusCode: number } } =>
  Object.assign(new Error("provider conflict details"), {
    name: "PreconditionFailed",
    $metadata: { httpStatusCode: 412 },
  });

const makeObjectClient = () => {
  const objects = new Map<
    string,
    { readonly bytes: Uint8Array; readonly checksum: string }
  >();
  const send = vi.fn<S3EvidenceArtifactClient["send"]>(async (command) => {
    if (command instanceof PutObjectCommand) {
      const key = command.input.Key!;
      if (objects.has(key)) throw conflict();
      const bytes = new Uint8Array(command.input.Body as Uint8Array);
      objects.set(key, {
        bytes,
        checksum: command.input.ChecksumSHA256!,
      });
      return { url: "https://provider.example/private/object" };
    }
    if (command instanceof HeadObjectCommand) {
      const object = objects.get(command.input.Key!);
      if (!object) throw notFound();
      return {
        ContentLength: object.bytes.byteLength,
        ChecksumSHA256: object.checksum,
        providerUrl: "https://provider.example/private/object",
      };
    }
    if (command instanceof GetObjectCommand) {
      const object = objects.get(command.input.Key!);
      if (!object) throw notFound();
      return {
        ContentLength: object.bytes.byteLength,
        ChecksumSHA256: object.checksum,
        Body: {
          transformToByteArray: async () => new Uint8Array(object.bytes),
        },
        providerUrl: "https://provider.example/private/object",
      };
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(command.input.Key!);
      return {};
    }
    throw new Error("unexpected command");
  });
  return {
    client: { send } satisfies S3EvidenceArtifactClient,
    send,
    objects,
  };
};

const userDocumentInput = () => ({
  artifactId: "artifact_s3",
  artifactKind: "user_document" as const,
  sourceId: "source_user_upload",
  sourceUrl: null,
  sourceReference: createSessionDocumentReference(OWNER, "document_s3"),
  collectedAt: NOW,
  mimeType: "application/pdf",
  bytes: BYTES,
  storageKey: STORAGE_KEY,
  retentionPolicy: "user_document" as const,
  retainUntil: "2027-10-17T12:00:00.000Z",
  actorType: "user" as const,
  actorRef: OWNER.owner_id,
  ownerContext: OWNER,
});

describe("S3 Evidence Artifact blob adapter", () => {
  it("uses the exact key, private request shape, and conditional create", async () => {
    const fake = makeObjectClient();
    const store = new S3EvidenceArtifactBlobStore(S3_CONFIG, fake.client);

    const head = await store.putImmutable({
      storageKey: STORAGE_KEY,
      bytes: BYTES,
      expectedSha256: sha256Hex(BYTES),
    });

    const put = fake.send.mock.calls[0]![0];
    expect(put).toBeInstanceOf(PutObjectCommand);
    if (!(put instanceof PutObjectCommand)) throw new Error("expected put");
    expect(put.input).toMatchObject({
      Bucket: S3_CONFIG.bucket,
      Key: STORAGE_KEY,
      IfNoneMatch: "*",
      ChecksumSHA256: checksumBase64(BYTES),
    });
    expect(put.input).not.toHaveProperty("ACL");
    expect(head).toEqual({
      storageKey: STORAGE_KEY,
      byteSize: BYTES.byteLength,
      sha256: sha256Hex(BYTES),
    });
    expect(JSON.stringify(head)).not.toContain("provider.example");

    await expect(
      store.putImmutable({
        storageKey: STORAGE_KEY,
        bytes: BYTES,
        expectedSha256: sha256Hex(BYTES),
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_STORAGE_KEY_CONFLICT");
  });

  it("rejects checksum mismatches before provider write", async () => {
    const fake = makeObjectClient();
    const store = new S3EvidenceArtifactBlobStore(S3_CONFIG, fake.client);
    await expect(
      store.putImmutable({
        storageKey: STORAGE_KEY,
        bytes: BYTES,
        expectedSha256: "0".repeat(64),
      }),
    ).rejects.toThrow("EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH");
    expect(fake.send).not.toHaveBeenCalled();
  });

  it("supports verified head/get and idempotent delete", async () => {
    const fake = makeObjectClient();
    const store = new S3EvidenceArtifactBlobStore(S3_CONFIG, fake.client);
    await store.putImmutable({
      storageKey: STORAGE_KEY,
      bytes: BYTES,
      expectedSha256: sha256Hex(BYTES),
    });
    await expect(store.head(STORAGE_KEY)).resolves.toMatchObject({
      storageKey: STORAGE_KEY,
      sha256: sha256Hex(BYTES),
    });
    await expect(store.get(STORAGE_KEY)).resolves.toEqual(BYTES);
    await store.delete(STORAGE_KEY);
    await expect(store.head(STORAGE_KEY)).resolves.toBeNull();
    await expect(store.delete(STORAGE_KEY)).resolves.toBeUndefined();
  });

  it("rejects a checksum mismatch returned by the provider", async () => {
    const fake = makeObjectClient();
    const store = new S3EvidenceArtifactBlobStore(S3_CONFIG, fake.client);
    await store.putImmutable({
      storageKey: STORAGE_KEY,
      bytes: BYTES,
      expectedSha256: sha256Hex(BYTES),
    });
    fake.objects.set(STORAGE_KEY, {
      bytes: BYTES,
      checksum: Buffer.from("0".repeat(64), "hex").toString("base64"),
    });
    await expect(store.get(STORAGE_KEY)).rejects.toThrow(
      "EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH",
    );
  });

  it("sanitizes provider errors and retains no endpoint or credentials", async () => {
    const client: S3EvidenceArtifactClient = {
      send: async () => {
        throw new Error(
          "https://s3.storage.example test-access-key test-secret-key",
        );
      },
    };
    const store = new S3EvidenceArtifactBlobStore(S3_CONFIG, client);
    await expect(store.head(STORAGE_KEY)).rejects.toThrow(
      "EVIDENCE_ARTIFACT_BLOB_HEAD_FAILED",
    );
    const serialized = JSON.stringify(store);
    expect(serialized).not.toContain(S3_CONFIG.endpoint);
    expect(serialized).not.toContain(S3_CONFIG.accessKeyId);
    expect(serialized).not.toContain(S3_CONFIG.secretAccessKey);
  });
});

describe("S3 Evidence Artifact inventory", () => {
  it("paginates by opaque prefix and never returns provider URLs", async () => {
    const send = vi.fn<S3EvidenceArtifactClient["send"]>(async (command) => {
      if (command instanceof ListObjectsV2Command) {
        if (!command.input.ContinuationToken)
          return {
            Contents: [
              {
                Key: "evidence/first/content",
                LastModified: new Date(NOW),
                Size: 10,
                url: "https://provider.example/first",
              },
            ],
            IsTruncated: true,
            NextContinuationToken: "page-2",
          };
        return {
          Contents: [
            {
              Key: "evidence/second/content",
              LastModified: new Date(NOW),
              Size: 20,
              url: "https://provider.example/second",
            },
          ],
          IsTruncated: false,
        };
      }
      if (command instanceof DeleteObjectCommand) return {};
      throw new Error("unexpected command");
    });
    const inventory = new S3EvidenceArtifactBlobInventory(S3_CONFIG, { send });
    const first = await inventory.list({ prefix: "evidence/", cursor: null });
    const second = await inventory.list({
      prefix: "evidence/",
      cursor: first.cursor,
    });

    expect(first.cursor).toBe("page-2");
    expect(second.cursor).toBeNull();
    expect(
      [...first.items, ...second.items].map((item) => item.pathname),
    ).toEqual(["evidence/first/content", "evidence/second/content"]);
    expect(JSON.stringify({ first, second })).not.toContain("provider.example");
    await inventory.deletePathname("evidence/first/content");
    expect(send.mock.calls.at(-1)?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });
});

describe("Evidence Artifact provider runtime and data residency", () => {
  it("fails closed for incomplete S3 config and unsafe production defaults", () => {
    expect(() =>
      resolveEvidenceArtifactBlobRuntime({
        REDS_APPLICATION_MODE: "pilot",
        REDS_EVIDENCE_BLOB_PROVIDER: "s3",
      }),
    ).toThrow("EVIDENCE_ARTIFACT_S3_CONFIG_INVALID");
    expect(() =>
      resolveEvidenceArtifactBlobRuntime({ REDS_APPLICATION_MODE: "pilot" }),
    ).toThrow("EVIDENCE_ARTIFACT_BLOB_PROVIDER_REQUIRED");
    expect(() =>
      resolveEvidenceArtifactBlobRuntime({
        REDS_APPLICATION_MODE: "production",
        REDS_EVIDENCE_BLOB_PROVIDER: "memory",
      }),
    ).toThrow("EVIDENCE_ARTIFACT_BLOB_PROVIDER_DENIED");
  });

  it("creates a provider-neutral RU S3 runtime without retaining secrets", () => {
    const fake = makeObjectClient();
    const runtime = resolveEvidenceArtifactBlobRuntime(
      {
        REDS_APPLICATION_MODE: "pilot",
        REDS_EVIDENCE_BLOB_PROVIDER: "s3",
        REDS_EVIDENCE_S3_ENDPOINT: S3_CONFIG.endpoint,
        REDS_EVIDENCE_S3_REGION: S3_CONFIG.region,
        REDS_EVIDENCE_S3_BUCKET: S3_CONFIG.bucket,
        REDS_EVIDENCE_S3_ACCESS_KEY_ID: S3_CONFIG.accessKeyId,
        REDS_EVIDENCE_S3_SECRET_ACCESS_KEY: S3_CONFIG.secretAccessKey,
      },
      { s3Client: fake.client },
    );
    expect(runtime.capabilities).toEqual({
      provider: "s3",
      dataResidency: "RU",
    });
    expect(runtime.inventory).not.toBeNull();
    const serialized = JSON.stringify(runtime);
    expect(serialized).not.toContain(S3_CONFIG.endpoint);
    expect(serialized).not.toContain(S3_CONFIG.accessKeyId);
    expect(serialized).not.toContain(S3_CONFIG.secretAccessKey);
  });

  it.each([
    ["pilot", "Vercel", new VercelPrivateEvidenceArtifactBlobStore()],
    ["pilot", "memory", new InMemoryEvidenceArtifactBlobStore()],
    ["production", "Vercel", new VercelPrivateEvidenceArtifactBlobStore()],
    ["production", "memory", new InMemoryEvidenceArtifactBlobStore()],
  ] as const)(
    "denies %s user_document through %s",
    async (applicationMode, _name, blobStore) => {
      const service = new EvidenceArtifactService({
        repository: new InMemoryEvidenceArtifactRepository(),
        blobStore,
        applicationMode,
      });
      await expect(
        service.createQuarantinedArtifact(userDocumentInput()),
      ).rejects.toThrow("EVIDENCE_ARTIFACT_DATA_RESIDENCY_DENIED");
    },
  );

  it("allows production user_document only through configured RU S3", async () => {
    const fake = makeObjectClient();
    const service = new EvidenceArtifactService({
      repository: new InMemoryEvidenceArtifactRepository(),
      blobStore: new S3EvidenceArtifactBlobStore(S3_CONFIG, fake.client),
      applicationMode: "production",
      now: () => NOW,
      createEventId: () => "artifact_event_s3_residency",
    });
    const artifact =
      await service.createQuarantinedArtifact(userDocumentInput());
    expect(artifact).toMatchObject({ artifact_kind: "user_document" });
    expect(JSON.stringify(artifact)).not.toContain("provider.example");
  });

  it("keeps source snapshots provider-neutral in production", async () => {
    const delegate = new InMemoryEvidenceArtifactBlobStore();
    const blobStore: EvidenceArtifactBlobStore = {
      capabilities: Object.freeze({
        provider: "vercel",
        dataResidency: "NON_RU",
      }),
      putImmutable: (input) => delegate.putImmutable(input),
      head: (key) => delegate.head(key),
      get: (key) => delegate.get(key),
      delete: (key) => delegate.delete(key),
    };
    const service = new EvidenceArtifactService({
      repository: new InMemoryEvidenceArtifactRepository(),
      blobStore,
      applicationMode: "production",
      now: () => NOW,
      createEventId: () => "artifact_event_source_snapshot",
    });
    await expect(
      service.createQuarantinedArtifact({
        ...userDocumentInput(),
        artifactKind: "source_snapshot",
        sourceUrl: "https://source.invalid/unit/1",
        sourceReference: null,
        ownerContext: undefined,
        actorType: "service",
        actorRef: null,
      }),
    ).resolves.toMatchObject({ artifact_kind: "source_snapshot" });
  });

  it("keeps demo/test memory flows usable", async () => {
    const runtime = resolveEvidenceArtifactBlobRuntime({
      REDS_APPLICATION_MODE: "demo",
    });
    const service = new EvidenceArtifactService({
      repository: new InMemoryEvidenceArtifactRepository(),
      blobStore: runtime.blobStore,
      applicationMode: runtime.mode,
      now: () => NOW,
      createEventId: () => "artifact_event_demo_memory",
    });
    await expect(
      service.createQuarantinedArtifact(userDocumentInput()),
    ).resolves.toMatchObject({ artifact_kind: "user_document" });
  });
});
