import { describe, expect, it } from "vitest";

import { buildComparisonConclusion } from "../../src/comparison";
import type {
  ComparisonCellView,
  ComparisonColumnView,
  ComparisonRowView,
  DecisionDriverView,
} from "../../src/comparison";

const column = (
  propertyId: string,
  matchScore: number,
  overrides: Partial<ComparisonColumnView> = {},
): ComparisonColumnView => ({
  status: "ready",
  propertyId,
  offerId: `offer_${propertyId}`,
  scenarioId: `scenario_${propertyId}`,
  title: propertyId,
  propertyType: "Квартира",
  price: "10 000 000 ₽",
  availability: "В продаже",
  availabilityWarning: null,
  matchScore,
  matchLabel: `${matchScore}% Match`,
  confidence: "90%",
  confidenceBand: "high",
  scenarioLabel: "Сценарий",
  scenarioVerification: "Подтверждено",
  hardFail: false,
  criticalUnknownCount: 0,
  criticalConflictCount: 0,
  detailHref: `/property/${propertyId}`,
  errorMessage: null,
  ...overrides,
});

const cell = (
  propertyId: string,
  state: ComparisonCellView["state"] = "neutral",
): ComparisonCellView => ({
  propertyId,
  value: "Да",
  status: state === "critical_unknown" ? "unknown" : "matched",
  statusLabel: "Соответствует",
  verificationLabel:
    state === "critical_unknown" ? "Нет данных" : "Подтверждено",
  freshnessLabel: "Актуальные данные",
  state,
  detail: null,
  comparableValue: true,
  fit: state === "critical_unknown" ? null : 1,
});

const row = (
  states: readonly ComparisonCellView["state"][] = ["neutral", "neutral"],
): ComparisonRowView => ({
  id: "criterion:must",
  label: "Обязательное условие",
  target: "да",
  importance: "must",
  importanceLabel: "Обязательно",
  userCriterion: true,
  dynamic: false,
  cells: states.map((state, index) => cell(`p${index + 1}`, state)),
});

const driver: DecisionDriverView = {
  id: "driver:must",
  rowId: "criterion:must",
  label: "Обязательное условие",
  importance: "high",
  description: "p1 сильнее по подтверждённому условию.",
  leadingPropertyIds: ["p1"],
  affectedPropertyIds: [],
  spread: null,
  unresolved: false,
};

describe("TASK-011 deterministic comparison conclusion", () => {
  it("returns clear_leader only with a material confirmed lead", () => {
    expect(
      buildComparisonConclusion({
        columns: [column("p1", 95), column("p2", 70)],
        rows: [row()],
        decisionDrivers: [driver],
      }).status,
    ).toBe("clear_leader");
  });

  it("returns conditional_leader when the score lead depends on weak data", () => {
    expect(
      buildComparisonConclusion({
        columns: [
          column("p1", 95, { confidenceBand: "low", criticalUnknownCount: 1 }),
          column("p2", 70),
        ],
        rows: [row()],
        decisionDrivers: [driver],
      }).status,
    ).toBe("conditional_leader");
  });

  it("returns near_tie for close finalists", () => {
    expect(
      buildComparisonConclusion({
        columns: [column("p1", 91), column("p2", 88)],
        rows: [row()],
        decisionDrivers: [driver],
      }).status,
    ).toBe("near_tie");
  });

  it("returns insufficient_data for a critical unknown hard criterion", () => {
    expect(
      buildComparisonConclusion({
        columns: [column("p1", 91), column("p2", 88)],
        rows: [row(["critical_unknown", "neutral"])],
        decisionDrivers: [
          { ...driver, unresolved: true, affectedPropertyIds: ["p1"] },
        ],
      }).status,
    ).toBe("insufficient_data");
  });

  it("returns no_valid_option instead of ranking two hard failures", () => {
    expect(
      buildComparisonConclusion({
        columns: [
          column("p1", 20, { hardFail: true }),
          column("p2", 10, { hardFail: true }),
        ],
        rows: [row()],
        decisionDrivers: [],
      }).status,
    ).toBe("no_valid_option");
  });
});
