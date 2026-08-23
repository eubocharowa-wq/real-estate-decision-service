import {
  fieldEvidenceSchema,
  offerSchema,
  propertySchema,
  sourceSchema,
} from "../domain";
import type { UserRequest } from "../domain";
import { calculateDataQuality, matchProperty } from "../matching";
import { loadPilotDataset } from "../pilot-dataset";
import type { PropertyDetailInput } from "../property-detail";
import type { NormalizedUserUrlCandidate } from "./types";

export const parseNormalizedUserUrlCandidate = (
  value: unknown,
): NormalizedUserUrlCandidate | null => {
  if (typeof value !== "object" || value === null) return null;
  const property = propertySchema.safeParse(
    Reflect.get(value, "propertyCandidate"),
  );
  const offer = offerSchema.safeParse(Reflect.get(value, "offerCandidate"));
  const source = sourceSchema.safeParse(Reflect.get(value, "source"));
  const evidenceValue = Reflect.get(value, "evidence");
  const unresolvedFields = Reflect.get(value, "unresolvedFields");
  const financingClaims = Reflect.get(value, "financingClaims");
  const duplicateDecision = Reflect.get(value, "duplicateDecision");
  const matchingReadiness = Reflect.get(value, "matchingReadiness");
  if (
    !property.success ||
    !offer.success ||
    !source.success ||
    !Array.isArray(evidenceValue) ||
    !Array.isArray(unresolvedFields) ||
    !Array.isArray(financingClaims) ||
    typeof duplicateDecision !== "object" ||
    duplicateDecision === null ||
    typeof matchingReadiness !== "object" ||
    matchingReadiness === null
  )
    return null;
  const evidence = evidenceValue.map((item) =>
    fieldEvidenceSchema.safeParse(item),
  );
  if (evidence.some((item) => !item.success)) return null;
  if (offer.data.property_id !== property.data.identity.property_id)
    return null;
  if (offer.data.source_reference.source_id !== source.data.source_id)
    return null;
  if (
    evidence.some(
      (item) => item.success && item.data.source_id !== source.data.source_id,
    )
  )
    return null;
  return value as NormalizedUserUrlCandidate;
};

export const buildUserUrlPropertyDetailInput = ({
  candidate,
  userRequest,
}: {
  readonly candidate: NormalizedUserUrlCandidate;
  readonly userRequest: UserRequest;
}): PropertyDetailInput | null => {
  const dataset = loadPilotDataset();
  const existingProperty = candidate.duplicateDecision.existingPropertyId
    ? (dataset.properties.find(
        (property) =>
          property.identity.property_id ===
          candidate.duplicateDecision.existingPropertyId,
      ) ?? null)
    : null;
  const property = existingProperty ?? candidate.propertyCandidate;
  const propertyEvidence = existingProperty
    ? dataset.fieldEvidence.filter(
        (evidence) =>
          evidence.entity_type === "property" &&
          evidence.entity_id === existingProperty.identity.property_id,
      )
    : [];
  const evidence = [...propertyEvidence, ...candidate.evidence];
  const sources = [
    ...dataset.sources.filter((source) =>
      propertyEvidence.some(
        (evidence) => evidence.source_id === source.source_id,
      ),
    ),
    candidate.source,
  ].filter(
    (source, index, all) =>
      all.findIndex((item) => item.source_id === source.source_id) === index,
  );
  const sourceConflicts = existingProperty
    ? dataset.sourceConflicts.filter(
        (conflict) =>
          conflict.entity_id === existingProperty.identity.property_id,
      )
    : [];
  const matched = matchProperty({
    userRequest,
    property,
    offers: [candidate.offerCandidate],
    purchaseScenarios: [],
    financingEligibility: [],
    financingPrograms: [],
    fieldEvidence: evidence,
    sourceConflicts,
    currentTime:
      candidate.offerCandidate.updated_at ??
      candidate.propertyCandidate.metadata.updated_at,
  });
  if (!matched.success) return null;
  const quality = calculateDataQuality({
    userRequest,
    matchResult: matched.result.match_result,
    fieldEvidence: evidence,
    sourceConflicts,
    sources,
    selectedOffer: candidate.offerCandidate,
    selectedPurchaseScenario: null,
    selectedPromotion: null,
    currentTime:
      candidate.offerCandidate.updated_at ??
      candidate.propertyCandidate.metadata.updated_at,
  });
  return {
    property,
    offers: [candidate.offerCandidate],
    selectedOffer: candidate.offerCandidate,
    purchaseScenarios: [],
    selectedPurchaseScenario: null,
    selectedFinancingProgram: null,
    selectedFinancingOffer: null,
    selectedPromotion: null,
    userRequest,
    matching: matched.result,
    dataQuality: quality.success ? quality.result : null,
    sources,
    fieldEvidence: evidence,
    sourceConflicts,
    generatedAt: candidate.propertyCandidate.metadata.updated_at,
    partial: candidate.unresolvedFields.length > 0 || !quality.success,
    contextNotice:
      "Вариант добавлен пользователем по ссылке; значения заявлены и требуют проверки.",
  };
};
