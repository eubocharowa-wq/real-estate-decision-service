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

export const getBuyerJourneyRuntime = (): BuyerJourneyApplication =>
  (runtimeGlobal[RUNTIME_KEY] ??= new BuyerJourneyApplication());

export const resetBuyerJourneyRuntimeForTests = (): void => {
  delete runtimeGlobal[RUNTIME_KEY];
};
