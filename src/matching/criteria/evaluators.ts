import {
  isoDateSchema,
  type Criterion,
  type CriterionEvaluationResult,
} from "../../domain";
import { CRITERIA_SOFT_CURVE_CONFIG } from "./config";
import type {
  ComparisonResult,
  CriterionDefinition,
  NormalizedActualValue,
} from "./types";

type JsonValue = CriterionEvaluationResult["actual"];

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

interface Decimal {
  readonly unscaled: bigint;
  readonly scale: number;
}

const parseDecimal = (value: string): Decimal | null => {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return {
    unscaled: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
};

const scaleDecimal = (value: Decimal, scale: number): bigint =>
  value.unscaled * BigInt(10) ** BigInt(scale - value.scale);

const scaledToString = (value: bigint, scale: number): string => {
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value)
    .toString()
    .padStart(scale + 1, "0");
  const rendered =
    scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${rendered}` : rendered;
};

const money = (
  value: JsonValue,
): { readonly amount: string; readonly currency: string } | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  return typeof item.amount === "string" && typeof item.currency === "string"
    ? { amount: item.amount, currency: item.currency }
    : null;
};

const explicitTolerance = (criterion: Criterion): number | null => {
  const tolerance = criterion.tolerance;
  if (typeof tolerance === "number" && tolerance >= 0) return tolerance;
  const moneyTolerance = money(tolerance);
  if (moneyTolerance) return Number(moneyTolerance.amount);
  if (
    typeof tolerance === "object" &&
    tolerance !== null &&
    !Array.isArray(tolerance)
  ) {
    const absolute = (tolerance as Record<string, unknown>).absolute;
    if (typeof absolute === "number" && absolute >= 0) return absolute;
  }
  return null;
};

const softFit = (
  differenceOutsideBoundary: number,
  targetMagnitude: number,
  criterion: Criterion,
): number => {
  if (differenceOutsideBoundary <= 0) return 1;
  const tolerance = explicitTolerance(criterion);
  const falloff =
    tolerance ??
    Math.max(
      Math.abs(targetMagnitude) *
        CRITERIA_SOFT_CURVE_CONFIG.linearBoundary.relativeFalloff,
      CRITERIA_SOFT_CURVE_CONFIG.linearBoundary.zeroTargetAbsoluteFalloff,
    );
  return falloff === 0 ? 0 : clamp(1 - differenceOutsideBoundary / falloff);
};

const booleanTarget = (
  criterion: Criterion,
  definition: CriterionDefinition,
): JsonValue => {
  if (
    definition.key === "first_floor" &&
    criterion.field === "physical.floor" &&
    criterion.target === 1
  ) {
    return criterion.operator === "neq" ? false : true;
  }
  if (criterion.operator === "boolean" && criterion.target === "connected") {
    return "connected";
  }
  return criterion.target;
};

const exactComparison = (
  criterion: Criterion,
  definition: CriterionDefinition,
  actual: JsonValue,
): ComparisonResult => {
  const target = booleanTarget(criterion, definition);
  let matched = false;
  if (
    definition.key === "first_floor" &&
    criterion.field === "physical.floor"
  ) {
    matched = actual === target;
    return {
      matched,
      fit: matched ? 1 : 0,
      margin: null,
      explanationCode: matched ? "EXACT_MATCH" : "EXACT_MISMATCH",
      explanationParams: { actual, target },
    };
  }
  switch (criterion.operator) {
    case "eq":
    case "boolean":
      matched = actual === target;
      break;
    case "neq":
      matched = actual !== target;
      break;
    case "exists":
      matched = actual !== null;
      break;
    case "absent":
      matched = actual === null || actual === false || actual === "absent";
      break;
    default:
      matched = actual === target;
  }
  return {
    matched,
    fit: matched ? 1 : 0,
    margin: null,
    explanationCode: matched ? "EXACT_MATCH" : "EXACT_MISMATCH",
    explanationParams: { actual, target },
  };
};

const setComparison = (
  criterion: Criterion,
  actual: JsonValue,
): ComparisonResult => {
  const targetValues = Array.isArray(criterion.target)
    ? criterion.target
    : [criterion.target];
  const contains = targetValues.some((target) => target === actual);
  const matched = ["not_in", "neq"].includes(criterion.operator)
    ? !contains
    : contains;
  return {
    matched,
    fit: matched ? 1 : 0,
    margin: null,
    explanationCode: matched ? "SET_MATCH" : "SET_MISMATCH",
    explanationParams: { actual, target_values: targetValues },
  };
};

const numberRange = (
  target: JsonValue,
): { readonly minimum: number; readonly maximum: number } | null => {
  if (
    Array.isArray(target) &&
    target.length === 2 &&
    typeof target[0] === "number" &&
    typeof target[1] === "number"
  ) {
    return { minimum: target[0], maximum: target[1] };
  }
  if (typeof target === "object" && target !== null && !Array.isArray(target)) {
    const record = target as Record<string, unknown>;
    if (
      typeof record.minimum === "number" &&
      typeof record.maximum === "number"
    ) {
      return { minimum: record.minimum, maximum: record.maximum };
    }
  }
  return null;
};

const numericComparison = (
  criterion: Criterion,
  actual: number,
): ComparisonResult => {
  const tolerance = explicitTolerance(criterion) ?? 0;
  if (criterion.operator === "between") {
    const range = numberRange(criterion.target)!;
    const lowerDifference = Math.max(0, range.minimum - actual - tolerance);
    const upperDifference = Math.max(0, actual - range.maximum - tolerance);
    const difference = Math.max(lowerDifference, upperDifference);
    const matched = difference === 0;
    return {
      matched,
      fit: matched
        ? 1
        : softFit(
            difference,
            Math.max(Math.abs(range.minimum), Math.abs(range.maximum)),
            criterion,
          ),
      margin: {
        from_minimum: actual - range.minimum,
        to_maximum: range.maximum - actual,
      },
      explanationCode: matched ? "RANGE_MATCH" : "RANGE_OUTSIDE",
      explanationParams: {
        actual,
        minimum: range.minimum,
        maximum: range.maximum,
      },
    };
  }
  const target = criterion.target as number;
  const isMinimum =
    criterion.operator === "gte" || criterion.operator === "after";
  const rawMargin = isMinimum ? actual - target : target - actual;
  const difference = Math.max(0, -rawMargin - tolerance);
  const matched = difference === 0;
  return {
    matched,
    fit: matched ? 1 : softFit(difference, target, criterion),
    margin: rawMargin,
    explanationCode: matched
      ? "NUMERIC_BOUNDARY_MATCH"
      : "NUMERIC_BOUNDARY_MISS",
    explanationParams: { actual, target, tolerance },
  };
};

const moneyComparison = (
  criterion: Criterion,
  actualValue: JsonValue,
): ComparisonResult => {
  const actual = money(actualValue)!;
  const target = money(criterion.target)!;
  const actualDecimal = parseDecimal(actual.amount)!;
  const targetDecimal = parseDecimal(target.amount)!;
  const toleranceMoney = money(criterion.tolerance);
  const toleranceDecimal = toleranceMoney
    ? parseDecimal(toleranceMoney.amount)
    : null;
  const scale = Math.max(
    actualDecimal.scale,
    targetDecimal.scale,
    toleranceDecimal?.scale ?? 0,
  );
  const actualScaled = scaleDecimal(actualDecimal, scale);
  const targetScaled = scaleDecimal(targetDecimal, scale);
  const rawMargin = targetScaled - actualScaled;
  const toleranceNumber = explicitTolerance(criterion) ?? 0;
  const toleranceScaled = toleranceDecimal
    ? scaleDecimal(toleranceDecimal, scale)
    : BigInt(Math.round(toleranceNumber * 10 ** scale));
  const matched = rawMargin + toleranceScaled >= BigInt(0);
  const difference = matched
    ? 0
    : Number(-rawMargin - toleranceScaled) / 10 ** scale;
  return {
    matched,
    fit: matched ? 1 : softFit(difference, Number(target.amount), criterion),
    margin: {
      amount: scaledToString(rawMargin, scale),
      currency: target.currency,
    },
    explanationCode: matched ? "MONEY_WITHIN_MAXIMUM" : "MONEY_OVER_MAXIMUM",
    explanationParams: {
      actual: actualValue,
      target: criterion.target,
      tolerance: criterion.tolerance,
    },
  };
};

const dateComparison = (
  criterion: Criterion,
  actual: string,
): ComparisonResult => {
  const actualTime = Date.parse(`${actual}T00:00:00.000Z`);
  const targetTime = Date.parse(`${criterion.target as string}T00:00:00.000Z`);
  const dayMs = 86_400_000;
  const marginDays = Math.round((targetTime - actualTime) / dayMs);
  const toleranceDays = explicitTolerance(criterion) ?? 0;
  const matched = marginDays + toleranceDays >= 0;
  return {
    matched,
    fit: matched
      ? 1
      : softFit(
          -marginDays - toleranceDays,
          Math.max(Math.abs(marginDays), 1),
          criterion,
        ),
    margin: { days_until_deadline: marginDays },
    explanationCode: matched ? "DATE_WITHIN_DEADLINE" : "DATE_AFTER_DEADLINE",
    explanationParams: {
      actual,
      target: criterion.target,
      tolerance_days: toleranceDays,
    },
  };
};

export const compareCriterion = (
  criterion: Criterion,
  definition: CriterionDefinition,
  actual: NormalizedActualValue,
): ComparisonResult => {
  if (definition.valueType === "money") {
    return moneyComparison(criterion, actual.value);
  }
  if (definition.valueType === "number") {
    const numericActual =
      definition.evaluatorType === "distance" && criterion.unit === "km"
        ? (actual.value as number) / 1000
        : (actual.value as number);
    return numericComparison(criterion, numericActual);
  }
  if (definition.valueType === "date") {
    return dateComparison(criterion, actual.value as string);
  }
  if (
    definition.evaluatorType === "set" ||
    ["in", "not_in", "one_of"].includes(criterion.operator)
  ) {
    return setComparison(criterion, actual.value);
  }
  return exactComparison(criterion, definition, actual.value);
};

export const validateTarget = (
  criterion: Criterion,
  definition: CriterionDefinition,
): string | null => {
  if (definition.valueType === "money") {
    const target = money(criterion.target);
    if (!target || !parseDecimal(target.amount))
      return "Expected a Money target";
    const tolerance = money(criterion.tolerance);
    if (tolerance && tolerance.currency !== target.currency) {
      return "Money target and tolerance currencies must match";
    }
    return null;
  }
  if (definition.valueType === "number") {
    if (criterion.operator === "between") {
      const range = numberRange(criterion.target);
      return range && range.minimum <= range.maximum
        ? null
        : "Expected an ordered numeric range";
    }
    return typeof criterion.target === "number"
      ? null
      : "Expected a numeric target";
  }
  if (definition.valueType === "date") {
    return isoDateSchema.safeParse(criterion.target).success
      ? null
      : "Expected an ISO date target";
  }
  if (["in", "not_in", "one_of"].includes(criterion.operator)) {
    return Array.isArray(criterion.target) && criterion.target.length > 0
      ? null
      : "Expected a non-empty target set";
  }
  return null;
};

export const moneyCurrenciesMatch = (
  criterion: Criterion,
  actual: NormalizedActualValue,
): boolean => {
  const actualMoney = money(actual.value);
  const targetMoney = money(criterion.target);
  return actualMoney !== null && targetMoney !== null
    ? actualMoney.currency === targetMoney.currency
    : true;
};
