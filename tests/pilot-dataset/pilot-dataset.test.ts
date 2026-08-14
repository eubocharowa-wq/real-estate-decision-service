import { describe, expect, it } from "vitest";

import {
  loadPilotDataset,
  validatePilotDatasetIntegrity,
} from "../../src/pilot-dataset";

const dataset = loadPilotDataset();
const propertyById = new Map(
  dataset.properties.map((property) => [
    property.identity.property_id,
    property,
  ]),
);
const offerById = new Map(
  dataset.offers.map((offer) => [offer.offer_id, offer]),
);

describe("TASK-005 pilot fixture contracts", () => {
  it("loads every entity and ground-truth file through formal schemas", () => {
    expect(dataset.metadata.dataset_type).toBe("synthetic_pilot");
    expect(dataset.metadata.dataset_version).toBe("1.0.0");
    expect(dataset.properties).toHaveLength(36);
    expect(dataset.offers).toHaveLength(46);
  });

  it("passes referential and semantic integrity validation", () => {
    expect(validatePilotDatasetIntegrity(dataset)).toEqual([]);
  });

  it("uses unique stable IDs for every defined entity", () => {
    const ids = [
      ...dataset.properties.map((item) => item.identity.property_id),
      ...dataset.offers.map((item) => item.offer_id),
      ...dataset.sources.map((item) => item.source_id),
      ...dataset.fieldEvidence.map((item) => item.evidence_id),
      ...dataset.sourceConflicts.map((item) => item.conflict_id),
      ...dataset.financingPrograms.map((item) => item.program_id),
      ...dataset.financingOffers.map((item) => item.financing_offer_id),
      ...dataset.promotions.map((item) => item.promotion_id),
      ...dataset.propertyFinancingEligibility.map(
        (item) => item.eligibility_id,
      ),
      ...dataset.purchaseScenarios.map((item) => item.scenario_id),
      ...dataset.userRequests.map((item) => item.user_request_id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z][a-z0-9:_-]*$/.test(id))).toBe(true);
  });

  it("keeps physical Property separate from commercial Offer", () => {
    const multiOfferProperties = new Set(
      dataset.duplicateClusters.map((cluster) => cluster.property_id),
    );
    expect(multiOfferProperties.size).toBeGreaterThanOrEqual(5);
    expect(
      dataset.properties.every((property) => !("listing_price" in property)),
    ).toBe(true);
    expect(
      dataset.offers.every((offer) => propertyById.has(offer.property_id)),
    ).toBe(true);
  });

  it("meets the required property and Offer coverage", () => {
    const newBuild = dataset.properties.filter(
      (property) => property.market_type === "new_build",
    );
    const secondary = dataset.properties.filter(
      (property) => property.market_type === "secondary",
    );
    const houses = dataset.properties.filter((property) =>
      ["house", "townhouse"].includes(property.property_type),
    );
    const landOrSpecial = dataset.properties.filter(
      (property) =>
        property.property_type === "land" ||
        property.identity.canonical_key === null,
    );

    expect(newBuild.length).toBeGreaterThanOrEqual(12);
    expect(newBuild.length).toBeLessThanOrEqual(18);
    expect(secondary.length).toBeGreaterThanOrEqual(10);
    expect(houses.length).toBeGreaterThanOrEqual(6);
    expect(landOrSpecial.length).toBeGreaterThanOrEqual(2);
    expect(dataset.offers.length).toBeGreaterThanOrEqual(40);
    expect(dataset.offers.length).toBeLessThanOrEqual(70);
  });

  it("contains at least five valid duplicate clusters", () => {
    expect(dataset.duplicateClusters.length).toBeGreaterThanOrEqual(5);
    for (const cluster of dataset.duplicateClusters) {
      expect(cluster.offer_ids.length).toBeGreaterThanOrEqual(2);
      expect(
        cluster.offer_ids.every(
          (offerId) =>
            offerById.get(offerId)?.property_id === cluster.property_id,
        ),
      ).toBe(true);
    }
  });

  it("keeps at least three similar-but-different pairs split", () => {
    expect(dataset.falseDuplicatePairs.length).toBeGreaterThanOrEqual(3);
    for (const pair of dataset.falseDuplicatePairs) {
      expect(pair.property_ids[0]).not.toBe(pair.property_ids[1]);
      expect(pair.expected_relation).toBe("different_property");
    }
  });

  it("covers all required synthetic source categories", () => {
    const types = new Set(dataset.sources.map((source) => source.source_type));
    for (const required of [
      "developer_site",
      "classified",
      "agency_site",
      "bank_site",
      "government",
      "user_link",
      "manual_expert",
    ]) {
      expect(types.has(required as never)).toBe(true);
    }
    expect(dataset.sources.length).toBeGreaterThanOrEqual(6);
    expect(
      dataset.sources.every((source) =>
        source.policy_metadata.notes?.includes("Synthetic"),
      ),
    ).toBe(true);
  });

  it("covers verification and freshness status semantics", () => {
    const verification = new Set(
      dataset.fieldEvidence.map((item) => item.verification_status),
    );
    const freshness = new Set([
      ...dataset.fieldEvidence.map((item) => item.freshness_status),
      ...dataset.offers.map((item) => item.freshness_status),
      ...dataset.promotions.map((item) => item.freshness_status),
    ]);
    expect(verification).toEqual(
      new Set([
        "confirmed",
        "claimed",
        "unconfirmed",
        "conflicting",
        "stale",
        "unknown",
      ]),
    );
    expect(freshness).toEqual(
      new Set(["fresh", "aging", "stale", "expired", "unknown"]),
    );
  });

  it("preserves five unresolved property price conflicts", () => {
    const priceConflicts = dataset.sourceConflicts.filter(
      (conflict) => conflict.field === "listing_price",
    );
    expect(priceConflicts).toHaveLength(5);
    expect(
      priceConflicts.every(
        (conflict) =>
          conflict.status === "open" && conflict.evidence_ids.length >= 2,
      ),
    ).toBe(true);
  });

  it("preserves area, floor, handover and initial-payment conflicts", () => {
    const fields = new Set(
      dataset.sourceConflicts.map((conflict) => conflict.field),
    );
    expect(fields.has("physical.total_area_m2")).toBe(true);
    expect(fields.has("physical.floor")).toBe(true);
    expect(fields.has("timeline.handover_date")).toBe(true);
    expect(fields.has("initial_payment")).toBe(true);
  });

  it("covers availability without inferring removed as sold", () => {
    const availability = new Set(
      dataset.offers.map((offer) => offer.availability),
    );
    expect(availability).toEqual(
      new Set([
        "available",
        "reserved",
        "sold",
        "temporarily_unavailable",
        "unknown",
      ]),
    );
    const removed = offerById.get("offer_sec_006_primary");
    expect(removed?.availability).toBe("unknown");
    expect(removed?.freshness_status).toBe("expired");
    expect(removed?.commercial_terms.notes).toContain("listing_removed");
  });

  it("does not replace unknown template values with convenient defaults", () => {
    const template = propertyById.get("prop_special_template_001");
    const templateOffer = offerById.get("offer_special_template_001_primary");
    expect(template?.identity.canonical_key).toBeNull();
    expect(template?.physical.total_area_m2).toBeNull();
    expect(template?.physical.balcony).toBeNull();
    expect(template?.physical.bathrooms).toBeNull();
    expect(new Set(Object.values(template?.utilities ?? {}))).toEqual(
      new Set(["unknown"]),
    );
    expect(templateOffer?.price_from).toBe(true);
    expect(templateOffer?.availability).toBe("unknown");
  });

  it("has enough stale critical commercial cases", () => {
    const stalePropertyIds = new Set(
      dataset.offers
        .filter((offer) =>
          ["stale", "expired"].includes(offer.freshness_status),
        )
        .map((offer) => offer.property_id),
    );
    expect(stalePropertyIds.size).toBeGreaterThanOrEqual(5);
  });

  it("contains highly complete, partial and sparse data cases", () => {
    const tags = new Set(
      Object.values(dataset.fixtureNotes.properties).flatMap(
        (note) => note.fixture_tags,
      ),
    );
    expect(tags.has("highly_complete")).toBe(true);
    expect(tags.has("partially_complete")).toBe(true);
    expect(tags.has("sparse_property")).toBe(true);
  });

  it("covers financing programs, offers, eligibility and scenarios", () => {
    expect(dataset.financingPrograms.length).toBeGreaterThanOrEqual(2);
    expect(dataset.financingPrograms.length).toBeLessThanOrEqual(3);
    expect(dataset.financingOffers.length).toBeGreaterThanOrEqual(4);
    expect(dataset.propertyFinancingEligibility.length).toBeGreaterThanOrEqual(
      10,
    );
    expect(dataset.purchaseScenarios.length).toBeGreaterThanOrEqual(10);
    expect(dataset.purchaseScenarios.length).toBeLessThanOrEqual(20);
  });

  it("preserves claimed eligibility and every zero-down variant", () => {
    const claimed = dataset.propertyFinancingEligibility.find(
      (item) => item.eligibility_status === "claimed",
    );
    expect(claimed?.verification_status).toBe("claimed");

    const zeroStatuses = new Set(
      dataset.propertyFinancingEligibility.map(
        (item) => item.initial_payment.zero_payment_status,
      ),
    );
    expect(zeroStatuses.has("available")).toBe(true);
    expect(zeroStatuses.has("claimed")).toBe(true);
    expect(zeroStatuses.has("not_available")).toBe(true);
    expect(zeroStatuses.has("unknown")).toBe(true);

    const priceIncrease = dataset.financingOffers.find(
      (item) => item.financing_offer_id === "finoffer_family_zero_confirmed",
    );
    expect(priceIncrease?.price_impact.kind).toBe("increase");
  });

  it("keeps staged rate periods and installment balloon payment explicit", () => {
    const staged = dataset.financingOffers.find(
      (item) => item.financing_offer_id === "finoffer_staged_rate",
    );
    expect(staged?.rate_structure.periods).toHaveLength(2);
    expect(staged?.rate_structure.periods[0]?.rate_percent).toBe("0.10");
    expect(staged?.rate_structure.after_introductory_period_rate_percent).toBe(
      "12.00",
    );

    const installment = dataset.purchaseScenarios.find(
      (item) => item.scenario_id === "scenario_nb_008_installment",
    );
    expect(installment?.mandatory_costs[0]?.name).toBe("Final balloon payment");
    expect(installment?.financing_offer_id).toBe(
      "finoffer_installment_balloon",
    );
  });

  it("prevents Frankenstein financing combinations", () => {
    const guardrail = dataset.financingCompatibility[0];
    expect(guardrail?.forbidden_combinations).toContainEqual(
      expect.objectContaining({
        price_offer_id: "offer_nb_001_primary",
        financing_offer_id: "finoffer_family_zero_confirmed",
      }),
    );
    expect(
      dataset.purchaseScenarios.some(
        (scenario) =>
          scenario.offer_id === "offer_nb_001_primary" &&
          scenario.financing_offer_id === "finoffer_family_zero_confirmed",
      ),
    ).toBe(false);
  });

  it("provides normalized infrastructure and destination evidence", () => {
    const fields = new Set(dataset.fieldEvidence.map((item) => item.field));
    expect(fields.has("infrastructure.school.walk_time_min")).toBe(true);
    expect(fields.has("infrastructure.kindergarten.walk_time_min")).toBe(true);
    expect(fields.has("infrastructure.park.walk_time_min")).toBe(true);
    expect(fields.has("infrastructure.transport.walk_time_min")).toBe(true);
    expect(
      fields.has("mobility.user_destination.public_transport_time_min"),
    ).toBe(true);
  });

  it("defines three cross-type/trade-off comparison groups without a winner", () => {
    expect(dataset.comparisonGroups).toHaveLength(3);
    expect(
      dataset.comparisonGroups.every((group) => group.winner === null),
    ).toBe(true);
    const apartmentVsHouse = dataset.comparisonGroups.find(
      (group) => group.group_id === "comparison_apartment_vs_house",
    );
    const types = apartmentVsHouse?.property_ids.map(
      (id) => propertyById.get(id)?.property_type,
    );
    expect(types).toContain("apartment");
    expect(types).toContain("house");
  });

  it("loads five valid UserRequest benchmark fixtures", () => {
    expect(dataset.userRequests).toHaveLength(5);
    expect(
      dataset.userRequests.map((request) => request.user_request_id),
    ).toEqual([
      "request_pilot_a",
      "request_pilot_b",
      "request_pilot_c",
      "request_pilot_d",
      "request_pilot_e",
    ]);
  });

  it("keeps every benchmark manifest reference resolvable", () => {
    const requestIds = new Set(
      dataset.userRequests.map((request) => request.user_request_id),
    );
    for (const item of dataset.benchmarkManifest.cases) {
      expect(item.property_ids.every((id) => propertyById.has(id))).toBe(true);
      expect(item.offer_ids.every((id) => offerById.has(id))).toBe(true);
      expect(
        item.relevant_user_request_ids.every((id) => requestIds.has(id)),
      ).toBe(true);
    }
  });

  it("returns deterministic sorted results on every load", () => {
    const second = loadPilotDataset();
    expect(second).toEqual(dataset);
    const propertyIds = dataset.properties.map(
      (property) => property.identity.property_id,
    );
    const offerIds = dataset.offers.map((offer) => offer.offer_id);
    expect(propertyIds).toEqual([...propertyIds].sort());
    expect(offerIds).toEqual([...offerIds].sort());
  });
});
