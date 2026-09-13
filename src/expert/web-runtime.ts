import { createRepositorySet } from "../persistence/repositories";
import type { ExpertRequestRepository } from "./repository";

/**
 * The repository backing the standalone expert-request API route
 * (app/api/expert-requests/route.ts).
 *
 * The backend follows DATABASE_URL the same way getBuyerJourneyRuntime()
 * does: present means PostgreSQL, absent means in-memory. The route used to
 * construct its own InMemoryExpertRequestRepository directly, so a paid
 * expert review request never survived a server restart, even with a
 * database configured. Pinning the repository to globalThis keeps it stable
 * across dev hot reloads, the same reason the runtime and the database pool
 * are pinned. Kept in its own module, not the route file, so the route's own
 * export surface stays just {POST, runtime} — see the lockdown test in
 * tests/expert/core.test.ts.
 */
const REPOSITORY_KEY = Symbol.for("reds.expert-request-repository");

type RepositoryGlobal = typeof globalThis & {
  [REPOSITORY_KEY]?: ExpertRequestRepository;
};

const repositoryGlobal = globalThis as RepositoryGlobal;

export const getExpertRequestRepository = (): ExpertRequestRepository =>
  (repositoryGlobal[REPOSITORY_KEY] ??= createRepositorySet().expertRepository);

/** For tests: forces the next call to re-read DATABASE_URL from the env. */
export const resetExpertRequestRepositoryForTests = (): void => {
  delete repositoryGlobal[REPOSITORY_KEY];
};
