import { spawnSync } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import {
  InMemoryEvidenceArtifactBlobStore,
  InMemoryEvidenceArtifactRepository,
  InMemoryEvidenceArtifactRetentionRepository,
  parseEvidenceArtifactStorageSmokeArguments,
  runEvidenceArtifactStorageSmoke,
  S3AnonymousEvidenceArtifactReadProbe,
  type EvidenceArtifactBlobInventory,
  type EvidenceArtifactBlobStore,
  type S3EvidenceArtifactConfig,
} from "../../src/evidence-artifacts";

const NOW = "2026-11-12T12:00:00.000Z";
const OLD = "2026-11-12T11:00:00.000Z";

class OfflineS3Runtime
  implements EvidenceArtifactBlobStore, EvidenceArtifactBlobInventory
{
  readonly capabilities = Object.freeze({
    provider: "s3" as const,
    dataResidency: "RU" as const,
  });
  private readonly delegate = new InMemoryEvidenceArtifactBlobStore();
  private readonly uploaded = new Map<
    string,
    { readonly uploadedAt: string; readonly size: number }
  >();

  readonly putImmutable = vi.fn<EvidenceArtifactBlobStore["putImmutable"]>(
    async (input) => {
      if (this.uploaded.has(input.storageKey))
        throw new Error("EVIDENCE_ARTIFACT_STORAGE_KEY_CONFLICT");
      const head = await this.delegate.putImmutable(input);
      this.uploaded.set(input.storageKey, {
        uploadedAt: OLD,
        size: input.bytes.byteLength,
      });
      return head;
    },
  );

  readonly head = vi.fn<EvidenceArtifactBlobStore["head"]>((storageKey) =>
    this.delegate.head(storageKey),
  );

  readonly get = vi.fn<EvidenceArtifactBlobStore["get"]>((storageKey) =>
    this.delegate.get(storageKey),
  );

  readonly delete = vi.fn<EvidenceArtifactBlobStore["delete"]>(
    async (storageKey) => {
      await this.delegate.delete(storageKey);
      this.uploaded.delete(storageKey);
    },
  );

  readonly list = vi.fn<EvidenceArtifactBlobInventory["list"]>(
    async ({ prefix }) => ({
      items: [...this.uploaded.entries()]
        .filter(([pathname]) => pathname.startsWith(prefix))
        .map(([pathname, item]) => ({ pathname, ...item })),
      cursor: null,
    }),
  );

  readonly deletePathname = vi.fn<
    EvidenceArtifactBlobInventory["deletePathname"]
  >((pathname) => this.delete(pathname));
}

const dependencies = (input?: {
  readonly store?: OfflineS3Runtime;
  readonly databaseReady?: boolean;
}) => {
  const store = input?.store ?? new OfflineS3Runtime();
  const artifactRepository = new InMemoryEvidenceArtifactRepository();
  const retentionRepository = new InMemoryEvidenceArtifactRetentionRepository();
  return {
    store,
    artifactRepository,
    retentionRepository,
    value: {
      runtime: {
        mode: "pilot" as const,
        capabilities: store.capabilities,
        blobStore: store,
        inventory: store,
      },
      artifactRepository,
      retentionRepository,
      inspectDatabase: vi.fn(async () => ({
        reachable: input?.databaseReady ?? true,
        schemaCompatible: input?.databaseReady ?? true,
      })),
      anonymousReadProbe: {
        isReadDenied: vi.fn(async () => true),
      },
      now: () => NOW,
      sleep: vi.fn(async () => undefined),
      createRunId: () => "smoke_offline",
    },
  };
};

describe("Evidence Artifact RU S3 operator smoke", () => {
  it("defaults to a read-only preflight and requires explicit execute parameters", () => {
    expect(parseEvidenceArtifactStorageSmokeArguments([])).toEqual({
      mode: "preflight",
      orphanGracePeriodMs: null,
    });
    expect(
      parseEvidenceArtifactStorageSmokeArguments([
        "--execute",
        "--orphan-grace-ms",
        "1000",
      ]),
    ).toEqual({ mode: "execute", orphanGracePeriodMs: 1000 });
    for (const input of [
      ["--execute"],
      ["--orphan-grace-ms", "1000"],
      ["--execute", "--orphan-grace-ms", "0"],
      ["--unknown"],
    ])
      expect(() => parseEvidenceArtifactStorageSmokeArguments(input)).toThrow(
        "EVIDENCE_ARTIFACT_STORAGE_SMOKE_ARGUMENTS_INVALID",
      );
  });

  it("fails closed from the CLI when S3 configuration is incomplete", () => {
    const environment = { ...process.env };
    for (const key of [
      "REDS_DATABASE_URL",
      "DATABASE_URL",
      "REDS_EVIDENCE_S3_ENDPOINT",
      "REDS_EVIDENCE_S3_REGION",
      "REDS_EVIDENCE_S3_BUCKET",
      "REDS_EVIDENCE_S3_DATA_RESIDENCY",
      "REDS_EVIDENCE_S3_ACCESS_KEY_ID",
      "REDS_EVIDENCE_S3_SECRET_ACCESS_KEY",
    ])
      delete environment[key];
    Object.assign(environment, {
      NODE_ENV: "production",
      REDS_APPLICATION_MODE: "pilot",
      REDS_EVIDENCE_BLOB_PROVIDER: "s3",
    });

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/evidence-artifact-storage-smoke.ts"],
      {
        cwd: process.cwd(),
        env: environment,
        encoding: "utf8",
        timeout: 10_000,
      },
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "fail",
      writes_performed: false,
      checks: [
        {
          check_id: "bootstrap",
          diagnostic_code: "EVIDENCE_ARTIFACT_S3_CONFIG_INVALID",
        },
      ],
    });
    expect(result.stdout).not.toMatch(
      /access.key|secret|postgres(?:ql)?:\/\//i,
    );
  });

  it("performs no writes in default preflight", async () => {
    const setup = dependencies();
    const create = vi.spyOn(
      setup.artifactRepository,
      "createQuarantinedArtifact",
    );

    const report = await runEvidenceArtifactStorageSmoke(
      { mode: "preflight", orphanGracePeriodMs: null },
      setup.value,
    );

    expect(report).toMatchObject({
      mode: "preflight",
      status: "pass",
      writes_performed: false,
      provider: "s3",
      declared_data_residency: "RU",
    });
    expect(setup.store.putImmutable).not.toHaveBeenCalled();
    expect(setup.store.delete).not.toHaveBeenCalled();
    expect(setup.store.deletePathname).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("runs the live sequence through storage, authorization, metadata, retention, and orphan ports", async () => {
    const setup = dependencies();

    const report = await runEvidenceArtifactStorageSmoke(
      { mode: "execute", orphanGracePeriodMs: 1000 },
      setup.value,
    );

    expect(report.status, JSON.stringify(report)).toBe("pass");
    expect(report.writes_performed).toBe(true);
    expect(report.checks.map((check) => check.check_id)).toEqual(
      expect.arrayContaining([
        "postgres_metadata_link",
        "immutable_overwrite_denied",
        "head_read_checksum",
        "foreign_owner_read_denied",
        "anonymous_provider_read_denied",
        "inventory_current_run",
        "retention_delete",
        "orphan_dry_run",
        "orphan_execute",
        "current_run_cleanup",
      ]),
    );
    expect(setup.store.get).toHaveBeenCalledTimes(2);
    expect(setup.store.deletePathname).toHaveBeenCalledTimes(1);
    expect(setup.store.deletePathname).toHaveBeenCalledWith(
      "evidence/smoke/smoke_offline/orphan",
    );
    expect(
      await setup.artifactRepository.getArtifact("artifact_smoke_offline"),
    ).not.toBeNull();
    expect(
      await setup.retentionRepository.getState("artifact_smoke_offline"),
    ).toMatchObject({ blob_state: "deleted" });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("synthetic_evidence_storage_smoke");
    expect(serialized).not.toContain("document_ref:");
  });

  it("fails closed before writes for an unready database or non-RU runtime", async () => {
    const database = dependencies({ databaseReady: false });
    const databaseReport = await runEvidenceArtifactStorageSmoke(
      { mode: "execute", orphanGracePeriodMs: 1000 },
      database.value,
    );
    expect(databaseReport.status).toBe("fail");
    expect(databaseReport.checks.at(-1)).toMatchObject({
      check_id: "database_schema",
      diagnostic_code: "EVIDENCE_ARTIFACT_STORAGE_SMOKE_DATABASE_NOT_READY",
    });
    expect(database.store.putImmutable).not.toHaveBeenCalled();

    const unsafe = dependencies();
    const unsafeReport = await runEvidenceArtifactStorageSmoke(
      { mode: "execute", orphanGracePeriodMs: 1000 },
      {
        ...unsafe.value,
        runtime: {
          ...unsafe.value.runtime,
          capabilities: {
            provider: "s3" as const,
            dataResidency: "NON_RU" as const,
          },
        },
      },
    );
    expect(unsafeReport.status).toBe("fail");
    expect(unsafe.store.putImmutable).not.toHaveBeenCalled();
  });

  it("collapses provider/database errors without leaking their messages", async () => {
    const setup = dependencies();
    const report = await runEvidenceArtifactStorageSmoke(
      { mode: "preflight", orphanGracePeriodMs: null },
      {
        ...setup.value,
        inspectDatabase: async () => {
          throw new Error(
            "postgres://operator:secret-password@secret-host/private",
          );
        },
      },
    );
    const serialized = JSON.stringify(report);
    expect(report.status).toBe("fail");
    expect(serialized).not.toContain("secret-password");
    expect(serialized).not.toContain("secret-host");
    expect(serialized).not.toContain("postgres://");
  });
});

describe("S3 anonymous read probe", () => {
  const config: S3EvidenceArtifactConfig = {
    endpoint: "https://storage.example",
    region: "ru-test-1",
    bucket: "private-evidence",
    dataResidency: "RU",
    accessKeyId: "secret-access-id",
    secretAccessKey: "secret-access-key",
  };

  it("sends one unsigned redirect-free request and treats only denial statuses as private", async () => {
    const deniedFetch = vi.fn(
      async (...arguments_: Parameters<typeof fetch>) => {
        void arguments_;
        return new Response(null, { status: 403 });
      },
    );
    const probe = new S3AnonymousEvidenceArtifactReadProbe(
      config,
      deniedFetch as unknown as typeof fetch,
    );

    await expect(probe.isReadDenied("evidence/smoke/run/object")).resolves.toBe(
      true,
    );
    expect(deniedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = deniedFetch.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://storage.example/private-evidence/evidence/smoke/run/object",
    );
    expect(init).toMatchObject({ method: "GET", redirect: "manual" });
    expect(init?.headers).not.toHaveProperty("Authorization");
    expect(JSON.stringify(probe)).not.toContain(config.accessKeyId);
    expect(JSON.stringify(probe)).not.toContain(config.secretAccessKey);

    const publicProbe = new S3AnonymousEvidenceArtifactReadProbe(
      config,
      vi.fn(async (...arguments_: Parameters<typeof fetch>) => {
        void arguments_;
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch,
    );
    await expect(
      publicProbe.isReadDenied("evidence/smoke/run/object"),
    ).resolves.toBe(false);
  });
});
