import { describe, expect, it } from "vitest";

import {
  addComparisonItem,
  comparisonSelectionMatchesRequest,
  createComparisonSelection,
  parseComparisonSelection,
  removeComparisonItem,
} from "../../src/comparison";
import { comparisonRequest } from "./fixtures";

const item = (propertyId: string) => ({
  propertyId,
  offerId: `offer_${propertyId}`,
  scenarioId: `scenario_${propertyId}`,
});

describe("TASK-011 comparison selection", () => {
  it("stores only stable entity identifiers and request version", () => {
    const state = createComparisonSelection(comparisonRequest());
    const outcome = addComparisonItem(state, item("property_1"));
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    expect(Object.keys(outcome.state.items[0]!)).toEqual([
      "propertyId",
      "offerId",
      "scenarioId",
    ]);
    expect(outcome.state.userRequestSchemaVersion).toBe("1.0");
  });

  it("rejects another Offer of the same Property", () => {
    const first = addComparisonItem(
      createComparisonSelection(comparisonRequest()),
      item("property_1"),
    );
    if (!first.success) throw new Error(first.message);
    const duplicate = addComparisonItem(first.state, {
      ...item("property_1"),
      offerId: "another_offer",
    });
    expect(duplicate).toMatchObject({
      success: false,
      code: "DUPLICATE_PROPERTY",
    });
  });

  it("rejects a fifth Property without dropping the existing four", () => {
    let state = createComparisonSelection(comparisonRequest());
    for (const propertyId of ["p1", "p2", "p3", "p4"]) {
      const outcome = addComparisonItem(state, item(propertyId));
      if (!outcome.success) throw new Error(outcome.message);
      state = outcome.state;
    }
    const fifth = addComparisonItem(state, item("p5"));
    expect(fifth).toMatchObject({ success: false, code: "LIMIT_REACHED" });
    expect(fifth.state.items).toHaveLength(4);
  });

  it("removes one item and reports a missing remove target", () => {
    const first = addComparisonItem(
      createComparisonSelection(comparisonRequest()),
      item("property_1"),
    );
    if (!first.success) throw new Error(first.message);
    const removed = removeComparisonItem(first.state, "property_1");
    expect(removed.success && removed.state.items).toEqual([]);
    expect(removeComparisonItem(first.state, "missing")).toMatchObject({
      success: false,
      code: "ITEM_NOT_SELECTED",
    });
  });

  it("rejects malformed persisted state and detects another request version", () => {
    expect(parseComparisonSelection("{bad json")).toBeNull();
    const state = createComparisonSelection(comparisonRequest());
    expect(
      comparisonSelectionMatchesRequest(state, {
        user_request_id: state.userRequestId,
        schema_version: "2.0" as "1.0",
      }),
    ).toBe(false);
  });
});
