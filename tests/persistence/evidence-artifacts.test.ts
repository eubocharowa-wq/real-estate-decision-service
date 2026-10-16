import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
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
});
