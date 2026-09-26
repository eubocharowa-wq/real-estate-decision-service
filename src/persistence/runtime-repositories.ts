import { createRepositorySet, type RepositorySet } from "./repositories";

const REPOSITORY_SET_KEY = Symbol.for("reds.application-repository-set");

type RepositorySetGlobal = typeof globalThis & {
  [REPOSITORY_SET_KEY]?: RepositorySet;
};

const repositorySetGlobal = globalThis as RepositorySetGlobal;

/**
 * Process-local application composition root.
 *
 * Every HTTP runtime obtains its repositories here. With PostgreSQL the
 * repositories also share one PostgresContext, so cross-repository
 * transactions enlist on the same connection. Without DATABASE_URL this
 * keeps the development fallback coherent instead of creating a different
 * in-memory world for each route.
 */
export const getApplicationRepositorySet = (): RepositorySet =>
  (repositorySetGlobal[REPOSITORY_SET_KEY] ??= createRepositorySet());

/** Test seam: the next runtime resolves DATABASE_URL and creates a fresh set. */
export const resetApplicationRepositorySetForTests = (): void => {
  delete repositorySetGlobal[REPOSITORY_SET_KEY];
};
