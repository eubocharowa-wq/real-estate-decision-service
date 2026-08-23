import { describe, expect, it } from "vitest";

import {
  buildComparisonView,
  buildPilotComparisonInput,
  createComparisonSelection,
  addComparisonItem,
} from "../../src/comparison";
import { loadPilotDataset } from "../../src/pilot-dataset";
import { UserUrlIngestionOrchestrator } from "../../src/user-url-ingestion";

describe("user URL candidate comparison integration", () => {
  it("uses existing matching and data quality paths without combining their scores", async () => {
    const dataset = loadPilotDataset();
    const request = dataset.userRequests.find(
      (item) => item.user_request_id === "request_pilot_c",
    );
    if (!request) throw new Error("request fixture missing");
    const service = new UserUrlIngestionOrchestrator({
      now: () => new Date("2026-08-17T08:00:00.000Z"),
    });
    const preview = await service.preview(
      "https://fixture.example/listing/apartment",
    );
    const outcome = service.confirm(preview, preview.editableFields);
    if (!outcome.success) throw new Error(outcome.error.message);
    let selection = createComparisonSelection(request);
    for (const item of [
      {
        propertyId: "prop_house_001",
        offerId: "offer_house_001_primary",
        scenarioId: "scenario_house_001_mortgage",
      },
      {
        propertyId: outcome.candidate.propertyCandidate.identity.property_id,
        offerId: outcome.candidate.offerCandidate.offer_id,
        scenarioId: null,
      },
    ]) {
      const added = addComparisonItem(selection, item);
      if (!added.success) throw new Error(added.message);
      selection = added.state;
    }
    const input = buildPilotComparisonInput({
      userRequest: request,
      selection,
      importedCandidates: [outcome.candidate],
    });
    const imported = input.items.find((item) =>
      item.selection.propertyId.startsWith("candidate_property_"),
    );
    expect(imported?.status).toBe("ready");
    if (imported?.status === "ready") {
      expect(imported.detail.matching?.match_result.match_score).toEqual(
        expect.any(Number),
      );
      expect(
        imported.detail.dataQuality?.data_quality.data_confidence_score,
      ).toEqual(expect.any(Number));
      expect(imported.detail.matching?.match_result.match_score).toBe(
        imported.detail.dataQuality?.match_result.match_score,
      );
    }
    expect(buildComparisonView(input).success).toBe(true);
  });
});
