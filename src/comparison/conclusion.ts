import { COMPARISON_POLICY_V1 } from "./policy";
import type {
  ComparisonColumnView,
  ComparisonConclusionView,
  ComparisonRowView,
  DecisionDriverView,
} from "./types";

export interface ComparisonConclusionInput {
  readonly columns: readonly ComparisonColumnView[];
  readonly rows: readonly ComparisonRowView[];
  readonly decisionDrivers: readonly DecisionDriverView[];
}

const title = (
  columns: readonly ComparisonColumnView[],
  propertyId: string,
): string =>
  columns.find((column) => column.propertyId === propertyId)?.title ??
  propertyId;

const unresolvedMustRows = (
  rows: readonly ComparisonRowView[],
): readonly ComparisonRowView[] =>
  rows.filter(
    (row) =>
      (row.importance === "must" || row.importance === "exclude") &&
      row.cells.some(
        (cell) =>
          cell.state === "critical_unknown" || cell.state === "conflict",
      ),
  );

export const buildComparisonConclusion = ({
  columns,
  rows,
  decisionDrivers,
}: ComparisonConclusionInput): ComparisonConclusionView => {
  const ready = columns.filter((column) => column.status === "ready");
  const valid = ready.filter(
    (column) => !column.hardFail && column.availabilityWarning === null,
  );
  if (ready.length > 0 && valid.length === 0) {
    return {
      status: "no_valid_option",
      label: "Ни один вариант не проходит обязательные условия",
      summary:
        "Не выбираем лучший из неподходящих: сначала измените условия или замените финалистов.",
      leadingPropertyId: null,
      alternativePropertyId: null,
      decisionDriverIds: decisionDrivers.map((driver) => driver.id),
      conditions: [],
      unresolvedQuestions: [],
    };
  }

  const unresolvedMust = unresolvedMustRows(rows);
  if (columns.length < 2 || valid.length < 2 || unresolvedMust.length > 0) {
    return {
      status: "insufficient_data",
      label: "Недостаточно данных для уверенного выбора",
      summary:
        "Победитель не выбран: решение зависит от критичных неподтверждённых условий.",
      leadingPropertyId: null,
      alternativePropertyId: null,
      decisionDriverIds: decisionDrivers.map((driver) => driver.id),
      conditions: [],
      unresolvedQuestions: unresolvedMust.map(
        (row) => `Проверить «${row.label}».`,
      ),
    };
  }

  const ordered = [...valid].sort(
    (left, right) => (right.matchScore ?? 0) - (left.matchScore ?? 0),
  );
  const leader = ordered[0]!;
  const alternative = ordered[1]!;
  const gap = (leader.matchScore ?? 0) - (alternative.matchScore ?? 0);
  const leaderDriverWins = decisionDrivers.filter(
    (driver) =>
      !driver.unresolved &&
      driver.leadingPropertyIds.includes(leader.propertyId),
  ).length;
  const otherDriverWins = decisionDrivers.filter(
    (driver) =>
      !driver.unresolved &&
      driver.leadingPropertyIds.some(
        (propertyId) => propertyId !== leader.propertyId,
      ),
  ).length;
  const leaderConfidenceSufficient = ["high", "medium"].includes(
    leader.confidenceBand,
  );
  const leaderHasUncertainty =
    leader.criticalUnknownCount > 0 || leader.criticalConflictCount > 0;

  if (
    gap >= COMPARISON_POLICY_V1.clearLeaderMatchGap &&
    leaderConfidenceSufficient &&
    !leaderHasUncertainty &&
    leaderDriverWins > otherDriverWins
  ) {
    return {
      status: "clear_leader",
      label: "Явный лидер по вашим условиям",
      summary: `${leader.title} устойчиво сильнее по текущим подтверждённым критериям и данным.`,
      leadingPropertyId: leader.propertyId,
      alternativePropertyId: alternative.propertyId,
      decisionDriverIds: decisionDrivers.map((driver) => driver.id),
      conditions: [],
      unresolvedQuestions: [],
    };
  }

  if (
    gap >= COMPARISON_POLICY_V1.clearLeaderMatchGap &&
    (!leaderConfidenceSufficient || leaderHasUncertainty)
  ) {
    return {
      status: "conditional_leader",
      label: "Лидер при условии проверки",
      summary: `${leader.title} выглядит сильнее по Match Score, но это не окончательный выбор до проверки данных.`,
      leadingPropertyId: leader.propertyId,
      alternativePropertyId: alternative.propertyId,
      decisionDriverIds: decisionDrivers.map((driver) => driver.id),
      conditions: [
        `Подтвердить критичные данные для ${title(columns, leader.propertyId)}.`,
      ],
      unresolvedQuestions: decisionDrivers
        .filter((driver) => driver.unresolved)
        .map((driver) => driver.description),
    };
  }

  return {
    status: "near_tie",
    label: "Явного лидера нет",
    summary:
      gap <= COMPARISON_POLICY_V1.nearTieMatchGap
        ? "Варианты близки по Match Score; выбор определяется показанными trade-offs."
        : "Преимущества распределены между вариантами, поэтому победитель не навязывается.",
    leadingPropertyId: null,
    alternativePropertyId: null,
    decisionDriverIds: decisionDrivers.map((driver) => driver.id),
    conditions: [],
    unresolvedQuestions: decisionDrivers
      .filter((driver) => driver.unresolved)
      .map((driver) => driver.description),
  };
};
