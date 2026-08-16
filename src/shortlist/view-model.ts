import type {
  Criterion,
  FieldEvidence,
  Offer,
  Property,
  UserRequest,
} from "../domain";
import {
  applyShortlistPolicy,
  resolveShortlistLimit,
  SHORTLIST_POLICY_V1,
} from "./policy";
import {
  AVAILABILITY_PRESENTATION,
  CONFIDENCE_PRESENTATION,
  ELIGIBILITY_PRESENTATION,
  FINANCING_PROGRAM_PRESENTATION,
  FRESHNESS_PRESENTATION,
  PROPERTY_TYPE_PRESENTATION,
  formatCriterionExplanation,
  formatEvaluationFallback,
  formatFieldUnknown,
  getCriterionFieldLabel,
} from "./presentation-registry";
import { asMoneyLike, formatArea, formatDate, formatMoney } from "./formatters";
import type {
  ShortlistBuildError,
  ShortlistBuildOutcome,
  ShortlistCandidateInput,
  ShortlistCardView,
  ShortlistFinancingView,
  ShortlistInput,
  ShortlistPriceView,
} from "./types";

const allCriteria = (request: UserRequest): readonly Criterion[] => [
  ...request.must_have,
  ...request.nice_to_have,
  ...request.avoid,
  ...request.infrastructure,
  ...request.property_features,
];

const unique = (values: readonly string[]): string[] => [
  ...new Set(values.filter((value) => value.trim().length > 0)),
];

const error = (
  code: ShortlistBuildError["code"],
  message: string,
  entityId: string | null,
): ShortlistBuildOutcome => ({
  success: false,
  error: { code, message, entityId },
});

const oldPriceFromEvidence = (
  offer: Offer,
  evidence: readonly FieldEvidence[],
): ReturnType<typeof asMoneyLike> => {
  const item = evidence.find(
    (candidate) =>
      candidate.entity_id === offer.offer_id &&
      candidate.field === "listing_price.old_price" &&
      candidate.verification_status === "confirmed",
  );
  return item ? asMoneyLike(item.value) : null;
};

const buildPrice = (candidate: ShortlistCandidateInput): ShortlistPriceView => {
  const priceQuality = candidate.dataQuality?.field_results.find(
    (field) => field.field === "listing_price",
  );
  const hasConflict =
    priceQuality !== undefined && priceQuality.conflict_status !== "none";
  if (hasConflict) {
    return {
      kind: "conflicting",
      current: null,
      previous: null,
      label: "Цена требует уточнения",
      note: "Цена расходится между источниками",
    };
  }
  if (!candidate.offer?.listing_price) {
    return {
      kind: "unknown",
      current: null,
      previous: null,
      label: "Цена не указана",
      note: "Нужно запросить актуальную цену",
    };
  }
  const current = formatMoney(candidate.offer.listing_price);
  if (candidate.offer.price_from === true) {
    return {
      kind: "from",
      current,
      previous: null,
      label: `от ${current}`,
      note: "Минимальная цена, не точная цена выбранного варианта",
    };
  }
  const oldPrice = oldPriceFromEvidence(
    candidate.offer,
    candidate.fieldEvidence,
  );
  if (oldPrice) {
    return {
      kind: "old_new",
      current,
      previous: formatMoney(oldPrice),
      label: current,
      note: "Цена изменилась",
    };
  }
  return {
    kind: "exact",
    current,
    previous: null,
    label: current,
    note: null,
  };
};

const propertySubtitle = (property: Property): string => {
  const address = property.location.address;
  const street = [address.street, address.house_number]
    .filter(Boolean)
    .join(", ");
  return [address.city, address.district, street]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
};

const propertyFacts = (property: Property): readonly string[] => {
  const facts: string[] = [];
  if (property.physical.rooms !== null) {
    facts.push(
      property.physical.rooms === 0
        ? "Студия"
        : `${property.physical.rooms}-комнатная`,
    );
  }
  if (property.physical.total_area_m2 !== null) {
    facts.push(formatArea(property.physical.total_area_m2));
  }
  if (
    (property.property_type === "apartment" ||
      property.property_type === "apartments") &&
    property.physical.floor !== null
  ) {
    facts.push(
      property.building.floors_total === null
        ? `${property.physical.floor} этаж`
        : `${property.physical.floor} из ${property.building.floors_total} этажей`,
    );
  }
  if (
    (property.property_type === "house" ||
      property.property_type === "townhouse" ||
      property.property_type === "land") &&
    property.land.area_sotka !== null
  ) {
    facts.push(`${property.land.area_sotka} сот.`);
  }
  if (
    (property.property_type === "house" ||
      property.property_type === "townhouse") &&
    property.utilities.gas !== "unknown"
  ) {
    const gas =
      property.utilities.gas === "connected"
        ? "Газ подключён"
        : property.utilities.gas === "available"
          ? "Газ доступен"
          : property.utilities.gas === "planned"
            ? "Газ планируется"
            : "Газа нет";
    facts.push(gas);
  }
  return facts.slice(0, 3);
};

const sourceSummary = (candidate: ShortlistCandidateInput): string => {
  const sourceIds = new Set<string>();
  if (candidate.offer) {
    sourceIds.add(candidate.offer.source_reference.source_id);
    candidate.fieldEvidence
      .filter(
        (evidence) =>
          evidence.entity_id === candidate.offer?.offer_id ||
          evidence.entity_id === candidate.property.identity.property_id,
      )
      .forEach((evidence) => sourceIds.add(evidence.source_id));
  }
  if (sourceIds.size > 1) return `${sourceIds.size} источника`;
  const sourceId = [...sourceIds][0];
  const source = candidate.sources.find((item) => item.source_id === sourceId);
  return source ? `Источник: ${source.name}` : "Источник не указан";
};

const financingView = (
  candidate: ShortlistCandidateInput,
): ShortlistFinancingView => {
  const scenario = candidate.purchaseScenario;
  if (!scenario) {
    return {
      available: false,
      program: null,
      initialPayment: null,
      monthlyPayment: null,
      claimLabel: null,
    };
  }
  const claimed =
    scenario.verification_status === "claimed" ||
    scenario.verification_status === "unconfirmed" ||
    scenario.terms_compatibility_status === "claimed" ||
    scenario.terms_compatibility_status === "unconfirmed";
  return {
    available: true,
    program: candidate.financingProgram
      ? FINANCING_PROGRAM_PRESENTATION[candidate.financingProgram.program_type]
      : scenario.financing_program_id
        ? "Программа требует уточнения"
        : "Без выбранной ипотечной программы",
    initialPayment: scenario.initial_payment
      ? formatMoney(scenario.initial_payment)
      : null,
    monthlyPayment: scenario.monthly_payment
      ? formatMoney(scenario.monthly_payment)
      : null,
    claimLabel: claimed ? "Заявлено, требует подтверждения" : null,
  };
};

const requestSummary = (request: UserRequest): readonly string[] => {
  const criteria = [...request.must_have, ...request.avoid].slice(0, 3);
  const summary = criteria.map((criterion) => {
    if (criterion.user_expression) return criterion.user_expression;
    const targetMoney = asMoneyLike(criterion.target);
    if (targetMoney && criterion.operator === "lte") {
      return `${getCriterionFieldLabel(criterion.field)} до ${formatMoney(targetMoney)}`;
    }
    const target =
      typeof criterion.target === "string" ||
      typeof criterion.target === "number"
        ? String(criterion.target)
        : null;
    return target
      ? `${getCriterionFieldLabel(criterion.field)}: ${target}`
      : getCriterionFieldLabel(criterion.field);
  });
  if (summary.length > 0) return summary;
  if (request.budget.purchase_price.maximum) {
    return [`Бюджет до ${formatMoney(request.budget.purchase_price.maximum)}`];
  }
  return ["Подтверждённые условия запроса"];
};

const validateCandidate = (
  request: UserRequest,
  candidate: ShortlistCandidateInput,
): ShortlistBuildOutcome | null => {
  const formal = candidate.match.match_result;
  const propertyId = candidate.property.identity.property_id;
  if (
    formal.user_request_id !== request.user_request_id ||
    formal.property_id !== propertyId ||
    (candidate.offer !== null && candidate.offer.property_id !== propertyId) ||
    (candidate.purchaseScenario !== null &&
      (candidate.purchaseScenario.property_id !== propertyId ||
        candidate.purchaseScenario.scenario_id !==
          formal.purchase_scenario_id)) ||
    (candidate.dataQuality !== null &&
      candidate.dataQuality.match_result.match_result_id !==
        formal.match_result_id)
  ) {
    return error(
      "BROKEN_REFERENCE",
      "Shortlist input contains inconsistent request, property, offer or scenario references.",
      propertyId,
    );
  }
  if (!Number.isFinite(formal.match_score)) {
    return error(
      "MISSING_MATCH_SCORE",
      "Match Score is missing or malformed.",
      propertyId,
    );
  }
  return null;
};

const buildStrengths = (
  request: UserRequest,
  candidate: ShortlistCandidateInput,
): readonly string[] => {
  const criteria = new Map(
    allCriteria(request).map((criterion) => [
      criterion.criterion_id,
      criterion,
    ]),
  );
  const explained = candidate.match.explanation.strengths.map((item) =>
    formatCriterionExplanation(
      item,
      criteria.get(item.criterion_id) ?? null,
      "strength",
    ),
  );
  const fallbacks = candidate.match.match_result.criteria_results.flatMap(
    (result) => {
      if (result.status !== "matched") return [];
      const criterion = criteria.get(result.criterion_id);
      return criterion ? [formatEvaluationFallback(criterion, result)] : [];
    },
  );
  return unique([...explained, ...fallbacks]).slice(
    0,
    SHORTLIST_POLICY_V1.maxStrengths,
  );
};

const buildCompromises = (
  request: UserRequest,
  candidate: ShortlistCandidateInput,
): readonly string[] => {
  const criteria = new Map(
    allCriteria(request).map((criterion) => [
      criterion.criterion_id,
      criterion,
    ]),
  );
  return unique(
    candidate.match.explanation.compromises.map((item) =>
      formatCriterionExplanation(
        item,
        criteria.get(item.criterion_id) ?? null,
        "compromise",
      ),
    ),
  ).slice(0, SHORTLIST_POLICY_V1.maxCompromises);
};

const buildUnknowns = (
  request: UserRequest,
  candidate: ShortlistCandidateInput,
): readonly string[] => {
  const criteria = new Map(
    allCriteria(request).map((criterion) => [
      criterion.criterion_id,
      criterion,
    ]),
  );
  const matchingUnknowns = candidate.match.explanation.critical_unknowns.map(
    (item) =>
      formatCriterionExplanation(
        item,
        criteria.get(item.criterion_id) ?? null,
        "unknown",
      ),
  );
  const scenarioUnknowns = candidate.match.explanation.scenario_unknowns.map(
    () => "Совместимость условий сценария нужно подтвердить",
  );
  const confidenceUnknowns = [
    ...(candidate.dataQuality?.critical_unknowns.map((item) =>
      formatFieldUnknown(item.field),
    ) ?? []),
    ...(candidate.dataQuality?.critical_conflicts.map((item) =>
      formatFieldUnknown(item.field),
    ) ?? []),
  ];
  return unique([
    ...matchingUnknowns,
    ...scenarioUnknowns,
    ...confidenceUnknowns,
  ]).slice(0, SHORTLIST_POLICY_V1.maxCriticalUnknowns);
};

export const buildShortlistItemView = (
  request: UserRequest,
  candidate: ShortlistCandidateInput,
): ShortlistCardView => {
  const property = candidate.property;
  const match = candidate.match.match_result;
  const confidenceBand = candidate.dataQuality?.confidence_status ?? "pending";
  const propertyTypeLabel = PROPERTY_TYPE_PRESENTATION[property.property_type];
  const title = property.building.name
    ? `${propertyTypeLabel} · ${property.building.name}`
    : propertyTypeLabel;
  const compromises = buildCompromises(request, candidate);
  const offerId = candidate.offer?.offer_id ?? null;
  const scenarioId = candidate.purchaseScenario?.scenario_id ?? null;
  const query = [
    offerId ? `offer=${encodeURIComponent(offerId)}` : null,
    scenarioId ? `scenario=${encodeURIComponent(scenarioId)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  return {
    propertyId: property.identity.property_id,
    offerId,
    purchaseScenarioId: scenarioId,
    title,
    subtitle: propertySubtitle(property),
    propertyTypeLabel,
    secondaryFacts: propertyFacts(property),
    price: buildPrice(candidate),
    matchScore: match.match_score,
    matchLabel: `${Math.round(match.match_score)}% подходит`,
    matchContext: "Именно под ваши условия",
    eligibilityStatus:
      match.eligibility_status as ShortlistCardView["eligibilityStatus"],
    eligibilityLabel:
      ELIGIBILITY_PRESENTATION[
        match.eligibility_status as keyof typeof ELIGIBILITY_PRESENTATION
      ],
    requiresVerification: match.eligibility_status !== "eligible",
    confidence: {
      band: confidenceBand,
      label: CONFIDENCE_PRESENTATION[confidenceBand],
    },
    strengths: buildStrengths(request, candidate),
    compromises,
    noMaterialCompromises: compromises.length === 0,
    criticalUnknowns: buildUnknowns(request, candidate),
    financing: financingView(candidate),
    availabilityLabel: candidate.offer
      ? AVAILABILITY_PRESENTATION[candidate.offer.availability]
      : "Статус уточняется",
    freshnessLabel: candidate.offer
      ? `${FRESHNESS_PRESENTATION[candidate.offer.freshness_status]}${candidate.offer.updated_at ? ` · ${formatDate(candidate.offer.updated_at)}` : ""}`
      : "Дата проверки неизвестна",
    sourceSummary: sourceSummary(candidate),
    image: null,
    detailHref: `/property/${encodeURIComponent(property.identity.property_id)}${query ? `?${query}` : ""}`,
  };
};

export const buildShortlistView = (
  input: ShortlistInput,
): ShortlistBuildOutcome => {
  if (Number.isNaN(new Date(input.generatedAt).getTime())) {
    return error(
      "INVALID_GENERATED_AT",
      "Shortlist generated_at must be a valid date-time.",
      null,
    );
  }
  for (const candidate of input.candidates) {
    const invalid = validateCandidate(input.userRequest, candidate);
    if (invalid) return invalid;
  }
  const selected = applyShortlistPolicy(
    input.candidates,
    input.userRequest.result_limit,
  );
  return {
    success: true,
    view: {
      requestId: input.userRequest.user_request_id,
      heading: "Подобрали варианты под ваши условия",
      description:
        "Показаны объекты, которые соответствуют подтверждённым критериям. Match Score персонален, а надёжность данных показана отдельно.",
      requestSummary: requestSummary(input.userRequest),
      cards: selected.map((candidate) =>
        buildShortlistItemView(input.userRequest, candidate),
      ),
      resultLimit: resolveShortlistLimit(input.userRequest.result_limit),
      generatedAtLabel: `Подбор сформирован ${formatDate(input.generatedAt)}`,
      partial:
        input.partial || selected.some((item) => item.dataQuality === null),
      datasetNotice: input.datasetNotice,
    },
  };
};
