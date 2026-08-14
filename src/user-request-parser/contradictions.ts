import type { Criterion, UserRequest } from "../domain";
import type {
  ExtractedFact,
  ParserContradiction,
  SourceSpan,
} from "./contracts";
import { stableId } from "./normalization";

const allCriteria = (request: UserRequest): Criterion[] => [
  ...request.infrastructure,
  ...request.property_features,
  ...request.must_have,
  ...request.nice_to_have,
  ...request.avoid,
];

const spansFor = (
  facts: readonly ExtractedFact[],
  fields: readonly string[],
): SourceSpan[] =>
  facts
    .filter((fact) => fields.includes(fact.field))
    .map((fact) => fact.source_span);

const addContradiction = (
  contradictions: ParserContradiction[],
  facts: readonly ExtractedFact[],
  input: Omit<ParserContradiction, "contradiction_id" | "source_spans"> & {
    source_spans?: SourceSpan[];
  },
): void => {
  const key = `${input.type}:${[...input.fields].sort().join(",")}:${input.message}`;
  if (
    contradictions.some(
      (item) => item.contradiction_id === stableId("contradiction", key),
    )
  ) {
    return;
  }
  contradictions.push({
    ...input,
    contradiction_id: stableId("contradiction", key),
    source_spans: input.source_spans ?? spansFor(facts, input.fields),
  });
};

const moneyAmount = (
  value: { amount: string } | null | undefined,
): number | null => (value ? Number(value.amount) : null);

export const detectUserRequestContradictions = (
  request: UserRequest,
  extractedFacts: readonly ExtractedFact[],
): ParserContradiction[] => {
  const contradictions: ParserContradiction[] = [];
  const includedDistricts = new Set(request.location.preferred_districts);
  for (const district of request.location.excluded_districts) {
    if (!includedDistricts.has(district)) continue;
    addContradiction(contradictions, extractedFacts, {
      type: "location_inclusion_exclusion",
      fields: ["location.preferred_districts", "location.excluded_districts"],
      message: `Район «${district}» одновременно включён и исключён.`,
      blocking: true,
    });
  }

  const allowedTypes = new Set(request.property.allowed_property_types);
  for (const propertyType of request.property.excluded_property_types ?? []) {
    if (!allowedTypes.has(propertyType)) continue;
    addContradiction(contradictions, extractedFacts, {
      type: "property_type_inclusion_exclusion",
      fields: [
        "property.allowed_property_types",
        "property.excluded_property_types",
      ],
      message: `Тип объекта «${propertyType}» одновременно разрешён и исключён.`,
      blocking: true,
    });
  }

  const priceMinimum = moneyAmount(request.budget.purchase_price.minimum);
  const priceMaximum = moneyAmount(request.budget.purchase_price.maximum);
  if (
    priceMinimum !== null &&
    priceMaximum !== null &&
    priceMinimum > priceMaximum
  ) {
    addContradiction(contradictions, extractedFacts, {
      type: "invalid_min_max",
      fields: [
        "budget.purchase_price.minimum",
        "budget.purchase_price.maximum",
      ],
      message: "Минимальная цена выше максимальной.",
      blocking: true,
    });
  }
  if (
    request.property.rooms_min !== null &&
    request.property.rooms_max !== null &&
    request.property.rooms_min > request.property.rooms_max
  ) {
    addContradiction(contradictions, extractedFacts, {
      type: "invalid_min_max",
      fields: ["property.rooms_min", "property.rooms_max"],
      message: "Минимальное число комнат выше максимального.",
      blocking: true,
    });
  }

  const criteria = allCriteria(request);
  for (let leftIndex = 0; leftIndex < criteria.length; leftIndex += 1) {
    const left = criteria[leftIndex];
    if (!left) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < criteria.length;
      rightIndex += 1
    ) {
      const right = criteria[rightIndex];
      if (!right || left.field !== right.field) continue;
      const prioritiesConflict =
        (left.priority === "must" && right.priority === "exclude") ||
        (left.priority === "exclude" && right.priority === "must");
      if (
        !prioritiesConflict ||
        JSON.stringify(left.target) !== JSON.stringify(right.target)
      ) {
        continue;
      }
      addContradiction(contradictions, extractedFacts, {
        type: "criterion_must_exclude",
        fields: [left.field],
        message: `Условие «${left.field}» одновременно обязательно и исключено.`,
        blocking: true,
        source_spans: [left, right]
          .map((criterion) => criterion.user_expression)
          .filter((value): value is string => value !== null)
          .map((text) => ({ text, start: null, end: null })),
      });
    }
  }

  if (
    request.timeline.purchase_by !== null &&
    request.timeline.move_in_by !== null &&
    request.timeline.move_in_by < request.timeline.purchase_by
  ) {
    addContradiction(contradictions, extractedFacts, {
      type: "impossible_deadline",
      fields: ["timeline.purchase_by", "timeline.move_in_by"],
      message: "Дата въезда наступает раньше даты покупки.",
      blocking: true,
    });
  }
  if (
    request.timeline.move_in_by !== null &&
    request.timeline.construction_completion_by != null &&
    request.timeline.move_in_by < request.timeline.construction_completion_by
  ) {
    addContradiction(contradictions, extractedFacts, {
      type: "impossible_deadline",
      fields: ["timeline.move_in_by", "timeline.construction_completion_by"],
      message: "Дата въезда наступает раньше завершения строительства.",
      blocking: true,
    });
  }
  if (
    request.financing.financing_period.from !== null &&
    request.financing.financing_period.to !== null &&
    request.financing.financing_period.from >
      request.financing.financing_period.to
  ) {
    addContradiction(contradictions, extractedFacts, {
      type: "impossible_deadline",
      fields: [
        "financing.financing_period.from",
        "financing.financing_period.to",
      ],
      message: "Начало периода финансирования наступает после его окончания.",
      blocking: true,
    });
  }

  return contradictions;
};
