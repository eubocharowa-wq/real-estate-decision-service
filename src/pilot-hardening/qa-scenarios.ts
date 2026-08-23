export interface PilotQaScenario {
  readonly scenario_id: string;
  readonly title: string;
  readonly fixture_mode: "synthetic" | "manual" | "policy_gate";
  readonly expected_invariants: readonly string[];
}

export const PILOT_QA_SCENARIOS_V1: readonly PilotQaScenario[] = Object.freeze([
  {
    scenario_id: "pilot_clear_apartment",
    title: "Clear apartment decision",
    fixture_mode: "synthetic",
    expected_invariants: [
      "eligible candidate can enter shortlist",
      "Match Score remains separate from Data Confidence",
    ],
  },
  {
    scenario_id: "pilot_no_results_hard_constraints",
    title: "No results under confirmed hard constraints",
    fixture_mode: "synthetic",
    expected_invariants: [
      "confirmed hard fail is excluded",
      "empty result is qualified by CoverageSummary",
    ],
  },
  {
    scenario_id: "pilot_apartment_vs_house",
    title: "Apartment and house comparison",
    fixture_mode: "synthetic",
    expected_invariants: [
      "cross-type fields may be not_applicable",
      "no universal type preference",
    ],
  },
  {
    scenario_id: "pilot_claimed_financing",
    title: "Claimed financing",
    fixture_mode: "synthetic",
    expected_invariants: [
      "claimed is not confirmed",
      "bank approval is not inferred",
    ],
  },
  {
    scenario_id: "pilot_conflicting_price",
    title: "Conflicting price evidence",
    fixture_mode: "synthetic",
    expected_invariants: ["conflict remains visible", "no silent price winner"],
  },
  {
    scenario_id: "pilot_stale_availability",
    title: "Stale availability",
    fixture_mode: "synthetic",
    expected_invariants: [
      "stale remains stale",
      "removed is not inferred as sold",
    ],
  },
  {
    scenario_id: "pilot_restricted_url_manual_fallback",
    title: "Restricted user URL and manual fallback",
    fixture_mode: "manual",
    expected_invariants: [
      "automatic ingestion stays blocked",
      "manual facts remain unconfirmed",
    ],
  },
  {
    scenario_id: "pilot_expert_updates_decision",
    title: "Expert evidence updates affected decision",
    fixture_mode: "manual",
    expected_invariants: [
      "expert result enters evidence layer",
      "only affected candidates recompute",
    ],
  },
  {
    scenario_id: "pilot_openclaw_denied",
    title: "OpenClaw policy/readiness denial",
    fixture_mode: "policy_gate",
    expected_invariants: [
      "executor is not invoked",
      "controlled blocker is recorded",
    ],
  },
]);
