import type {
  Criterion,
  CriterionEvaluationResult,
  FinancingProgram,
  Offer,
  Property,
} from "../domain";
import type {
  DataQualityBand,
  StructuredCriterionExplanation,
} from "../matching";
import { asMoneyLike, formatArea, formatMoney } from "./formatters";

export const CONFIDENCE_PRESENTATION = Object.freeze({
  high: "Данные подтверждены достаточно хорошо",
  medium: "Есть данные, которые стоит проверить",
  low: "Несколько важных условий не подтверждены",
  critical: "Нельзя уверенно опираться на ключевые данные",
  pending: "Надёжность данных ещё не рассчитана",
} satisfies Record<DataQualityBand | "pending", string>);

export const AVAILABILITY_PRESENTATION = Object.freeze({
  available: "В продаже",
  reserved: "Бронь",
  sold: "Продано",
  temporarily_unavailable: "Временно недоступно",
  unknown: "Статус уточняется",
} satisfies Record<Offer["availability"], string>);

export const FRESHNESS_PRESENTATION = Object.freeze({
  fresh: "Данные актуальны",
  aging: "Данные скоро потребуют обновления",
  stale: "Данные устарели",
  expired: "Срок актуальности данных истёк",
  unknown: "Дата проверки неизвестна",
} satisfies Record<Offer["freshness_status"], string>);

export const PROPERTY_TYPE_PRESENTATION = Object.freeze({
  apartment: "Квартира",
  apartments: "Апартаменты",
  house: "Дом",
  townhouse: "Таунхаус",
  land: "Участок",
} satisfies Record<Property["property_type"], string>);

export const ELIGIBILITY_PRESENTATION = Object.freeze({
  eligible: "Подходит по обязательным условиям",
  eligible_with_unknowns: "Подходит, но важное условие нужно подтвердить",
  possible_match: "Возможное соответствие — данных пока недостаточно",
} as const);

export const CRITERION_FIELD_PRESENTATION: Readonly<Record<string, string>> =
  Object.freeze({
    "offer.listing_price": "цена",
    listing_price: "цена",
    "purchase_scenario.monthly_payment": "ежемесячный платёж",
    monthly_payment: "ежемесячный платёж",
    "purchase_scenario.initial_payment": "первоначальный взнос",
    initial_payment: "первоначальный взнос",
    "financing.program_type": "ипотечная программа",
    financing_program: "ипотечная программа",
    "physical.total_area_m2": "площадь",
    total_area_m2: "площадь",
    "physical.floor": "этаж",
    floor: "этаж",
    "timeline.move_in_possible_date": "срок въезда",
    move_in_possible_date: "срок въезда",
    "timeline.handover_date": "срок передачи",
    handover_date: "срок передачи",
    "utilities.gas": "газ",
    gas: "газ",
    family_mortgage: "семейная ипотека",
    zero_initial_payment: "нулевой первоначальный взнос",
    "condition.finishing_type": "отделка",
    "condition.ready_for_living": "готовность к проживанию",
    "land.area_sotka": "площадь участка",
    "infrastructure.school.walk_time_min": "путь до школы",
    "mobility.user_destination.public_transport_time_min":
      "время до нужного места",
    "location.address.city": "город",
    city: "город",
  });

export const FINANCING_PROGRAM_PRESENTATION = Object.freeze({
  mortgage: "Ипотека",
  family_mortgage: "Семейная ипотека",
  subsidized_mortgage: "Субсидированная ипотека",
  installment: "Рассрочка",
  cash_program: "Покупка за собственные средства",
  other: "Финансовая программа",
} satisfies Record<FinancingProgram["program_type"], string>);

const fieldLabel = (field: string): string =>
  CRITERION_FIELD_PRESENTATION[field] ??
  CRITERION_FIELD_PRESENTATION[field.split(".").at(-1) ?? ""] ??
  "условие";

const formatValue = (value: unknown): string | null => {
  const money = asMoneyLike(value);
  if (money) return formatMoney(money);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "да" : "нет";
  return null;
};

type ExplanationFormatter = (context: {
  readonly explanation: StructuredCriterionExplanation;
  readonly criterion: Criterion | null;
}) => string;

const matchedText: ExplanationFormatter = ({ explanation, criterion }) => {
  const field = criterion?.field ?? explanation.criterion_id;
  if (field.includes("listing_price")) return "Укладывается в ваш бюджет";
  if (field.includes("monthly_payment"))
    return "Ежемесячный платёж в заданном диапазоне";
  if (field.includes("initial_payment"))
    return "Первоначальный взнос соответствует условию";
  if (field.includes("move_in") || field.includes("handover"))
    return "Подходит по вашему сроку переезда";
  if (field.includes("total_area")) return "Подходит по нужной площади";
  if (field.includes("floor")) return "Подходит по этажу";
  return `Соответствует условию «${fieldLabel(field)}»`;
};

const mismatchText: ExplanationFormatter = ({ explanation, criterion }) => {
  const field = criterion?.field ?? explanation.criterion_id;
  const actual = formatValue(explanation.actual);
  const target = formatValue(explanation.target);
  if (field.includes("total_area") && typeof explanation.actual === "number") {
    return `Площадь ${formatArea(explanation.actual)} меньше желаемой`;
  }
  if (actual && target) {
    return `${fieldLabel(field)}: ${actual} при желаемом значении ${target}`;
  }
  return `Есть компромисс по условию «${fieldLabel(field)}»`;
};

const unknownText: ExplanationFormatter = ({ explanation, criterion }) => {
  const field = criterion?.field ?? explanation.criterion_id;
  if (field.includes("initial_payment"))
    return "Условие по первоначальному взносу пока не подтверждено";
  if (field.includes("financing") || field.includes("program"))
    return "Применимость программы нужно подтвердить";
  if (field.includes("listing_price"))
    return "Актуальную цену нужно подтвердить";
  return `Нужно подтвердить: ${fieldLabel(field)}`;
};

export const EXPLANATION_REGISTRY: Readonly<
  Record<string, ExplanationFormatter>
> = Object.freeze({
  MONEY_WITHIN_MAXIMUM: matchedText,
  MONEY_WITHIN_RANGE: matchedText,
  RANGE_MATCH: matchedText,
  NUMERIC_BOUNDARY_MATCH: matchedText,
  EXACT_MATCH: matchedText,
  SET_MATCH: matchedText,
  DATE_WITHIN_DEADLINE: matchedText,
  BOOLEAN_MATCH: matchedText,
  MONEY_OVER_MAXIMUM: mismatchText,
  MONEY_OUTSIDE_RANGE: mismatchText,
  RANGE_OUTSIDE: mismatchText,
  NUMERIC_BOUNDARY_MISS: mismatchText,
  EXACT_MISMATCH: mismatchText,
  SET_MISMATCH: mismatchText,
  DATE_AFTER_DEADLINE: mismatchText,
  BOOLEAN_MISMATCH: mismatchText,
  PRICE_FROM_NOT_EXACT: unknownText,
  CLAIMED_MATCH_REQUIRES_CONFIRMATION: unknownText,
  FINANCING_APPLICABILITY_CLAIMED: unknownText,
  UNKNOWN_ACTUAL: unknownText,
  CONFLICTING_ACTUAL: unknownText,
});

export const formatCriterionExplanation = (
  explanation: StructuredCriterionExplanation,
  criterion: Criterion | null,
  mode: "strength" | "compromise" | "unknown",
): string => {
  const formatter = EXPLANATION_REGISTRY[explanation.code];
  if (formatter) return formatter({ explanation, criterion });
  if (mode === "strength") return matchedText({ explanation, criterion });
  if (mode === "compromise") return mismatchText({ explanation, criterion });
  return unknownText({ explanation, criterion });
};

export const formatEvaluationFallback = (
  criterion: Criterion,
  result: CriterionEvaluationResult,
): string =>
  result.status === "matched"
    ? matchedText({
        criterion,
        explanation: {
          criterion_id: criterion.criterion_id,
          code: "MATCHED_FALLBACK",
          status: result.status,
          priority: criterion.priority,
          weight: criterion.weight,
          fit: result.fit,
          contribution: null,
          actual: result.actual,
          target: result.target,
          verification_status: result.verification_status,
          freshness_status: result.freshness_status,
          evidence_refs: result.evidence_refs,
        },
      })
    : `Соответствие условию «${fieldLabel(criterion.field)}»`;

export const formatFieldUnknown = (field: string): string => {
  if (field.includes("listing_price"))
    return "Цена расходится между источниками";
  if (field.includes("initial_payment"))
    return "Первоначальный взнос пока не подтверждён";
  if (field.includes("financing"))
    return "Условия финансирования нужно подтвердить";
  return `Нужно подтвердить: ${fieldLabel(field)}`;
};

export const getCriterionFieldLabel = fieldLabel;
