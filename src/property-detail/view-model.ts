import type {
  Criterion,
  FieldEvidence,
  Offer,
  Property,
  Source,
  SourceConflict,
  UserRequest,
} from "../domain";
import type { RecommendedCheck } from "../matching";
import {
  asMoneyLike,
  formatArea,
  formatDate,
  formatMoney,
} from "../shortlist/formatters";
import {
  formatCriterionExplanation,
  formatFieldUnknown,
} from "../shortlist/presentation-registry";
import { PROPERTY_DETAIL_POLICY_V1 } from "./policy";
import {
  AVAILABILITY_LABELS,
  CHECK_PRESENTATION,
  COMPLETENESS_PRESENTATION,
  CONFIDENCE_PRESENTATION,
  CRITERION_STATUS_PRESENTATION,
  DETAIL_FRESHNESS_PRESENTATION,
  FINANCING_PROGRAM_LABELS,
  FINISHING_PRESENTATION,
  PROPERTY_LABELS,
  SOURCE_TYPE_PRESENTATION,
  UTILITY_PRESENTATION,
  VERIFICATION_PRESENTATION,
  getCriterionFieldLabel,
} from "./presentation-registry";
import type {
  AlternativeOfferView,
  ConflictView,
  DecisionPointView,
  DetailStatusView,
  FinancingView,
  PropertyDetailBuildOutcome,
  PropertyDetailInput,
  PropertyFactView,
  RecommendedCheckView,
  SourceSectionView,
  UnknownView,
} from "./types";

type FactSemantics = PropertyFactView["semantics"];

interface FactDefinition {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly string[];
  readonly value: (property: Property) => unknown;
  readonly format: (value: unknown, property: Property) => string;
  readonly notApplicable?: (property: Property) => boolean;
  readonly dynamic?: boolean;
}

const allCriteria = (request: UserRequest | null): readonly Criterion[] =>
  request
    ? [
        ...request.must_have,
        ...request.nice_to_have,
        ...request.avoid,
        ...request.infrastructure,
        ...request.property_features,
      ]
    : [];

const statusView = (
  status: keyof typeof VERIFICATION_PRESENTATION,
): DetailStatusView => ({ key: status, ...VERIFICATION_PRESENTATION[status] });

const freshnessView = (
  status: keyof typeof DETAIL_FRESHNESS_PRESENTATION,
): DetailStatusView => ({
  key: status,
  ...DETAIL_FRESHNESS_PRESENTATION[status],
});

const safeUrl = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const latestEvidence = (
  evidence: readonly FieldEvidence[],
): FieldEvidence | null =>
  [...evidence].sort((left, right) =>
    right.collected_at.localeCompare(left.collected_at),
  )[0] ?? null;

const relevantConflict = (
  conflicts: readonly SourceConflict[],
  entityIds: ReadonlySet<string>,
  fields: readonly string[],
): SourceConflict | null =>
  conflicts.find(
    (conflict) =>
      conflict.status === "open" &&
      entityIds.has(conflict.entity_id) &&
      fields.includes(conflict.field),
  ) ?? null;

const formatBoolean = (value: unknown): string =>
  value === true ? "Да" : value === false ? "Нет" : "Не подтверждено";

const stringOrUnknown = (value: unknown): string =>
  typeof value === "string" && value.trim().length > 0
    ? value
    : "Не подтверждено";

const FACTS: readonly FactDefinition[] = [
  {
    id: "rooms",
    label: "Комнаты",
    fields: ["physical.rooms", "rooms"],
    value: (property) => property.physical.rooms,
    format: (value) =>
      typeof value === "number"
        ? value === 0
          ? "Студия"
          : String(value)
        : "Не подтверждено",
    notApplicable: (property) => property.property_type === "land",
  },
  {
    id: "total-area",
    label: "Площадь объекта",
    fields: ["physical.total_area_m2", "total_area_m2"],
    value: (property) => property.physical.total_area_m2,
    format: (value) =>
      typeof value === "number" ? formatArea(value) : "Не подтверждено",
    notApplicable: (property) => property.property_type === "land",
  },
  {
    id: "land-area",
    label: "Площадь участка",
    fields: ["land.area_sotka"],
    value: (property) => property.land.area_sotka,
    format: (value) =>
      typeof value === "number" ? `${value} сот.` : "Не подтверждено",
    notApplicable: (property) =>
      !["house", "townhouse", "land"].includes(property.property_type),
  },
  {
    id: "floor",
    label: "Этаж",
    fields: ["physical.floor", "floor"],
    value: (property) => property.physical.floor,
    format: (value, property) =>
      typeof value === "number"
        ? property.building.floors_total
          ? `${value} из ${property.building.floors_total}`
          : String(value)
        : "Не подтверждено",
    notApplicable: (property) =>
      !["apartment", "apartments"].includes(property.property_type),
  },
  {
    id: "finishing",
    label: "Отделка",
    fields: ["condition.finishing_type"],
    value: (property) => property.condition.finishing_type,
    format: (value) =>
      FINISHING_PRESENTATION[value as keyof typeof FINISHING_PRESENTATION] ??
      "Не подтверждено",
    notApplicable: (property) => property.property_type === "land",
  },
  {
    id: "ready",
    label: "Можно жить сразу",
    fields: ["condition.ready_for_living"],
    value: (property) => property.condition.ready_for_living,
    format: formatBoolean,
    notApplicable: (property) => property.property_type === "land",
  },
  {
    id: "balcony",
    label: "Балкон",
    fields: ["physical.balcony"],
    value: (property) => property.physical.balcony,
    format: formatBoolean,
    notApplicable: (property) =>
      !["apartment", "apartments"].includes(property.property_type),
  },
  {
    id: "building",
    label: "Дом / проект",
    fields: ["building.name", "building.building_type"],
    value: (property) =>
      property.building.name ?? property.building.building_type,
    format: stringOrUnknown,
    notApplicable: (property) => property.property_type === "land",
  },
  ...(["electricity", "water", "gas", "sewerage", "heating"] as const).map(
    (utility): FactDefinition => ({
      id: `utility-${utility}`,
      label:
        utility === "electricity"
          ? "Электричество"
          : utility === "water"
            ? "Вода"
            : utility === "gas"
              ? "Газ"
              : utility === "sewerage"
                ? "Канализация"
                : "Отопление",
      fields: [`utilities.${utility}`, utility],
      value: (property) => property.utilities[utility],
      format: (value) =>
        UTILITY_PRESENTATION[value as keyof typeof UTILITY_PRESENTATION] ??
        "Не подтверждено",
      notApplicable: (property) =>
        !["house", "townhouse", "land"].includes(property.property_type),
    }),
  ),
  {
    id: "permitted-use",
    label: "Разрешённое использование",
    fields: ["land.permitted_use"],
    value: (property) => property.land.permitted_use,
    format: stringOrUnknown,
    notApplicable: (property) => property.property_type !== "land",
  },
];

const TIMELINE_FACTS: readonly FactDefinition[] = [
  {
    id: "commissioning",
    label: "Завершение строительства",
    fields: ["timeline.planned_commissioning_date"],
    value: (property) => property.timeline.planned_commissioning_date,
    format: (value) =>
      typeof value === "string" ? formatDate(value) : "Нет данных",
    dynamic: true,
  },
  {
    id: "handover",
    label: "Передача объекта",
    fields: ["timeline.handover_date", "handover_date"],
    value: (property) => property.timeline.handover_date,
    format: (value) =>
      typeof value === "string" ? formatDate(value) : "Нет данных",
    dynamic: true,
  },
  {
    id: "move-in",
    label: "Возможный въезд",
    fields: ["timeline.move_in_possible_date", "move_in_possible_date"],
    value: (property) => property.timeline.move_in_possible_date,
    format: (value) =>
      typeof value === "string" ? formatDate(value) : "Нет данных",
    dynamic: true,
  },
];

const factSemantics = (
  value: unknown,
  notApplicable: boolean,
): FactSemantics => {
  if (notApplicable) return "not_applicable";
  if (value === null || value === undefined || value === "unknown")
    return "unknown";
  if (value === false || value === "absent") return "false";
  return "known";
};

const buildFacts = (
  definitions: readonly FactDefinition[],
  input: PropertyDetailInput,
): readonly PropertyFactView[] => {
  const criteria = allCriteria(input.userRequest);
  const relevantFields = new Set(criteria.map((criterion) => criterion.field));
  const propertyId = input.property.identity.property_id;
  const entityIds = new Set([propertyId]);
  return definitions
    .map((definition, order) => {
      const notApplicable = definition.notApplicable?.(input.property) ?? false;
      if (notApplicable) return null;
      const value = definition.value(input.property);
      const semantics = factSemantics(value, false);
      const evidence = input.fieldEvidence.filter(
        (item) =>
          item.entity_id === propertyId &&
          definition.fields.includes(item.field),
      );
      const selectedEvidence = latestEvidence(evidence);
      const conflict = relevantConflict(
        input.sourceConflicts,
        entityIds,
        definition.fields,
      );
      const verification = conflict
        ? statusView("conflicting")
        : semantics === "unknown"
          ? statusView("unknown")
          : statusView(selectedEvidence?.verification_status ?? "unconfirmed");
      const freshness = definition.dynamic
        ? freshnessView(selectedEvidence?.freshness_status ?? "unknown")
        : null;
      const requestRelevant = definition.fields.some((field) =>
        relevantFields.has(field),
      );
      const weight = Math.max(
        0,
        ...criteria
          .filter((criterion) => definition.fields.includes(criterion.field))
          .map((criterion) =>
            criterion.priority === "must" || criterion.priority === "exclude"
              ? 100
              : (criterion.weight ?? 1),
          ),
      );
      return {
        fact: {
          id: definition.id,
          label: definition.label,
          value: definition.format(value, input.property),
          semantics,
          verification,
          freshness,
          requestRelevant,
        } satisfies PropertyFactView,
        weight,
        order,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(
      (left, right) => right.weight - left.weight || left.order - right.order,
    )
    .map((item) => item.fact);
};

const propertyLocation = (property: Property): string => {
  const address = property.location.address;
  return [
    address.city ?? address.locality,
    address.district,
    [address.street, address.house_number].filter(Boolean).join(", "),
  ]
    .filter((part) => Boolean(part))
    .join(" · ");
};

const propertySummary = (property: Property): readonly string[] => {
  const values: string[] = [];
  if (property.physical.rooms !== null)
    values.push(
      property.physical.rooms === 0
        ? "Студия"
        : `${property.physical.rooms}-комнатная`,
    );
  if (property.physical.total_area_m2 !== null)
    values.push(formatArea(property.physical.total_area_m2));
  if (property.physical.floor !== null)
    values.push(`${property.physical.floor} этаж`);
  if (property.land.area_sotka !== null)
    values.push(`${property.land.area_sotka} сот.`);
  return values.slice(0, 3);
};

const conflictApplies = (
  conflict: SourceConflict,
  input: PropertyDetailInput,
): boolean => {
  if (conflict.status !== "open") return false;
  const entityIds = new Set(
    [
      input.property.identity.property_id,
      input.selectedOffer?.offer_id,
      input.selectedPurchaseScenario?.scenario_id,
      input.selectedFinancingOffer?.financing_offer_id,
      input.selectedPromotion?.promotion_id,
    ].filter((id): id is string => Boolean(id)),
  );
  if (entityIds.has(conflict.entity_id)) return true;
  return (
    input.dataQuality?.critical_conflicts.some((item) =>
      item.evidence_refs.some((id) => conflict.evidence_ids.includes(id)),
    ) ?? false
  );
};

const buildPrice = (input: PropertyDetailInput) => {
  const conflict = input.sourceConflicts.some(
    (item) => conflictApplies(item, input) && item.field === "listing_price",
  );
  if (conflict) {
    return {
      kind: "conflicting" as const,
      label: "Цена требует уточнения",
      note: "В источниках указаны разные значения.",
    };
  }
  const price = input.selectedOffer?.listing_price;
  if (!price)
    return {
      kind: "unknown" as const,
      label: "Цена не указана",
      note: "Нужно запросить актуальную цену.",
    };
  const formatted = formatMoney(price);
  return input.selectedOffer?.price_from === true
    ? {
        kind: "from" as const,
        label: `от ${formatted}`,
        note: "Минимальная цена, а не точная цена выбранного объекта.",
      }
    : { kind: "exact" as const, label: formatted, note: null };
};

const criterionMap = (request: UserRequest | null): Map<string, Criterion> =>
  new Map(
    allCriteria(request).map((criterion) => [
      criterion.criterion_id,
      criterion,
    ]),
  );

const buildDecisionPoints = (
  input: PropertyDetailInput,
  kind: "strengths" | "compromises" | "hard_failures",
): readonly DecisionPointView[] => {
  if (!input.userRequest || !input.matching) return [];
  const criteria = criterionMap(input.userRequest);
  const mode = kind === "strengths" ? "strength" : "compromise";
  const limit =
    kind === "strengths"
      ? PROPERTY_DETAIL_POLICY_V1.maxStrengths
      : PROPERTY_DETAIL_POLICY_V1.maxCompromises;
  return input.matching.explanation[kind].slice(0, limit).map((item) => ({
    id: item.criterion_id,
    text: formatCriterionExplanation(
      item,
      criteria.get(item.criterion_id) ?? null,
      mode,
    ),
  }));
};

const checkView = (
  check: RecommendedCheck,
  propertyId: string,
): RecommendedCheckView => ({
  id: `${check.code}:${check.field}`,
  field: check.field,
  title: CHECK_PRESENTATION[check.code],
  priority: check.priority,
  expertHref: `${PROPERTY_DETAIL_POLICY_V1.expertRequestPath}?property=${encodeURIComponent(propertyId)}&field=${encodeURIComponent(check.field)}&check=${encodeURIComponent(check.code)}`,
});

const matchingCheck = (
  field: string,
  checks: readonly RecommendedCheckView[],
): RecommendedCheckView | null =>
  checks.find(
    (check) =>
      check.field === field ||
      check.field.endsWith(field) ||
      field.endsWith(check.field),
  ) ?? null;

const buildUnknowns = (
  input: PropertyDetailInput,
  checks: readonly RecommendedCheckView[],
): readonly UnknownView[] => {
  if (!input.userRequest) return [];
  const criteria = criterionMap(input.userRequest);
  const matchingUnknowns =
    input.matching?.explanation.critical_unknowns.map((item) => {
      const criterion = criteria.get(item.criterion_id);
      const field = criterion?.field ?? item.criterion_id;
      return {
        id: `matching:${item.criterion_id}`,
        title: formatFieldUnknown(field),
        detail: "Обязательное условие нельзя считать выполненным без проверки.",
        check: matchingCheck(field, checks),
      } satisfies UnknownView;
    }) ?? [];
  const qualityUnknowns =
    input.dataQuality?.critical_unknowns.map((item) => ({
      id: `quality:${item.field}`,
      title: formatFieldUnknown(item.field),
      detail:
        item.current_status === "claimed"
          ? "Условие заявлено источником, но пока не подтверждено."
          : "Для критичного поля недостаточно подтверждённых данных.",
      check: matchingCheck(item.field, checks),
    })) ?? [];
  const scenarioUnknowns =
    input.matching?.explanation.scenario_unknowns.map((item) => ({
      id: `scenario:${item.scenario_id}`,
      title: "Совместимость условий сценария нужно подтвердить",
      detail:
        "Расчёт не доказывает применимость всех условий к выбранному предложению.",
      check: matchingCheck("financing_program", checks),
    })) ?? [];
  const byId = new Map<string, UnknownView>();
  [...matchingUnknowns, ...qualityUnknowns, ...scenarioUnknowns].forEach(
    (item) => byId.set(item.id, item),
  );
  return [...byId.values()];
};

const formatEvidenceValue = (field: string, value: unknown): string => {
  const money = asMoneyLike(value);
  if (money) return formatMoney(money);
  if (field.includes("area") && typeof value === "number")
    return formatArea(value);
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value);
    return value;
  }
  if (typeof value === "number") return String(value);
  return "Значение не указано";
};

const buildConflicts = (
  input: PropertyDetailInput,
  checks: readonly RecommendedCheckView[],
): readonly ConflictView[] =>
  input.sourceConflicts
    .filter((conflict) => conflictApplies(conflict, input))
    .map((conflict) => ({
      id: conflict.conflict_id,
      title: `${getCriterionFieldLabel(conflict.field)}: данные расходятся`,
      severityLabel:
        conflict.severity === "critical"
          ? "Критичное расхождение"
          : conflict.severity === "significant"
            ? "Значимое расхождение"
            : "Расхождение источников",
      values: conflict.evidence_ids.flatMap((evidenceId) => {
        const evidence = input.fieldEvidence.find(
          (item) => item.evidence_id === evidenceId,
        );
        if (!evidence) return [];
        const source = input.sources.find(
          (item) => item.source_id === evidence.source_id,
        );
        return [
          {
            evidenceId,
            value: formatEvidenceValue(conflict.field, evidence.value),
            source: source?.name ?? "Источник не указан",
            checkedAt: formatDate(evidence.collected_at),
            verification: statusView(evidence.verification_status),
            sourceUrl:
              source?.policy_metadata.display_rights === true
                ? safeUrl(evidence.source_url ?? source.base_url)
                : null,
          },
        ];
      }),
      check: matchingCheck(conflict.field, checks),
    }));

const formatMonths = (months: number): string =>
  months % 12 === 0 ? `${months / 12} лет` : `${months} мес.`;

const buildFinancing = (input: PropertyDetailInput): FinancingView => {
  const scenario = input.selectedPurchaseScenario;
  if (!scenario) {
    return {
      available: false,
      scenarioId: null,
      context: "Для выбранного предложения готовый сценарий покупки не указан.",
      claimedNotice: null,
      facts: [],
      rates: [],
      mandatoryCosts: [],
      assumptions: [],
      promotion: null,
      priceImpact: null,
      verification: null,
      freshness: null,
    };
  }
  const facts = [
    input.selectedOffer?.listing_price
      ? {
          label: "Цена предложения",
          value: formatMoney(input.selectedOffer.listing_price),
        }
      : null,
    scenario.initial_payment
      ? {
          label: "Первоначальный взнос",
          value: formatMoney(scenario.initial_payment),
        }
      : null,
    scenario.loan_amount
      ? { label: "Сумма кредита", value: formatMoney(scenario.loan_amount) }
      : null,
    scenario.monthly_payment
      ? {
          label: "Ежемесячный платёж",
          value: formatMoney(scenario.monthly_payment),
        }
      : null,
    scenario.estimated_total_entry_cost
      ? {
          label: "Сколько потребуется на входе",
          value: formatMoney(scenario.estimated_total_entry_cost),
        }
      : null,
    scenario.total_payment
      ? {
          label: "Расчётная сумма выплат",
          value: formatMoney(scenario.total_payment),
        }
      : null,
    input.selectedFinancingProgram
      ? {
          label: "Программа",
          value:
            FINANCING_PROGRAM_LABELS[
              input.selectedFinancingProgram.program_type
            ],
        }
      : { label: "Программа", value: "Без выбранной кредитной программы" },
    input.selectedFinancingOffer?.term.maximum_months
      ? {
          label: "Срок",
          value: input.selectedFinancingOffer.term.minimum_months
            ? `${formatMonths(input.selectedFinancingOffer.term.minimum_months)} — ${formatMonths(input.selectedFinancingOffer.term.maximum_months)}`
            : `до ${formatMonths(input.selectedFinancingOffer.term.maximum_months)}`,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const rateStructure = input.selectedFinancingOffer?.rate_structure;
  const rates = rateStructure
    ? rateStructure.periods.length > 0
      ? rateStructure.periods.map((period, index) => ({
          id: `period-${index + 1}`,
          period: period.to_month
            ? `${period.from_month}–${period.to_month} месяц`
            : `с ${period.from_month} месяца`,
          rate: `${period.rate_percent}%`,
          conditions: period.conditions,
        }))
      : [
          rateStructure.nominal_rate_percent
            ? {
                id: "nominal",
                period: "Номинальная ставка",
                rate: `${rateStructure.nominal_rate_percent}%${rateStructure.rate_from ? " от" : ""}`,
                conditions: rateStructure.conditions,
              }
            : rateStructure.advertised_rate_percent
              ? {
                  id: "advertised",
                  period: "Заявленная ставка",
                  rate: `${rateStructure.advertised_rate_percent}%${rateStructure.rate_from ? " от" : ""}`,
                  conditions: rateStructure.conditions,
                }
              : null,
        ].filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  const mandatoryCosts = [
    ...scenario.mandatory_costs.map((cost) => ({
      label: cost.name,
      value: formatMoney(cost.amount),
    })),
    ...(input.selectedOffer?.mandatory_extras.map((extra) => ({
      label: extra.name,
      value: `${formatMoney(extra.cost)} · ${VERIFICATION_PRESENTATION[extra.verification_status].label}`,
    })) ?? []),
    ...(input.selectedFinancingOffer?.mandatory_services
      .filter((service) => service.required)
      .map((service) => ({
        label: service.name,
        value: service.cost
          ? formatMoney(service.cost)
          : "Стоимость не указана",
      })) ?? []),
  ];
  const impact =
    input.selectedPromotion?.price_impact.kind !== "none" &&
    input.selectedPromotion?.price_impact.kind !== undefined
      ? input.selectedPromotion.price_impact
      : input.selectedFinancingOffer?.price_impact;
  const priceImpact =
    impact && impact.kind !== "none"
      ? (impact.description ??
        (impact.amount
          ? `Цена ${impact.kind === "increase" ? "выше" : impact.kind === "decrease" ? "ниже" : "может отличаться"} на ${formatMoney(impact.amount)}.`
          : "Влияние программы на цену нужно уточнить."))
      : null;
  const claimed = [
    scenario.verification_status,
    scenario.terms_compatibility_status,
    input.selectedFinancingOffer?.verification_status,
    input.selectedPromotion?.verification_status,
  ].some((status) =>
    ["claimed", "unconfirmed", "unknown", "conflicting"].includes(status ?? ""),
  );
  return {
    available: true,
    scenarioId: scenario.scenario_id,
    context:
      "Расчёт относится только к этому предложению и сценарию; это не банковское одобрение.",
    claimedNotice: claimed
      ? "Условие заявлено, но ещё не подтверждено для этого объекта."
      : null,
    facts,
    rates,
    mandatoryCosts,
    assumptions: scenario.assumptions.map((assumption) => ({
      text: assumption.assumption,
      verification: statusView(assumption.verification_status),
    })),
    promotion: input.selectedPromotion
      ? `${input.selectedPromotion.title}${input.selectedPromotion.conditions.length > 0 ? `: ${input.selectedPromotion.conditions.join("; ")}` : ""}`
      : null,
    priceImpact,
    verification: statusView(scenario.verification_status),
    freshness: freshnessView(scenario.freshness_status),
  };
};

const sourceForOffer = (offer: Offer, sources: readonly Source[]): string =>
  sources.find(
    (source) => source.source_id === offer.source_reference.source_id,
  )?.name ?? "Источник не указан";

const buildAlternativeOffers = (
  input: PropertyDetailInput,
): readonly AlternativeOfferView[] =>
  input.offers
    .filter((offer) => offer.offer_id !== input.selectedOffer?.offer_id)
    .map((offer) => ({
      offerId: offer.offer_id,
      seller:
        offer.seller.name ??
        (offer.seller.seller_type === "owner"
          ? "Собственник"
          : offer.seller.seller_type === "developer"
            ? "Застройщик"
            : "Продавец не указан"),
      source: sourceForOffer(offer, input.sources),
      price: offer.listing_price
        ? `${offer.price_from === true ? "от " : ""}${formatMoney(offer.listing_price)}`
        : "Цена не указана",
      availability: AVAILABILITY_LABELS[offer.availability],
      commercialTerms: unique([
        ...(offer.commercial_terms.reservation_terms
          ? [offer.commercial_terms.reservation_terms]
          : []),
        ...(offer.commercial_terms.payment_terms
          ? [offer.commercial_terms.payment_terms]
          : []),
        ...offer.commercial_terms.notes,
      ]),
      financingDifference:
        offer.financing_offer_ids.length > 0
          ? `Свои финансовые условия: ${offer.financing_offer_ids.length}`
          : "Отдельные финансовые условия не указаны",
      href: `/property/${encodeURIComponent(input.property.identity.property_id)}?offer=${encodeURIComponent(offer.offer_id)}`,
    }));

const verificationRank: Readonly<Record<string, number>> = Object.freeze({
  unknown: 6,
  conflicting: 5,
  stale: 4,
  unconfirmed: 3,
  claimed: 2,
  confirmed: 1,
});
const freshnessRank: Readonly<Record<string, number>> = Object.freeze({
  unknown: 5,
  expired: 4,
  stale: 3,
  aging: 2,
  fresh: 1,
});

const worstStatus = <T extends string>(
  values: readonly T[],
  ranking: Readonly<Record<string, number>>,
  fallback: T,
): T =>
  [...values].sort(
    (left, right) => (ranking[right] ?? 0) - (ranking[left] ?? 0),
  )[0] ?? fallback;

const buildSources = (
  input: PropertyDetailInput,
): readonly SourceSectionView[] => {
  const entityIds = new Set(
    [
      input.property.identity.property_id,
      ...input.offers.map((offer) => offer.offer_id),
      ...input.purchaseScenarios.map((scenario) => scenario.scenario_id),
      input.selectedFinancingProgram?.program_id,
      input.selectedFinancingOffer?.financing_offer_id,
      input.selectedPromotion?.promotion_id,
    ].filter((id): id is string => Boolean(id)),
  );
  const relevant = input.fieldEvidence.filter((item) =>
    entityIds.has(item.entity_id),
  );
  const referencedSourceIds = new Set([
    ...relevant.map((item) => item.source_id),
    ...input.offers.map((offer) => offer.source_reference.source_id),
    ...(input.selectedFinancingProgram?.source_references.map(
      (reference) => reference.source_id,
    ) ?? []),
    ...(input.selectedFinancingOffer
      ? [input.selectedFinancingOffer.source_reference.source_id]
      : []),
    ...(input.selectedPromotion
      ? [input.selectedPromotion.source_reference.source_id]
      : []),
  ]);
  return input.sources
    .filter((source) => referencedSourceIds.has(source.source_id))
    .map((source) => {
      const evidence = relevant.filter(
        (item) => item.source_id === source.source_id,
      );
      const latest = latestEvidence(evidence);
      const verification = worstStatus(
        evidence.map((item) => item.verification_status),
        verificationRank,
        "unknown",
      );
      const freshness = worstStatus(
        evidence.map((item) => item.freshness_status),
        freshnessRank,
        "unknown",
      );
      const evidenceUrl = evidence.find((item) =>
        safeUrl(item.source_url),
      )?.source_url;
      return {
        sourceId: source.source_id,
        name: source.name,
        typeLabel: SOURCE_TYPE_PRESENTATION[source.source_type],
        url:
          source.policy_metadata.display_rights === true
            ? safeUrl(evidenceUrl ?? source.base_url)
            : null,
        checkedAt: latest ? formatDate(latest.collected_at) : "Дата не указана",
        supports: unique(
          evidence.map((item) => getCriterionFieldLabel(item.field)),
        ),
        evidenceCount: evidence.length,
        verification: statusView(verification),
        freshness: freshnessView(freshness),
      };
    });
};

const buildCriterionResults = (
  input: PropertyDetailInput,
): readonly PropertyFactView[] => {
  if (!input.userRequest || !input.matching) return [];
  const criteria = criterionMap(input.userRequest);
  return input.matching.match_result.criteria_results.map((result) => {
    const criterion = criteria.get(result.criterion_id);
    const status = CRITERION_STATUS_PRESENTATION[result.status];
    const semantics: FactSemantics =
      result.status === "not_applicable"
        ? "not_applicable"
        : result.status === "unknown" || result.status === "conflicting"
          ? "unknown"
          : "known";
    return {
      id: result.criterion_id,
      label: criterion
        ? getCriterionFieldLabel(criterion.field)
        : result.criterion_id,
      value: status,
      semantics,
      verification: statusView(result.verification_status),
      freshness: freshnessView(result.freshness_status),
      requestRelevant: true,
    };
  });
};

const validateInput = (
  input: PropertyDetailInput,
): PropertyDetailBuildOutcome | null => {
  if (Number.isNaN(new Date(input.generatedAt).getTime())) {
    return {
      success: false,
      error: {
        code: "INVALID_GENERATED_AT",
        message: "Property detail generated_at must be a valid date-time.",
      },
    };
  }
  const propertyId = input.property.identity.property_id;
  if (
    input.offers.some((offer) => offer.property_id !== propertyId) ||
    (input.selectedOffer !== null &&
      (!input.offers.some(
        (offer) => offer.offer_id === input.selectedOffer?.offer_id,
      ) ||
        input.selectedOffer.property_id !== propertyId)) ||
    input.purchaseScenarios.some(
      (scenario) => scenario.property_id !== propertyId,
    ) ||
    (input.selectedPurchaseScenario !== null &&
      (input.selectedPurchaseScenario.property_id !== propertyId ||
        input.selectedPurchaseScenario.offer_id !==
          input.selectedOffer?.offer_id)) ||
    (input.matching !== null &&
      (input.userRequest === null ||
        input.matching.match_result.property_id !== propertyId ||
        input.matching.match_result.user_request_id !==
          input.userRequest.user_request_id)) ||
    (input.dataQuality !== null && input.matching === null)
  ) {
    return {
      success: false,
      error: {
        code: "BROKEN_REFERENCE",
        message:
          "Property detail input contains inconsistent property, offer, scenario or request references.",
      },
    };
  }
  return null;
};

export const buildPropertyDetailView = (
  input: PropertyDetailInput,
): PropertyDetailBuildOutcome => {
  const invalid = validateInput(input);
  if (invalid) return invalid;
  const propertyId = input.property.identity.property_id;
  const checks =
    input.dataQuality?.recommended_checks.map((check) =>
      checkView(check, propertyId),
    ) ?? [];
  const matching = input.userRequest ? input.matching : null;
  const dataQuality = input.userRequest ? input.dataQuality : null;
  const confidenceBand = dataQuality?.confidence_status ?? "pending";
  const completenessBand = dataQuality?.completeness_status ?? "pending";
  const query = [
    input.selectedOffer
      ? `offer=${encodeURIComponent(input.selectedOffer.offer_id)}`
      : null,
    input.selectedPurchaseScenario
      ? `scenario=${encodeURIComponent(input.selectedPurchaseScenario.scenario_id)}`
      : null,
  ]
    .filter(Boolean)
    .join("&");
  const propertyType = PROPERTY_LABELS[input.property.property_type];
  return {
    success: true,
    view: {
      propertyId,
      selectedOfferId: input.selectedOffer?.offer_id ?? null,
      selectedScenarioId: input.selectedPurchaseScenario?.scenario_id ?? null,
      personalized: input.userRequest !== null && matching !== null,
      partial:
        input.partial || (input.userRequest !== null && dataQuality === null),
      contextNotice: input.contextNotice,
      identity: {
        title: input.property.building.name
          ? `${propertyType} · ${input.property.building.name}`
          : propertyType,
        location: propertyLocation(input.property) || "Адрес не указан",
        summary: propertySummary(input.property),
        image: null,
      },
      price: buildPrice(input),
      availability: {
        label: input.selectedOffer
          ? AVAILABILITY_LABELS[input.selectedOffer.availability]
          : "Статус уточняется",
        freshness: input.selectedOffer
          ? DETAIL_FRESHNESS_PRESENTATION[input.selectedOffer.freshness_status]
              .label
          : DETAIL_FRESHNESS_PRESENTATION.unknown.label,
        checkedAt: input.selectedOffer?.updated_at
          ? `Проверено ${formatDate(input.selectedOffer.updated_at)}`
          : "Дата проверки неизвестна",
      },
      matchSummary: matching
        ? {
            score: matching.match_result.match_score,
            label: `${Math.round(matching.match_result.match_score)}% подходит под ваши условия`,
            eligibility:
              matching.match_result.eligibility_status === "hard_fail"
                ? "Не соответствует обязательному условию"
                : matching.match_result.eligibility_status === "unavailable"
                  ? "Предложение недоступно"
                  : matching.match_result.eligibility_status ===
                      "eligible_with_unknowns"
                    ? "Подходит, но важное условие нужно подтвердить"
                    : matching.match_result.eligibility_status ===
                        "possible_match"
                      ? "Возможное соответствие — данных недостаточно"
                      : matching.match_result.eligibility_status ===
                          "insufficient_data"
                        ? "Соответствие пока не рассчитано полностью"
                        : "Подходит по обязательным условиям",
            hardFail: matching.match_result.eligibility_status === "hard_fail",
          }
        : null,
      dataQuality: {
        confidenceBand,
        confidenceLabel: CONFIDENCE_PRESENTATION[confidenceBand],
        completenessBand,
        completenessLabel: COMPLETENESS_PRESENTATION[completenessBand],
        criticalUnknownCount:
          dataQuality?.data_quality.critical_unknown_count ?? 0,
        criticalConflictCount:
          dataQuality?.data_quality.critical_conflict_count ?? 0,
      },
      strengths: buildDecisionPoints(input, "strengths"),
      compromises: buildDecisionPoints(input, "compromises"),
      hardFailures: buildDecisionPoints(input, "hard_failures"),
      facts: buildFacts(FACTS, input),
      timeline: buildFacts(TIMELINE_FACTS, input),
      criterionResults: buildCriterionResults(input),
      financing: buildFinancing(input),
      unknowns: buildUnknowns(input, checks),
      conflicts: buildConflicts(input, checks),
      recommendedChecks: checks,
      sources: buildSources(input),
      alternativeOffers: buildAlternativeOffers(input),
      actions: {
        backHref: "/shortlist",
        describeHref: "/",
        editHref: "/request/confirm",
        comparisonHref: `${PROPERTY_DETAIL_POLICY_V1.comparisonPath}?property=${encodeURIComponent(propertyId)}${query ? `&${query}` : ""}`,
      },
    },
  };
};
