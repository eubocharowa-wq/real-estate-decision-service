import { describe, expect, it } from "vitest";

import {
  BuyerJourneyApplication,
  JOURNEY_ERROR_CODES,
  JOURNEY_ERROR_PRESENTATION,
} from "../../src/buyer-journey";
import { loadPilotDataset } from "../../src/pilot-dataset";
import {
  InMemoryApplicationErrorRepository,
  InMemoryFeedbackRepository,
  InMemoryPilotTelemetry,
  JourneyFeedbackService,
  PILOT_TELEMETRY_EVENTS,
  aggregateApplicationErrors,
  buildCoverageSummary,
  buildJourneyDiagnosticReport,
  buildPilotFeedbackReviewReport,
  createApplicationError,
  createPilotRuntimeConfig,
  evaluateAllPilotSources,
  evaluatePilotReleaseGate,
} from "../../src/pilot-hardening";
import { createGoldenJourney } from "../buyer-journey/helpers";

const now = "2026-08-24T12:00:00.000Z";

describe("pilot telemetry and feedback", async () => {
  it("defines every required vendor-neutral event and strips sensitive metadata", () => {
    expect(PILOT_TELEMETRY_EVENTS).toEqual(
      expect.arrayContaining([
        "buyer_journey_started",
        "request_submitted",
        "request_parsed",
        "request_confirmation_viewed",
        "request_confirmed",
        "request_edited",
        "matching_started",
        "matching_completed",
        "shortlist_viewed",
        "property_opened",
        "comparison_created",
        "comparison_item_added",
        "comparison_viewed",
        "user_url_ingestion_started",
        "user_url_ingestion_completed",
        "expert_request_created",
        "expert_result_viewed",
        "decision_recomputed",
        "journey_feedback_submitted",
      ]),
    );
    const telemetry = new InMemoryPilotTelemetry(
      createPilotRuntimeConfig({ mode: "pilot" }),
    );
    const event = telemetry.record({
      eventName: "request_submitted",
      journeyId: "journey_safe",
      sessionId: "session_safe",
      stage: "request_entry",
      occurredAt: now,
      metadata: {
        raw_request_text: "sensitive",
        email: "person@example.test",
        private_url: "https://private.example/path",
        request_version: 2,
      },
    });
    expect(event.metadata).toEqual({ request_version: 2 });
  });

  it("stores optional feedback comments separately from generic telemetry", async () => {
    const telemetry = new InMemoryPilotTelemetry(
      createPilotRuntimeConfig({ mode: "demo" }),
    );
    const repository = new InMemoryFeedbackRepository();
    const service = new JourneyFeedbackService(
      repository,
      telemetry,
      () => now,
    );
    const feedback = await service.submit({
      journeyId: "journey_feedback",
      sessionId: "session_feedback",
      journeyStage: "shortlist",
      stage: "shortlist",
      questionCode: "pilot_shortlist_helpfulness_v1",
      answer: "partly",
      optionalComment: "Potentially sensitive free text",
    });
    expect(
      (await repository.list("journey_feedback"))[0]?.optional_comment,
    ).toBe("Potentially sensitive free text");
    const metadata = telemetry.list("journey_feedback")[0]?.metadata;
    expect(metadata).toMatchObject({ answer: "partly", has_comment: true });
    expect(JSON.stringify(metadata)).not.toContain("Potentially sensitive");
    expect(feedback.feedback_id).toBeTruthy();

    const report = buildPilotFeedbackReviewReport({
      events: telemetry.list("journey_feedback"),
      feedback: await repository.list("journey_feedback"),
      errors: [],
      unknownFields: ["availability", "availability", "listing_price"],
      sourceGaps: ["pilot_source", "pilot_source"],
      generatedAt: now,
    });
    expect(report.feedback_by_stage.shortlist).toBe(1);
    expect(report.common_unknowns[0]).toEqual({
      field: "availability",
      count: 2,
    });
    expect(JSON.stringify(report)).not.toContain("Potentially sensitive");
  });

  it("records core Buyer Journey telemetry without raw request text", async () => {
    const { application, journey } = await createGoldenJourney();
    await application.getShortlist(journey.journey_id);
    const events = application.pilotTelemetry.list(journey.journey_id);
    expect(events.map((event) => event.event_name)).toEqual(
      expect.arrayContaining([
        "buyer_journey_started",
        "request_submitted",
        "request_parsed",
        "request_confirmation_viewed",
        "request_confirmed",
        "matching_started",
        "matching_completed",
        "shortlist_viewed",
      ]),
    );
    expect(JSON.stringify(events)).not.toContain(
      "Семейная ипотека обязательна",
    );
    expect(
      application.performanceRecorder.list().map((item) => item.operation),
    ).toEqual(
      expect.arrayContaining(["parser", "matching", "confidence", "shortlist"]),
    );
  });
});

describe("diagnostics, coverage and release gate", async () => {
  it("gives every recoverable journey error a user action", () => {
    for (const code of JOURNEY_ERROR_CODES) {
      const presentation = JOURNEY_ERROR_PRESENTATION[code];
      expect(presentation.message).toBeTruthy();
      expect(presentation.action_label).toBeTruthy();
      expect(presentation.action_href).toMatch(/^\//u);
    }
  });

  it("aggregates structured errors without exposing a raw stack", async () => {
    const repository = new InMemoryApplicationErrorRepository();
    const first = createApplicationError({
      errorCode: "SOURCE_POLICY_BLOCKED",
      layer: "source_policy",
      journeyId: "journey_error",
      stage: "matching",
      recoverable: true,
      userVisible: true,
      occurredAt: now,
      contextIds: { source_id: "src_dev_02" },
      appVersion: "test",
    });
    await repository.record(first.record);
    await repository.markRecovered(first.record.error_id, now);
    const diagnostics = aggregateApplicationErrors(await repository.list());
    expect(diagnostics.source_policy_blocks).toBe(1);
    expect(diagnostics.recovery_success_count).toBe(1);
    expect(first.record).not.toHaveProperty("stack");
  });

  it("distinguishes no eligible objects from insufficient coverage", () => {
    const dataset = loadPilotDataset();
    const insufficient = buildCoverageSummary({
      properties: [],
      eligiblePropertyIds: [],
      sourceReadiness: evaluateAllPilotSources(),
      expectedGeography: ["Тестовая область"],
      expectedPropertyTypes: ["apartment"],
      generatedAt: now,
    });
    expect(insufficient.empty_result_kind).toBe("insufficient_data_coverage");
    expect(insufficient.user_message).not.toContain("на рынке нет");

    const available = buildCoverageSummary({
      properties: dataset.properties,
      eligiblePropertyIds: [],
      sourceReadiness: [
        {
          source_id: "manual_curated_ready",
          ready: true,
          blockers: [],
          warnings: ["REFRESH_INTENTIONALLY_MANUAL"],
          approved_operations: ["manual_import", "display"],
          approved_environment: "pilot",
          policy_version: "test",
        },
      ],
      generatedAt: now,
    });
    expect(available.empty_result_kind).toBe("no_eligible_in_available_data");
    expect(available.user_message).toContain("По подключённым источникам");
  });

  it("builds a safe per-journey diagnostic report", async () => {
    const application = new BuyerJourneyApplication({ clock: () => now });
    const journey = await application.startBuyerJourney({
      sessionId: "session_diagnostic",
      rawRequestText: "sensitive request that must not enter diagnostics",
    });
    const report = buildJourneyDiagnosticReport({
      journey,
      snapshot: await application.getJourneySnapshot(journey.journey_id),
      auditEvents: await application.instrumentation.list(journey.journey_id),
      telemetryEvents: application.pilotTelemetry.list(journey.journey_id),
      refreshTaskIds: ["refresh_task_1"],
      collectionRunIds: ["collection_run_1"],
      openclawRequestIds: ["openclaw_request_1"],
      generatedAt: now,
    });
    expect(report).toMatchObject({
      journey_id: journey.journey_id,
      refresh_task_ids: ["refresh_task_1"],
      collection_run_ids: ["collection_run_1"],
      openclaw_request_ids: ["openclaw_request_1"],
    });
    expect(JSON.stringify(report)).not.toContain("sensitive request");
  });

  it("fails the machine-readable release gate closed", () => {
    const gate = evaluatePilotReleaseGate({
      evidence: {
        buildPassed: true,
        coreRegressionsPassed: true,
        secretsScanPassed: true,
        provenanceValidationPassed: true,
        hardCriteriaPassed: true,
        matchConfidenceSeparationPassed: true,
        expertEvidenceBoundaryPassed: true,
        urlFetchSafetyPassed: true,
        openclawPolicyGatePassed: true,
        sourceReadiness: evaluateAllPilotSources(),
        realPilotDatasetManifest: {
          schema_version: "real-pilot-dataset-manifest-v1",
          manifest_id: "empty_real_pilot_manifest",
          dataset_version: "test-empty-v1",
          environment: "pilot",
          created_at: now,
          candidates: [],
          manual_selection_sources: [],
        },
        lowCoverage: true,
        expertSlaDefined: false,
        comparisonSampleSufficient: false,
        refreshFixtureBacked: true,
        openclawLiveEnabled: false,
      },
      evaluatedAt: now,
      appVersion: "test",
    });
    expect(gate.ready).toBe(false);
    expect(gate.blockers).toContain("REAL_PILOT_DATASET_NOT_CONFIGURED");
    expect(gate.warnings).toContain(
      "OPENCLAW_LIVE_DISABLED_PENDING_SOURCE_APPROVAL",
    );
  });
});
