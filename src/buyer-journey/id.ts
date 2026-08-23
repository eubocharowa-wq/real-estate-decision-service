export type BuyerJourneyIdKind =
  | "journey"
  | "parsed_request"
  | "matching_bundle"
  | "comparison"
  | "decision_update"
  | "evidence"
  | "canonical_overlay"
  | "expert";

export type BuyerJourneyIdFactory = (kind: BuyerJourneyIdKind) => string;

export const createSequentialBuyerJourneyIdFactory = (
  namespace = "buyer_journey",
): BuyerJourneyIdFactory => {
  let sequence = 0;
  return (kind) => `${namespace}_${kind}_${++sequence}`;
};
