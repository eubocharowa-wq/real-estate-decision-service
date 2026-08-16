import type {
  Criterion,
  CriterionEvaluationResult,
  FieldEvidence,
  Money,
  Property,
} from "../domain";
import { formatMoney } from "../shortlist/formatters";
import {
  formatCriterionExplanation,
  formatFieldUnknown,
  getCriterionFieldLabel,
} from "../shortlist/presentation-registry";
import { buildComparisonConclusion } from "./conclusion";
import { buildDecisionDrivers, buildTradeoffs } from "./decision-drivers";
import {
  AVAILABILITY_LABELS,
  CONFIDENCE_PRESENTATION,
  CRITERION_STATUS_PRESENTATION,
  DETAIL_FRESHNESS_PRESENTATION,
  FINANCING_PROGRAM_LABELS,
  FINISHING_PRESENTATION,
  PRIORITY_PRESENTATION,
  PROPERTY_LABELS,
  UTILITY_PRESENTATION,
  VERIFICATION_PRESENTATION,
  formatComparisonValue,
  formatCriterionTarget,
} from "./formatting-registry";
import { COMPARISON_POLICY_V1 } from "./policy";
import {
  comparisonSelectionMatchesRequest,
  comparisonSelectionSchema,
} from "./selection";
import type {
  ComparisonBuildOutcome,
  ComparisonCellState,
  ComparisonCellView,
  ComparisonColumnView,
  ComparisonInput,
  ComparisonItemInput,
  ComparisonReadyItemInput,
  ComparisonRowView,
  ComparisonSectionView,
  ComparisonUnknownGroupView,
} from "./types";

type ReadyItem = ComparisonReadyItemInput;

interface ContextRowDefinition {
  readonly id: string;
  readonly label: string;
  readonly section: "finance" | "timing" | "property" | "type_specific";
  readonly dynamic: boolean;
  readonly value: (item: ReadyItem) => unknown;
  readonly format: (value: unknown, item: ReadyItem) => string;
  readonly comparable: (item: ReadyItem) => string | number | boolean | null;
  readonly evidenceFields: readonly string[];
  readonly applicable?: (property: Property) => boolean;
}

const allCriteria = (input: ComparisonInput): readonly Criterion[] => [
  ...input.userRequest.must_have,
  ...input.userRequest.nice_to_have,
  ...input.userRequest.avoid,
  ...input.userRequest.infrastructure,
  ...input.userRequest.property_features,
];

const readyItems = (input: ComparisonInput): readonly ReadyItem[] =>
  input.items.filter((item): item is ReadyItem => item.status === "ready");

const selectedSourceName = (item: ReadyItem): string => {
  const sourceId = item.detail.selectedOffer?.source_reference.source_id;
  return (
    item.detail.sources.find((source) => source.source_id === sourceId)?.name ??
    "источник не указан"
  );
};

const selectedSellerName = (item: ReadyItem): string =>
  item.detail.selectedOffer?.seller.name ??
  (item.detail.selectedOffer?.seller.seller_type === "developer"
    ? "Застройщик"
    : item.detail.selectedOffer?.seller.seller_type === "owner"
      ? "Собственник"
      : "Продавец");

const moneyNumber = (value: Money | null | undefined): number | null =>
  value && Number.isFinite(Number(value.amount)) ? Number(value.amount) : null;

const latestEvidence = (
  evidence: readonly FieldEvidence[],
): FieldEvidence | null =>
  [...evidence].sort((left, right) =>
    right.collected_at.localeCompare(left.collected_at),
  )[0] ?? null;

const evidenceFor = (
  item: ReadyItem,
  fields: readonly string[],
): FieldEvidence | null => {
  const entityIds = new Set(
    [
      item.selection.propertyId,
      item.selection.offerId,
      item.selection.scenarioId,
      item.detail.selectedFinancingOffer?.financing_offer_id,
      item.detail.selectedFinancingProgram?.program_id,
    ].filter((id): id is string => id !== null && id !== undefined),
  );
  return latestEvidence(
    item.detail.fieldEvidence.filter(
      (evidence) =>
        entityIds.has(evidence.entity_id) && fields.includes(evidence.field),
    ),
  );
};

const dataQualityFor = (item: ReadyItem, fields: readonly string[]) =>
  item.detail.dataQuality?.field_results.find(
    (result) =>
      fields.includes(result.field) ||
      result.data_fields.some((field) => fields.includes(field)),
  ) ?? null;

const hasOpenConflict = (
  item: ReadyItem,
  fields: readonly string[],
): boolean => {
  const ids = new Set(
    [
      item.selection.propertyId,
      item.selection.offerId,
      item.selection.scenarioId,
    ].filter((id): id is string => id !== null),
  );
  return item.detail.sourceConflicts.some(
    (conflict) =>
      conflict.status === "open" &&
      ids.has(conflict.entity_id) &&
      fields.includes(conflict.field),
  );
};

const verificationFor = (
  item: ReadyItem,
  fields: readonly string[],
): keyof typeof VERIFICATION_PRESENTATION => {
  if (hasOpenConflict(item, fields)) return "conflicting";
  const quality = dataQualityFor(item, fields);
  if (quality) return quality.verification_status;
  return evidenceFor(item, fields)?.verification_status ?? "unknown";
};

const freshnessFor = (
  item: ReadyItem,
  fields: readonly string[],
): keyof typeof DETAIL_FRESHNESS_PRESENTATION =>
  dataQualityFor(item, fields)?.freshness_status ??
  evidenceFor(item, fields)?.freshness_status ??
  "unknown";

const criterionExplanation = (
  item: ReadyItem,
  criterion: Criterion,
  result: CriterionEvaluationResult,
): string => {
  const groups = item.detail.matching?.explanation;
  const explanation = [
    ...(groups?.strengths ?? []),
    ...(groups?.compromises ?? []),
    ...(groups?.hard_failures ?? []),
    ...(groups?.critical_unknowns ?? []),
  ].find((candidate) => candidate.criterion_id === criterion.criterion_id);
  if (!explanation) return CRITERION_STATUS_PRESENTATION[result.status];
  const mode =
    result.status === "matched"
      ? "strength"
      : result.status === "unknown" || result.status === "conflicting"
        ? "unknown"
        : "compromise";
  return formatCriterionExplanation(explanation, criterion, mode);
};

const criterionCellState = (
  criterion: Criterion,
  result: CriterionEvaluationResult,
): ComparisonCellState => {
  if (result.status === "hard_failed") return "hard_fail";
  if (result.status === "conflicting") return "conflict";
  if (result.status === "not_applicable") return "not_applicable";
  if (
    result.status === "unknown" &&
    (criterion.priority === "must" || criterion.priority === "exclude")
  )
    return "critical_unknown";
  return "neutral";
};

const unavailableCriterionCell = (propertyId: string): ComparisonCellView => ({
  propertyId,
  value: "Вариант недоступен",
  status: "unavailable",
  statusLabel: "Недоступно",
  verificationLabel: "Нет данных",
  freshnessLabel: null,
  state: "unavailable",
  detail: null,
  comparableValue: null,
  fit: null,
});

const buildCriterionRow = (
  criterion: Criterion,
  items: readonly ComparisonItemInput[],
): ComparisonRowView => ({
  id: `criterion:${criterion.criterion_id}`,
  label: criterion.user_expression ?? getCriterionFieldLabel(criterion.field),
  target: formatCriterionTarget(criterion),
  importance: criterion.priority,
  importanceLabel: PRIORITY_PRESENTATION[criterion.priority],
  userCriterion: true,
  dynamic:
    criterion.category === "finance" || criterion.category === "timeline",
  cells: items.map((item) => {
    if (item.status === "unavailable")
      return unavailableCriterionCell(item.selection.propertyId);
    const result = item.detail.matching?.match_result.criteria_results.find(
      (candidate) => candidate.criterion_id === criterion.criterion_id,
    );
    if (!result) {
      return {
        propertyId: item.selection.propertyId,
        value: "Не рассчитано",
        status: "unknown",
        statusLabel: "Нет результата",
        verificationLabel: "Нет данных",
        freshnessLabel: null,
        state:
          criterion.priority === "must" || criterion.priority === "exclude"
            ? "critical_unknown"
            : "neutral",
        detail: "Результат по этому условию отсутствует.",
        comparableValue: null,
        fit: null,
      };
    }
    return {
      propertyId: item.selection.propertyId,
      value:
        result.status === "not_applicable"
          ? "Не относится к этому типу объекта"
          : criterionExplanation(item, criterion, result),
      status: result.status,
      statusLabel: CRITERION_STATUS_PRESENTATION[result.status],
      verificationLabel:
        VERIFICATION_PRESENTATION[result.verification_status].label,
      freshnessLabel:
        DETAIL_FRESHNESS_PRESENTATION[result.freshness_status].label,
      state: criterionCellState(criterion, result),
      detail: result.unknown_reason,
      comparableValue:
        typeof result.actual === "string" ||
        typeof result.actual === "number" ||
        typeof result.actual === "boolean"
          ? result.actual
          : JSON.stringify(result.actual),
      fit: result.fit,
    };
  }),
});

const formatMonths = (value: number): string => `${value} мес.`;

const mandatoryCosts = (item: ReadyItem): string => {
  const scenario = item.detail.selectedPurchaseScenario;
  if (!scenario) return "Нет выбранного сценария";
  const values = [
    ...scenario.mandatory_costs.map(
      (cost) => `${cost.name}: ${formatMoney(cost.amount)}`,
    ),
    ...(item.detail.selectedOffer?.mandatory_extras.map(
      (extra) => `${extra.name}: ${formatMoney(extra.cost)}`,
    ) ?? []),
    ...(item.detail.selectedFinancingOffer?.mandatory_services
      .filter((service) => service.required)
      .map(
        (service) =>
          `${service.name}: ${service.cost ? formatMoney(service.cost) : "стоимость не указана"}`,
      ) ?? []),
  ];
  return values.length > 0
    ? values.join("; ")
    : "Обязательные расходы не указаны";
};

const CONTEXT_ROWS: readonly ContextRowDefinition[] = [
  {
    id: "listing-price",
    label: "Цена выбранного предложения",
    section: "finance",
    dynamic: true,
    value: (item) => item.detail.selectedOffer?.listing_price,
    format: (value) =>
      value ? formatMoney(value as Money) : "Цена не указана",
    comparable: (item) => moneyNumber(item.detail.selectedOffer?.listing_price),
    evidenceFields: ["offer.listing_price", "listing_price"],
  },
  {
    id: "initial-payment",
    label: "Первоначальный взнос",
    section: "finance",
    dynamic: true,
    value: (item) => item.detail.selectedPurchaseScenario?.initial_payment,
    format: (value) => (value ? formatMoney(value as Money) : "Не рассчитан"),
    comparable: (item) =>
      moneyNumber(item.detail.selectedPurchaseScenario?.initial_payment),
    evidenceFields: ["purchase_scenario.initial_payment", "initial_payment"],
  },
  {
    id: "monthly-payment",
    label: "Ежемесячный платёж",
    section: "finance",
    dynamic: true,
    value: (item) => item.detail.selectedPurchaseScenario?.monthly_payment,
    format: (value) => (value ? formatMoney(value as Money) : "Не рассчитан"),
    comparable: (item) =>
      moneyNumber(item.detail.selectedPurchaseScenario?.monthly_payment),
    evidenceFields: ["purchase_scenario.monthly_payment", "monthly_payment"],
  },
  {
    id: "program",
    label: "Программа",
    section: "finance",
    dynamic: true,
    value: (item) => item.detail.selectedFinancingProgram?.program_type,
    format: (value) =>
      typeof value === "string" && value in FINANCING_PROGRAM_LABELS
        ? FINANCING_PROGRAM_LABELS[
            value as keyof typeof FINANCING_PROGRAM_LABELS
          ]
        : "Без выбранной программы",
    comparable: (item) =>
      item.detail.selectedFinancingProgram?.program_type ?? null,
    evidenceFields: ["financing.program_type", "financing_program"],
  },
  {
    id: "term",
    label: "Срок финансирования",
    section: "finance",
    dynamic: true,
    value: (item) => item.detail.selectedFinancingOffer?.term.maximum_months,
    format: (value, item) => {
      if (typeof value !== "number") return "Не указан";
      const minimum = item.detail.selectedFinancingOffer?.term.minimum_months;
      return minimum
        ? `${formatMonths(minimum)} — ${formatMonths(value)}`
        : `до ${formatMonths(value)}`;
    },
    comparable: (item) =>
      item.detail.selectedFinancingOffer?.term.maximum_months ?? null,
    evidenceFields: ["financing.term", "term"],
  },
  {
    id: "entry-cost",
    label: "Всего средств на входе",
    section: "finance",
    dynamic: true,
    value: (item) =>
      item.detail.selectedPurchaseScenario?.estimated_total_entry_cost,
    format: (value) => (value ? formatMoney(value as Money) : "Не рассчитано"),
    comparable: (item) =>
      moneyNumber(
        item.detail.selectedPurchaseScenario?.estimated_total_entry_cost,
      ),
    evidenceFields: ["purchase_scenario.estimated_total_entry_cost"],
  },
  {
    id: "mandatory-costs",
    label: "Обязательные расходы",
    section: "finance",
    dynamic: true,
    value: mandatoryCosts,
    format: (value) => String(value),
    comparable: () => null,
    evidenceFields: ["purchase_scenario.mandatory_costs"],
  },
  {
    id: "move-in",
    label: "Возможный въезд",
    section: "timing",
    dynamic: true,
    value: (item) => item.detail.property.timeline.move_in_possible_date,
    format: (value) => formatComparisonValue("date", value),
    comparable: (item) => item.detail.property.timeline.move_in_possible_date,
    evidenceFields: ["timeline.move_in_possible_date", "move_in_possible_date"],
  },
  {
    id: "availability",
    label: "Наличие",
    section: "timing",
    dynamic: true,
    value: (item) => item.detail.selectedOffer?.availability,
    format: (value) =>
      typeof value === "string" && value in AVAILABILITY_LABELS
        ? AVAILABILITY_LABELS[value as keyof typeof AVAILABILITY_LABELS]
        : "Статус уточняется",
    comparable: (item) => item.detail.selectedOffer?.availability ?? null,
    evidenceFields: ["offer.availability", "availability"],
  },
  {
    id: "total-area",
    label: "Площадь объекта",
    section: "property",
    dynamic: false,
    value: (item) => item.detail.property.physical.total_area_m2,
    format: (value) => formatComparisonValue("area", value),
    comparable: (item) => item.detail.property.physical.total_area_m2,
    evidenceFields: ["physical.total_area_m2", "total_area_m2"],
    applicable: (property) => property.property_type !== "land",
  },
  {
    id: "finishing",
    label: "Отделка",
    section: "property",
    dynamic: false,
    value: (item) => item.detail.property.condition.finishing_type,
    format: (value) =>
      typeof value === "string" && value in FINISHING_PRESENTATION
        ? FINISHING_PRESENTATION[value as keyof typeof FINISHING_PRESENTATION]
        : "Не подтверждено",
    comparable: (item) => item.detail.property.condition.finishing_type,
    evidenceFields: ["condition.finishing_type"],
    applicable: (property) => property.property_type !== "land",
  },
  {
    id: "ready",
    label: "Можно жить сразу",
    section: "property",
    dynamic: false,
    value: (item) => item.detail.property.condition.ready_for_living,
    format: (value) => formatComparisonValue("boolean", value),
    comparable: (item) => item.detail.property.condition.ready_for_living,
    evidenceFields: ["condition.ready_for_living"],
    applicable: (property) => property.property_type !== "land",
  },
  {
    id: "floor",
    label: "Этаж",
    section: "type_specific",
    dynamic: false,
    value: (item) => item.detail.property.physical.floor,
    format: (value, item) =>
      typeof value === "number"
        ? item.detail.property.building.floors_total
          ? `${value} из ${item.detail.property.building.floors_total}`
          : String(value)
        : "Не подтверждено",
    comparable: (item) => item.detail.property.physical.floor,
    evidenceFields: ["physical.floor", "floor"],
    applicable: (property) =>
      ["apartment", "apartments"].includes(property.property_type),
  },
  {
    id: "elevator",
    label: "Лифт",
    section: "type_specific",
    dynamic: false,
    value: (item) => item.detail.property.building.elevator,
    format: (value) => formatComparisonValue("boolean", value),
    comparable: (item) => item.detail.property.building.elevator,
    evidenceFields: ["building.elevator"],
    applicable: (property) =>
      ["apartment", "apartments"].includes(property.property_type),
  },
  {
    id: "balcony",
    label: "Балкон",
    section: "type_specific",
    dynamic: false,
    value: (item) => item.detail.property.physical.balcony,
    format: (value) => formatComparisonValue("boolean", value),
    comparable: (item) => item.detail.property.physical.balcony,
    evidenceFields: ["physical.balcony"],
    applicable: (property) =>
      ["apartment", "apartments"].includes(property.property_type),
  },
  {
    id: "land-area",
    label: "Площадь участка",
    section: "type_specific",
    dynamic: false,
    value: (item) => item.detail.property.land.area_sotka,
    format: (value) =>
      typeof value === "number" ? `${value} сот.` : "Не подтверждено",
    comparable: (item) => item.detail.property.land.area_sotka,
    evidenceFields: ["land.area_sotka"],
    applicable: (property) =>
      ["house", "townhouse", "land"].includes(property.property_type),
  },
  {
    id: "gas",
    label: "Газ",
    section: "type_specific",
    dynamic: false,
    value: (item) => item.detail.property.utilities.gas,
    format: (value) =>
      typeof value === "string" && value in UTILITY_PRESENTATION
        ? UTILITY_PRESENTATION[value as keyof typeof UTILITY_PRESENTATION]
        : "Не подтверждено",
    comparable: (item) => item.detail.property.utilities.gas,
    evidenceFields: ["utilities.gas", "gas"],
    applicable: (property) =>
      ["house", "townhouse", "land"].includes(property.property_type),
  },
];

const contextualCell = (
  definition: ContextRowDefinition,
  item: ComparisonItemInput,
): ComparisonCellView => {
  if (item.status === "unavailable")
    return unavailableCriterionCell(item.selection.propertyId);
  if (definition.applicable && !definition.applicable(item.detail.property)) {
    return {
      propertyId: item.selection.propertyId,
      value: "Не относится к этому типу объекта",
      status: "not_applicable",
      statusLabel: "Не применимо",
      verificationLabel: "Не требуется",
      freshnessLabel: null,
      state: "not_applicable",
      detail: null,
      comparableValue: null,
      fit: null,
    };
  }
  const value = definition.value(item);
  const verification = verificationFor(item, definition.evidenceFields);
  const freshness = freshnessFor(item, definition.evidenceFields);
  const missing = value === null || value === undefined || value === "unknown";
  const conflict = verification === "conflicting";
  return {
    propertyId: item.selection.propertyId,
    value: conflict
      ? formatFieldUnknown(definition.evidenceFields[0]!)
      : definition.format(value, item),
    status: conflict ? "conflicting" : missing ? "unknown" : "available",
    statusLabel: conflict
      ? "Есть расхождение"
      : missing
        ? "Нет данных"
        : "Значение",
    verificationLabel: VERIFICATION_PRESENTATION[verification].label,
    freshnessLabel: definition.dynamic
      ? DETAIL_FRESHNESS_PRESENTATION[freshness].label
      : null,
    state: conflict ? "conflict" : "neutral",
    detail: null,
    comparableValue: missing ? null : definition.comparable(item),
    fit: null,
  };
};

const markBestConfirmed = (row: ComparisonRowView): ComparisonRowView => {
  if (!row.userCriterion) return row;
  const candidates = row.cells.filter(
    (cell) =>
      cell.fit !== null &&
      ![
        "critical_unknown",
        "conflict",
        "hard_fail",
        "not_applicable",
        "unavailable",
      ].includes(cell.state) &&
      cell.verificationLabel === VERIFICATION_PRESENTATION.confirmed.label &&
      cell.freshnessLabel !== DETAIL_FRESHNESS_PRESENTATION.stale.label &&
      cell.freshnessLabel !== DETAIL_FRESHNESS_PRESENTATION.expired.label,
  );
  const maximum = Math.max(...candidates.map((cell) => cell.fit ?? -1));
  const leaders = candidates.filter((cell) => cell.fit === maximum);
  if (leaders.length !== 1 || candidates.every((cell) => cell.fit === maximum))
    return row;
  const leaderId = leaders[0]!.propertyId;
  return {
    ...row,
    cells: row.cells.map((cell) =>
      cell.propertyId === leaderId
        ? { ...cell, state: "best_confirmed" }
        : cell,
    ),
  };
};

const titleFor = (item: ReadyItem): string =>
  item.detail.property.building.name ??
  item.detail.property.location.address.street ??
  `${PROPERTY_LABELS[item.detail.property.property_type]} ${item.selection.propertyId}`;

const buildColumn = (item: ComparisonItemInput): ComparisonColumnView => {
  if (item.status === "unavailable") {
    return {
      status: "unavailable",
      propertyId: item.selection.propertyId,
      offerId: item.selection.offerId,
      scenarioId: item.selection.scenarioId,
      title: `Вариант ${item.selection.propertyId}`,
      propertyType: "Не найден",
      price: "Недоступно",
      availability: "Недоступно",
      availabilityWarning: item.message,
      matchScore: null,
      matchLabel: "Не рассчитан",
      confidence: "Не рассчитана",
      confidenceBand: "pending",
      scenarioLabel: "Сценарий недоступен",
      scenarioVerification: "Нет данных",
      hardFail: false,
      criticalUnknownCount: 0,
      criticalConflictCount: 0,
      detailHref: null,
      errorMessage: item.message,
    };
  }
  const offer = item.detail.selectedOffer;
  const scenario = item.detail.selectedPurchaseScenario;
  const matching = item.detail.matching?.match_result;
  const quality = item.detail.dataQuality?.data_quality;
  const priceFields = ["offer.listing_price", "listing_price"];
  const priceConflict =
    hasOpenConflict(item, priceFields) ||
    verificationFor(item, priceFields) === "conflicting";
  const unavailable = offer
    ? ["sold", "temporarily_unavailable"].includes(offer.availability)
    : true;
  return {
    status: "ready",
    propertyId: item.selection.propertyId,
    offerId: offer?.offer_id ?? item.selection.offerId,
    scenarioId: scenario?.scenario_id ?? item.selection.scenarioId,
    title: titleFor(item),
    propertyType: PROPERTY_LABELS[item.detail.property.property_type],
    price: priceConflict
      ? "Цена расходится между источниками"
      : offer?.listing_price
        ? `${offer.price_from === true ? "от " : ""}${formatMoney(offer.listing_price)}`
        : "Цена не указана",
    availability: offer
      ? AVAILABILITY_LABELS[offer.availability]
      : "Статус уточняется",
    availabilityWarning: unavailable
      ? offer
        ? `Вариант сейчас имеет статус «${AVAILABILITY_LABELS[offer.availability]}».`
        : "Выбранное предложение не найдено."
      : null,
    matchScore: matching?.match_score ?? null,
    matchLabel: matching
      ? `${matching.match_score}% Match`
      : "Match не рассчитан",
    confidence: quality
      ? `${quality.data_confidence_score}% · ${CONFIDENCE_PRESENTATION[item.detail.dataQuality?.confidence_status ?? "pending"]}`
      : "Надёжность не рассчитана",
    confidenceBand: item.detail.dataQuality?.confidence_status ?? "pending",
    scenarioLabel: scenario
      ? `${selectedSellerName(item)} · ${selectedSourceName(item)} · ${item.detail.selectedFinancingProgram ? FINANCING_PROGRAM_LABELS[item.detail.selectedFinancingProgram.program_type] : "без выбранной кредитной программы"}`
      : "Сценарий не выбран",
    scenarioVerification: scenario
      ? VERIFICATION_PRESENTATION[scenario.verification_status].label
      : "Нет данных",
    hardFail: matching?.eligibility_status === "hard_fail",
    criticalUnknownCount: quality?.critical_unknown_count ?? 0,
    criticalConflictCount: quality?.critical_conflict_count ?? 0,
    detailHref: `/property/${encodeURIComponent(item.selection.propertyId)}?offer=${encodeURIComponent(offer?.offer_id ?? item.selection.offerId ?? "")}&scenario=${encodeURIComponent(scenario?.scenario_id ?? item.selection.scenarioId ?? "")}&from=comparison`,
    errorMessage: null,
  };
};

const buildUnknownGroups = (
  items: readonly ComparisonItemInput[],
  columns: readonly ComparisonColumnView[],
  criteria: readonly Criterion[],
): readonly ComparisonUnknownGroupView[] =>
  items.flatMap((item) => {
    if (item.status === "unavailable") {
      return [
        {
          propertyId: item.selection.propertyId,
          propertyTitle:
            columns.find(
              (column) => column.propertyId === item.selection.propertyId,
            )?.title ?? item.selection.propertyId,
          items: [item.message],
        },
      ];
    }
    const matching =
      item.detail.matching?.explanation.critical_unknowns.map((unknown) => {
        const criterion = criteria.find(
          (candidate) => candidate.criterion_id === unknown.criterion_id,
        );
        return formatFieldUnknown(criterion?.field ?? unknown.criterion_id);
      }) ?? [];
    const quality = item.detail.dataQuality;
    const values = [
      ...matching,
      ...(quality?.critical_unknowns.map((unknown) =>
        formatFieldUnknown(unknown.field),
      ) ?? []),
      ...(quality?.critical_conflicts.map((conflict) =>
        formatFieldUnknown(conflict.field),
      ) ?? []),
      ...(quality?.recommended_checks.map((check) =>
        formatFieldUnknown(check.field),
      ) ?? []),
    ];
    const unique = [...new Set(values)];
    return unique.length > 0
      ? [
          {
            propertyId: item.selection.propertyId,
            propertyTitle:
              columns.find(
                (column) => column.propertyId === item.selection.propertyId,
              )?.title ?? item.selection.propertyId,
            items: unique,
          },
        ]
      : [];
  });

const criterionSection = (criterion: Criterion): ComparisonSectionView["id"] =>
  criterion.priority === "must" || criterion.priority === "exclude"
    ? "must"
    : criterion.priority === "avoid"
      ? "avoid"
      : "preferred";

const SECTION_TITLES: Readonly<Record<ComparisonSectionView["id"], string>> =
  Object.freeze({
    must: "Обязательные условия и исключения",
    preferred: "Желательные условия",
    avoid: "Чего лучше избежать",
    finance: "Финансовый сценарий",
    timing: "Сроки и наличие",
    property: "Объект",
    type_specific: "Особенности типа объекта",
  });

const requestSummary = (input: ComparisonInput): readonly string[] => {
  const criteria = allCriteria(input);
  return criteria
    .filter(
      (criterion) =>
        criterion.priority !== "neutral" && criterion.priority !== "unknown",
    )
    .sort(
      (left, right) =>
        ["must", "exclude", "preferred", "avoid"].indexOf(left.priority) -
        ["must", "exclude", "preferred", "avoid"].indexOf(right.priority),
    )
    .slice(0, 8)
    .map(
      (criterion) =>
        `${PRIORITY_PRESENTATION[criterion.priority]}: ${criterion.user_expression ?? getCriterionFieldLabel(criterion.field)} · ${formatCriterionTarget(criterion)}`,
    );
};

const validate = (input: ComparisonInput): ComparisonBuildOutcome | null => {
  if (Number.isNaN(new Date(input.createdAt).getTime()))
    return {
      success: false,
      error: {
        code: "INVALID_CREATED_AT",
        message: "Comparison created_at must be a valid date-time.",
      },
    };
  const selection = comparisonSelectionSchema.safeParse(input.selection);
  if (
    !selection.success ||
    input.selection.items.length < COMPARISON_POLICY_V1.minimumItems
  )
    return {
      success: false,
      error: {
        code: "INVALID_SELECTION_SIZE",
        message: "Для сравнения выберите от 2 до 4 вариантов.",
      },
    };
  if (!comparisonSelectionMatchesRequest(input.selection, input.userRequest))
    return {
      success: false,
      error: {
        code: "MIXED_USER_REQUEST",
        message: "Условия изменились — пересчитайте сравнение.",
      },
    };
  const signature = (item: {
    propertyId: string;
    offerId: string | null;
    scenarioId: string | null;
  }) => `${item.propertyId}:${item.offerId ?? ""}:${item.scenarioId ?? ""}`;
  const itemSignatures = new Set(
    input.items.map((item) => signature(item.selection)),
  );
  if (
    input.items.length !== input.selection.items.length ||
    input.selection.items.some((item) => !itemSignatures.has(signature(item)))
  )
    return {
      success: false,
      error: {
        code: "BROKEN_REFERENCE",
        message: "Состав сравнения не совпадает с выбранными вариантами.",
      },
    };
  return null;
};

export const buildComparisonView = (
  input: ComparisonInput,
): ComparisonBuildOutcome => {
  const invalid = validate(input);
  if (invalid) return invalid;
  const columns = input.items.map(buildColumn);
  const criteria = allCriteria(input).filter(
    (criterion) =>
      criterion.priority !== "neutral" && criterion.priority !== "unknown",
  );
  const criterionRows = criteria.map((criterion) =>
    markBestConfirmed(buildCriterionRow(criterion, input.items)),
  );
  const contextRows = CONTEXT_ROWS.map((definition) => ({
    id: `context:${definition.id}`,
    label: definition.label,
    target: null,
    importance: "context" as const,
    importanceLabel: PRIORITY_PRESENTATION.context,
    userCriterion: false,
    dynamic: definition.dynamic,
    cells: input.items.map((item) => contextualCell(definition, item)),
    section: definition.section,
  }));
  const sections = (
    Object.keys(SECTION_TITLES) as ComparisonSectionView["id"][]
  )
    .map((sectionId) => {
      const rows = [
        ...criterionRows.filter(
          (row) =>
            criterionSection(
              criteria.find(
                (criterion) => `criterion:${criterion.criterion_id}` === row.id,
              )!,
            ) === sectionId,
        ),
        ...contextRows.filter((row) => row.section === sectionId),
      ];
      return {
        id: sectionId,
        title: SECTION_TITLES[sectionId],
        rows,
      } satisfies ComparisonSectionView;
    })
    .filter((section) => section.rows.length > 0);
  const flattened = sections.flatMap((section) => section.rows);
  const decisionDrivers = buildDecisionDrivers(flattened, columns);
  const conclusion = buildComparisonConclusion({
    columns,
    rows: flattened,
    decisionDrivers,
  });
  const criticalUnknowns = buildUnknownGroups(input.items, columns, criteria);
  const propertyIds = input.selection.items.map((item) => item.propertyId);
  return {
    success: true,
    view: {
      comparisonId: input.comparisonId,
      userRequestId: input.userRequest.user_request_id,
      userRequestSchemaVersion: input.userRequest.schema_version,
      selectionSignature: input.selection.items
        .map(
          (item) =>
            `${item.propertyId}:${item.offerId ?? ""}:${item.scenarioId ?? ""}`,
        )
        .join("|"),
      requestSummary: requestSummary(input),
      columns,
      sections,
      decisionDrivers,
      tradeoffs: buildTradeoffs(decisionDrivers, columns),
      criticalUnknowns,
      conclusion,
      partial:
        input.partial || readyItems(input).some((item) => item.detail.partial),
      actions: {
        shortlistHref: "/shortlist",
        editRequestHref: "/request/confirm",
        expertHref:
          input.selection.items.length >= COMPARISON_POLICY_V1.minimumItems
            ? `${COMPARISON_POLICY_V1.expertRequestPath}?type=choice_assistance&comparison=${encodeURIComponent(input.comparisonId)}&request=${encodeURIComponent(input.userRequest.user_request_id)}&properties=${encodeURIComponent(propertyIds.join(","))}&unknowns=${criticalUnknowns.reduce((sum, group) => sum + group.items.length, 0)}`
            : null,
        canAdd:
          input.selection.items.length < COMPARISON_POLICY_V1.maximumItems,
      },
    },
  };
};
