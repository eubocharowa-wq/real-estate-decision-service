import {
  sourceSchema,
  type FinancingProgram,
  type Offer,
  type Property,
  type PropertyFinancingEligibility,
  type PurchaseScenario,
  type Source,
  type UserRequest,
} from "../domain";
import {
  CONFIDENCE_ALGORITHM_VERSION,
  CRITERIA_REGISTRY_VERSION,
  MATCHING_ALGORITHM_VERSION,
  calculateDataQuality,
  matchProperty,
} from "../matching";
import { loadPilotDataset, type PilotDataset } from "../pilot-dataset";
import type { PropertyDetailInput } from "../property-detail";
import { buildPropertyDetailView } from "../property-detail";
import {
  buildShortlistView,
  matchesConfirmedScope,
  type ShortlistCandidateInput,
  type ShortlistInput,
  type ShortlistView,
} from "../shortlist";
import { buildUserUrlPropertyDetailInput } from "../user-url-ingestion";
import {
  measurePilotOperation,
  type PilotPerformanceRecorder,
} from "../pilot-hardening/performance";
import {
  MATCHING_BUNDLE_SCHEMA_VERSION,
  type CanonicalDecisionOverlay,
  type ConfirmedRequestRecord,
  type MatchingBundle,
  type MatchingBundleEntry,
} from "./contracts";
import { BuyerJourneyError } from "./errors";
import type { BuyerJourneyIdFactory } from "./id";
import type { BuyerJourneyRepository } from "./repository";

interface MutableRecord {
  [key: string]: unknown;
}

const setPath = (value: object, path: string, nextValue: unknown): void => {
  const parts = path.split(".");
  let cursor = value as MutableRecord;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (typeof next !== "object" || next === null)
      throw new Error(`CANONICAL_OVERLAY_PATH_NOT_FOUND:${path}`);
    cursor = next as MutableRecord;
  }
  const leaf = parts.at(-1);
  if (!leaf || !(leaf in cursor))
    throw new Error(`CANONICAL_OVERLAY_PATH_NOT_FOUND:${path}`);
  cursor[leaf] = structuredClone(nextValue);
};

interface EvaluatedDataset extends PilotDataset {
  readonly sources: readonly Source[];
}

const MANUAL_EXPERT_SOURCE: Source = sourceSchema.parse({
  schema_version: "1.0",
  source_id: "source_manual_expert_journey",
  source_type: "manual_expert",
  name: "Экспертная проверка",
  domain: null,
  base_url: null,
  coverage: { country_codes: [], regions: [], property_types: [] },
  collection_method: "manual",
  trust_level: "authoritative",
  status: "active",
  policy_metadata: {
    access_status: "approved",
    storage_rights: true,
    display_rights: true,
    refresh_rights: false,
    reviewed_at: null,
    notes: "Transient controlled-fixture expert evidence for TASK-018.",
  },
  upstream_source_id: null,
});

const applyOverlays = <T extends object>(
  values: readonly T[],
  overlays: readonly CanonicalDecisionOverlay[],
  entityType: CanonicalDecisionOverlay["entity_type"],
  id: (value: T) => string,
): readonly T[] =>
  values.map((value) => {
    const applicable = overlays.filter(
      (overlay) =>
        overlay.entity_type === entityType && overlay.entity_id === id(value),
    );
    if (applicable.length === 0) return structuredClone(value);
    const next = structuredClone(value);
    for (const overlay of applicable)
      setPath(next, overlay.field, overlay.value);
    return next;
  });

export const loadJourneyDataset = (
  repository: BuyerJourneyRepository,
): EvaluatedDataset => {
  const dataset = loadPilotDataset();
  const overlays = repository.listCanonicalOverlays();
  const additionalEvidence = repository.listEvidence();
  return {
    ...dataset,
    properties: applyOverlays(
      dataset.properties,
      overlays,
      "property",
      (property) => property.identity.property_id,
    ),
    offers: applyOverlays(
      dataset.offers,
      overlays,
      "offer",
      (offer) => offer.offer_id,
    ),
    purchaseScenarios: applyOverlays(
      dataset.purchaseScenarios,
      overlays,
      "purchase_scenario",
      (scenario) => scenario.scenario_id,
    ),
    propertyFinancingEligibility: applyOverlays(
      dataset.propertyFinancingEligibility,
      overlays,
      "property_financing_eligibility",
      (eligibility) => eligibility.eligibility_id,
    ),
    sources:
      additionalEvidence.length > 0
        ? [...dataset.sources, MANUAL_EXPERT_SOURCE]
        : dataset.sources,
    fieldEvidence: [...dataset.fieldEvidence, ...additionalEvidence],
  };
};

interface CandidateParts {
  readonly property: Property;
  readonly offers: readonly Offer[];
  readonly scenarios: readonly PurchaseScenario[];
  readonly eligibility: readonly PropertyFinancingEligibility[];
  readonly programs: readonly FinancingProgram[];
}

const evaluateCandidate = (
  request: UserRequest,
  parts: CandidateParts,
  dataset: EvaluatedDataset,
  currentTime: string,
  performanceRecorder?: PilotPerformanceRecorder,
): MatchingBundleEntry | null => {
  const propertyId = parts.property.identity.property_id;
  const match = matchProperty({
    userRequest: request,
    property: parts.property,
    offers: parts.offers,
    purchaseScenarios: parts.scenarios,
    financingEligibility: parts.eligibility,
    financingPrograms: parts.programs,
    fieldEvidence: dataset.fieldEvidence,
    sourceConflicts: dataset.sourceConflicts,
    currentTime,
  });
  if (!match.success) return null;
  const selectedOffer =
    parts.offers.find(
      (offer) => offer.offer_id === match.result.selected_offer_id,
    ) ?? null;
  const selectedScenario =
    parts.scenarios.find(
      (scenario) =>
        scenario.scenario_id === match.result.match_result.purchase_scenario_id,
    ) ?? null;
  const calculateQuality = () =>
    calculateDataQuality({
      userRequest: request,
      matchResult: match.result.match_result,
      fieldEvidence: dataset.fieldEvidence,
      sourceConflicts: dataset.sourceConflicts,
      sources: dataset.sources,
      selectedOffer,
      selectedPurchaseScenario: selectedScenario,
      selectedPromotion:
        dataset.promotions.find(
          (promotion) =>
            promotion.promotion_id === selectedScenario?.promotion_id,
        ) ?? null,
      currentTime,
    });
  const quality = performanceRecorder
    ? measurePilotOperation({
        operation: "confidence",
        candidateCount: 1,
        recorder: performanceRecorder,
        clock: () => currentTime,
        execute: calculateQuality,
      })
    : calculateQuality();
  return {
    property_id: propertyId,
    selected_offer_id: match.result.selected_offer_id,
    selected_purchase_scenario_id:
      match.result.match_result.purchase_scenario_id,
    origin: "synthetic",
    match: match.result,
    data_quality: quality.success ? quality.result : null,
  };
};

const evaluateImportedCandidate = (
  request: UserRequest,
  repository: BuyerJourneyRepository,
  ingestionId: string,
): MatchingBundleEntry | null => {
  const candidate = repository.getImportedCandidate(ingestionId);
  if (!candidate) return null;
  const detail = buildUserUrlPropertyDetailInput({
    candidate,
    userRequest: request,
  });
  if (!detail?.matching) return null;
  return {
    property_id: detail.property.identity.property_id,
    selected_offer_id: detail.selectedOffer?.offer_id ?? null,
    selected_purchase_scenario_id:
      detail.selectedPurchaseScenario?.scenario_id ?? null,
    origin: "user_supplied",
    match: detail.matching,
    data_quality: detail.dataQuality,
  };
};

export const runMatchingForConfirmedRequest = (input: {
  readonly repository: BuyerJourneyRepository;
  readonly confirmed: ConfirmedRequestRecord;
  readonly previousBundle: MatchingBundle | null;
  readonly importedCandidateIds: readonly string[];
  readonly generatedAt: string;
  readonly createId: BuyerJourneyIdFactory;
  readonly affectedPropertyIds?: readonly string[] | null;
  readonly performanceRecorder?: PilotPerformanceRecorder;
  readonly includeSyntheticDataset?: boolean;
}): MatchingBundle => {
  const dataset = loadJourneyDataset(input.repository);
  const includeSyntheticDataset = input.includeSyntheticDataset ?? true;
  const affected = input.affectedPropertyIds
    ? new Set(input.affectedPropertyIds)
    : null;
  const previousByProperty = new Map(
    input.previousBundle?.entries.map((entry) => [entry.property_id, entry]) ??
      [],
  );
  const entries: MatchingBundleEntry[] = [];
  let partial = false;

  for (const property of (includeSyntheticDataset
    ? dataset.properties
    : []
  ).filter((candidate) =>
    matchesConfirmedScope(input.confirmed.request, candidate),
  )) {
    const propertyId = property.identity.property_id;
    if (affected && !affected.has(propertyId)) {
      const previous = previousByProperty.get(propertyId);
      if (previous) entries.push(previous);
      continue;
    }
    const candidate = evaluateCandidate(
      input.confirmed.request,
      {
        property,
        offers: dataset.offers.filter(
          (offer) => offer.property_id === propertyId,
        ),
        scenarios: dataset.purchaseScenarios.filter(
          (scenario) => scenario.property_id === propertyId,
        ),
        eligibility: dataset.propertyFinancingEligibility.filter(
          (eligibility) => eligibility.property_id === propertyId,
        ),
        programs: dataset.financingPrograms,
      },
      dataset,
      input.generatedAt,
      input.performanceRecorder,
    );
    if (candidate) entries.push(candidate);
    else partial = true;
  }

  for (const ingestionId of input.importedCandidateIds) {
    const candidate = input.repository.getImportedCandidate(ingestionId);
    const propertyId = candidate?.propertyCandidate.identity.property_id;
    if (propertyId && affected && !affected.has(propertyId)) {
      const previous = previousByProperty.get(propertyId);
      if (previous) entries.push(previous);
      continue;
    }
    const evaluated = evaluateImportedCandidate(
      input.confirmed.request,
      input.repository,
      ingestionId,
    );
    if (evaluated) entries.push(evaluated);
    else partial = true;
  }

  entries.sort((left, right) =>
    left.property_id.localeCompare(right.property_id),
  );
  return {
    schema_version: MATCHING_BUNDLE_SCHEMA_VERSION,
    matching_bundle_id: input.createId("matching_bundle"),
    user_request_id: input.confirmed.user_request_id,
    user_request_version: input.confirmed.user_request_version,
    generated_at: input.generatedAt,
    entries,
    matching_algorithm_version: MATCHING_ALGORITHM_VERSION,
    confidence_algorithm_version: CONFIDENCE_ALGORITHM_VERSION,
    criteria_registry_version: CRITERIA_REGISTRY_VERSION,
    dataset_snapshot: {
      dataset_id: includeSyntheticDataset
        ? dataset.metadata.dataset_id
        : "pilot_runtime_explicit",
      dataset_version: includeSyntheticDataset
        ? dataset.metadata.dataset_version
        : "pilot-runtime-v1",
      dataset_type: includeSyntheticDataset
        ? input.importedCandidateIds.length > 0
          ? "mixed_explicit"
          : dataset.metadata.dataset_type
        : input.importedCandidateIds.length > 0
          ? "user_supplied_only"
          : "empty_pilot",
    },
    imported_candidate_ids: [...input.importedCandidateIds],
    partial,
    stale: false,
    supersedes_bundle_id: input.previousBundle?.matching_bundle_id ?? null,
  };
};

const importedDetail = (
  repository: BuyerJourneyRepository,
  bundle: MatchingBundle,
  propertyId: string,
  request: UserRequest,
): PropertyDetailInput | null => {
  for (const ingestionId of bundle.imported_candidate_ids) {
    const candidate = repository.getImportedCandidate(ingestionId);
    if (candidate?.propertyCandidate.identity.property_id === propertyId)
      return buildUserUrlPropertyDetailInput({
        candidate,
        userRequest: request,
      });
  }
  return null;
};

export const resolveBundlePropertyDetail = (input: {
  readonly repository: BuyerJourneyRepository;
  readonly confirmed: ConfirmedRequestRecord;
  readonly bundle: MatchingBundle;
  readonly propertyId: string;
}): PropertyDetailInput => {
  const entry = input.bundle.entries.find(
    (candidate) => candidate.property_id === input.propertyId,
  );
  if (!entry)
    throw new BuyerJourneyError(
      "ENTITY_NOT_FOUND",
      `Property ${input.propertyId} is absent from the current MatchingBundle`,
      false,
    );
  if (
    input.bundle.user_request_id !== input.confirmed.user_request_id ||
    input.bundle.user_request_version !==
      input.confirmed.user_request_version ||
    input.bundle.stale
  )
    throw new BuyerJourneyError(
      "STALE_REQUEST_VERSION",
      "MatchingBundle does not belong to the active confirmed request",
      true,
    );

  if (entry.origin === "user_supplied") {
    const detail = importedDetail(
      input.repository,
      input.bundle,
      input.propertyId,
      input.confirmed.request,
    );
    if (!detail)
      throw new BuyerJourneyError(
        "ENTITY_NOT_FOUND",
        "Imported candidate is unavailable",
        false,
      );
    return {
      ...detail,
      matching: entry.match,
      dataQuality: entry.data_quality,
    };
  }

  const dataset = loadJourneyDataset(input.repository);
  const property = dataset.properties.find(
    (candidate) => candidate.identity.property_id === input.propertyId,
  );
  if (!property)
    throw new BuyerJourneyError(
      "ENTITY_NOT_FOUND",
      "Property not found",
      false,
    );
  const offers = dataset.offers.filter(
    (offer) => offer.property_id === input.propertyId,
  );
  const scenarios = dataset.purchaseScenarios.filter(
    (scenario) => scenario.property_id === input.propertyId,
  );
  const selectedOffer =
    offers.find((offer) => offer.offer_id === entry.selected_offer_id) ?? null;
  const selectedScenario =
    scenarios.find(
      (scenario) =>
        scenario.scenario_id === entry.selected_purchase_scenario_id,
    ) ?? null;
  return {
    property,
    offers,
    selectedOffer,
    purchaseScenarios: scenarios,
    selectedPurchaseScenario: selectedScenario,
    selectedFinancingProgram:
      dataset.financingPrograms.find(
        (program) =>
          program.program_id === selectedScenario?.financing_program_id,
      ) ?? null,
    selectedFinancingOffer:
      dataset.financingOffers.find(
        (offer) =>
          offer.financing_offer_id === selectedScenario?.financing_offer_id,
      ) ?? null,
    selectedPromotion:
      dataset.promotions.find(
        (promotion) =>
          promotion.promotion_id === selectedScenario?.promotion_id,
      ) ?? null,
    userRequest: input.confirmed.request,
    matching: entry.match,
    dataQuality: entry.data_quality,
    sources: dataset.sources,
    fieldEvidence: dataset.fieldEvidence,
    sourceConflicts: dataset.sourceConflicts,
    generatedAt: input.bundle.generated_at,
    partial: entry.data_quality === null,
    contextNotice:
      "Демонстрационные данные synthetic_pilot; это не полное покрытие рынка.",
  };
};

export const buildShortlistFromMatchingBundle = (input: {
  readonly repository: BuyerJourneyRepository;
  readonly confirmed: ConfirmedRequestRecord;
  readonly bundle: MatchingBundle;
}): ShortlistView => {
  const origins = [
    ...new Set(input.bundle.entries.map((entry) => entry.origin)),
  ]
    .sort()
    .join(",");
  const candidates: ShortlistCandidateInput[] = input.bundle.entries.map(
    (entry) => {
      const detail = resolveBundlePropertyDetail({
        repository: input.repository,
        confirmed: input.confirmed,
        bundle: input.bundle,
        propertyId: entry.property_id,
      });
      return {
        property: detail.property,
        offer: detail.selectedOffer,
        purchaseScenario: detail.selectedPurchaseScenario,
        financingProgram: detail.selectedFinancingProgram,
        promotion: detail.selectedPromotion,
        match: entry.match,
        dataQuality: entry.data_quality,
        sources: detail.sources,
        fieldEvidence: detail.fieldEvidence,
      };
    },
  );
  const shortlistInput: ShortlistInput = {
    userRequest: input.confirmed.request,
    candidates,
    generatedAt: input.bundle.generated_at,
    partial: input.bundle.partial,
    datasetNotice: (() => {
      switch (input.bundle.dataset_snapshot.dataset_type) {
        case "synthetic_pilot":
          return "Демонстрационные данные · origin=synthetic · dataset_type=synthetic_pilot. Это не полное покрытие рынка.";
        case "mixed_explicit":
          return `Смешанный явный набор · dataset_type=mixed_explicit · origins=${origins}. Synthetic и пользовательские данные не считаются live-market coverage.`;
        case "user_supplied_only":
          return "Только явно добавленные пользователем варианты · origin=user_supplied. Это не полное покрытие рынка.";
        case "empty_pilot":
          return "Pilot dataset не подключён. Данных недостаточно для вывода о наличии вариантов на рынке.";
      }
    })(),
  };
  const outcome = buildShortlistView(shortlistInput);
  if (!outcome.success)
    throw new BuyerJourneyError(
      "MATCH_RECOMPUTE_FAILED",
      outcome.error.message,
      true,
    );
  return outcome.view;
};

export const buildPropertyViewFromMatchingBundle = (input: {
  readonly repository: BuyerJourneyRepository;
  readonly confirmed: ConfirmedRequestRecord;
  readonly bundle: MatchingBundle;
  readonly propertyId: string;
}) => {
  const outcome = buildPropertyDetailView(resolveBundlePropertyDetail(input));
  if (!outcome.success)
    throw new BuyerJourneyError(
      "ENTITY_NOT_FOUND",
      outcome.error.message,
      false,
    );
  return outcome.view;
};
