import {
  EXPERT_ROUTING_VERSION,
  expertQuestionCategorySchema,
  expertRequestTypeSchema,
  type ExpertQuestionCategory,
  type ExpertRequestType,
  type ExpertTriggerType,
  type SpecialistType,
} from "./contracts";

const REQUEST_SPECIALIST_ALLOWLIST: Readonly<
  Record<ExpertRequestType, readonly SpecialistType[]>
> = Object.freeze({
  information_verification: [
    "real_estate_expert",
    "lawyer",
    "mortgage_specialist",
    "property_inspector",
    "technical_specialist",
  ],
  document_review: ["lawyer"],
  choice_assistance: ["real_estate_expert"],
  property_analysis: [
    "real_estate_expert",
    "property_inspector",
    "technical_specialist",
  ],
  consultation: ["real_estate_expert", "lawyer", "mortgage_specialist"],
  onsite_check: ["property_inspector", "technical_specialist"],
  transaction_question: ["lawyer"],
});

const CATEGORY_SPECIALIST: Readonly<
  Record<ExpertQuestionCategory, SpecialistType>
> = Object.freeze({
  general: "real_estate_expert",
  price: "real_estate_expert",
  availability: "real_estate_expert",
  financing: "mortgage_specialist",
  document: "lawyer",
  legal: "lawyer",
  physical_condition: "property_inspector",
  structural_engineering: "technical_specialist",
  transaction: "lawyer",
  comparison: "real_estate_expert",
});

export interface ExpertRoutingInput {
  readonly requestType: ExpertRequestType;
  readonly triggerType: ExpertTriggerType;
  readonly questionCategory: ExpertQuestionCategory;
}

export interface ExpertRoutingDecision {
  readonly specialistType: SpecialistType;
  readonly routingVersion: typeof EXPERT_ROUTING_VERSION;
  readonly reasonCode: string;
}

const fixedRoute = (requestType: ExpertRequestType): SpecialistType | null => {
  if (requestType === "document_review") return "lawyer";
  if (requestType === "choice_assistance") return "real_estate_expert";
  if (requestType === "transaction_question") return "lawyer";
  return null;
};

export const validateSpecialistRoute = (
  requestType: ExpertRequestType,
  specialistType: SpecialistType,
): void => {
  if (!REQUEST_SPECIALIST_ALLOWLIST[requestType].includes(specialistType))
    throw new Error(
      `ROUTE_NOT_ALLOWED: ${requestType} cannot route to ${specialistType}`,
    );
};

export const routeExpertRequest = (
  input: ExpertRoutingInput,
): ExpertRoutingDecision => {
  const requestType = expertRequestTypeSchema.parse(input.requestType);
  const questionCategory = expertQuestionCategorySchema.parse(
    input.questionCategory,
  );
  const specialistType =
    fixedRoute(requestType) ??
    (input.triggerType === "financing_uncertainty"
      ? "mortgage_specialist"
      : CATEGORY_SPECIALIST[questionCategory]);
  validateSpecialistRoute(requestType, specialistType);
  return {
    specialistType,
    routingVersion: EXPERT_ROUTING_VERSION,
    reasonCode: `route:${requestType}:${input.triggerType}:${questionCategory}`,
  };
};

export const expertRequestSpecialistAllowlist = REQUEST_SPECIALIST_ALLOWLIST;
