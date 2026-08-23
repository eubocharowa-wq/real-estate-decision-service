import type { CanonicalDecisionOverlay } from "./contracts";

export const BUYER_JOURNEY_POLICY_V1 = Object.freeze({
  version: "buyer-journey-policy-v1",
  comparison: { minimum: 2, maximum: 4 },
  canonicalOverlayFields: {
    property: [
      "physical.rooms",
      "physical.floor",
      "physical.total_area_m2",
      "timeline.handover_date",
    ],
    offer: [
      "listing_price",
      "price_from",
      "availability",
      "verification_status",
      "freshness_status",
    ],
    purchase_scenario: [
      "verification_status",
      "freshness_status",
      "terms_compatibility_status",
    ],
    property_financing_eligibility: [
      "eligibility_status",
      "verification_status",
      "freshness_status",
      "initial_payment.zero_payment_status",
      "applicability_evidence_refs",
    ],
  } satisfies Readonly<
    Record<CanonicalDecisionOverlay["entity_type"], readonly string[]>
  >,
});

export const isJourneyCanonicalFieldAllowed = (
  entityType: CanonicalDecisionOverlay["entity_type"],
  field: string,
): boolean =>
  BUYER_JOURNEY_POLICY_V1.canonicalOverlayFields[entityType].includes(field);
