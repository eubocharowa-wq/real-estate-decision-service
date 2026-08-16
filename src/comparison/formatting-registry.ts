import type { Criterion, Property } from "../domain";
import {
  asMoneyLike,
  formatArea,
  formatDate,
  formatMoney,
} from "../shortlist/formatters";
import {
  AVAILABILITY_LABELS,
  CONFIDENCE_PRESENTATION,
  CRITERION_STATUS_PRESENTATION,
  DETAIL_FRESHNESS_PRESENTATION,
  FINANCING_PROGRAM_LABELS,
  FINISHING_PRESENTATION,
  PROPERTY_LABELS,
  UTILITY_PRESENTATION,
  VERIFICATION_PRESENTATION,
} from "../property-detail/presentation-registry";

export type ComparisonFormatKind =
  | "money"
  | "percent"
  | "duration"
  | "distance"
  | "date"
  | "boolean"
  | "categorical"
  | "status"
  | "area"
  | "number";

const booleanLabels = Object.freeze({ true: "Да", false: "Нет" });

export const COMPARISON_FORMATTERS: Readonly<
  Record<ComparisonFormatKind, (value: unknown) => string>
> = Object.freeze({
  money: (value) => {
    const money = asMoneyLike(value);
    return money ? formatMoney(money) : "Нет данных";
  },
  percent: (value) =>
    typeof value === "number" || typeof value === "string"
      ? `${value}%`
      : "Нет данных",
  duration: (value) =>
    typeof value === "number" ? `${value} мин.` : "Нет данных",
  distance: (value) =>
    typeof value === "number"
      ? value >= 1000
        ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value / 1000)} км`
        : `${value} м`
      : "Нет данных",
  date: (value) =>
    typeof value === "string" ? formatDate(value) : "Нет данных",
  boolean: (value) =>
    typeof value === "boolean"
      ? booleanLabels[String(value) as "true" | "false"]
      : "Нет данных",
  categorical: (value) =>
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.join(", ")
        : "Нет данных",
  status: (value) => (typeof value === "string" ? value : "Нет данных"),
  area: (value) =>
    typeof value === "number" ? formatArea(value) : "Нет данных",
  number: (value) =>
    typeof value === "number"
      ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
          value,
        )
      : "Нет данных",
});

export const formatComparisonValue = (
  kind: ComparisonFormatKind,
  value: unknown,
): string => COMPARISON_FORMATTERS[kind](value);

export const inferCriterionFormat = (
  criterion: Criterion,
): ComparisonFormatKind => {
  if (asMoneyLike(criterion.target)) return "money";
  if (criterion.operator === "before" || criterion.operator === "after")
    return "date";
  if (criterion.operator === "boolean") return "boolean";
  if (criterion.operator === "within_time" || criterion.field.includes("time"))
    return "duration";
  if (
    criterion.operator === "within_distance" ||
    criterion.field.includes("distance")
  )
    return "distance";
  if (criterion.field.includes("area")) return "area";
  if (typeof criterion.target === "number") return "number";
  return "categorical";
};

export const formatCriterionTarget = (criterion: Criterion): string => {
  const formatted = formatComparisonValue(
    inferCriterionFormat(criterion),
    criterion.target,
  );
  const prefix =
    criterion.operator === "lte" || criterion.operator === "before"
      ? "до "
      : criterion.operator === "gte" || criterion.operator === "after"
        ? "от "
        : criterion.operator === "neq" || criterion.operator === "not_in"
          ? "исключить: "
          : "";
  return `${prefix}${formatted}`;
};

export const PRIORITY_PRESENTATION = Object.freeze({
  must: "Обязательно",
  exclude: "Исключить",
  preferred: "Желательно",
  avoid: "Лучше избежать",
  neutral: "Неважно",
  unknown: "Не определено",
  context: "Для сравнения",
} as const);

export {
  AVAILABILITY_LABELS,
  CONFIDENCE_PRESENTATION,
  CRITERION_STATUS_PRESENTATION,
  DETAIL_FRESHNESS_PRESENTATION,
  FINANCING_PROGRAM_LABELS,
  FINISHING_PRESENTATION,
  PROPERTY_LABELS,
  UTILITY_PRESENTATION,
  VERIFICATION_PRESENTATION,
};

export const propertyTypeLabel = (property: Property): string =>
  PROPERTY_LABELS[property.property_type];
