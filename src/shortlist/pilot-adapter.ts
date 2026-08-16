import type { Property, UserRequest } from "../domain";
import {
  calculateDataQuality,
  matchProperty,
  type DataQualityEngineError,
  type MatchingEngineError,
} from "../matching";
import { loadPilotDataset } from "../pilot-dataset";
import type { ShortlistCandidateInput, ShortlistInput } from "./types";

export interface PilotShortlistDiagnostics {
  readonly matchingErrors: readonly MatchingEngineError[];
  readonly dataQualityErrors: readonly DataQualityEngineError[];
}

export interface PilotShortlistAdapterResult {
  readonly input: ShortlistInput;
  readonly diagnostics: PilotShortlistDiagnostics;
}

const matchesConfirmedScope = (
  request: UserRequest,
  property: Property,
): boolean => {
  const address = property.location.address;
  if (
    request.property.allowed_property_types.length > 0 &&
    !request.property.allowed_property_types.includes(property.property_type)
  ) {
    return false;
  }
  if (
    request.property.excluded_property_types?.includes(property.property_type)
  ) {
    return false;
  }
  if (
    request.property.allowed_market_types.length > 0 &&
    !request.property.allowed_market_types.includes(property.market_type)
  ) {
    return false;
  }
  if (
    request.location.country_codes.length > 0 &&
    (address.country_code === null ||
      !request.location.country_codes.includes(address.country_code))
  ) {
    return false;
  }
  if (
    request.location.regions.length > 0 &&
    (address.region === null ||
      !request.location.regions.includes(address.region))
  ) {
    return false;
  }
  if (
    request.location.cities.length > 0 &&
    (address.city === null || !request.location.cities.includes(address.city))
  ) {
    return false;
  }
  if (
    address.district !== null &&
    request.location.excluded_districts.includes(address.district)
  ) {
    return false;
  }
  return true;
};

/**
 * Server-only pilot boundary. It executes existing TASK-007/008 engines and
 * hands their ready results to the pure shortlist presentation layer.
 */
export const buildPilotShortlistInput = (
  userRequest: UserRequest,
): PilotShortlistAdapterResult => {
  const dataset = loadPilotDataset();
  const matchingErrors: MatchingEngineError[] = [];
  const dataQualityErrors: DataQualityEngineError[] = [];
  const candidates: ShortlistCandidateInput[] = [];

  for (const property of dataset.properties.filter((item) =>
    matchesConfirmedScope(userRequest, item),
  )) {
    const propertyId = property.identity.property_id;
    const offers = dataset.offers.filter(
      (offer) => offer.property_id === propertyId,
    );
    const scenarios = dataset.purchaseScenarios.filter(
      (scenario) => scenario.property_id === propertyId,
    );
    const eligibility = dataset.propertyFinancingEligibility.filter(
      (item) => item.property_id === propertyId,
    );
    const matched = matchProperty({
      userRequest,
      property,
      offers,
      purchaseScenarios: scenarios,
      financingEligibility: eligibility,
      financingPrograms: dataset.financingPrograms,
      fieldEvidence: dataset.fieldEvidence,
      sourceConflicts: dataset.sourceConflicts,
      currentTime: dataset.metadata.created_at,
    });
    if (!matched.success) {
      matchingErrors.push(matched.error);
      continue;
    }

    const offer =
      dataset.offers.find(
        (item) => item.offer_id === matched.result.selected_offer_id,
      ) ?? null;
    const scenario =
      dataset.purchaseScenarios.find(
        (item) =>
          item.scenario_id === matched.result.match_result.purchase_scenario_id,
      ) ?? null;
    const program =
      dataset.financingPrograms.find(
        (item) => item.program_id === scenario?.financing_program_id,
      ) ?? null;
    const promotion =
      dataset.promotions.find(
        (item) => item.promotion_id === scenario?.promotion_id,
      ) ?? null;
    const quality = calculateDataQuality({
      userRequest,
      matchResult: matched.result.match_result,
      fieldEvidence: dataset.fieldEvidence,
      sourceConflicts: dataset.sourceConflicts,
      sources: dataset.sources,
      selectedOffer: offer,
      selectedPurchaseScenario: scenario,
      selectedPromotion: promotion,
      currentTime: dataset.metadata.created_at,
    });
    if (!quality.success) dataQualityErrors.push(quality.error);

    candidates.push({
      property,
      offer,
      purchaseScenario: scenario,
      financingProgram: program,
      promotion,
      match: matched.result,
      dataQuality: quality.success ? quality.result : null,
      sources: dataset.sources,
      fieldEvidence: dataset.fieldEvidence,
    });
  }

  return {
    input: {
      userRequest,
      candidates,
      generatedAt: dataset.metadata.created_at,
      partial: matchingErrors.length > 0 || dataQualityErrors.length > 0,
      datasetNotice:
        "Демонстрационный подбор по синтетическому pilot dataset; это не полное покрытие рынка.",
    },
    diagnostics: { matchingErrors, dataQualityErrors },
  };
};
