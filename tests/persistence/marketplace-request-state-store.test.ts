import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  migrateUp,
  PostgresMarketplaceRequestStateStore,
} from "../../src/persistence";
import {
  createTestDatabase,
  dropTestDatabase,
  isDatabaseAvailable,
  type TestDatabase,
} from "./helpers";

describe.skipIf(!isDatabaseAvailable)(
  "PostgresMarketplaceRequestStateStore",
  () => {
    let database: TestDatabase;

    beforeAll(async () => {
      database = await createTestDatabase("test_marketplace_request_guard");
      await migrateUp(database.pool);
    });

    afterAll(async () => {
      await dropTestDatabase(database);
    });

    it("shares pending, rate, and terminal stop state across instances", async () => {
      const first = new PostgresMarketplaceRequestStateStore(database.pool);
      const second = new PostgresMarketplaceRequestStateStore(database.pool);
      const input = {
        sourceId: "src_mkt_04" as const,
        limit: { maximumRequestsPerWindow: 1, windowMs: 60_000 },
        now: new Date("2026-11-11T12:00:00.000Z"),
      };
      await expect(first.acquire(input)).resolves.toEqual({ allowed: true });
      await expect(second.acquire(input)).resolves.toMatchObject({
        allowed: false,
        reason: "guard_unavailable",
      });
      await first.complete({ sourceId: "src_mkt_04", now: input.now });
      await expect(second.acquire(input)).resolves.toMatchObject({
        allowed: false,
        reason: "rate_limit",
      });
      await second.stop({
        sourceId: "src_mkt_04",
        reason: "rate_limited",
        now: input.now,
      });
      await expect(first.acquire(input)).resolves.toEqual({
        allowed: false,
        reason: "source_stopped",
        stopReason: "rate_limited",
      });
    });
  },
);
