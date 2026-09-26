import { afterAll, describe, it } from "vitest";

import { BuyerJourneyApplication } from "../../src/buyer-journey";
import {
  createPostgresRepositories,
  migrateUp,
  type RepositorySet,
} from "../../src/persistence";
import {
  createTestDatabase,
  dropTestDatabase,
  isDatabaseAvailable,
  type TestDatabase,
} from "../persistence/helpers";
import {
  demoRuntimeConfig,
  runRealExpertRuntimeGoldenFlow,
} from "./real-runtime-cases";

describe.skipIf(!isDatabaseAvailable)(
  "TASK-025A real expert golden flow on PostgreSQL",
  () => {
    let database: TestDatabase | undefined;

    afterAll(async () => {
      await dropTestDatabase(database);
    });

    it("survives fresh application and workbench instances through recompute", async () => {
      database = await createTestDatabase("test_real_expert_runtime");
      await migrateUp(database.pool);
      await runRealExpertRuntimeGoldenFlow({
        open: () => {
          const postgres = createPostgresRepositories(database!.pool);
          const repositories: RepositorySet = {
            backend: "postgres",
            repository: postgres.repository,
            expertRepository: postgres.expertRepository,
            refreshQueue: postgres.refreshQueue,
            instrumentation: postgres.instrumentation,
            feedbackRepository: postgres.feedbackRepository,
            errorRepository: postgres.errorRepository,
            draftRepository: postgres.draftRepository,
          };
          return {
            repositories,
            application: new BuyerJourneyApplication({
              repository: repositories.repository,
              expertRepository: repositories.expertRepository,
              instrumentation: repositories.instrumentation,
              feedbackRepository: repositories.feedbackRepository,
              errorRepository: repositories.errorRepository,
              pilotRuntimeConfig: demoRuntimeConfig,
            }),
          };
        },
      });
    });
  },
);
