import { describe, expect, it } from "vitest";

import {
  InMemoryMarketplaceRequestStateStore,
  MarketplaceRequestGuard,
  type MarketplaceRequestStateStore,
} from "../../src/data-collection/source-adapters";

describe("MarketplaceRequestGuard", () => {
  it("counts independently per source and stops a source terminally", async () => {
    const now = new Date("2026-11-11T12:00:00.000Z");
    const guard = new MarketplaceRequestGuard(
      new InMemoryMarketplaceRequestStateStore(),
      () => now,
    );
    await expect(guard.beforeRequest("src_mkt_04")).resolves.toEqual({
      allowed: true,
    });
    await expect(guard.beforeRequest("src_mkt_01")).resolves.toEqual({
      allowed: true,
    });
    await expect(guard.beforeRequest("src_mkt_04")).resolves.toMatchObject({
      allowed: false,
      reason: "rate_limit",
    });
    await guard.stopSource("src_mkt_01", "challenge");
    await expect(guard.beforeRequest("src_mkt_01")).resolves.toEqual({
      allowed: false,
      reason: "source_stopped",
      stopReason: "challenge",
    });
  });

  it("fails closed when the state backend is unavailable", async () => {
    const failingStore: MarketplaceRequestStateStore = {
      scope: "shared",
      async acquire() {
        throw new Error("database details must not escape");
      },
      async stop() {
        throw new Error("database details must not escape");
      },
    };
    const guard = new MarketplaceRequestGuard(failingStore);
    await expect(guard.beforeRequest("src_mkt_04")).resolves.toEqual({
      allowed: false,
      reason: "guard_unavailable",
      stopReason: null,
    });
  });
});
