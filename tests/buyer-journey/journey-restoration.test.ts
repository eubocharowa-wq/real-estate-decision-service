import { afterAll, describe, expect, it } from "vitest";

import {
  BuyerJourneyApplication,
  type BuyerJourney,
} from "../../src/buyer-journey";
import {
  createComparisonSelection,
  addComparisonItem,
} from "../../src/comparison/selection";
import { createPostgresRepositories, migrateUp } from "../../src/persistence";
import {
  FixtureSourcePolicyResolver,
  UserUrlIngestionOrchestrator,
} from "../../src/user-url-ingestion";
import {
  createTestDatabase,
  dropTestDatabase,
  isDatabaseAvailable,
  type TestDatabase,
} from "../persistence/helpers";
import { confirmParsedJourney, GOLDEN_RAW_REQUEST } from "./helpers";

/**
 * Closing and reopening a tab.
 *
 * The browser keeps a session id and a journey id and nothing else, so this is
 * what a reopened tab actually does: a brand new application instance, holding
 * no memory of the first one, is asked for the journey by id. Everything the
 * screens need has to come back out of PostgreSQL.
 *
 * Skipped without DATABASE_URL: with the in-memory backend a second instance
 * genuinely has nothing to restore, which is the bug this closes.
 */
const SESSION_ID = "session_restoration";

let database: TestDatabase | undefined;

describe.skipIf(!isDatabaseAvailable)("journey restoration by id", () => {
  const openTab = (db: TestDatabase): BuyerJourneyApplication => {
    const repositories = createPostgresRepositories(db.pool);
    return new BuyerJourneyApplication({
      repository: repositories.repository,
      expertRepository: repositories.expertRepository,
      instrumentation: repositories.instrumentation,
      feedbackRepository: repositories.feedbackRepository,
      errorRepository: repositories.errorRepository,
    });
  };

  afterAll(async () => {
    await dropTestDatabase(database);
  });

  it("restores request, selection and candidates in a fresh application", async () => {
    database = await createTestDatabase("test_restoration");
    await migrateUp(database.pool);

    // First tab: describe, confirm, match, tick two objects, add a candidate.
    const first = openTab(database);
    const journey: BuyerJourney = await first.startBuyerJourney({
      sessionId: SESSION_ID,
      rawRequestText: GOLDEN_RAW_REQUEST,
    });
    const confirmation = await confirmParsedJourney(first, journey);
    await first.runJourneyMatching(journey.journey_id);

    const selection = addComparisonItem(
      addComparisonItem(
        createComparisonSelection(confirmation.confirmed_request),
        { propertyId: "prop_nb_002", offerId: null, scenarioId: null },
      ).state,
      { propertyId: "prop_nb_003", offerId: null, scenarioId: null },
    ).state;
    await first.saveComparisonSelection(journey.journey_id, selection);

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
    await first.addUserUrlCandidate(journey.journey_id, confirmed.candidate);

    // The tab closes. Nothing of the first instance survives but the two ids.
    const second = openTab(database);
    const restored = await second.getJourneyClientState(journey.journey_id);

    expect(restored.journey_id).toBe(journey.journey_id);
    expect(restored.session_id).toBe(SESSION_ID);
    expect(restored.owner_id).toBe(SESSION_ID);
    expect(restored.raw_request_text).toBe(GOLDEN_RAW_REQUEST);
    expect(restored.parsed_request?.raw_text).toBe(GOLDEN_RAW_REQUEST);
    expect(restored.confirmed_request?.user_request_id).toBe(
      confirmation.confirmed_request.user_request_id,
    );
    // First confirmation of this journey, so version 1.
    expect(restored.confirmed_request_version).toBe(1);
    expect(
      restored.comparison_selection?.items.map((item) => item.propertyId),
    ).toEqual(["prop_nb_002", "prop_nb_003"]);
    expect(restored.imported_candidates).toHaveLength(1);
    expect(restored.imported_candidates[0]?.canonicalUrl).toBe(
      confirmed.candidate.canonicalUrl,
    );

    // The shortlist itself is rebuilt from the same stored bundle.
    const shortlist = await second.getShortlist(journey.journey_id);
    expect(shortlist.cards.length).toBeGreaterThan(0);
  });

  it("refuses a selection that belongs to another request version", async () => {
    const tab = openTab(database!);
    const journey = await tab.startBuyerJourney({
      sessionId: SESSION_ID,
      rawRequestText: GOLDEN_RAW_REQUEST,
    });
    const confirmation = await confirmParsedJourney(tab, journey);
    const stale = createComparisonSelection({
      user_request_id: confirmation.confirmed_request.user_request_id,
      schema_version: "9.9" as "1.0",
    });

    await expect(
      tab.saveComparisonSelection(journey.journey_id, stale),
    ).rejects.toThrow(/STALE_REQUEST_VERSION|another request version/);

    // The refusal leaves the stored journey untouched.
    const state = await tab.getJourneyClientState(journey.journey_id);
    expect(state.comparison_selection).toBeNull();
  });
});
