import {
  expertRequestTypeSchema,
  type ExpertQuestionCategory,
  type ExpertRequestType,
  type ExpertTriggerType,
} from "./contracts";

export interface ExpertRequestPreview {
  readonly requestType: ExpertRequestType;
  readonly triggerType: ExpertTriggerType;
  readonly questionCategory: ExpertQuestionCategory;
  readonly title: string;
  readonly whatToCheck: string;
  readonly whyItMatters: string;
  readonly propertyIds: readonly string[];
  readonly propertyLabels: readonly string[];
  readonly userRequestRef: string | null;
  readonly comparisonRef: string | null;
  readonly field: string | null;
  readonly questionCode: string | null;
  readonly documentRefs: readonly string[];
  readonly onsiteContext: {
    readonly scope: "visual_physical" | "structural_engineering";
    readonly knownRisks: readonly string[];
    readonly itemsToCheck: readonly string[];
  } | null;
  readonly structuredQuestionPreview: readonly string[];
  readonly submitLabel: string;
  readonly boundaryNotice: string | null;
}

export interface ExpertRequestPreviewInput {
  readonly type: string | null;
  readonly property: string | null;
  readonly properties: string | null;
  readonly userRequest: string | null;
  readonly comparison: string | null;
  readonly field: string | null;
  readonly check: string | null;
  readonly unknownCount: number | null;
  readonly documentRefs?: readonly string[];
  readonly onsiteScope?: string | null;
  readonly knownRisks?: readonly string[];
  readonly itemsToCheck?: readonly string[];
}

const parseProperties = (input: ExpertRequestPreviewInput): string[] => {
  const values = input.properties
    ? input.properties.split(",")
    : input.property
      ? [input.property]
      : [];
  return [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ].slice(0, 5);
};

const inferRequestType = (
  input: ExpertRequestPreviewInput,
): ExpertRequestType => {
  const parsed = expertRequestTypeSchema.safeParse(input.type);
  if (parsed.success) return parsed.data;
  if (input.comparison || input.properties) return "choice_assistance";
  return "information_verification";
};

const humanField = (field: string | null): string => {
  if (!field) return "конкретный вопрос по выбранному объекту";
  return field
    .replaceAll("_", " ")
    .replaceAll(".", " → ")
    .toLocaleLowerCase("ru-RU");
};

const normalizeQuestionCode = (code: string | null): string | null => {
  if (!code) return null;
  const normalized = code
    .trim()
    .toLocaleLowerCase("en-US")
    .replaceAll(/[^a-z0-9:_-]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
  return /^[a-z]/.test(normalized) ? normalized : `check_${normalized}`;
};

export const buildExpertRequestPreview = (
  input: ExpertRequestPreviewInput,
): ExpertRequestPreview => {
  const requestType = inferRequestType(input);
  const propertyIds = parseProperties(input);
  const financing = Boolean(
    input.field?.match(/financ|mortgage|payment|ипотек|взнос/i),
  );
  const conflict = Boolean(input.check?.match(/conflict|расхожд/i));
  const onsiteScope =
    input.onsiteScope === "visual_physical" ||
    input.onsiteScope === "structural_engineering"
      ? input.onsiteScope
      : null;
  const triggerType: ExpertTriggerType =
    requestType === "choice_assistance"
      ? "comparison_uncertainty"
      : requestType === "document_review"
        ? "document_question"
        : requestType === "onsite_check"
          ? "onsite_needed"
          : financing
            ? "financing_uncertainty"
            : conflict
              ? "critical_conflict"
              : input.field
                ? "critical_unknown"
                : "user_requested";
  const questionCategory: ExpertQuestionCategory =
    requestType === "choice_assistance"
      ? "comparison"
      : requestType === "document_review"
        ? "document"
        : requestType === "onsite_check"
          ? onsiteScope === "structural_engineering"
            ? "structural_engineering"
            : "physical_condition"
          : financing
            ? "financing"
            : conflict || input.field?.includes("price")
              ? "price"
              : input.field?.includes("availability")
                ? "availability"
                : "general";
  const whatToCheck =
    requestType === "choice_assistance"
      ? "Помочь выбрать между финалистами по вашим условиям и trade-offs."
      : `Проверить: ${humanField(input.field)}.`;
  const whyItMatters =
    requestType === "choice_assistance"
      ? "У вариантов есть разные преимущества, компромиссы или неизвестные данные, которые могут изменить решение."
      : conflict
        ? "Источники расходятся; без проверки нельзя безопасно считать одно значение верным."
        : "Этот факт влияет на решение и пока недостаточно подтверждён.";
  return {
    requestType,
    triggerType,
    questionCategory,
    title:
      requestType === "choice_assistance"
        ? "Экспертная помощь с выбором"
        : "Экспертная проверка вопроса",
    whatToCheck,
    whyItMatters,
    propertyIds,
    propertyLabels:
      propertyIds.length > 0
        ? propertyIds.map((id, index) => `Объект ${index + 1} · ${id}`)
        : ["Объект будет взят из текущего контекста"],
    userRequestRef: input.userRequest,
    comparisonRef: input.comparison,
    field: input.field,
    questionCode: normalizeQuestionCode(input.check),
    documentRefs: [...(input.documentRefs ?? [])],
    onsiteContext:
      requestType === "onsite_check" && onsiteScope
        ? {
            scope: onsiteScope,
            knownRisks: [...(input.knownRisks ?? [])],
            itemsToCheck: [...(input.itemsToCheck ?? [])],
          }
        : null,
    structuredQuestionPreview: input.field
      ? [`Подтвердить поле «${humanField(input.field)}» и указать основание.`]
      : requestType === "choice_assistance"
        ? [
            `Сопоставить ${propertyIds.length || "выбранные"} финалиста по решающим условиям.`,
            ...(input.unknownCount && input.unknownCount > 0
              ? [`Разобрать критичные неизвестные: ${input.unknownCount}.`]
              : []),
          ]
        : [
            "Зафиксировать, что проверено, каким способом и на каком основании.",
          ],
    submitLabel:
      requestType === "choice_assistance"
        ? "Попросить помочь с выбором"
        : "Передать на экспертную проверку",
    boundaryNotice:
      requestType === "document_review" ||
      requestType === "transaction_question"
        ? "Экспертный разбор в сервисе не заменяет официальное юридическое заключение, если оно требуется."
        : requestType === "onsite_check"
          ? "Визуальная проверка не является инженерно-техническим обследованием."
          : null,
  };
};
