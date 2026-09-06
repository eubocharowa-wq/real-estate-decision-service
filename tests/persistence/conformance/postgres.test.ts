import { afterAll, describe, expect, it } from "vitest";

import {
  createPostgresRepositories,
  migrateUp,
  type RepositorySet,
} from "../../../src/persistence";
import {
  createTestDatabase,
  dropTestDatabase,
  isDatabaseAvailable,
  PHASE_ONE_TABLES,
  type TestDatabase,
} from "../helpers";
import {
  makeConfirmedRequest,
  makeEvidence,
  makeJourney,
  NOW,
} from "./fixtures";
import { describeRepositoryConformance } from "./suite";

/**
 * The PostgreSQL backend runs the same suite. Skipped without DATABASE_URL so
 * the default run stays offline.
 */
let database: TestDatabase | undefined;

const toSet = (db: TestDatabase): RepositorySet => {
  const postgres = createPostgresRepositories(db.pool);
  return {
    backend: "postgres",
    repository: postgres.repository,
    expertRepository: postgres.expertRepository,
    refreshQueue: postgres.refreshQueue,
    instrumentation: postgres.instrumentation,
    feedbackRepository: postgres.feedbackRepository,
    errorRepository: postgres.errorRepository,
    draftRepository: postgres.draftRepository,
  };
};

if (isDatabaseAvailable) {
  describeRepositoryConformance("postgres", async () => {
    database = await createTestDatabase("test_conformance");
    await migrateUp(database.pool);
    const set = toSet(database);
    return {
      set,
      reset: async () => {
        await database!.pool.query(
          `TRUNCATE ${PHASE_ONE_TABLES.join(", ")} RESTART IDENTITY CASCADE`,
        );
      },
    };
  });
}

/**
 * Guarantees that only the durable backend can make: a transaction spanning
 * two repositories commits or rolls back as one. The in-memory unit of work
 * runs the callback and cannot undo it, which is why this is not part of the
 * shared suite.
 */
describe.skipIf(!isDatabaseAvailable)("postgres transactions", () => {
  let transactional: TestDatabase;

  const freshSet = async () => {
    transactional ??= await createTestDatabase("test_transactions");
    await migrateUp(transactional.pool);
    await transactional.pool.query(
      `TRUNCATE ${PHASE_ONE_TABLES.join(", ")} RESTART IDENTITY CASCADE`,
    );
    return toSet(transactional);
  };

  afterAll(async () => {
    await dropTestDatabase(transactional);
    await dropTestDatabase(database);
  });

  it("commits work from two repositories together", async () => {
    const set = await freshSet();

    await set.repository.transaction(async () => {
      await set.repository.saveJourney(makeJourney());
      await set.repository.appendEvidence(makeEvidence());
    });

    expect(
      await set.repository.getJourney("journey_conformance_1"),
    ).not.toBeNull();
    expect(await set.repository.listEvidence()).toHaveLength(1);
  });

  it("rolls the whole unit of work back when it fails", async () => {
    const set = await freshSet();

    await expect(
      set.repository.transaction(async () => {
        await set.repository.saveJourney(makeJourney());
        await set.repository.appendEvidence(makeEvidence());
        throw new Error("EXPERT_RESULT_FAILED");
      }),
    ).rejects.toThrow("EXPERT_RESULT_FAILED");

    // Neither write survives: the journey and the evidence were one unit.
    expect(await set.repository.getJourney("journey_conformance_1")).toBeNull();
    expect(await set.repository.listEvidence()).toEqual([]);
  });

  it("rolls back across the journey and expert repositories", async () => {
    const set = await freshSet();
    await set.repository.saveConfirmedRequest(makeConfirmedRequest(1));

    await expect(
      set.repository.transaction(async () => {
        await set.repository.saveJourney(makeJourney());
        await set.expertRepository.appendAudit({
          event_id: "audit_rollback",
          request_id: "req_missing",
          event_type: "request_created",
          actor_type: "system",
          actor_ref: null,
          metadata: {},
          created_at: NOW,
        } as Parameters<typeof set.expertRepository.appendAudit>[0]);
      }),
    ).rejects.toThrow();

    // The audit insert violates its foreign key, and the journey written
    // earlier in the same transaction goes with it.
    expect(await set.repository.getJourney("journey_conformance_1")).toBeNull();
  });

  it("joins an outer transaction instead of opening a second", async () => {
    const set = await freshSet();

    await expect(
      set.repository.transaction(async () => {
        await set.repository.saveJourney(makeJourney());
        // A nested call must not commit the outer work early.
        await set.expertRepository.transaction(async () => {
          await set.repository.appendEvidence(makeEvidence());
        });
        throw new Error("OUTER_FAILED");
      }),
    ).rejects.toThrow("OUTER_FAILED");

    expect(await set.repository.getJourney("journey_conformance_1")).toBeNull();
    expect(await set.repository.listEvidence()).toEqual([]);
  });
});
