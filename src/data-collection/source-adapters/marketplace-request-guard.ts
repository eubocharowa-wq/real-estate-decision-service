import {
  AVITO_SOURCE_ID,
  CIAN_SOURCE_ID,
  MARKETPLACE_REQUEST_GUARD_CONFIG,
} from "./config";

export type MarketplaceGuardSourceId =
  typeof CIAN_SOURCE_ID | typeof AVITO_SOURCE_ID;
export type MarketplaceStopReason =
  "access_denied" | "rate_limited" | "challenge";

export interface MarketplaceRequestLimit {
  readonly maximumRequestsPerWindow: number;
  readonly windowMs: number;
}

export type MarketplaceRequestDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: "rate_limit" | "source_stopped" | "guard_unavailable";
      readonly stopReason: MarketplaceStopReason | null;
    };

export interface MarketplaceRequestStateStore {
  /** `shared` means the implementation coordinates multiple app instances. */
  readonly scope: "process" | "shared" | "unavailable";
  acquire(input: {
    readonly sourceId: MarketplaceGuardSourceId;
    readonly limit: MarketplaceRequestLimit;
    readonly now: Date;
  }): Promise<MarketplaceRequestDecision>;
  stop(input: {
    readonly sourceId: MarketplaceGuardSourceId;
    readonly reason: MarketplaceStopReason;
    readonly now: Date;
  }): Promise<void>;
}

interface ProcessState {
  windowStartedAtMs: number;
  requestCount: number;
  stopReason: MarketplaceStopReason | null;
}

/** Offline/dev store. It is deliberately marked process-local. */
export class InMemoryMarketplaceRequestStateStore implements MarketplaceRequestStateStore {
  readonly scope = "process" as const;
  private readonly states = new Map<MarketplaceGuardSourceId, ProcessState>();

  async acquire({
    sourceId,
    limit,
    now,
  }: Parameters<
    MarketplaceRequestStateStore["acquire"]
  >[0]): Promise<MarketplaceRequestDecision> {
    const nowMs = now.getTime();
    const current = this.states.get(sourceId);
    if (current?.stopReason)
      return {
        allowed: false,
        reason: "source_stopped",
        stopReason: current.stopReason,
      };
    if (!current || nowMs - current.windowStartedAtMs >= limit.windowMs) {
      this.states.set(sourceId, {
        windowStartedAtMs: nowMs,
        requestCount: 1,
        stopReason: null,
      });
      return { allowed: true };
    }
    if (current.requestCount >= limit.maximumRequestsPerWindow)
      return { allowed: false, reason: "rate_limit", stopReason: null };
    current.requestCount += 1;
    return { allowed: true };
  }

  async stop({
    sourceId,
    reason,
    now,
  }: Parameters<MarketplaceRequestStateStore["stop"]>[0]): Promise<void> {
    const current = this.states.get(sourceId);
    this.states.set(sourceId, {
      windowStartedAtMs: current?.windowStartedAtMs ?? now.getTime(),
      requestCount: current?.requestCount ?? 0,
      stopReason: current?.stopReason ?? reason,
    });
  }
}

export class UnavailableMarketplaceRequestStateStore implements MarketplaceRequestStateStore {
  readonly scope = "unavailable" as const;

  async acquire(): Promise<MarketplaceRequestDecision> {
    return {
      allowed: false,
      reason: "guard_unavailable",
      stopReason: null,
    };
  }

  async stop(): Promise<void> {
    throw new Error("MARKETPLACE_REQUEST_GUARD_UNAVAILABLE");
  }
}

/**
 * Application guard used by adapters. A local stop cache prevents another
 * request in this process even if a shared-store stop operation fails.
 */
export class MarketplaceRequestGuard {
  private readonly locallyStopped = new Map<
    MarketplaceGuardSourceId,
    MarketplaceStopReason
  >();

  constructor(
    private readonly store: MarketplaceRequestStateStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  get storeScope(): MarketplaceRequestStateStore["scope"] {
    return this.store.scope;
  }

  async beforeRequest(
    sourceId: MarketplaceGuardSourceId,
  ): Promise<MarketplaceRequestDecision> {
    const localReason = this.locallyStopped.get(sourceId);
    if (localReason)
      return {
        allowed: false,
        reason: "source_stopped",
        stopReason: localReason,
      };
    const limit = MARKETPLACE_REQUEST_GUARD_CONFIG.sources[sourceId];
    try {
      return await this.store.acquire({
        sourceId,
        limit,
        now: this.clock(),
      });
    } catch {
      return {
        allowed: false,
        reason: "guard_unavailable",
        stopReason: null,
      };
    }
  }

  async stopSource(
    sourceId: MarketplaceGuardSourceId,
    reason: MarketplaceStopReason,
  ): Promise<void> {
    this.locallyStopped.set(sourceId, reason);
    await this.store.stop({ sourceId, reason, now: this.clock() });
  }
}
