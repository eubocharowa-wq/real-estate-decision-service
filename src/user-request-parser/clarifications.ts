import type {
  ClarificationCandidate,
  ParserContradiction,
  ParserUnknown,
} from "./contracts";
import { userRequestParserPolicy } from "./config";
import { stableId } from "./normalization";

const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const impactRank = {
  hard_ambiguity: 0,
  high_search_impact: 1,
  finance_impact: 2,
  deadline_impact: 3,
  location_impact: 4,
  unsupported_criterion: 5,
} as const;

const questionForUnknown = (
  unknown: ParserUnknown,
  rawText: string,
): ClarificationCandidate => {
  const shared: Pick<
    ClarificationCandidate,
    "clarification_id" | "field" | "reason" | "priority" | "source_text"
  > = {
    clarification_id: stableId("clarification", unknown.field, unknown.reason),
    field: unknown.field,
    reason: unknown.explanation,
    priority: unknown.materiality,
    source_text: [rawText],
  };

  switch (unknown.field) {
    case "location.city":
      return {
        ...shared,
        impact: "location_impact",
        proposed_question:
          "Город уже выбран или сначала помочь определить подходящие города?",
        options: [
          { label: "Указать город", value: "provide_city" },
          { label: "Сначала выбрать город", value: "location_discovery" },
        ],
      };
    case "location.travel_destination":
      return {
        ...shared,
        impact: "high_search_impact",
        proposed_question: "До какого адреса или района считать время в пути?",
        options: [
          { label: "Указать адрес или район", value: "provide_destination" },
        ],
      };
    case "budget.context":
      return {
        ...shared,
        impact: "finance_impact",
        proposed_question:
          "Указанная сумма — цена объекта или весь бюджет вместе с ремонтом и расходами?",
        options: [
          { label: "Только цена объекта", value: "property_price" },
          { label: "Весь бюджет", value: "total_entry" },
        ],
      };
    case "source_links":
      return {
        ...shared,
        impact: "hard_ambiguity",
        proposed_question:
          "Пришлите ссылки или идентификаторы вариантов для сравнения.",
        options: [{ label: "Добавить варианты", value: "provide_links" }],
      };
    default:
      return {
        ...shared,
        impact:
          unknown.materiality === "critical"
            ? "hard_ambiguity"
            : unknown.field.startsWith("budget.") ||
                unknown.field.startsWith("financing.")
              ? "finance_impact"
              : unknown.field.startsWith("timeline.")
                ? "deadline_impact"
                : unknown.field.startsWith("location.")
                  ? "location_impact"
                  : "high_search_impact",
        proposed_question: `Уточните условие «${unknown.field}».`,
        options: [{ label: "Уточнить", value: "provide_value" }],
      };
  }
};

const questionForContradiction = (
  contradiction: ParserContradiction,
): ClarificationCandidate => ({
  clarification_id: stableId("clarification", contradiction.contradiction_id),
  field: contradiction.fields[0] ?? "request",
  reason: contradiction.message,
  impact: "hard_ambiguity",
  proposed_question: `Какое из противоречащих условий оставить: ${contradiction.message}`,
  options: [
    { label: "Оставить включение", value: "include" },
    { label: "Оставить исключение", value: "exclude" },
  ],
  priority: contradiction.blocking ? "critical" : "high",
  source_text:
    contradiction.source_spans.length > 0
      ? contradiction.source_spans.map((span) => span.text)
      : [contradiction.message],
});

export const selectTopClarifications = (
  unknowns: readonly ParserUnknown[],
  contradictions: readonly ParserContradiction[],
  rawText: string,
): ClarificationCandidate[] => {
  const candidates = [
    ...contradictions.map(questionForContradiction),
    ...unknowns
      .filter((unknown) => unknown.materiality !== "low")
      .map((unknown) => questionForUnknown(unknown, rawText)),
  ];
  const unique = new Map<string, ClarificationCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.field)) unique.set(candidate.field, candidate);
  }
  return [...unique.values()]
    .sort(
      (left, right) =>
        priorityRank[left.priority] - priorityRank[right.priority] ||
        impactRank[left.impact] - impactRank[right.impact] ||
        left.field.localeCompare(right.field, "ru"),
    )
    .slice(0, userRequestParserPolicy.maximum_clarifications);
};
