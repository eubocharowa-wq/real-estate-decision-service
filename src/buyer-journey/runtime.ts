import { createRepositorySet } from "../persistence/repositories";
import { BuyerJourneyApplication } from "./application";

/**
 * The runtime used to be a module-scoped `let`. That is not a singleton in any
 * deployment with more than one process: each server instance, and in
 * development each module registry after a hot reload, held its own journeys,
 * so two requests from the same buyer could land on different in-memory
 * states. Pinning it to `globalThis` makes the instance genuinely shared
 * within a process and stable across hot reloads.
 *
 * This narrows the bug, it does not close it: separate processes still hold
 * separate memory. Durable storage is what actually fixes that, and these
 * repositories are now asynchronous so it can be implemented behind the same
 * contracts.
 */
const RUNTIME_KEY = Symbol.for("reds.buyer-journey-runtime");

type RuntimeGlobal = typeof globalThis & {
  [RUNTIME_KEY]?: BuyerJourneyApplication;
};

const runtimeGlobal = globalThis as RuntimeGlobal;

/**
 * The backend follows the configuration: DATABASE_URL present means the
 * PostgreSQL repositories, absent means in-memory. Nothing else in the
 * application knows which one it got.
 */
const createRuntime = (): BuyerJourneyApplication => {
  const repositories = createRepositorySet();
  return new BuyerJourneyApplication({
    repository: repositories.repository,
    expertRepository: repositories.expertRepository,
    instrumentation: repositories.instrumentation,
    feedbackRepository: repositories.feedbackRepository,
    errorRepository: repositories.errorRepository,
  });
};

export const getBuyerJourneyRuntime = (): BuyerJourneyApplication =>
  (runtimeGlobal[RUNTIME_KEY] ??= createRuntime());

export const resetBuyerJourneyRuntimeForTests = (): void => {
  delete runtimeGlobal[RUNTIME_KEY];
};
