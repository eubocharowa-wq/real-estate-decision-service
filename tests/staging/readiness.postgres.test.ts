import { afterAll, describe, expect, it } from "vitest";

import {
  inspectDatabaseMigrationReadiness,
  migrateDown,
  migrateUp,
} from "../../src/persistence";
import {
  createTestDatabase,
  dropTestDatabase,
  isDatabaseAvailable,
  type TestDatabase,
} from "../persistence/helpers";

describe.skipIf(!isDatabaseAvailable)(
  "TASK-025 readiness against PostgreSQL",
  () => {
    let database: TestDatabase | undefined;

    afterAll(async () => {
      await dropTestDatabase(database);
    });

    it("fails before migrations, passes after up, and detects a rollback", async () => {
      database = await createTestDatabase("test_staging_readiness");

      const empty = await inspectDatabaseMigrationReadiness(database.pool);
      expect(empty).toMatchObject({
        reachable: true,
        schemaCompatible: false,
        appliedMigrationCount: 0,
      });

      await migrateUp(database.pool);
      const migrated = await inspectDatabaseMigrationReadiness(database.pool);
      expect(migrated).toMatchObject({
        reachable: true,
        schemaCompatible: true,
        expectedMigrationCount: 4,
        appliedMigrationCount: 4,
      });

      await migrateDown(database.pool, { steps: 1 });
      const rolledBack = await inspectDatabaseMigrationReadiness(database.pool);
      expect(rolledBack.schemaCompatible).toBe(false);
      expect(rolledBack.pendingVersions).toEqual(["0004"]);
    });
  },
);
