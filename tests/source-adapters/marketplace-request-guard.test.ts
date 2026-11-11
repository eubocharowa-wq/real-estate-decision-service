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
    await guard.completeRequest("src_mkt_04");
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
      async complete() {
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

  it("keeps every instance fail-closed when terminal-stop persistence is uncertain", async () => {
    let outcomePending = false;
    const sharedStore: MarketplaceRequestStateStore = {
      scope: "shared",
      async acquire() {
        if (outcomePending)
          return {
            allowed: false,
            reason: "guard_unavailable",
            stopReason: null,
          };
        outcomePending = true;
        return { allowed: true };
      },
      async stop() {
        throw new Error("terminal stop could not be persisted");
      },
      async complete() {
        outcomePending = false;
      },
    };
    const firstInstance = new MarketplaceRequestGuard(sharedStore);
    const secondInstance = new MarketplaceRequestGuard(sharedStore);

    await expect(firstInstance.beforeRequest("src_mkt_04")).resolves.toEqual({
      allowed: true,
    });
    await expect(
      firstInstance.stopSource("src_mkt_04", "challenge"),
    ).rejects.toThrow("terminal stop could not be persisted");
    await expect(firstInstance.beforeRequest("src_mkt_04")).resolves.toEqual({
      allowed: false,
      reason: "source_stopped",
      stopReason: "challenge",
    });
    await expect(secondInstance.beforeRequest("src_mkt_04")).resolves.toEqual({
      allowed: false,
      reason: "guard_unavailable",
      stopReason: null,
    });
  });
});
