import type { PilotDataset } from "./loader";

export interface PilotDatasetIntegrityIssue {
  readonly code: string;
  readonly message: string;
}

const collectDuplicates = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
};

export const validatePilotDatasetIntegrity = (
  dataset: PilotDataset,
): readonly PilotDatasetIntegrityIssue[] => {
  const issues: PilotDatasetIntegrityIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  const requireReference = (
    collection: ReadonlySet<string>,
    id: string,
    context: string,
  ) => {
    if (!collection.has(id)) add("missing_reference", `${context}: ${id}`);
  };

  const propertyIdValues = dataset.properties.map(
    (item) => item.identity.property_id,
  );
  const offerIdValues = dataset.offers.map((item) => item.offer_id);
  const sourceIdValues = dataset.sources.map((item) => item.source_id);
  const evidenceIdValues = dataset.fieldEvidence.map(
    (item) => item.evidence_id,
  );
  const programIdValues = dataset.financingPrograms.map(
    (item) => item.program_id,
  );
  const financingOfferIdValues = dataset.financingOffers.map(
    (item) => item.financing_offer_id,
  );
  const promotionIdValues = dataset.promotions.map((item) => item.promotion_id);
  const eligibilityIdValues = dataset.propertyFinancingEligibility.map(
    (item) => item.eligibility_id,
  );
  const scenarioIdValues = dataset.purchaseScenarios.map(
    (item) => item.scenario_id,
  );
  const userRequestIdValues = dataset.userRequests.map(
    (item) => item.user_request_id,
  );
  const propertyIds = new Set(propertyIdValues);
  const offerIds = new Set(offerIdValues);
  const sourceIds = new Set(sourceIdValues);
  const evidenceIds = new Set(evidenceIdValues);
  const programIds = new Set(programIdValues);
  const financingOfferIds = new Set(financingOfferIdValues);
  const promotionIds = new Set(promotionIdValues);
  const eligibilityIds = new Set(eligibilityIdValues);
  const scenarioIds = new Set(scenarioIdValues);
  const userRequestIds = new Set(userRequestIdValues);
  const allEntityIds = new Set([
    ...propertyIds,
    ...offerIds,
    ...sourceIds,
    ...programIds,
    ...financingOfferIds,
    ...promotionIds,
    ...eligibilityIds,
    ...scenarioIds,
  ]);

  const idGroups: readonly [string, readonly string[]][] = [
    ["properties", propertyIdValues],
    ["offers", offerIdValues],
    ["sources", sourceIdValues],
    ["field evidence", evidenceIdValues],
    [
      "source conflicts",
      dataset.sourceConflicts.map((item) => item.conflict_id),
    ],
    ["financing programs", programIdValues],
    ["financing offers", financingOfferIdValues],
    ["promotions", promotionIdValues],
    ["eligibility", eligibilityIdValues],
    ["purchase scenarios", scenarioIdValues],
    ["user requests", userRequestIdValues],
  ];
  for (const [name, ids] of idGroups) {
    const duplicates = collectDuplicates(ids);
    if (duplicates.length > 0) {
      add("duplicate_id", `${name}: ${duplicates.join(", ")}`);
    }
  }
  const globallyDefinedIds = idGroups.flatMap(([, ids]) => ids);
  const globalDuplicates = collectDuplicates(globallyDefinedIds);
  if (globalDuplicates.length > 0) {
    add("duplicate_global_id", globalDuplicates.join(", "));
  }

  if (dataset.metadata.property_count !== dataset.properties.length) {
    add("metadata_count", "metadata.property_count does not match fixtures");
  }
  if (dataset.metadata.offer_count !== dataset.offers.length) {
    add("metadata_count", "metadata.offer_count does not match fixtures");
  }
  if (
    dataset.benchmarkManifest.dataset_id !== dataset.metadata.dataset_id ||
    dataset.benchmarkManifest.dataset_version !==
      dataset.metadata.dataset_version
  ) {
    add("manifest_identity", "benchmark manifest does not match metadata");
  }

  for (const property of dataset.properties) {
    for (const evidenceId of property.metadata.evidence_refs) {
      requireReference(
        evidenceIds,
        evidenceId,
        `Property ${property.identity.property_id} evidence`,
      );
    }
  }

  for (const offer of dataset.offers) {
    requireReference(
      propertyIds,
      offer.property_id,
      `Offer ${offer.offer_id} property`,
    );
    requireReference(
      sourceIds,
      offer.source_reference.source_id,
      `Offer ${offer.offer_id} source`,
    );
    for (const evidenceId of [
      ...offer.evidence_refs,
      ...offer.source_reference.evidence_ids,
    ]) {
      requireReference(
        evidenceIds,
        evidenceId,
        `Offer ${offer.offer_id} evidence`,
      );
    }
    for (const id of offer.financing_offer_ids) {
      requireReference(
        financingOfferIds,
        id,
        `Offer ${offer.offer_id} financing`,
      );
    }
    for (const id of offer.promotion_ids) {
      requireReference(promotionIds, id, `Offer ${offer.offer_id} promotion`);
    }
    if (offer.availability === "sold" && offer.freshness_status === "fresh") {
      const notes = offer.commercial_terms.notes.join(" ");
      if (notes.includes("currently_available")) {
        add("availability_conflict", `${offer.offer_id} is sold and available`);
      }
    }
    if (offer.price_from === true) {
      const property = dataset.properties.find(
        (item) => item.identity.property_id === offer.property_id,
      );
      if (property?.identity.canonical_key !== null) {
        add(
          "price_from_concrete_unit",
          `${offer.offer_id} is price_from but references a concrete unit`,
        );
      }
    }
  }

  for (const evidence of dataset.fieldEvidence) {
    requireReference(
      allEntityIds,
      evidence.entity_id,
      `Evidence ${evidence.evidence_id} entity`,
    );
    requireReference(
      sourceIds,
      evidence.source_id,
      `Evidence ${evidence.evidence_id} source`,
    );
    if (
      evidence.verification_status === "confirmed" &&
      evidence.evidence_text === null &&
      evidence.evidence_reference === null
    ) {
      add(
        "confirmed_without_evidence",
        `${evidence.evidence_id} is confirmed without evidence detail`,
      );
    }
    if (
      evidence.verification_status === "stale" &&
      evidence.freshness_status !== "stale" &&
      evidence.freshness_status !== "expired"
    ) {
      add(
        "stale_without_freshness",
        `${evidence.evidence_id} is stale without stale freshness`,
      );
    }
  }

  for (const conflict of dataset.sourceConflicts) {
    requireReference(
      allEntityIds,
      conflict.entity_id,
      `Conflict ${conflict.conflict_id}`,
    );
    for (const evidenceId of conflict.evidence_ids) {
      requireReference(
        evidenceIds,
        evidenceId,
        `Conflict ${conflict.conflict_id} evidence`,
      );
    }
  }

  for (const program of dataset.financingPrograms) {
    for (const reference of program.source_references) {
      requireReference(
        sourceIds,
        reference.source_id,
        `Program ${program.program_id} source`,
      );
    }
  }

  for (const financingOffer of dataset.financingOffers) {
    requireReference(
      programIds,
      financingOffer.program_id,
      `Financing offer ${financingOffer.financing_offer_id} program`,
    );
    requireReference(
      sourceIds,
      financingOffer.source_reference.source_id,
      `Financing offer ${financingOffer.financing_offer_id} source`,
    );
    for (const evidenceId of financingOffer.evidence_refs) {
      requireReference(
        evidenceIds,
        evidenceId,
        `Financing offer ${financingOffer.financing_offer_id} evidence`,
      );
    }
  }

  for (const promotion of dataset.promotions) {
    for (const id of promotion.eligible_property_refs) {
      requireReference(
        propertyIds,
        id,
        `Promotion ${promotion.promotion_id} property`,
      );
    }
    for (const id of promotion.eligible_offer_refs) {
      requireReference(
        offerIds,
        id,
        `Promotion ${promotion.promotion_id} offer`,
      );
    }
    for (const id of promotion.financing_impact.financing_offer_ids) {
      requireReference(
        financingOfferIds,
        id,
        `Promotion ${promotion.promotion_id} financing offer`,
      );
    }
    requireReference(
      sourceIds,
      promotion.source_reference.source_id,
      `Promotion ${promotion.promotion_id} source`,
    );
  }

  for (const eligibility of dataset.propertyFinancingEligibility) {
    requireReference(
      propertyIds,
      eligibility.property_id,
      `Eligibility ${eligibility.eligibility_id} property`,
    );
    if (eligibility.offer_id !== null) {
      requireReference(
        offerIds,
        eligibility.offer_id,
        `Eligibility ${eligibility.eligibility_id} offer`,
      );
    }
    if (eligibility.program_id !== null) {
      requireReference(
        programIds,
        eligibility.program_id,
        `Eligibility ${eligibility.eligibility_id} program`,
      );
    }
    if (eligibility.financing_offer_id !== null) {
      requireReference(
        financingOfferIds,
        eligibility.financing_offer_id,
        `Eligibility ${eligibility.eligibility_id} financing offer`,
      );
    }
    for (const evidenceId of eligibility.applicability_evidence_refs) {
      requireReference(
        evidenceIds,
        evidenceId,
        `Eligibility ${eligibility.eligibility_id} evidence`,
      );
    }
    if (
      eligibility.eligibility_status === "claimed" &&
      eligibility.verification_status !== "claimed"
    ) {
      add(
        "claimed_eligibility_promoted",
        `${eligibility.eligibility_id} no longer preserves claimed status`,
      );
    }
  }

  const financingOfferById = new Map(
    dataset.financingOffers.map((item) => [item.financing_offer_id, item]),
  );
  const offerById = new Map(
    dataset.offers.map((item) => [item.offer_id, item]),
  );
  const promotionById = new Map(
    dataset.promotions.map((item) => [item.promotion_id, item]),
  );
  for (const scenario of dataset.purchaseScenarios) {
    requireReference(
      propertyIds,
      scenario.property_id,
      `Scenario ${scenario.scenario_id} property`,
    );
    requireReference(
      offerIds,
      scenario.offer_id,
      `Scenario ${scenario.scenario_id} offer`,
    );
    const offer = offerById.get(scenario.offer_id);
    if (offer?.property_id !== scenario.property_id) {
      add(
        "scenario_property_mismatch",
        `${scenario.scenario_id} crosses Property and Offer`,
      );
    }
    if (scenario.financing_program_id !== null) {
      requireReference(
        programIds,
        scenario.financing_program_id,
        `Scenario ${scenario.scenario_id} program`,
      );
    }
    if (scenario.financing_offer_id !== null) {
      requireReference(
        financingOfferIds,
        scenario.financing_offer_id,
        `Scenario ${scenario.scenario_id} financing offer`,
      );
      if (!offer?.financing_offer_ids.includes(scenario.financing_offer_id)) {
        add(
          "frankenstein_scenario",
          `${scenario.scenario_id} uses financing from another Offer`,
        );
      }
      const financingOffer = financingOfferById.get(
        scenario.financing_offer_id,
      );
      if (
        scenario.financing_program_id !== null &&
        financingOffer?.program_id !== scenario.financing_program_id
      ) {
        add(
          "scenario_program_mismatch",
          `${scenario.scenario_id} combines incompatible program and offer`,
        );
      }
    }
    if (scenario.promotion_id !== null) {
      requireReference(
        promotionIds,
        scenario.promotion_id,
        `Scenario ${scenario.scenario_id} promotion`,
      );
      if (!offer?.promotion_ids.includes(scenario.promotion_id)) {
        add(
          "frankenstein_scenario",
          `${scenario.scenario_id} uses promotion from another Offer`,
        );
      }
      const promotion = promotionById.get(scenario.promotion_id);
      if (
        promotion?.freshness_status === "expired" &&
        scenario.freshness_status !== "expired"
      ) {
        add(
          "expired_promotion_active",
          `${scenario.scenario_id} treats expired promotion as active`,
        );
      }
    }
    for (const evidenceId of [
      ...scenario.compatibility_evidence_refs,
      ...scenario.mandatory_costs.flatMap((cost) => cost.evidence_refs),
      ...scenario.assumptions.flatMap((assumption) => assumption.evidence_refs),
    ]) {
      requireReference(
        evidenceIds,
        evidenceId,
        `Scenario ${scenario.scenario_id} evidence`,
      );
    }
  }

  for (const cluster of dataset.duplicateClusters) {
    requireReference(
      propertyIds,
      cluster.property_id,
      `Cluster ${cluster.cluster_id}`,
    );
    for (const offerId of cluster.offer_ids) {
      requireReference(
        offerIds,
        offerId,
        `Cluster ${cluster.cluster_id} offer`,
      );
      if (offerById.get(offerId)?.property_id !== cluster.property_id) {
        add(
          "duplicate_cluster_mismatch",
          `${cluster.cluster_id} contains an Offer for another Property`,
        );
      }
    }
  }

  for (const pair of dataset.falseDuplicatePairs) {
    for (const id of pair.property_ids) {
      requireReference(
        propertyIds,
        id,
        `False duplicate ${pair.pair_id} property`,
      );
    }
    for (const id of pair.offer_ids) {
      requireReference(offerIds, id, `False duplicate ${pair.pair_id} offer`);
    }
    if (pair.property_ids[0] === pair.property_ids[1]) {
      add("false_duplicate_merged", `${pair.pair_id} references one Property`);
    }
  }

  for (const group of dataset.comparisonGroups) {
    for (const id of group.property_ids) {
      requireReference(
        propertyIds,
        id,
        `Comparison ${group.group_id} property`,
      );
    }
  }
  for (const item of dataset.confidenceCases) {
    requireReference(
      propertyIds,
      item.property_id,
      `Confidence ${item.case_id}`,
    );
    for (const id of item.offer_ids) {
      requireReference(offerIds, id, `Confidence ${item.case_id} offer`);
    }
    for (const id of item.evidence_ids) {
      requireReference(evidenceIds, id, `Confidence ${item.case_id} evidence`);
    }
  }
  for (const item of dataset.financingCompatibility) {
    requireReference(
      propertyIds,
      item.property_id,
      `Financing ${item.case_id}`,
    );
    for (const id of item.allowed_scenario_ids) {
      requireReference(scenarioIds, id, `Financing ${item.case_id} scenario`);
    }
    for (const combination of item.forbidden_combinations) {
      requireReference(
        offerIds,
        combination.price_offer_id,
        `Financing ${item.case_id} price Offer`,
      );
      requireReference(
        financingOfferIds,
        combination.financing_offer_id,
        `Financing ${item.case_id} financing Offer`,
      );
    }
  }

  for (const item of dataset.benchmarkManifest.cases) {
    for (const id of item.property_ids) {
      requireReference(propertyIds, id, `Benchmark ${item.id} property`);
    }
    for (const id of item.offer_ids) {
      requireReference(offerIds, id, `Benchmark ${item.id} offer`);
    }
    for (const id of item.relevant_user_request_ids) {
      requireReference(userRequestIds, id, `Benchmark ${item.id} request`);
    }
  }

  for (const propertyId of Object.keys(dataset.fixtureNotes.properties)) {
    requireReference(propertyIds, propertyId, "Property fixture note");
  }
  for (const offerId of Object.keys(dataset.fixtureNotes.offers)) {
    requireReference(offerIds, offerId, "Offer fixture note");
  }
  for (const propertyId of propertyIds) {
    if (!(propertyId in dataset.fixtureNotes.properties)) {
      add("missing_fixture_note", `Property ${propertyId}`);
    }
  }
  for (const offerId of offerIds) {
    if (!(offerId in dataset.fixtureNotes.offers)) {
      add("missing_fixture_note", `Offer ${offerId}`);
    }
  }

  return issues.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
};

export const assertPilotDatasetIntegrity = (dataset: PilotDataset): void => {
  const issues = validatePilotDatasetIntegrity(dataset);
  if (issues.length > 0) {
    throw new Error(
      `Pilot dataset integrity failed:\n${issues
        .map((issue) => `- [${issue.code}] ${issue.message}`)
        .join("\n")}`,
    );
  }
};
