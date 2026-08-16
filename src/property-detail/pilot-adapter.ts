import type { UserRequest } from "../domain";
import { calculateDataQuality, matchProperty } from "../matching";
import { loadPilotDataset } from "../pilot-dataset";
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
