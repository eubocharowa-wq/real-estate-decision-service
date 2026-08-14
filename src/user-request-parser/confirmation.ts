import type { Criterion, UserRequest } from "../domain";
import type {
  ClarificationCandidate,
  ConfirmationView,
  ExtractedFact,
  ParserContradiction,
  ParserUnknown,
} from "./contracts";
import { stableId } from "./normalization";

const labelByField: Record<string, string> = {
  "budget.purchase_price.maximum": "Максимальная цена",
  "budget.purchase_price.minimum": "Минимальная цена",
  "financing.program_type": "Ипотечная программа",
  "financing.zero_initial_payment": "Без первоначального взноса",
  "financing.monthly_payment_max": "Максимальный платёж",
  "infrastructure.school_proximity": "Школа рядом",
  "lifestyle.commute_time_max": "Время до работы",
  "location.cities": "Город",
  "location.excluded_districts": "Исключённый район",
  "location.preferred_districts": "Район",
  "property.allowed_property_types": "Тип объекта",
  "property.area_sqm": "Минимальная площадь",
  "property.floor.is_first": "Первый этаж",
  "timeline.move_in_by": "Срок въезда",
};

const allCriteria = (request: UserRequest): Criterion[] => [
  ...request.infrastructure,
  ...request.property_features,
  ...request.must_have,
  ...request.nice_to_have,
  ...request.avoid,
];

const toConfirmationCriterion = (
  criterion: Criterion,
): ConfirmationView["groups"]["required"][number] => ({
  criterion_id: criterion.criterion_id,
  label: labelByField[criterion.field] ?? criterion.field,
  value: criterion.target,
  priority: criterion.priority,
  source_text: criterion.user_expression,
  editable: { value: true, priority: true, removable: true },
});

export const buildConfirmationView = (
  request: UserRequest,
  rawText: string,
  extractedFacts: readonly ExtractedFact[],
  unknowns: readonly ParserUnknown[],
  contradictions: readonly ParserContradiction[],
  clarifications: readonly ClarificationCandidate[],
): ConfirmationView => {
  const groups: ConfirmationView["groups"] = {
    required: [],
    preferred: [],
    flexible: [],
    unknown: [...unknowns],
  };
  const seen = new Set<string>();
  for (const criterion of allCriteria(request)) {
    const key = `${criterion.field}:${JSON.stringify(criterion.target)}:${criterion.priority}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const item = toConfirmationCriterion(criterion);
    if (criterion.priority === "must" || criterion.priority === "exclude") {
      groups.required.push(item);
    } else if (
      criterion.priority === "neutral" ||
      criterion.priority === "unknown"
    ) {
      groups.flexible.push(item);
    } else {
      groups.preferred.push(item);
    }
  }

  for (const fact of extractedFacts) {
    const priority = fact.priority_interpretation?.value;
    if (!priority) continue;
    const key = `${fact.field}:${JSON.stringify(fact.value)}:${priority}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const item: ConfirmationView["groups"]["required"][number] = {
      criterion_id: stableId("confirmation", fact.fact_id),
      label: labelByField[fact.field] ?? fact.field,
      value: fact.value,
      priority,
      source_text: fact.source_span.text,
      editable: { value: true, priority: true, removable: true },
    };
    if (priority === "must" || priority === "exclude")
      groups.required.push(item);
    else if (priority === "neutral" || priority === "unknown")
      groups.flexible.push(item);
    else groups.preferred.push(item);
  }

  const summaryParts = extractedFacts
    .filter((fact) =>
      [
        "intent",
        "goal.purpose",
        "location.cities",
        "property.allowed_property_types",
        "budget.total_budget",
        "budget.own_funds",
      ].includes(fact.field),
    )
    .map(
      (fact) =>
        `${labelByField[fact.field] ?? fact.field}: ${JSON.stringify(fact.value)}`,
    )
    .slice(0, 6);

  return {
    summary: {
      headline: "Проверьте, правильно ли мы вас поняли.",
      parts: summaryParts,
    },
    groups,
    contradictions: [...contradictions],
    clarification_questions: [...clarifications],
    source_text: rawText,
    can_confirm:
      !contradictions.some((item) => item.blocking) &&
      !clarifications.some((item) => item.priority === "critical"),
    can_add_criterion: true,
  };
};
