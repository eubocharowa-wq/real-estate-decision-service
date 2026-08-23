import type { BuyerJourneyStage } from "./contracts";
import { BuyerJourneyError } from "./errors";

const transitions: Readonly<
  Record<BuyerJourneyStage, readonly BuyerJourneyStage[]>
> = Object.freeze({
  request_entry: ["request_confirmation"],
  request_confirmation: ["matching"],
  matching: ["shortlist"],
  shortlist: [
    "request_confirmation",
    "property_detail",
    "comparison",
    "expert_request",
  ],
  property_detail: [
    "request_confirmation",
    "shortlist",
    "comparison",
    "expert_request",
  ],
  comparison: [
    "request_confirmation",
    "shortlist",
    "property_detail",
    "expert_request",
  ],
  expert_request: ["expert_in_progress", "request_confirmation"],
  expert_in_progress: ["expert_result", "request_confirmation"],
  expert_result: ["updated_decision", "request_confirmation", "shortlist"],
  updated_decision: [
    "request_confirmation",
    "shortlist",
    "property_detail",
    "comparison",
    "expert_request",
  ],
});

export const assertBuyerJourneyTransition = (
  from: BuyerJourneyStage,
  to: BuyerJourneyStage,
): void => {
  if (from === to) return;
  if (!transitions[from].includes(to))
    throw new BuyerJourneyError(
      "INVALID_TRANSITION",
      `BuyerJourney transition ${from} -> ${to} is not allowed`,
      true,
    );
};
