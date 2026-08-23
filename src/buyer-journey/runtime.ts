import { BuyerJourneyApplication } from "./application";

let runtime: BuyerJourneyApplication | null = null;

/** Session-scoped pilot runtime. Production persistence remains out of scope. */
export const getBuyerJourneyRuntime = (): BuyerJourneyApplication =>
  (runtime ??= new BuyerJourneyApplication());

export const resetBuyerJourneyRuntimeForTests = (): void => {
  runtime = null;
};
