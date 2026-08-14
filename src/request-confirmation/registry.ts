import type { Criterion } from "../domain/matching/schema";
import type { ConfirmationView } from "../user-request-parser/contracts";

export type EditorKind =
  "money" | "number" | "range" | "property_types" | "boolean" | "date" | "text";

export interface CriterionPresentation {
  readonly label: string;
  readonly category_label: string;
  readonly editor: EditorKind;
  readonly category: Criterion["category"];
  readonly operator: Criterion["operator"];
  readonly unit: string | null;
  readonly allowed_priorities: readonly Criterion["priority"][];
  readonly addable: boolean;
  readonly default_value: ConfirmationView["groups"]["required"][number]["value"];
}

const allPriorities = [
  "must",
  "preferred",
  "neutral",
  "avoid",
  "exclude",
] as const satisfies readonly Criterion["priority"][];

const withoutExclude = [
  "must",
  "preferred",
  "neutral",
  "avoid",
] as const satisfies readonly Criterion["priority"][];

const entry = (
  value: Omit<CriterionPresentation, "allowed_priorities" | "addable"> &
    Partial<Pick<CriterionPresentation, "allowed_priorities" | "addable">>,
): CriterionPresentation => ({
  ...value,
  allowed_priorities: value.allowed_priorities ?? allPriorities,
  addable: value.addable ?? false,
});

export const criterionPresentationRegistry: Record<
  string,
  CriterionPresentation
> = {
  "budget.purchase_price.maximum": entry({
    label: "Максимальная цена",
    category_label: "Цена",
    editor: "money",
    category: "finance",
    operator: "lte",
    unit: "RUB",
    addable: true,
    default_value: 0,
  }),
  "budget.purchase_price.minimum": entry({
    label: "Минимальная цена",
    category_label: "Цена",
    editor: "money",
    category: "finance",
    operator: "gte",
    unit: "RUB",
    default_value: 0,
  }),
  "budget.total_budget": entry({
    label: "Общий бюджет",
    category_label: "Цена",
    editor: "money",
    category: "finance",
    operator: "lte",
    unit: "RUB",
    default_value: 0,
  }),
  "budget.own_funds": entry({
    label: "Собственные средства",
    category_label: "Цена",
    editor: "money",
    category: "finance",
    operator: "lte",
    unit: "RUB",
    default_value: 0,
  }),
  "budget.renovation_budget": entry({
    label: "Бюджет на ремонт",
    category_label: "Цена",
    editor: "money",
    category: "finance",
    operator: "lte",
    unit: "RUB",
    default_value: 0,
  }),
  "budget.budget_flexible": entry({
    label: "Бюджет можно уточнить",
    category_label: "Цена",
    editor: "boolean",
    category: "finance",
    operator: "boolean",
    unit: null,
    allowed_priorities: withoutExclude,
    default_value: true,
  }),
  "property.allowed_property_types": entry({
    label: "Тип недвижимости",
    category_label: "Тип недвижимости",
    editor: "property_types",
    category: "property",
    operator: "one_of",
    unit: null,
    addable: true,
    default_value: ["apartment"],
  }),
  "property.property_type_flexible": entry({
    label: "Тип недвижимости можно уточнить",
    category_label: "Тип недвижимости",
    editor: "boolean",
    category: "property",
    operator: "boolean",
    unit: null,
    allowed_priorities: withoutExclude,
    default_value: true,
  }),
  "property.allowed_market_types": entry({
    label: "Рынок недвижимости",
    category_label: "Тип недвижимости",
    editor: "text",
    category: "property",
    operator: "one_of",
    unit: null,
    default_value: "",
  }),
  "property.rooms": entry({
    label: "Количество комнат",
    category_label: "Комнаты",
    editor: "number",
    category: "property",
    operator: "eq",
    unit: "rooms",
    addable: true,
    default_value: 1,
  }),
  "property.rooms_min": entry({
    label: "Минимум комнат",
    category_label: "Комнаты",
    editor: "number",
    category: "property",
    operator: "gte",
    unit: "rooms",
    default_value: 1,
  }),
  "property.area_sqm": entry({
    label: "Площадь",
    category_label: "Площадь",
    editor: "range",
    category: "property",
    operator: "between",
    unit: "м²",
    addable: true,
    default_value: { minimum: null, maximum: null },
  }),
  "property.floor": entry({
    label: "Этаж",
    category_label: "Этаж",
    editor: "range",
    category: "property",
    operator: "between",
    unit: "этаж",
    addable: true,
    default_value: { minimum: null, maximum: null },
  }),
  "property.floor.is_first": entry({
    label: "Первый этаж",
    category_label: "Этаж",
    editor: "boolean",
    category: "property",
    operator: "boolean",
    unit: null,
    default_value: false,
  }),
  "property.floor.is_last": entry({
    label: "Последний этаж",
    category_label: "Этаж",
    editor: "boolean",
    category: "property",
    operator: "boolean",
    unit: null,
    default_value: false,
  }),
  "property.finishing": entry({
    label: "Отделка",
    category_label: "Отделка",
    editor: "text",
    category: "property",
    operator: "eq",
    unit: null,
    addable: true,
    default_value: "",
  }),
  "property.balcony": entry({
    label: "Балкон или лоджия",
    category_label: "Объект",
    editor: "boolean",
    category: "property",
    operator: "boolean",
    unit: null,
    default_value: true,
  }),
  "property.elevator": entry({
    label: "Лифт",
    category_label: "Объект",
    editor: "boolean",
    category: "property",
    operator: "boolean",
    unit: null,
    default_value: true,
  }),
  "property.parking": entry({
    label: "Парковка",
    category_label: "Объект",
    editor: "boolean",
    category: "property",
    operator: "boolean",
    unit: null,
    default_value: true,
  }),
  "location.cities": entry({
    label: "Город",
    category_label: "Район",
    editor: "text",
    category: "location",
    operator: "in",
    unit: null,
    addable: true,
    default_value: "",
  }),
  "location.regions": entry({
    label: "Регион",
    category_label: "Район",
    editor: "text",
    category: "location",
    operator: "in",
    unit: null,
    default_value: "",
  }),
  "location.preferred_districts": entry({
    label: "Район",
    category_label: "Район",
    editor: "text",
    category: "location",
    operator: "in",
    unit: null,
    addable: true,
    default_value: "",
  }),
  "location.excluded_districts": entry({
    label: "Исключённый район",
    category_label: "Район",
    editor: "text",
    category: "location",
    operator: "not_in",
    unit: null,
    default_value: "",
  }),
  "location.excluded_locations": entry({
    label: "Исключённая локация",
    category_label: "Район",
    editor: "text",
    category: "location",
    operator: "not_in",
    unit: null,
    default_value: "",
  }),
  "timeline.move_in_by": entry({
    label: "Срок въезда",
    category_label: "Срок въезда",
    editor: "date",
    category: "timeline",
    operator: "before",
    unit: null,
    addable: true,
    default_value: "",
  }),
  "timeline.purchase_by": entry({
    label: "Срок покупки",
    category_label: "Срок въезда",
    editor: "date",
    category: "timeline",
    operator: "before",
    unit: null,
    default_value: "",
  }),
  "timeline.construction_completion_by": entry({
    label: "Срок сдачи",
    category_label: "Срок въезда",
    editor: "date",
    category: "timeline",
    operator: "before",
    unit: null,
    default_value: "",
  }),
  "timeline.ready_now_required": entry({
    label: "Можно въехать сразу",
    category_label: "Срок въезда",
    editor: "boolean",
    category: "timeline",
    operator: "boolean",
    unit: null,
    default_value: true,
  }),
  "financing.program_type": entry({
    label: "Ипотечная программа",
    category_label: "Ипотека",
    editor: "text",
    category: "finance",
    operator: "eq",
    unit: null,
    addable: true,
    default_value: "",
  }),
  "financing.zero_initial_payment": entry({
    label: "Без первоначального взноса",
    category_label: "Первоначальный взнос",
    editor: "boolean",
    category: "finance",
    operator: "boolean",
    unit: null,
    addable: true,
    default_value: true,
  }),
  "financing.initial_payment_max": entry({
    label: "Максимальный первоначальный взнос",
    category_label: "Первоначальный взнос",
    editor: "money",
    category: "finance",
    operator: "lte",
    unit: "RUB",
    addable: true,
    default_value: 0,
  }),
  "financing.monthly_payment_max": entry({
    label: "Максимальный ежемесячный платёж",
    category_label: "Ежемесячный платёж",
    editor: "money",
    category: "finance",
    operator: "lte",
    unit: "RUB/month",
    addable: true,
    default_value: 0,
  }),
  "infrastructure.school_proximity": entry({
    label: "Школа рядом",
    category_label: "Школа",
    editor: "number",
    category: "infrastructure",
    operator: "within_time",
    unit: "минут",
    addable: true,
    default_value: 1,
  }),
  "infrastructure.transport_proximity": entry({
    label: "Транспорт рядом",
    category_label: "Транспорт",
    editor: "number",
    category: "infrastructure",
    operator: "within_time",
    unit: "минут",
    addable: true,
    default_value: 1,
  }),
  "infrastructure.kindergarten_proximity": entry({
    label: "Детский сад рядом",
    category_label: "Инфраструктура",
    editor: "number",
    category: "infrastructure",
    operator: "within_time",
    unit: "минут",
    default_value: 1,
  }),
  "infrastructure.park_proximity": entry({
    label: "Парк рядом",
    category_label: "Инфраструктура",
    editor: "number",
    category: "infrastructure",
    operator: "within_time",
    unit: "минут",
    default_value: 1,
  }),
  "infrastructure.clinic_proximity": entry({
    label: "Поликлиника рядом",
    category_label: "Инфраструктура",
    editor: "number",
    category: "infrastructure",
    operator: "within_time",
    unit: "минут",
    default_value: 1,
  }),
  "lifestyle.commute_time_max": entry({
    label: "Время в пути до работы",
    category_label: "Транспорт",
    editor: "number",
    category: "location",
    operator: "within_time",
    unit: "минут",
    default_value: 1,
  }),
  "lifestyle.quiet": entry({
    label: "Тихое окружение",
    category_label: "Район",
    editor: "boolean",
    category: "location",
    operator: "boolean",
    unit: null,
    default_value: true,
  }),
  "lifestyle.green_area": entry({
    label: "Зелёное окружение",
    category_label: "Район",
    editor: "boolean",
    category: "location",
    operator: "boolean",
    unit: null,
    default_value: true,
  }),
  "lifestyle.walkability": entry({
    label: "Можно ходить пешком",
    category_label: "Транспорт",
    editor: "boolean",
    category: "location",
    operator: "boolean",
    unit: null,
    default_value: true,
  }),
  "house.land_area": entry({
    label: "Площадь участка",
    category_label: "Объект",
    editor: "number",
    category: "house",
    operator: "gte",
    unit: "соток",
    default_value: 1,
  }),
  "house.utilities": entry({
    label: "Коммуникации",
    category_label: "Объект",
    editor: "text",
    category: "house",
    operator: "exists",
    unit: null,
    default_value: "",
  }),
};

const priorityLabels: Record<Criterion["priority"], string> = {
  must: "Обязательно",
  preferred: "Желательно",
  neutral: "Неважно / можно гибко",
  avoid: "Лучше не",
  exclude: "Исключить",
  unknown: "Не определено",
};

const propertyTypeLabels: Record<string, string> = {
  apartment: "Квартира",
  apartments: "Апартаменты",
  house: "Дом",
  townhouse: "Таунхаус",
  land: "Участок",
};

export const getCriterionPresentation = (
  field: string,
): CriterionPresentation =>
  criterionPresentationRegistry[field] ??
  entry({
    label: "Дополнительное условие",
    category_label: "Другое",
    editor: "text",
    category: "custom",
    operator: "custom",
    unit: null,
    default_value: "",
  });

export const getPriorityLabel = (priority: Criterion["priority"]): string =>
  priorityLabels[priority];

export const getAddableCriteria = (): Array<
  readonly [string, CriterionPresentation]
> =>
  Object.entries(criterionPresentationRegistry)
    .filter(([, presentation]) => presentation.addable)
    .sort((left, right) =>
      left[1].category_label.localeCompare(right[1].category_label, "ru"),
    );

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "amount" in value &&
    typeof value.amount === "string"
  ) {
    const amount = Number(value.amount);
    return Number.isFinite(amount) ? amount : null;
  }
  return null;
};

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);

export const formatCriterionValue = (field: string, value: unknown): string => {
  const presentation = getCriterionPresentation(field);
  if (presentation.editor === "money") {
    const amount = asNumber(value);
    return amount === null
      ? "Не указано"
      : new Intl.NumberFormat("ru-RU", {
          style: "currency",
          currency: "RUB",
          maximumFractionDigits: 0,
        }).format(amount);
  }
  if (presentation.editor === "property_types") {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => propertyTypeLabels[String(item)] ?? String(item))
      .join(", ");
  }
  if (
    presentation.editor === "range" &&
    typeof value === "object" &&
    value !== null
  ) {
    const minimum = "minimum" in value ? asNumber(value.minimum) : null;
    const maximum = "maximum" in value ? asNumber(value.maximum) : null;
    if (minimum !== null && maximum !== null) {
      return `${formatNumber(minimum)}–${formatNumber(maximum)} ${presentation.unit ?? ""}`.trim();
    }
    if (minimum !== null)
      return `от ${formatNumber(minimum)} ${presentation.unit ?? ""}`.trim();
    if (maximum !== null)
      return `до ${formatNumber(maximum)} ${presentation.unit ?? ""}`.trim();
    return "Границы не указаны";
  }
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "number") {
    return `${formatNumber(value)} ${presentation.unit ?? ""}`.trim();
  }
  if (typeof value === "object" && value !== null && "maximum" in value) {
    const maximum = asNumber(value.maximum);
    return maximum === null
      ? "Не указано"
      : `до ${formatNumber(maximum)} ${presentation.unit ?? ""}`.trim();
  }
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
};
