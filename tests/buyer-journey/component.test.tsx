// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { JourneyDecisionUpdateView } from "../../src/buyer-journey/components";
import type { BuyerJourney, DecisionUpdate } from "../../src/buyer-journey";

const metric = (bundle: string, confidence: number) => ({
  property_id: "prop_fixture",
  match_result_id: "match_fixture",
  match_result_ref: `${bundle}:match_fixture`,
  match_score: 88,
  eligibility_status: "eligible_with_unknowns",
  data_quality_id: "quality_fixture",
  data_quality_ref: `${bundle}:quality_fixture`,
  data_confidence_score: confidence,
  data_completeness_score: 80,
  critical_unknowns: confidence < 70 ? ["family_mortgage"] : [],
});

afterEach(cleanup);

describe("updated decision UI", () => {
  it("shows real before/after values and keeps Match separate from confidence", () => {
    const journey = {
      journey_id: "journey_fixture",
      comparison_id: "comparison_fixture",
    } as BuyerJourney;
    const update: DecisionUpdate = {
      schema_version: "decision-update-v1",
      update_id: "update_fixture",
      journey_id: journey.journey_id,
      trigger_type: "expert_result",
      trigger_ref: "expert_result_fixture",
      affected_property_ids: ["prop_fixture"],
      previous_matching_bundle_id: "bundle_before",
      new_matching_bundle_id: "bundle_after",
      previous_results: [metric("bundle_before", 42)],
      new_results: [metric("bundle_after", 78)],
      resolved_unknowns: ["family_mortgage"],
      unresolved_unknowns: [],
      new_conflicts: [],
      resolved_conflicts: [],
      status: "completed",
      error_code: null,
      created_at: "2026-08-15T01:00:00.000Z",
    };
    render(<JourneyDecisionUpdateView journey={journey} update={update} />);
    expect(
      screen.getByRole("heading", { name: "Что изменилось после проверки" }),
    ).toBeTruthy();
    expect(screen.getByText(/88 → 88 \(без изменения\)/)).toBeTruthy();
    expect(screen.getByText(/42 → 78/)).toBeTruthy();
    expect(screen.getByText(/dataset_type=synthetic_pilot/)).toBeTruthy();
  });

  it("does not fabricate before/after when recompute was not required", () => {
    const journey = {
      journey_id: "journey_fixture",
      comparison_id: null,
    } as BuyerJourney;
    const update: DecisionUpdate = {
      schema_version: "decision-update-v1",
      update_id: "update_without_recompute",
      journey_id: journey.journey_id,
      trigger_type: "expert_result",
      trigger_ref: "expert_result_unable",
      affected_property_ids: ["prop_fixture"],
      previous_matching_bundle_id: "bundle_before",
      new_matching_bundle_id: null,
      previous_results: [metric("bundle_before", 42)],
      new_results: [],
      resolved_unknowns: [],
      unresolved_unknowns: [],
      new_conflicts: [],
      resolved_conflicts: [],
      status: "completed",
      error_code: null,
      created_at: "2026-08-15T01:00:00.000Z",
    };
    render(<JourneyDecisionUpdateView journey={journey} update={update} />);
    expect(
      screen.getByRole("heading", {
        name: "Фактического пересчёта не потребовалось",
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/88 → 88/)).toBeNull();
  });
});
