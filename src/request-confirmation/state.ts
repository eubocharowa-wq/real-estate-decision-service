import type { Criterion } from "../domain/matching/schema";
import {
  userRequestSchema,
  type UserRequest,
} from "../domain/user-request/schema";
import {
  selectTopClarifications,
  type ClarificationCandidate,
  type ConfirmationView,
  type ParserContradiction,
  type ParserUnknown,
  type UserRequestParserResult,
} from "../user-request-parser";
import { detectUserRequestContradictions } from "../user-request-parser/contradictions";
import {
  requestConfirmationResultSchema,
  type AnsweredClarification,
  type ConfirmationChange,
  type RequestConfirmationResult,
} from "./contracts";
import {
  getCriterionPresentation,
  type CriterionPresentation,
} from "./registry";

export type ConfirmationCriterion =
  ConfirmationView["groups"]["required"][number];

export interface ConfirmationValidationError {
  readonly field: string;
  readonly message: string;
}

export interface ConfirmationSession {
  readonly initial_result: UserRequestParserResult;
  readonly draft_request: UserRequest;
  readonly criteria: ConfirmationCriterion[];
  readonly unknowns: ParserUnknown[];
  readonly contradictions: ParserContradiction[];
  readonly clarifications: ClarificationCandidate[];
  readonly answered_clarifications: AnsweredClarification[];
  readonly changes: ConfirmationChange[];
  readonly validation_errors: ConfirmationValidationError[];
  readonly status: "editing" | "confirmed" | "transition_error";
  readonly confirmation_result: RequestConfirmationResult | null;
  readonly transition_error: string | null;
}

const propertyTypes = [
  "apartment",
  "apartments",
  "house",
  "townhouse",
  "land",
] as const;

const nowIso = (): string => new Date().toISOString();

const money = (amount: number) => ({
  amount: amount.toFixed(2),
  currency: "RUB",
});

const criteriaArrays = (request: UserRequest): Criterion[] => [
  ...request.infrastructure,
  ...request.property_features,
  ...request.must_have,
  ...request.nice_to_have,
  ...request.avoid,
];

const groupCriteria = (
  result: UserRequestParserResult,
): ConfirmationCriterion[] => {
  const groups = result.confirmation_view.groups;
  const criteria = [
    ...groups.required,
    ...groups.preferred,
    ...groups.flexible,
  ].map((criterion) => structuredClone(criterion));

  const propertyTypeCriteria = criteria.filter(
    (criterion) =>
      criterion.label === "Тип объекта" ||
      criterion.field === "property.allowed_property_types",
  );
  if (propertyTypeCriteria.length === 0) return criteria;

  const combined = propertyTypeCriteria[0];
  if (!combined) return criteria;
  combined.label = getCriterionPresentation(
    "property.allowed_property_types",
  ).label;
  combined.value = [
    ...new Set(
      propertyTypeCriteria.flatMap((criterion) =>
        Array.isArray(criterion.value)
          ? criterion.value.map(String)
          : [String(criterion.value)],
      ),
    ),
  ];
  combined.source_text = propertyTypeCriteria
    .map((criterion) => criterion.source_text)
    .filter((value): value is string => value !== null)
    .join(" / ");
  return [
    ...criteria.filter(
      (criterion) => !propertyTypeCriteria.includes(criterion),
    ),
    combined,
  ];
};

const listForPriority = (
  request: UserRequest,
  priority: Criterion["priority"],
): Criterion[] => {
  if (priority === "avoid") return request.avoid;
  if (
    priority === "preferred" ||
    priority === "neutral" ||
    priority === "unknown"
  ) {
    return request.nice_to_have;
  }
  return request.must_have;
};

const applicableTypes = (
  presentation: CriterionPresentation,
): Criterion["applicable_property_types"] => {
  if (presentation.category === "house") return ["house", "townhouse", "land"];
  if (presentation.category === "property") {
    return ["apartment", "apartments", "house", "townhouse"];
  }
  return [...propertyTypes];
};

const createDomainCriterion = (item: ConfirmationCriterion): Criterion => {
  const presentation = getCriterionPresentation(item.field);
  return {
    schema_version: "1.0",
    criterion_id: item.criterion_id,
    category: presentation.category,
    field: item.field,
    operator: presentation.operator,
    target: item.value,
    unit: presentation.unit,
    priority: item.priority,
    weight:
      item.priority === "preferred" || item.priority === "avoid" ? 3 : null,
    tolerance: null,
    fit_function: null,
    criterion_group_id: null,
    applicable_property_types: applicableTypes(presentation),
    source_requirement: ["unknown"],
    freshness_requirement: null,
    critical_if_unknown:
      item.priority === "must" || item.priority === "exclude",
    user_expression: item.source_text,
  };
};

const materializeConfirmationCriteria = (
  request: UserRequest,
  criteria: readonly ConfirmationCriterion[],
): UserRequest => {
  const draft = structuredClone(request);
  const existingIds = new Set(
    criteriaArrays(draft).map((criterion) => criterion.criterion_id),
  );
  for (const item of criteria) {
    if (existingIds.has(item.criterion_id)) continue;
    const criterion = createDomainCriterion(item);
    if (criterion.category === "infrastructure")
      draft.infrastructure.push(criterion);
    else if (
      criterion.category === "property" ||
      criterion.category === "house"
    ) {
      draft.property_features.push(criterion);
    } else {
      listForPriority(draft, criterion.priority).push(criterion);
    }
    existingIds.add(criterion.criterion_id);
  }
  return userRequestSchema.parse(draft);
};

const updateDomainCriterion = (
  request: UserRequest,
  criterionId: string,
  update: (criterion: Criterion) => Criterion,
): void => {
  for (const list of [
    request.infrastructure,
    request.property_features,
    request.must_have,
    request.nice_to_have,
    request.avoid,
  ]) {
    const index = list.findIndex(
      (criterion) => criterion.criterion_id === criterionId,
    );
    if (index >= 0 && list[index]) list[index] = update(list[index]);
  }
};

const removeDomainCriterion = (
  request: UserRequest,
  criterionId: string,
): void => {
  request.infrastructure = request.infrastructure.filter(
    (criterion) => criterion.criterion_id !== criterionId,
  );
  request.property_features = request.property_features.filter(
    (criterion) => criterion.criterion_id !== criterionId,
  );
  request.must_have = request.must_have.filter(
    (criterion) => criterion.criterion_id !== criterionId,
  );
  request.nice_to_have = request.nice_to_have.filter(
    (criterion) => criterion.criterion_id !== criterionId,
  );
  request.avoid = request.avoid.filter(
    (criterion) => criterion.criterion_id !== criterionId,
  );
};

const relocateDomainCriterion = (
  request: UserRequest,
  criterionId: string,
): void => {
  const infrastructure = request.infrastructure.find(
    (criterion) => criterion.criterion_id === criterionId,
  );
  const property = request.property_features.find(
    (criterion) => criterion.criterion_id === criterionId,
  );
  if (infrastructure || property) return;
  const criterion = [
    ...request.must_have,
    ...request.nice_to_have,
    ...request.avoid,
  ].find((candidate) => candidate.criterion_id === criterionId);
  if (!criterion) return;
  request.must_have = request.must_have.filter(
    (candidate) => candidate.criterion_id !== criterionId,
  );
  request.nice_to_have = request.nice_to_have.filter(
    (candidate) => candidate.criterion_id !== criterionId,
  );
  request.avoid = request.avoid.filter(
    (candidate) => candidate.criterion_id !== criterionId,
  );
  listForPriority(request, criterion.priority).push(criterion);
};

const jsonValues = (value: ConfirmationCriterion["value"]): string[] =>
  (Array.isArray(value) ? value : [value]).map(String);

const syncBoundValue = (
  request: UserRequest,
  field: string,
  value: ConfirmationCriterion["value"],
): void => {
  const numeric = typeof value === "number" ? value : null;
  switch (field) {
    case "budget.purchase_price.maximum":
      request.budget.purchase_price.maximum =
        numeric === null ? null : money(numeric);
      break;
    case "budget.purchase_price.minimum":
      request.budget.purchase_price.minimum =
        numeric === null ? null : money(numeric);
      break;
    case "budget.total_budget":
      request.budget.total_budget = numeric === null ? null : money(numeric);
      break;
    case "budget.own_funds":
      request.budget.own_funds = numeric === null ? null : money(numeric);
      break;
    case "budget.renovation_budget":
      request.budget.renovation_budget =
        numeric === null ? null : money(numeric);
      break;
    case "budget.budget_flexible":
      request.budget.budget_flexible =
        typeof value === "boolean" ? value : null;
      break;
    case "financing.initial_payment_max":
      request.financing.initial_payment_max =
        numeric === null ? null : money(numeric);
      break;
    case "financing.monthly_payment_max":
      request.financing.monthly_payment_max =
        numeric === null ? null : money(numeric);
      break;
    case "financing.program_type":
      request.financing.required_program_types =
        jsonValues(value).filter(Boolean);
      break;
    case "property.allowed_property_types":
      request.property.allowed_property_types = jsonValues(value).filter(
        (
          item,
        ): item is UserRequest["property"]["allowed_property_types"][number] =>
          propertyTypes.includes(item as (typeof propertyTypes)[number]),
      );
      request.property.property_type_flexible =
        request.property.allowed_property_types.length > 1;
      break;
    case "property.rooms":
      request.property.rooms_min = numeric;
      request.property.rooms_max = numeric;
      break;
    case "property.rooms_min":
      request.property.rooms_min = numeric;
      break;
    case "location.cities":
      request.location.cities = jsonValues(value).filter(Boolean);
      request.location.location_flexible =
        request.location.cities.length === 0 ? true : false;
      break;
    case "location.regions":
      request.location.regions = jsonValues(value).filter(Boolean);
      break;
    case "location.preferred_districts":
      request.location.preferred_districts = jsonValues(value).filter(Boolean);
      break;
    case "location.excluded_districts":
      request.location.excluded_districts = jsonValues(value).filter(Boolean);
      break;
    case "location.excluded_locations":
      request.location.excluded_locations = jsonValues(value).filter(Boolean);
      break;
    case "timeline.move_in_by":
      request.timeline.move_in_by =
        typeof value === "string" && value ? value : null;
      break;
    case "timeline.purchase_by":
      request.timeline.purchase_by =
        typeof value === "string" && value ? value : null;
      break;
    case "timeline.construction_completion_by":
      request.timeline.construction_completion_by =
        typeof value === "string" && value ? value : null;
      break;
    case "timeline.ready_now_required":
      request.timeline.ready_now_required =
        typeof value === "boolean" ? value : null;
      break;
  }
};

const removeBoundValue = (
  request: UserRequest,
  field: string,
  value: ConfirmationCriterion["value"],
): void => {
  const removeValues = new Set(jsonValues(value));
  switch (field) {
    case "budget.purchase_price.maximum":
      request.budget.purchase_price.maximum = null;
      break;
    case "budget.purchase_price.minimum":
      request.budget.purchase_price.minimum = null;
      break;
    case "budget.total_budget":
      request.budget.total_budget = null;
      break;
    case "budget.own_funds":
      request.budget.own_funds = null;
      break;
    case "budget.renovation_budget":
      request.budget.renovation_budget = null;
      break;
    case "financing.initial_payment_max":
      request.financing.initial_payment_max = null;
      break;
    case "financing.monthly_payment_max":
      request.financing.monthly_payment_max = null;
      break;
    case "financing.program_type":
      request.financing.required_program_types =
        request.financing.required_program_types.filter(
          (program) => !removeValues.has(program),
        );
      break;
    case "property.allowed_property_types":
      request.property.allowed_property_types =
        request.property.allowed_property_types.filter(
          (propertyType) => !removeValues.has(propertyType),
        );
      break;
    case "property.rooms":
      request.property.rooms_min = null;
      request.property.rooms_max = null;
      break;
    case "property.rooms_min":
      request.property.rooms_min = null;
      break;
    case "location.cities":
      request.location.cities = request.location.cities.filter(
        (city) => !removeValues.has(city),
      );
      break;
    case "location.regions":
      request.location.regions = request.location.regions.filter(
        (region) => !removeValues.has(region),
      );
      break;
    case "location.preferred_districts":
      request.location.preferred_districts =
        request.location.preferred_districts.filter(
          (district) => !removeValues.has(district),
        );
      break;
    case "location.excluded_districts":
      request.location.excluded_districts =
        request.location.excluded_districts.filter(
          (district) => !removeValues.has(district),
        );
      break;
    case "location.excluded_locations":
      request.location.excluded_locations = (
        request.location.excluded_locations ?? []
      ).filter((location) => !removeValues.has(location));
      break;
    case "timeline.move_in_by":
      request.timeline.move_in_by = null;
      break;
    case "timeline.purchase_by":
      request.timeline.purchase_by = null;
      break;
    case "timeline.construction_completion_by":
      request.timeline.construction_completion_by = null;
      break;
  }
};

const amountValue = (
  value: { amount: string } | null | undefined,
): number | null => (value ? Number(value.amount) : null);

export const validateConfirmationSession = (
  request: UserRequest,
  criteria: readonly ConfirmationCriterion[],
  contradictions: readonly ParserContradiction[],
  clarifications: readonly ClarificationCandidate[],
): ConfirmationValidationError[] => {
  const errors: ConfirmationValidationError[] = [];
  if (!userRequestSchema.safeParse(request).success) {
    errors.push({
      field: "request",
      message:
        "Не удалось проверить структуру запроса. Проверьте изменённые условия.",
    });
  }
  for (const criterion of criteria) {
    const presentation = getCriterionPresentation(criterion.field);
    if (presentation.editor === "money" || presentation.editor === "number") {
      const value =
        typeof criterion.value === "object" &&
        criterion.value !== null &&
        "maximum" in criterion.value
          ? criterion.value.maximum
          : criterion.value;
      const allowedFuzzyValue =
        presentation.editor === "number" && criterion.value === "nearby";
      if (
        !allowedFuzzyValue &&
        (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      ) {
        errors.push({
          field: criterion.field,
          message: `${presentation.label}: укажите неотрицательное число.`,
        });
      }
    }
    if (presentation.editor === "range") {
      const value = criterion.value;
      const minimum =
        typeof value === "number"
          ? value
          : typeof value === "object" && value !== null && "minimum" in value
            ? value.minimum
            : null;
      const maximum =
        typeof value === "object" && value !== null && "maximum" in value
          ? value.maximum
          : null;
      if (minimum === null && maximum === null) {
        errors.push({
          field: criterion.field,
          message: `${presentation.label}: укажите хотя бы одну границу.`,
        });
      } else if (
        typeof minimum === "number" &&
        typeof maximum === "number" &&
        minimum > maximum
      ) {
        errors.push({
          field: criterion.field,
          message: `Минимальная ${presentation.label.toLowerCase()} не может быть больше максимальной.`,
        });
      }
    }
    if (presentation.editor === "text" || presentation.editor === "date") {
      if (
        typeof criterion.value !== "string" ||
        criterion.value.trim() === ""
      ) {
        errors.push({
          field: criterion.field,
          message: `${presentation.label}: укажите значение.`,
        });
      }
    }
    if (presentation.editor === "property_types") {
      if (!Array.isArray(criterion.value) || criterion.value.length === 0) {
        errors.push({
          field: criterion.field,
          message: "Выберите хотя бы один тип недвижимости.",
        });
      }
    }
  }
  const priceMinimum = amountValue(request.budget.purchase_price.minimum);
  const priceMaximum = amountValue(request.budget.purchase_price.maximum);
  if (
    priceMinimum !== null &&
    priceMaximum !== null &&
    priceMinimum > priceMaximum
  ) {
    errors.push({
      field: "budget.purchase_price",
      message: "Минимальная цена не может быть больше максимальной.",
    });
  }
  if (contradictions.some((contradiction) => contradiction.blocking)) {
    errors.push({
      field: "contradictions",
      message: "Исправьте противоречащие обязательные условия.",
    });
  }
  if (
    clarifications.some(
      (clarification) => clarification.priority === "critical",
    )
  ) {
    errors.push({
      field: "clarifications",
      message: "Ответьте на обязательные уточнения.",
    });
  }
  return errors;
};

const recompute = (session: ConfirmationSession): ConfirmationSession => {
  const contradictions = detectUserRequestContradictions(
    session.draft_request,
    session.initial_result.extracted_facts,
  );
  const answeredIds = new Set(
    session.answered_clarifications.map((answer) => answer.clarification_id),
  );
  const clarifications = selectTopClarifications(
    session.unknowns,
    contradictions,
    session.initial_result.raw_text,
  ).filter((clarification) => !answeredIds.has(clarification.clarification_id));
  return {
    ...session,
    contradictions,
    clarifications,
    validation_errors: validateConfirmationSession(
      session.draft_request,
      session.criteria,
      contradictions,
      clarifications,
    ),
  };
};

export const createConfirmationSession = (
  result: UserRequestParserResult,
): ConfirmationSession => {
  const initialResult = structuredClone(result);
  const criteria = groupCriteria(initialResult);
  const draftRequest = materializeConfirmationCriteria(
    initialResult.parsed_request,
    criteria,
  );
  return recompute({
    initial_result: initialResult,
    draft_request: draftRequest,
    criteria,
    unknowns: structuredClone(initialResult.unknowns),
    contradictions: [],
    clarifications: [],
    answered_clarifications: [],
    changes: [],
    validation_errors: [],
    status: "editing",
    confirmation_result: null,
    transition_error: null,
  });
};

const changeId = (type: ConfirmationChange["type"], index: number): string =>
  `change_${type}_${index}`;

const appendChange = (
  session: ConfirmationSession,
  change: Omit<ConfirmationChange, "change_id">,
): ConfirmationChange[] => [
  ...session.changes,
  { ...change, change_id: changeId(change.type, session.changes.length + 1) },
];

export const editCriterionValue = (
  session: ConfirmationSession,
  criterionId: string,
  value: ConfirmationCriterion["value"],
  changedAt = nowIso(),
): ConfirmationSession => {
  const existing = session.criteria.find(
    (criterion) => criterion.criterion_id === criterionId,
  );
  if (!existing)
    return {
      ...session,
      status: "transition_error",
      transition_error: "Условие не найдено.",
    };
  const request = structuredClone(session.draft_request);
  const presentation = getCriterionPresentation(existing.field);
  updateDomainCriterion(request, criterionId, (criterion) => ({
    ...criterion,
    operator: presentation.operator,
    target: value,
    unit: presentation.unit,
  }));
  syncBoundValue(request, existing.field, value);
  const criteria = session.criteria.map((criterion) =>
    criterion.criterion_id === criterionId
      ? { ...criterion, value }
      : criterion,
  );
  return recompute({
    ...session,
    draft_request: request,
    criteria,
    changes: appendChange(session, {
      type: "criterion_value_changed",
      criterion_id: criterionId,
      field: existing.field,
      previous_value: existing.value,
      next_value: value,
      changed_at: changedAt,
    }),
    status: "editing",
    confirmation_result: null,
    transition_error: null,
  });
};

export const changeCriterionPriority = (
  session: ConfirmationSession,
  criterionId: string,
  priority: Criterion["priority"],
  changedAt = nowIso(),
): ConfirmationSession => {
  const existing = session.criteria.find(
    (criterion) => criterion.criterion_id === criterionId,
  );
  if (!existing)
    return {
      ...session,
      status: "transition_error",
      transition_error: "Условие не найдено.",
    };
  const request = structuredClone(session.draft_request);
  updateDomainCriterion(request, criterionId, (criterion) => ({
    ...criterion,
    priority,
    critical_if_unknown: priority === "must" || priority === "exclude",
    weight:
      priority === "preferred" || priority === "avoid"
        ? (criterion.weight ?? 3)
        : null,
  }));
  relocateDomainCriterion(request, criterionId);
  const criteria = session.criteria.map((criterion) =>
    criterion.criterion_id === criterionId
      ? { ...criterion, priority }
      : criterion,
  );
  return recompute({
    ...session,
    draft_request: request,
    criteria,
    changes: appendChange(session, {
      type: "priority_changed",
      criterion_id: criterionId,
      field: existing.field,
      previous_value: existing.priority,
      next_value: priority,
      changed_at: changedAt,
    }),
    status: "editing",
    confirmation_result: null,
    transition_error: null,
  });
};

export const removeCriterion = (
  session: ConfirmationSession,
  criterionId: string,
  changedAt = nowIso(),
): ConfirmationSession => {
  const existing = session.criteria.find(
    (criterion) => criterion.criterion_id === criterionId,
  );
  if (!existing)
    return {
      ...session,
      status: "transition_error",
      transition_error: "Условие не найдено.",
    };
  const request = structuredClone(session.draft_request);
  removeDomainCriterion(request, criterionId);
  removeBoundValue(request, existing.field, existing.value);
  const criteria = session.criteria.filter(
    (criterion) => criterion.criterion_id !== criterionId,
  );
  return recompute({
    ...session,
    draft_request: request,
    criteria,
    changes: appendChange(session, {
      type: "criterion_removed",
      criterion_id: criterionId,
      field: existing.field,
      previous_value: existing.value,
      next_value: null,
      changed_at: changedAt,
    }),
    status: "editing",
    confirmation_result: null,
    transition_error: null,
  });
};

const safeFieldId = (field: string): string =>
  field.replace(/[^a-z0-9]+/g, "_");

export const addCriterion = (
  session: ConfirmationSession,
  field: string,
  value: ConfirmationCriterion["value"],
  priority: Criterion["priority"] = "preferred",
  changedAt = nowIso(),
): ConfirmationSession => {
  if (session.criteria.some((criterion) => criterion.field === field)) {
    return {
      ...session,
      status: "transition_error",
      transition_error: "Это условие уже добавлено — измените существующее.",
    };
  }
  const presentation = getCriterionPresentation(field);
  const item: ConfirmationCriterion = {
    criterion_id: `criterion_added_${safeFieldId(field)}_${session.criteria.length + 1}`,
    field,
    label: presentation.label,
    value,
    priority,
    source_text: null,
    editable: { value: true, priority: true, removable: true },
  };
  const request = materializeConfirmationCriteria(session.draft_request, [
    item,
  ]);
  syncBoundValue(request, field, value);
  const criteria = [...session.criteria, item];
  return recompute({
    ...session,
    draft_request: request,
    criteria,
    changes: appendChange(session, {
      type: "criterion_added",
      criterion_id: item.criterion_id,
      field,
      previous_value: null,
      next_value: value,
      changed_at: changedAt,
    }),
    status: "editing",
    confirmation_result: null,
    transition_error: null,
  });
};

const removeCriteriaByField = (
  request: UserRequest,
  criteria: ConfirmationCriterion[],
  field: string,
): ConfirmationCriterion[] => {
  for (const criterion of criteria.filter((item) => item.field === field)) {
    removeDomainCriterion(request, criterion.criterion_id);
  }
  return criteria.filter((criterion) => criterion.field !== field);
};

export const answerClarification = (
  session: ConfirmationSession,
  clarificationId: string,
  answer: ClarificationCandidate["options"][number]["value"],
  answeredAt = nowIso(),
): ConfirmationSession => {
  const clarification = session.clarifications.find(
    (candidate) => candidate.clarification_id === clarificationId,
  );
  if (!clarification) {
    return {
      ...session,
      status: "transition_error",
      transition_error: "Уточнение уже закрыто.",
    };
  }
  const request = structuredClone(session.draft_request);
  let criteria = [...session.criteria];
  let unknowns = session.unknowns.filter(
    (unknown) => unknown.field !== clarification.field,
  );

  if (answer === "include") {
    request.location.excluded_districts = [];
    criteria = removeCriteriaByField(
      request,
      criteria,
      "location.excluded_districts",
    );
  } else if (answer === "exclude") {
    request.location.preferred_districts = [];
    criteria = removeCriteriaByField(
      request,
      criteria,
      "location.preferred_districts",
    );
  } else if (
    clarification.field === "budget.context" &&
    typeof answer === "string"
  ) {
    if (answer === "property_price" || answer === "total_entry") {
      request.budget.budget_context = answer;
    }
  } else if (clarification.field === "location.city") {
    if (answer === "location_discovery") {
      request.location.location_flexible = true;
      unknowns = session.unknowns;
    } else if (typeof answer === "string" && answer !== "provide_city") {
      request.location.cities = [answer];
      request.location.location_flexible = false;
    }
  } else if (
    clarification.field === "location.travel_destination" &&
    typeof answer === "string"
  ) {
    if (answer !== "provide_destination") {
      request.location.destination_addresses = [
        {
          country_code: null,
          region: null,
          city: null,
          locality: null,
          district: null,
          street: answer,
          house_number: null,
          postal_code: null,
        },
      ];
    }
  } else if (
    clarification.field === "source_links" &&
    typeof answer === "string"
  ) {
    if (answer !== "provide_links") request.source_links = [answer];
  } else if (typeof answer === "number") {
    const criterion = criteria.find(
      (item) => item.field === clarification.field,
    );
    if (criterion) {
      const updatedValue = { maximum: answer, mode: "unspecified" };
      criteria = criteria.map((item) =>
        item.criterion_id === criterion.criterion_id
          ? { ...item, value: updatedValue }
          : item,
      );
      updateDomainCriterion(
        request,
        criterion.criterion_id,
        (domainCriterion) => ({
          ...domainCriterion,
          operator: "within_time",
          target: updatedValue,
          unit: "minutes",
        }),
      );
    }
  }

  const answered: AnsweredClarification = {
    clarification_id: clarificationId,
    field: clarification.field,
    answer,
    answered_at: answeredAt,
  };
  return recompute({
    ...session,
    draft_request: request,
    criteria,
    unknowns,
    answered_clarifications: [...session.answered_clarifications, answered],
    changes: appendChange(session, {
      type: "clarification_answered",
      criterion_id: null,
      field: clarification.field,
      previous_value: null,
      next_value: answer,
      changed_at: answeredAt,
    }),
    status: "editing",
    confirmation_result: null,
    transition_error: null,
  });
};

export const confirmRequest = (
  session: ConfirmationSession,
  confirmedAt = nowIso(),
): ConfirmationSession => {
  const recomputed = recompute(session);
  if (recomputed.validation_errors.length > 0) {
    return {
      ...recomputed,
      status: "transition_error",
      transition_error:
        "Запрос пока нельзя подтвердить. Исправьте отмеченные условия.",
    };
  }
  try {
    const confirmedRequest = userRequestSchema.parse(recomputed.draft_request);
    const result = requestConfirmationResultSchema.parse({
      schema_version: "1.0",
      request_status: "confirmed",
      original_raw_text: recomputed.initial_result.raw_text,
      confirmed_request: confirmedRequest,
      unresolved_nonblocking_unknowns: recomputed.unknowns.filter(
        (unknown) => unknown.materiality !== "critical",
      ),
      answered_clarifications: recomputed.answered_clarifications,
      user_changes: recomputed.changes,
      confirmed_at: confirmedAt,
    });
    return {
      ...recomputed,
      status: "confirmed",
      confirmation_result: result,
      transition_error: null,
    };
  } catch {
    return {
      ...recomputed,
      status: "transition_error",
      transition_error:
        "Не удалось сохранить подтверждённый запрос. Изменения не потеряны.",
    };
  }
};

export const canConfirmRequest = (session: ConfirmationSession): boolean =>
  session.validation_errors.length === 0 &&
  !session.contradictions.some((contradiction) => contradiction.blocking) &&
  !session.clarifications.some(
    (clarification) => clarification.priority === "critical",
  );

export const createAddCriterionDraft = (
  field: string,
): ConfirmationCriterion => {
  const presentation = getCriterionPresentation(field);
  return {
    criterion_id: `criterion_draft_${safeFieldId(field)}`,
    field,
    label: presentation.label,
    value: structuredClone(presentation.default_value),
    priority: "preferred",
    source_text: null,
    editable: { value: true, priority: true, removable: true },
  };
};
