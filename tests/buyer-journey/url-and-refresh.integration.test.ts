import { describe, expect, it } from "vitest";

import {
  FixtureSourcePolicyResolver,
  UserUrlIngestionOrchestrator,
} from "../../src/user-url-ingestion";
import type { RefreshResult } from "../../src/data-collection/refresh";
import { createGoldenJourney } from "./helpers";

describe("buyer journey URL and refresh boundaries", () => {
  it("adds an offline user URL candidate through the same matching pipeline", async () => {
    const { application, journey, matching } = await createGoldenJourney();
    application.createJourneyComparison(journey.journey_id, [
      "prop_nb_002",
      "prop_nb_003",
    ]);
    const ingestion = new UserUrlIngestionOrchestrator({
      policyResolver: new FixtureSourcePolicyResolver({
        environment: "test",
        now: () => new Date("2026-08-15T00:00:00.000Z"),
      }),
      now: () => new Date("2026-08-15T00:00:00.000Z"),
    });
    const preview = await ingestion.preview(
      "https://fixture.example/listing/apartment",
    );
    const confirmed = ingestion.confirm(preview, preview.editableFields);
    if (!confirmed.success) throw new Error(confirmed.error.message);
    const result = application.addUserUrlCandidate(
      journey.journey_id,
      confirmed.candidate,
    );
    const imported = result.bundle.entries.find(
      (entry) => entry.origin === "user_supplied",
    );
    expect(imported).toBeDefined();
    expect(result.bundle.dataset_snapshot.dataset_type).toBe("mixed_explicit");
    expect(imported!.match.match_result.algorithm_version).toBe(
      matching.bundle.matching_algorithm_version,
    );
    expect(result.update.trigger_type).toBe("user_url_ingestion");
    expect(result.update.affected_property_ids).toEqual([
      confirmed.candidate.propertyCandidate.identity.property_id,
    ]);
    const comparison = application.createJourneyComparison(journey.journey_id, [
      "prop_nb_002",
      "prop_nb_003",
      confirmed.candidate.propertyCandidate.identity.property_id,
    ]);
    expect(comparison.state.items).toHaveLength(3);
    expect(comparison.view.columns).toHaveLength(3);
  });

  it("keeps src_dev_02 live refresh policy-blocked without breaking the journey", async () => {
    const { application, journey } = await createGoldenJourney();
    const outcome = application.requestJourneyRefresh({
      journeyId: journey.journey_id,
      propertyId: "prop_nb_002",
      offerId: "offer_nb_002_primary",
      targetUrl: "https://vneshstroi.ru/kvartiry/12345/",
      fieldPaths: ["listing_price"],
      environment: "test",
    });
    expect(outcome).toMatchObject({
      status: "blocked",
      error_code: "SOURCE_POLICY_BLOCKED",
    });
    expect(outcome.audit.policyAllowedAtEnqueue).toBe(false);
    expect(outcome.audit.preferredMethodAtEnqueue).toBeNull();
    expect(application.getShortlist(journey.journey_id).cards.length).toBe(5);
  });

  it("applies a successful fixture RefreshResult to affected entities only", async () => {
    const { application, journey, matching } = await createGoldenJourney();
    const result: RefreshResult = {
      schema_version: "1.0",
      refresh_task_id: "refresh_fixture_success",
      collection_run_id: "refresh_run_fixture_success",
      idempotency_key: "refresh_fixture_success_key",
      source_id: "fixture_refresh",
      status: "succeeded",
      selected_method: "fixture_mock",
      adapter_version: "fixture-refresh-v1",
      policy_version: "fixture-policy-v1",
      source_registry_version: "fixture-registry-v1",
      started_at: "2026-08-15T00:00:00.000Z",
      completed_at: "2026-08-15T00:00:00.000Z",
      changed_fields: [],
      unchanged_fields: ["listing_price"],
      missing_fields: [],
      new_conflict_ids: [],
      resolved_conflict_ids: [],
      evidence_ids: [],
      source_health_effect: "success",
      affected_entities: {
        affected_property_ids: ["prop_nb_002"],
        affected_offer_ids: ["offer_nb_002_primary"],
        affected_scenario_ids: [],
        affected_user_request_ids: [matching.bundle.user_request_id],
      },
      recompute: {
        data_confidence_entity_ids: ["prop_nb_002"],
        data_completeness_entity_ids: ["prop_nb_002"],
        match_result_pairs: [
          {
            user_request_id: matching.bundle.user_request_id,
            property_id: "prop_nb_002",
          },
        ],
      },
      error_code: null,
      retry: null,
    };
    const applied = application.applyRefreshResultToJourney(
      journey.journey_id,
      result,
    );
    expect(applied?.update).toMatchObject({
      trigger_type: "refresh_result",
      affected_property_ids: ["prop_nb_002"],
    });
    expect(applied?.update.previous_results[0]?.match_score).toBe(
      applied?.update.new_results[0]?.match_score,
    );
    expect(applied?.bundle.entries).toHaveLength(
      matching.bundle.entries.length,
    );
  });
});
