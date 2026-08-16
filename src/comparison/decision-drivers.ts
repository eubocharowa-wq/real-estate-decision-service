import { COMPARISON_POLICY_V1 } from "./policy";
import type {
  ComparisonColumnView,
  ComparisonRowView,
  DecisionDriverView,
  TradeoffView,
} from "./types";

const isUnresolved = (state: string): boolean =>
  state === "critical_unknown" || state === "conflict";

const hasMaterialDifference = (row: ComparisonRowView): boolean => {
  const readyCells = row.cells.filter((cell) => cell.state !== "unavailable");
  const fits = readyCells.flatMap((cell) =>
    cell.fit === null ? [] : [cell.fit],
  );
  if (
    fits.length > 1 &&
    Math.max(...fits) - Math.min(...fits) >=
      COMPARISON_POLICY_V1.minimumCriterionFitGap
  )
    return true;
  const numeric = readyCells.flatMap((cell) =>
    typeof cell.comparableValue === "number" ? [cell.comparableValue] : [],
  );
  if (numeric.length > 1) {
    const minimum = Math.min(...numeric);
    const maximum = Math.max(...numeric);
    const baseline = Math.max(Math.abs(minimum), 1);
    if (
      (maximum - minimum) / baseline >=
      COMPARISON_POLICY_V1.minimumNumericSpreadRatio
    )
      return true;
  }
  const signatures = new Set(
    readyCells.map(
      (cell) => `${cell.status}:${String(cell.comparableValue)}:${cell.state}`,
    ),
  );
  return (
    signatures.size > 1 &&
    readyCells.some(
      (cell) =>
        typeof cell.comparableValue === "string" ||
        typeof cell.comparableValue === "boolean" ||
        cell.status !== readyCells[0]?.status,
    )
  );
};

const numericSpread = (
  row: ComparisonRowView,
): DecisionDriverView["spread"] => {
  const values = row.cells.flatMap((cell) =>
    typeof cell.comparableValue === "number" ? [cell.comparableValue] : [],
  );
  return values.length > 1
    ? { minimum: Math.min(...values), maximum: Math.max(...values) }
    : null;
};

export const buildDecisionDrivers = (
  rows: readonly ComparisonRowView[],
  columns: readonly ComparisonColumnView[],
): readonly DecisionDriverView[] => {
  const titleByProperty = new Map(
    columns.map((column) => [column.propertyId, column.title]),
  );
  return rows
    .filter((row) => {
      const unresolved = row.cells.some((cell) => isUnresolved(cell.state));
      return unresolved || (row.userCriterion && hasMaterialDifference(row));
    })
    .map((row) => {
      const unresolvedCells = row.cells.filter((cell) =>
        isUnresolved(cell.state),
      );
      const leaders = row.cells
        .filter((cell) => cell.state === "best_confirmed")
        .map((cell) => cell.propertyId);
      const affected = unresolvedCells.map((cell) => cell.propertyId);
      const importance =
        row.importance === "must" ||
        row.importance === "exclude" ||
        unresolvedCells.length > 0
          ? "high"
          : "medium";
      const description =
        unresolvedCells.length > 0
          ? `По условию «${row.label}» выбор зависит от проверки данных для ${unresolvedCells
              .map(
                (cell) =>
                  titleByProperty.get(cell.propertyId) ?? cell.propertyId,
              )
              .join(", ")}.`
          : leaders.length === 1
            ? `${titleByProperty.get(leaders[0]!) ?? leaders[0]} сильнее по подтверждённому условию «${row.label}».`
            : `Варианты заметно различаются по условию «${row.label}».`;
      return {
        id: `driver:${row.id}`,
        rowId: row.id,
        label: row.label,
        importance,
        description,
        leadingPropertyIds: leaders,
        affectedPropertyIds: affected,
        spread: numericSpread(row),
        unresolved: unresolvedCells.length > 0,
      } satisfies DecisionDriverView;
    })
    .sort(
      (left, right) =>
        Number(right.importance === "high") -
          Number(left.importance === "high") ||
        Number(right.unresolved) - Number(left.unresolved),
    )
    .slice(0, COMPARISON_POLICY_V1.maximumDecisionDrivers);
};

export const buildTradeoffs = (
  drivers: readonly DecisionDriverView[],
  columns: readonly ComparisonColumnView[],
): readonly TradeoffView[] => {
  const titleByProperty = new Map(
    columns.map((column) => [column.propertyId, column.title]),
  );
  return drivers
    .map((driver) => {
      if (driver.unresolved) {
        const names = driver.affectedPropertyIds.map(
          (propertyId) => titleByProperty.get(propertyId) ?? propertyId,
        );
        return {
          id: `tradeoff:${driver.id}`,
          text: `Разницу по «${driver.label}» нельзя использовать как преимущество, пока не проверены данные для ${names.join(", ")}.`,
          propertyIds: driver.affectedPropertyIds,
          driverIds: [driver.id],
        } satisfies TradeoffView;
      }
      if (driver.leadingPropertyIds.length === 1) {
        const leaderId = driver.leadingPropertyIds[0]!;
        return {
          id: `tradeoff:${driver.id}`,
          text: `${titleByProperty.get(leaderId) ?? leaderId} выигрывает по «${driver.label}», но это преимущество относится только к вашему текущему запросу.`,
          propertyIds: [leaderId],
          driverIds: [driver.id],
        } satisfies TradeoffView;
      }
      return {
        id: `tradeoff:${driver.id}`,
        text: `По «${driver.label}» есть разные последствия, но подтверждённого единственного преимущества нет.`,
        propertyIds: [],
        driverIds: [driver.id],
      } satisfies TradeoffView;
    })
    .slice(0, COMPARISON_POLICY_V1.maximumTradeoffs);
};
