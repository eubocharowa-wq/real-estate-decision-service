import type { Pool, PoolClient } from "pg";

import type {
  MarketplaceRequestDecision,
  MarketplaceRequestStateStore,
  MarketplaceStopReason,
} from "../../data-collection/source-adapters/marketplace-request-guard";

interface RequestStateRow {
  readonly window_started_at: Date;
  readonly request_count: number;
  readonly stop_reason: MarketplaceStopReason | null;
  readonly outcome_pending: boolean;
}

const rollback = async (client: PoolClient): Promise<void> => {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The deterministic public error below intentionally hides DB details.
  }
};

/**
 * Shared, atomic marketplace request guard backed by PostgreSQL. Advisory
 * transaction locks serialize each source across every application instance.
 */
export class PostgresMarketplaceRequestStateStore implements MarketplaceRequestStateStore {
  readonly scope = "shared" as const;

  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async acquire({
    sourceId,
    limit,
  }: Parameters<
    MarketplaceRequestStateStore["acquire"]
  >[0]): Promise<MarketplaceRequestDecision> {
    const client = await this.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        sourceId,
      ]);
      const nowResult = await client.query<{ now: Date }>(
        "SELECT clock_timestamp() AS now",
      );
      const now = nowResult.rows[0]!.now;
      const stateResult = await client.query<RequestStateRow>(
        `SELECT window_started_at, request_count, stop_reason, outcome_pending
         FROM marketplace_source_request_state
         WHERE source_id = $1
         FOR UPDATE`,
        [sourceId],
      );
      const state = stateResult.rows[0];
      if (state?.stop_reason) {
        await client.query("COMMIT");
        return {
          allowed: false,
          reason: "source_stopped",
          stopReason: state.stop_reason,
        };
      }
      if (state?.outcome_pending) {
        await client.query("COMMIT");
        return {
          allowed: false,
          reason: "guard_unavailable",
          stopReason: null,
        };
      }
      if (!state) {
        await client.query(
          `INSERT INTO marketplace_source_request_state (
             source_id, window_started_at, request_count, outcome_pending, stop_reason,
             stopped_at, updated_at
           ) VALUES ($1, $2, 1, true, NULL, NULL, $2)`,
          [sourceId, now],
        );
        await client.query("COMMIT");
        return { allowed: true };
      }
      const windowExpired =
        now.getTime() - state.window_started_at.getTime() >= limit.windowMs;
      if (windowExpired) {
        await client.query(
          `UPDATE marketplace_source_request_state
           SET window_started_at = $2, request_count = 1,
               outcome_pending = true, updated_at = $2
           WHERE source_id = $1`,
          [sourceId, now],
        );
        await client.query("COMMIT");
        return { allowed: true };
      }
      if (state.request_count >= limit.maximumRequestsPerWindow) {
        await client.query("COMMIT");
        return { allowed: false, reason: "rate_limit", stopReason: null };
      }
      await client.query(
        `UPDATE marketplace_source_request_state
         SET request_count = request_count + 1, outcome_pending = true,
             updated_at = $2
         WHERE source_id = $1`,
        [sourceId, now],
      );
      await client.query("COMMIT");
      return { allowed: true };
    } catch {
      await rollback(client);
      throw new Error("MARKETPLACE_REQUEST_GUARD_STORE_FAILED");
    } finally {
      client.release();
    }
  }

  async stop({
    sourceId,
    reason,
  }: Parameters<MarketplaceRequestStateStore["stop"]>[0]): Promise<void> {
    const client = await this.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        sourceId,
      ]);
      await client.query(
        `INSERT INTO marketplace_source_request_state (
           source_id, window_started_at, request_count, outcome_pending, stop_reason,
           stopped_at, updated_at
         ) VALUES ($1, clock_timestamp(), 0, false, $2, clock_timestamp(), clock_timestamp())
         ON CONFLICT (source_id) DO UPDATE
         SET stop_reason = COALESCE(marketplace_source_request_state.stop_reason, EXCLUDED.stop_reason),
             stopped_at = COALESCE(marketplace_source_request_state.stopped_at, EXCLUDED.stopped_at),
             outcome_pending = false,
             updated_at = EXCLUDED.updated_at`,
        [sourceId, reason],
      );
      await client.query("COMMIT");
    } catch {
      await rollback(client);
      throw new Error("MARKETPLACE_REQUEST_GUARD_STORE_FAILED");
    } finally {
      client.release();
    }
  }

  async complete({
    sourceId,
  }: Parameters<MarketplaceRequestStateStore["complete"]>[0]): Promise<void> {
    const client = await this.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        sourceId,
      ]);
      const result = await client.query(
        `UPDATE marketplace_source_request_state
         SET outcome_pending = false, updated_at = clock_timestamp()
         WHERE source_id = $1
           AND outcome_pending = true
           AND stop_reason IS NULL
         RETURNING source_id`,
        [sourceId],
      );
      if (result.rowCount !== 1)
        throw new Error("MARKETPLACE_REQUEST_GUARD_STATE_INVALID");
      await client.query("COMMIT");
    } catch {
      await rollback(client);
      throw new Error("MARKETPLACE_REQUEST_GUARD_STORE_FAILED");
    } finally {
      client.release();
    }
  }

  private async connect(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch {
      throw new Error("MARKETPLACE_REQUEST_GUARD_STORE_FAILED");
    }
  }
}
