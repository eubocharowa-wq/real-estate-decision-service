import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createEvidenceArtifactRetentionContext,
  EvidenceArtifactRetentionService,
  EvidenceArtifactService,
  InMemoryEvidenceArtifactBlobStore,
} from "../../src/evidence-artifacts";
import { createPostgresRepositories, migrateUp } from "../../src/persistence";
import {
  createTestDatabase,
  dropTestDatabase,
  isDatabaseAvailable,
  type TestDatabase,
} from "./helpers";

const NOW = "2026-10-16T12:00:00.000Z";

describe.skipIf(!isDatabaseAvailable)("evidence artifact persistence", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase("test_evidence_artifacts");
    await migrateUp(database.pool);
  });

  afterAll(async () => {
    await dropTestDatabase(database);
  });

  it("persists links and an atomic lifecycle audit", async () => {
    const repository = createPostgresRepositories(
      database.pool,
    ).evidenceArtifactRepository;
    let event = 0;
    const service = new EvidenceArtifactService({
      repository,
      blobStore: new InMemoryEvidenceArtifactBlobStore(),
      now: () => NOW,
      createEventId: () => `artifact_event_db_${++event}`,
    });
    const bytes = new TextEncoder().encode("database evidence fixture");

    await service.createQuarantinedArtifact({
      artifactId: "artifact_db_1",
      artifactKind: "source_snapshot",
      sourceId: "source_db",
      sourceUrl: "https://source.invalid/unit/1",
      sourceReference: null,
      collectedAt: NOW,
      mimeType: "text/html",
      bytes,
      storageKey: "evidence/artifact_db_1/content",
      retentionPolicy: "standard",
      retainUntil: "2027-10-16T12:00:00.000Z",
      actorType: "service",
      actorRef: null,
      links: [
        {
          subjectType: "field_evidence",
          subjectId: "evidence_db_1",
          relation: "supports",
        },
        {
          subjectType: "source_snapshot",
          subjectId: "snapshot_db_1",
          relation: "captures",
        },
      ],
    });
    await service.transitionArtifact({
      artifactId: "artifact_db_1",
      toState: "staged",
      actorType: "service",
      actorRef: null,
      reasonCode: "content_validated",
    });
    await service.transitionArtifact({
      artifactId: "artifact_db_1",
      toState: "approved",
      actorType: "operator",
      actorRef: "operator_db_1",
      reasonCode: "evidence_reviewed",
    });

    expect(await repository.getArtifact("artifact_db_1")).toMatchObject({
      state: "approved",
    });
    expect(await repository.listArtifactLinks("artifact_db_1")).toHaveLength(2);
    expect(await repository.listArtifactEvents("artifact_db_1")).toHaveLength(
      3,
    );
  });

  it("rejects raw SQL metadata rewrites and backwards transitions", async () => {
    await expect(
      database.pool.query(
        `UPDATE evidence_artifacts SET sha256 = $1 WHERE artifact_id = $2`,
        ["f".repeat(64), "artifact_db_1"],
      ),
    ).rejects.toThrow(/EVIDENCE_ARTIFACT_IMMUTABLE_METADATA/);
    await expect(
      database.pool.query(
        `UPDATE evidence_artifacts SET state = 'staged' WHERE artifact_id = $1`,
        ["artifact_db_1"],
      ),
    ).rejects.toThrow(/EVIDENCE_ARTIFACT_INVALID_TRANSITION/);
  });

  it("initializes retention and persists state plus append-only audit", async () => {
    const repositories = createPostgresRepositories(database.pool);
    const state =
      await repositories.evidenceArtifactRetentionRepository.getState(
        "artifact_db_1",
      );
    expect(state).toMatchObject({
      effective_retain_until: "2027-10-16T12:00:00.000Z",
      legal_hold_active: false,
      blob_state: "present",
    });

    const service = new EvidenceArtifactRetentionService({
      repository: repositories.evidenceArtifactRetentionRepository,
      artifactRepository: repositories.evidenceArtifactRepository,
      blobStore: new InMemoryEvidenceArtifactBlobStore(),
      now: () => "2026-10-17T12:00:00.000Z",
      createEventId: () => "retention_event_db_extend",
    });
    await service.extendRetention({
      artifactId: "artifact_db_1",
      retainUntil: "2028-10-16T12:00:00.000Z",
      context: createEvidenceArtifactRetentionContext({
        principalType: "operator",
        principalRef: "operator_db_1",
      }),
    });
    expect(
      await repositories.evidenceArtifactRetentionRepository.listEvents(
        "artifact_db_1",
      ),
    ).toHaveLength(2);
    await expect(
      repositories.evidenceArtifactRetentionRepository.extendRetention({
        artifactId: "artifact_db_1",
        retainUntil: "2029-10-16T12:00:00.000Z",
        actorType: "operator",
        actorRef: "operator_db_1",
        occurredAt: "2026-10-17T13:00:00.000Z",
        eventId: "retention_event_db_extend",
      }),
    ).rejects.toThrow();
    expect(
      await repositories.evidenceArtifactRetentionRepository.getState(
        "artifact_db_1",
      ),
    ).toMatchObject({
      effective_retain_until: "2028-10-16T12:00:00.000Z",
    });
    await expect(
      database.pool.query(
        `DELETE FROM evidence_artifact_retention_events WHERE artifact_id = $1`,
        ["artifact_db_1"],
      ),
    ).rejects.toThrow(/APPEND_ONLY/);
  });

  it("enforces legal hold and two-phase deletion in PostgreSQL", async () => {
    const repositories = createPostgresRepositories(database.pool);
    const blobStore = new InMemoryEvidenceArtifactBlobStore();
    await new EvidenceArtifactService({
      repository: repositories.evidenceArtifactRepository,
      blobStore,
      now: () => NOW,
      createEventId: () => "artifact_event_db_retention",
    }).createQuarantinedArtifact({
      artifactId: "artifact_db_retention",
      artifactKind: "source_snapshot",
      sourceId: "source_db",
      sourceUrl: "https://source.invalid/unit/retention",
      sourceReference: null,
      collectedAt: NOW,
      mimeType: "text/html",
      bytes: new TextEncoder().encode("retention database fixture"),
      storageKey: "evidence/artifact_db_retention/content",
      retentionPolicy: "standard",
      retainUntil: "2026-10-15T12:00:00.000Z",
      actorType: "service",
      actorRef: null,
    });

    let event = 0;
    const retention = new EvidenceArtifactRetentionService({
      repository: repositories.evidenceArtifactRetentionRepository,
      artifactRepository: repositories.evidenceArtifactRepository,
      blobStore,
      now: () => "2026-10-17T12:00:00.000Z",
      createEventId: () => `retention_event_db_delete_${++event}`,
    });
    const operator = createEvidenceArtifactRetentionContext({
      principalType: "operator",
      principalRef: "operator_db_1",
    });

    await retention.placeLegalHold({
      artifactId: "artifact_db_retention",
      context: operator,
    });
    await expect(
      retention.deleteExpired({ artifactId: "artifact_db_retention" }),
    ).resolves.toEqual({ outcome: "not_eligible" });
    await retention.releaseLegalHold({
      artifactId: "artifact_db_retention",
      context: operator,
    });
    await expect(
      retention.deleteExpired({ artifactId: "artifact_db_retention" }),
    ).resolves.toEqual({ outcome: "deleted" });

    expect(
      await repositories.evidenceArtifactRetentionRepository.getState(
        "artifact_db_retention",
      ),
    ).toMatchObject({ legal_hold_active: false, blob_state: "deleted" });
    expect(
      (
        await repositories.evidenceArtifactRetentionRepository.listEvents(
          "artifact_db_retention",
        )
      ).map((retentionEvent) => retentionEvent.event_type),
    ).toEqual([
      "retention_initialized",
      "legal_hold_placed",
      "legal_hold_released",
      "deletion_claimed",
      "blob_deleted",
    ]);
    expect(
      await repositories.evidenceArtifactRepository.getArtifact(
        "artifact_db_retention",
      ),
    ).not.toBeNull();
  });
});
