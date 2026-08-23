import type {
  BuyerJourney,
  JourneyDataSnapshot,
  JourneyAuditEvent,
} from "../buyer-journey";
import type {
  ApplicationErrorRecord,
  JourneyDiagnosticReport,
  PilotTelemetryEvent,
} from "./contracts";

export const buildJourneyDiagnosticReport = (input: {
  readonly journey: BuyerJourney;
  readonly snapshot: JourneyDataSnapshot;
  readonly auditEvents?: readonly JourneyAuditEvent[];
  readonly telemetryEvents?: readonly PilotTelemetryEvent[];
  readonly errors?: readonly ApplicationErrorRecord[];
  readonly refreshTaskIds?: readonly string[];
  readonly collectionRunIds?: readonly string[];
  readonly openclawRequestIds?: readonly string[];
  readonly generatedAt: string;
}): JourneyDiagnosticReport => {
  const timeline = [
    ...(input.auditEvents ?? []).map((event) => ({
      event_id: event.event_id,
      event_name: event.event_type,
      occurred_at: event.occurred_at,
    })),
    ...(input.telemetryEvents ?? []).map((event) => ({
      event_id: event.event_id,
      event_name: event.event_name,
      occurred_at: event.occurred_at,
    })),
  ].sort(
    (left, right) =>
      left.occurred_at.localeCompare(right.occurred_at) ||
      left.event_id.localeCompare(right.event_id),
  );
  return {
    schema_version: "journey-diagnostic-v1",
    journey_id: input.journey.journey_id,
    session_id: input.journey.session_id,
    stage: input.journey.current_stage,
    timeline,
    active_request: {
      request_id: input.journey.confirmed_user_request_id,
      version: input.journey.confirmed_user_request_version,
    },
    matching: {
      bundle_id: input.snapshot.matching_bundle?.matching_bundle_id ?? null,
      algorithm_version:
        input.snapshot.matching_bundle?.matching_algorithm_version ?? null,
    },
    selected_property_ids: [
      ...new Set(
        [
          input.journey.selected_property_id,
          ...input.journey.comparison_property_ids,
        ].filter((value): value is string => value !== null),
      ),
    ],
    comparison_id: input.journey.comparison_id,
    expert_request_ids: [...input.journey.expert_request_ids],
    refresh_task_ids: [...(input.refreshTaskIds ?? [])],
    collection_run_ids: [...(input.collectionRunIds ?? [])],
    openclaw_request_ids: [...(input.openclawRequestIds ?? [])],
    error_ids: (input.errors ?? []).map((error) => error.error_id),
    decision_update_ids: input.snapshot.decision_update
      ? [input.snapshot.decision_update.update_id]
      : [],
    generated_at: input.generatedAt,
  };
};
