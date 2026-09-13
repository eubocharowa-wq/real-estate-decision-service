import type { UserRequest } from "../domain";
import { calculateDataQuality, matchProperty } from "../matching";
import { loadPilotDataset } from "../pilot-dataset";
import { loadCuratedPilotDataset } from "../pilot-hardening/curated-dataset";
import type {
  PilotPropertyDetailAdapterOutcome,
  PropertyDetailInput,
} from "./types";

export interface PilotPropertyDetailRequest {
  readonly propertyId: string;
  readonly offerId?: string | null;
  readonly scenarioId?: string | null;
  readonly userRequest?: UserRequest | null;
  readonly contextNotice?: string | null;
}

const failure = (
  code:
    | "PROPERTY_NOT_FOUND"
    | "OFFER_NOT_FOUND"
    | "SCENARIO_NOT_FOUND"
    | "MATCHING_UNAVAILABLE",
  message: string,
): PilotPropertyDetailAdapterOutcome => ({
  success: false,
  error: { code, message },
});

/**
 * Server-only pilot boundary. Existing matching and data-quality engines are
 * executed here; the detail view model receives their completed results.
 */
export const buildPilotPropertyDetailInput = (
  request: PilotPropertyDetailRequest,
): PilotPropertyDetailAdapterOutcome => {
  const dataset = loadPilotDataset();
  const property = dataset.properties.find(
    (item) => item.identity.property_id === request.propertyId,
  );
  if (!property) {
    return failure("PROPERTY_NOT_FOUND", "Объект не найден.");
  }

  const offers = dataset.offers.filter(
    (offer) => offer.property_id === request.propertyId,
  );
  const scenarios = dataset.purchaseScenarios.filter(
    (scenario) => scenario.property_id === request.propertyId,
  );
  const requestedScenario = request.scenarioId
    ? (scenarios.find(
        (scenario) => scenario.scenario_id === request.scenarioId,
      ) ?? null)
    : null;
  if (request.scenarioId && !requestedScenario) {
    return failure(
      "SCENARIO_NOT_FOUND",
      "Сценарий не найден для этого объекта.",
    );
  }
  const effectiveOfferId =
    request.offerId ?? requestedScenario?.offer_id ?? null;
  const requestedOffer = effectiveOfferId
    ? (offers.find((offer) => offer.offer_id === effectiveOfferId) ?? null)
    : null;
  if (effectiveOfferId && !requestedOffer) {
    return failure(
      "OFFER_NOT_FOUND",
      "Предложение не найдено для этого объекта.",
    );
  }
  if (
    requestedScenario &&
    requestedOffer &&
    requestedScenario.offer_id !== requestedOffer.offer_id
  ) {
    return failure(
      "SCENARIO_NOT_FOUND",
      "Сценарий относится к другому предложению.",
    );
  }

  let selectedOffer = requestedOffer;
  let selectedScenario = requestedScenario;
  let matching: PropertyDetailInput["matching"] = null;
  let dataQuality: PropertyDetailInput["dataQuality"] = null;
  const diagnostics: string[] = [];

  if (request.userRequest) {
    const candidateOffers = requestedOffer ? [requestedOffer] : offers;
    const candidateScenarios = requestedScenario
      ? [requestedScenario]
      : requestedOffer
        ? scenarios.filter(
            (scenario) => scenario.offer_id === requestedOffer.offer_id,
          )
        : scenarios;
    const candidateOfferIds = new Set(
      candidateOffers.map((offer) => offer.offer_id),
    );
    const matched = matchProperty({
      userRequest: request.userRequest,
      property,
      offers: candidateOffers,
      purchaseScenarios: candidateScenarios,
      financingEligibility: dataset.propertyFinancingEligibility.filter(
        (item) =>
          item.property_id === request.propertyId &&
          (item.offer_id === null || candidateOfferIds.has(item.offer_id)),
      ),
      financingPrograms: dataset.financingPrograms,
      fieldEvidence: dataset.fieldEvidence,
      sourceConflicts: dataset.sourceConflicts,
      currentTime: dataset.metadata.created_at,
    });
    if (!matched.success) {
      return failure(
        "MATCHING_UNAVAILABLE",
        "Соответствие этому запросу ещё не рассчитано.",
      );
    }
    matching = matched.result;
    selectedOffer =
      requestedOffer ??
      offers.find(
        (offer) => offer.offer_id === matched.result.selected_offer_id,
      ) ??
      null;
    selectedScenario =
      requestedScenario ??
      scenarios.find(
        (scenario) =>
          scenario.scenario_id ===
          matched.result.match_result.purchase_scenario_id,
      ) ??
      null;

    const selectedPromotion =
      dataset.promotions.find(
        (promotion) =>
          promotion.promotion_id === selectedScenario?.promotion_id,
      ) ?? null;
    const quality = calculateDataQuality({
      userRequest: request.userRequest,
      matchResult: matched.result.match_result,
      fieldEvidence: dataset.fieldEvidence,
      sourceConflicts: dataset.sourceConflicts,
      sources: dataset.sources,
      selectedOffer,
      selectedPurchaseScenario: selectedScenario,
      selectedPromotion,
      currentTime: dataset.metadata.created_at,
    });
    if (quality.success) dataQuality = quality.result;
    else diagnostics.push(`${quality.error.code}: ${quality.error.message}`);
  } else {
    selectedOffer =
      requestedOffer ?? (offers.length === 1 ? (offers[0] ?? null) : null);
  }

  const selectedFinancingProgram =
    dataset.financingPrograms.find(
      (program) =>
        program.program_id === selectedScenario?.financing_program_id,
    ) ?? null;
  const selectedFinancingOffer =
    dataset.financingOffers.find(
      (offer) =>
        offer.financing_offer_id === selectedScenario?.financing_offer_id,
    ) ?? null;
  const selectedPromotion =
    dataset.promotions.find(
      (promotion) => promotion.promotion_id === selectedScenario?.promotion_id,
    ) ?? null;

  return {
    success: true,
    input: {
      property,
      offers,
      selectedOffer,
      purchaseScenarios: scenarios,
      selectedPurchaseScenario: selectedScenario,
      selectedFinancingProgram,
      selectedFinancingOffer,
      selectedPromotion,
      userRequest: request.userRequest ?? null,
      matching,
      dataQuality,
      sources: dataset.sources,
      fieldEvidence: dataset.fieldEvidence,
      sourceConflicts: dataset.sourceConflicts,
      generatedAt: dataset.metadata.created_at,
      partial: diagnostics.length > 0,
      contextNotice: request.contextNotice ?? null,
    },
    diagnostics,
  };
};

/**
 * The curated-pilot counterpart to buildPilotPropertyDetailInput: same
 * server-only boundary and the same matching/data-quality engines, but the
 * candidate is one of the manually curated real ЕИСЖС objects, not a row
 * from the synthetic fixture dataset. Every curated candidate carries
 * exactly one Offer and no purchase scenarios or financing programs, so this
 * resolver is simpler than the synthetic one rather than a parallel copy of
 * it — see EISJS_EXPLICIT_UNKNOWN_FIELDS in pilot-hardening/eisjs-candidate.
 */
export const buildCuratedPropertyDetailInput = (
  request: PilotPropertyDetailRequest,
  curatedPilotDirectory?: string,
): PilotPropertyDetailAdapterOutcome => {
  const dataset = loadCuratedPilotDataset(curatedPilotDirectory);
  const found = dataset.candidates.find(
    (item) =>
      item.candidate.property.identity.property_id === request.propertyId,
  );
  if (!found) return failure("PROPERTY_NOT_FOUND", "Объект не найден.");
  const { property, offer, sources, evidence } = found.candidate;
  if (request.offerId && request.offerId !== offer.offer_id)
    return failure(
      "OFFER_NOT_FOUND",
      "Предложение не найдено для этого объекта.",
    );
  if (request.scenarioId)
    return failure(
      "SCENARIO_NOT_FOUND",
      "Сценарий не найден для этого объекта.",
    );

  let matching: PropertyDetailInput["matching"] = null;
  let dataQuality: PropertyDetailInput["dataQuality"] = null;
  const diagnostics: string[] = [];
  const now = new Date().toISOString();

  if (request.userRequest) {
    const matched = matchProperty({
      userRequest: request.userRequest,
      property,
      offers: [offer],
      purchaseScenarios: [],
      financingEligibility: [],
      financingPrograms: [],
      fieldEvidence: evidence,
      sourceConflicts: [],
      currentTime: now,
    });
    if (!matched.success)
      return failure(
        "MATCHING_UNAVAILABLE",
        "Соответствие этому запросу ещё не рассчитано.",
      );
    matching = matched.result;
    const quality = calculateDataQuality({
      userRequest: request.userRequest,
      matchResult: matched.result.match_result,
      fieldEvidence: evidence,
      sourceConflicts: [],
      sources,
      selectedOffer: offer,
      selectedPurchaseScenario: null,
      selectedPromotion: null,
      currentTime: now,
    });
    if (quality.success) dataQuality = quality.result;
    else diagnostics.push(`${quality.error.code}: ${quality.error.message}`);
  }

  return {
    success: true,
    input: {
      property,
      offers: [offer],
      selectedOffer: offer,
      purchaseScenarios: [],
      selectedPurchaseScenario: null,
      selectedFinancingProgram: null,
      selectedFinancingOffer: null,
      selectedPromotion: null,
      userRequest: request.userRequest ?? null,
      matching,
      dataQuality,
      sources,
      fieldEvidence: evidence,
      sourceConflicts: [],
      generatedAt: now,
      partial: diagnostics.length > 0,
      contextNotice:
        request.contextNotice ??
        "Реальный объект, внесённый вручную из проектной декларации: цена, доступность и условия финансирования в источнике не публикуются.",
    },
    diagnostics,
  };
};
