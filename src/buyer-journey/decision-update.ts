import {
  DECISION_UPDATE_SCHEMA_VERSION,
  type DecisionMetricSnapshot,
  type DecisionUpdate,
  type DecisionUpdateTrigger,
  type MatchingBundle,
} from "./contracts";
import type { BuyerJourneyIdFactory } from "./id";

export const snapshotBundle = (
  bundle: MatchingBundle | null,
  affectedPropertyIds?: readonly string[] | null,
): readonly DecisionMetricSnapshot[] => {
  const affected = affectedPropertyIds ? new Set(affectedPropertyIds) : null;
  return (bundle?.entries ?? [])
    .filter((entry) => !affected || affected.has(entry.property_id))
    .map((entry) => ({
      property_id: entry.property_id,
      match_result_id: entry.match.match_result.match_result_id,
      match_result_ref: `${bundle!.matching_bundle_id}:${entry.match.match_result.match_result_id}`,
      match_score: entry.match.match_result.match_score,
      eligibility_status: entry.match.match_result.eligibility_status,
      data_quality_id: entry.data_quality?.data_quality.data_quality_id ?? null,
      data_quality_ref: entry.data_quality
        ? `${bundle!.matching_bundle_id}:${entry.data_quality.data_quality.data_quality_id}`
        : null,
      data_confidence_score:
        entry.data_quality?.data_quality.data_confidence_score ?? null,
      data_completeness_score:
        entry.data_quality?.data_quality.data_completeness_score ?? null,
      critical_unknowns: [...entry.match.match_result.unknown_critical],
    }));
};

export const buildDecisionUpdate = (input: {
  readonly journeyId: string;
  readonly triggerType: DecisionUpdateTrigger;
  readonly triggerRef: string;
  readonly previousBundle: MatchingBundle | null;
  readonly nextBundle: MatchingBundle | null;
  readonly affectedPropertyIds: readonly string[];
  readonly newConflicts?: readonly string[];
  readonly resolvedConflicts?: readonly string[];
  readonly status?: DecisionUpdate["status"];
  readonly errorCode?: DecisionUpdate["error_code"];
  readonly now: string;
  readonly createId: BuyerJourneyIdFactory;
}): DecisionUpdate => {
  const previous = snapshotBundle(
    input.previousBundle,
    input.affectedPropertyIds,
  );
  const next = snapshotBundle(input.nextBundle, input.affectedPropertyIds);
  const previousUnknowns = new Set(
    previous.flatMap((item) => item.critical_unknowns),
  );
  const nextUnknowns = new Set(next.flatMap((item) => item.critical_unknowns));
  return {
    schema_version: DECISION_UPDATE_SCHEMA_VERSION,
    update_id: input.createId("decision_update"),
    journey_id: input.journeyId,
    trigger_type: input.triggerType,
    trigger_ref: input.triggerRef,
    affected_property_ids: [...new Set(input.affectedPropertyIds)].sort(),
    previous_matching_bundle_id:
      input.previousBundle?.matching_bundle_id ?? null,
    new_matching_bundle_id: input.nextBundle?.matching_bundle_id ?? null,
    previous_results: previous,
    new_results: next,
    resolved_unknowns: [...previousUnknowns]
      .filter((unknown) => !nextUnknowns.has(unknown))
      .sort(),
    unresolved_unknowns: [...nextUnknowns].sort(),
    new_conflicts: [...(input.newConflicts ?? [])],
    resolved_conflicts: [...(input.resolvedConflicts ?? [])],
    status: input.status ?? "completed",
    error_code: input.errorCode ?? null,
    created_at: input.now,
  };
};
