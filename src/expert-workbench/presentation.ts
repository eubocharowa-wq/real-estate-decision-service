import type { ExpertResultReviewInput } from "./contracts";
import {
  checkStatusLabels,
  choiceStatusLabels,
  expertRequestTypeLabels,
  findingSeverityLabels,
  nextActionLabels,
  priorityLabels,
  resultStatusLabels,
  specialistTypeLabels,
  workflowStatusLabels,
} from "./labels";

const formatValue = (value: unknown): string => {
  if (value === null) return "Значение не установлено";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "number")
    return new Intl.NumberFormat("ru-RU").format(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
};

const scoreChange = (
  oldValue: number | null,
  newValue: number | null,
): string => {
  if (oldValue === null) return "Не рассчитано";
  if (newValue === null) return `${oldValue}% · нового пересчёта пока нет`;
  return `${oldValue}% → ${newValue}%`;
};

export interface ExpertResultReviewView {
  readonly header: {
    readonly title: string;
    readonly status: string;
    readonly checked: string;
    readonly context: string;
    readonly mainResult: string;
  };
  readonly checkedItems: readonly string[];
  readonly confirmed: readonly string[];
  readonly notConfirmed: readonly string[];
  readonly unknown: readonly string[];
  readonly unresolvedConflicts: readonly string[];
  readonly risks: readonly { label: string; text: string }[];
  readonly findings: readonly { label: string; text: string }[];
  readonly nextActions: readonly string[];
  readonly documentRefs: readonly string[];
  readonly decisionImpact: {
    readonly match: string;
    readonly confidence: string;
    readonly explanation: string;
  };
  readonly choice: {
    readonly label: string;
    readonly preferredPropertyId: string | null;
    readonly conditions: readonly string[];
    readonly unresolvedQuestions: readonly string[];
  } | null;
  readonly boundaryNotice: string | null;
  readonly technicalEscalationHref: string | null;
}

export const buildExpertResultReviewView = (
  input: ExpertResultReviewInput,
  technicalEscalationHref: string | null,
): ExpertResultReviewView => {
  const result = input.result;
  const recommendation = result?.recommendations[0] ?? null;
  const unableReason = result?.unconfirmed.find(
    (item) => item.outcome === "unable_to_verify",
  )?.reason;
  const mainResult = result
    ? (recommendation ??
      unableReason ??
      (result.status === "unable_to_verify"
        ? "Проверку не удалось завершить; неизвестность сохранена."
        : "Эксперт зафиксировал структурированный результат проверки."))
    : workflowStatusLabels[input.request.status];
  const context = input.contextPackage.properties
    .map((property) => property.location_label)
    .join(" · ");
  return {
    header: {
      title: expertRequestTypeLabels[input.request.request_type],
      status: result
        ? resultStatusLabels[result.status]
        : workflowStatusLabels[input.request.status],
      checked: input.contextPackage.user_question,
      context,
      mainResult,
    },
    checkedItems:
      result?.checked_items.map(
        (item) =>
          `${item.subject} — ${
            item.outcome === "confirmed"
              ? checkStatusLabels.checked_confirmed
              : item.outcome === "unconfirmed"
                ? checkStatusLabels.checked_not_confirmed
                : item.outcome === "conflicting"
                  ? checkStatusLabels.checked_conflicting
                  : item.outcome === "not_required"
                    ? checkStatusLabels.not_required
                    : checkStatusLabels.unable_to_check
          }`,
      ) ?? [],
    confirmed:
      result?.confirmed.map(
        (fact) => `${fact.field}: ${formatValue(fact.value)}`,
      ) ?? [],
    notConfirmed:
      result?.unconfirmed
        .filter((fact) => fact.outcome === "unconfirmed")
        .map((fact) => `${fact.field}: ${fact.reason}`) ?? [],
    unknown:
      result?.unconfirmed
        .filter((fact) => fact.outcome === "unable_to_verify")
        .map((fact) => `${fact.field}: ${fact.reason}`) ??
      input.contextPackage.critical_unknowns.map(
        (unknown) => `${unknown.field}: ${unknown.reason}`,
      ),
    unresolvedConflicts:
      result?.conflicts
        .filter((conflict) => conflict.outcome === "remains_open")
        .map((conflict) => `${conflict.field}: ${conflict.reason}`) ??
      input.contextPackage.conflicts.map(
        (conflict) => `${conflict.field}: расхождение ещё не разрешено`,
      ),
    risks:
      result?.risks.map((risk) => ({
        label: findingSeverityLabels[risk.severity],
        text: risk.description,
      })) ?? [],
    findings:
      result?.findings.map((finding) => ({
        label: findingSeverityLabels[finding.severity],
        text: finding.statement,
      })) ?? [],
    nextActions:
      result?.next_actions.map(
        (action) =>
          nextActionLabels[action as keyof typeof nextActionLabels] ?? action,
      ) ?? [],
    documentRefs: input.contextPackage.document_refs,
    decisionImpact: {
      match: scoreChange(
        input.recompute.old_match_score,
        input.recompute.new_match_score,
      ),
      confidence: scoreChange(
        input.recompute.old_data_confidence_score,
        input.recompute.new_data_confidence_score,
      ),
      explanation: input.recompute.message,
    },
    choice: result?.choice_assistance
      ? {
          label: choiceStatusLabels[result.choice_assistance.status],
          preferredPropertyId:
            result.choice_assistance.status === "near_tie"
              ? null
              : result.choice_assistance.preferred_property_id,
          conditions: result.choice_assistance.conditions,
          unresolvedQuestions: result.choice_assistance.unresolved_questions,
        }
      : null,
    boundaryNotice:
      input.request.request_type === "document_review"
        ? (result?.disclaimer ??
          "Разбор документа не является официальным юридическим заключением.")
        : input.request.request_type === "onsite_check"
          ? (input.contextPackage.onsite_context?.boundary_notice ??
            "Визуальная проверка не является инженерно-техническим обследованием.")
          : null,
    technicalEscalationHref,
  };
};

export const expertWorkbenchHeaderLabels = {
  requestType: expertRequestTypeLabels,
  priority: priorityLabels,
  status: workflowStatusLabels,
  specialist: specialistTypeLabels,
};
