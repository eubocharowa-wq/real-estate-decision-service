import { AsyncLocalStorage } from "node:async_hooks";

import { Kysely, PostgresDialect, type Transaction } from "kysely";
import type { Pool } from "pg";

import type { Database } from "./database";

/**
 * Shared execution context.
 *
 * The repository contracts take no transaction argument — `transaction(work)`
 * receives a callback and nothing else. To make a flow that writes through two
 * repositories atomic, the transaction has to reach them some other way, and
 * AsyncLocalStorage is that way: `transaction` opens a Kysely transaction and
 * runs the callback inside a store holding it, so every repository built on
 * the same context picks the transaction up instead of the pool.
 *
 * This is what closes the gap the in-memory unit of work left open:
 * applyExpertResultToJourney touches the journey and the expert repository,
 * and both now run on one connection.
 */
export class PostgresContext {
  private readonly storage = new AsyncLocalStorage<Transaction<Database>>();

  constructor(readonly db: Kysely<Database>) {}

  /** The transaction in scope, or the pool when there is none. */
  get executor(): Kysely<Database> | Transaction<Database> {
    return this.storage.getStore() ?? this.db;
  }

  /** True while a transaction is in scope on this async path. */
  get inTransaction(): boolean {
    return this.storage.getStore() !== undefined;
  }

  /**
   * Runs `work` inside a transaction. Nested calls join the outer one rather
   * than opening a second: the callback of a flow that already owns a
   * transaction must not commit half of it.
   */
  transaction<T>(work: () => Promise<T>): Promise<T> {
    const existing = this.storage.getStore();
    if (existing) return work();
    return this.db
      .transaction()
      .execute((trx) => this.storage.run(trx, () => work()));
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
  }
}

export const createPostgresContext = (pool: Pool): PostgresContext =>
  new PostgresContext(
    new Kysely<Database>({ dialect: new PostgresDialect({ pool }) }),
  );
