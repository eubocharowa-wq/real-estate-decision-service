import { describe, expect, it } from "vitest";

import {
  buildComparisonView,
  buildPilotComparisonInput,
  createComparisonSelection,
} from "../../src/comparison";
import {
  comparisonDataset,
  comparisonRequest,
  comparisonSelection,
  comparisonView,
  crossTypeComparisonView,
  uncertainComparisonView,
} from "./fixtures";

describe("TASK-011 pure comparison view model", () => {
  it.each(comparisonDataset.comparisonGroups)(
    "builds pilot comparison group $group_id without a universal winner",
    (group) => {
      const view = comparisonView(group.property_ids);
      expect(view.columns.map((column) => column.propertyId)).toEqual(
        group.property_ids,
      );
      expect(view.columns).toHaveLength(2);
      expect(view.sections[0]?.id).toBe("must");
      expect(view.conclusion.status).toMatch(
        /clear_leader|conditional_leader|near_tie|insufficient_data|no_valid_option/,
      );
    },
  );

  it("keeps a cheap price_from option uncertain rather than declaring its price exact", () => {
    const template = uncertainComparisonView.columns.find(
      (column) => column.propertyId === "prop_special_template_001",
    );
    expect(template?.price).toMatch(/^от |расходится|не указана/i);
    expect(template?.confidenceBand).toMatch(/low|critical/);
  });

  it("keeps Match Score and confidence as independent fields", () => {
    const highMatchLowConfidence = uncertainComparisonView.columns.find(
      (column) => column.propertyId === "prop_nb_001",
    );
    expect(highMatchLowConfidence?.matchScore).toBe(100);
    expect(highMatchLowConfidence?.confidenceBand).toBe("low");
  });

  it("keeps two close pilot finalists without forcing a clear leader", () => {
    const view = comparisonView(["prop_nb_001", "prop_nb_002"]);
    const scores = view.columns.map((column) => column.matchScore ?? 0);
    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThanOrEqual(5);
    expect(view.conclusion.status).not.toBe("clear_leader");
  });

  it("returns no_valid_option for two pilot hard-fail properties", () => {
    const view = comparisonView(["prop_nb_005", "prop_nb_006"]);
    expect(view.columns.every((column) => column.hardFail)).toBe(true);
    expect(view.conclusion.status).toBe("no_valid_option");
  });

  it("renders a financing difference from exact selected scenarios", () => {
    const view = comparisonView(
      ["prop_nb_002", "prop_nb_003"],
      "request_pilot_b",
    );
    const finance = view.sections.find((section) => section.id === "finance");
    const monthly = finance?.rows.find(
      (row) => row.id === "context:monthly-payment",
    );
    expect(monthly?.cells).toHaveLength(2);
    expect(
      new Set(monthly?.cells.map((cell) => cell.value)).size,
    ).toBeGreaterThan(1);
    expect(
      view.columns.every((column) => column.offerId && column.scenarioId),
    ).toBe(true);
  });

  it("uses explicit not_applicable cells for cross-type rows", () => {
    const typeSpecific = crossTypeComparisonView.sections.find(
      (section) => section.id === "type_specific",
    );
    const floor = typeSpecific?.rows.find((row) => row.id === "context:floor");
    const land = typeSpecific?.rows.find(
      (row) => row.id === "context:land-area",
    );
    expect(floor?.cells.some((cell) => cell.state === "not_applicable")).toBe(
      true,
    );
    expect(land?.cells.some((cell) => cell.state === "not_applicable")).toBe(
      true,
    );
    expect(
      floor?.cells.find((cell) => cell.state === "not_applicable")?.value,
    ).toMatch(/не относится/i);
  });

  it("preserves unavailable items as removable columns", () => {
    const request = comparisonRequest();
    const selection = comparisonSelection(["prop_nb_001", "prop_nb_002"]);
    const input = buildPilotComparisonInput({
      userRequest: request,
      selection,
    });
    const outcome = buildComparisonView({
      ...input,
      partial: true,
      items: [
        input.items[0]!,
        {
          status: "unavailable",
          selection: selection.items[1]!,
          message: "Объект больше недоступен.",
        },
      ],
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    expect(outcome.view.columns[1]).toMatchObject({
      status: "unavailable",
      errorMessage: "Объект больше недоступен.",
    });
  });

  it("blocks mixed UserRequest versions with the required stale message", () => {
    const request = comparisonRequest();
    const selection = {
      ...comparisonSelection(["prop_nb_001", "prop_nb_002"]),
      userRequestSchemaVersion: "2.0",
    };
    const outcome = buildComparisonView(
      buildPilotComparisonInput({ userRequest: request, selection }),
    );
    expect(outcome).toMatchObject({
      success: false,
      error: {
        code: "MIXED_USER_REQUEST",
        message: "Условия изменились — пересчитайте сравнение.",
      },
    });
  });

  it("requires 2–4 selected items", () => {
    const request = comparisonRequest();
    const selection = createComparisonSelection(request);
    expect(
      buildComparisonView(
        buildPilotComparisonInput({ userRequest: request, selection }),
      ),
    ).toMatchObject({
      success: false,
      error: { code: "INVALID_SELECTION_SIZE" },
    });
  });

  it("builds a contextual expert handoff without embedding full snapshots", () => {
    expect(uncertainComparisonView.actions.expertHref).toContain(
      "type=choice_assistance",
    );
    expect(uncertainComparisonView.actions.expertHref).toContain(
      "properties=prop_special_template_001%2Cprop_nb_001",
    );
    expect(uncertainComparisonView.actions.expertHref).not.toContain(
      "listing_price",
    );
  });
});
