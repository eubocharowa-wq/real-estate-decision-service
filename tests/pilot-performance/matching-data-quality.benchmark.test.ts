import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { calculateDataQuality, matchProperty } from "../../src/matching";
import { loadPilotDataset } from "../../src/pilot-dataset";
import { createGoldenJourney } from "../buyer-journey/helpers";

const percentile = (values: readonly number[], ratio: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0
  );
};

describe("TASK-019 reproducible pilot performance benchmark", () => {
  it("measures matching/DataQuality and the instrumented golden journey", async () => {
    const dataset = loadPilotDataset();
    const request = dataset.userRequests[0]!;
    const candidateCount = 75;
    const matchingDurations: number[] = [];
    const confidenceDurations: number[] = [];
    let evaluated = 0;
    const benchmarkStarted = performance.now();

    for (let index = 0; index < candidateCount; index += 1) {
      const property = dataset.properties[index % dataset.properties.length]!;
      const propertyId = property.identity.property_id;
      const offers = dataset.offers.filter(
        (offer) => offer.property_id === propertyId,
      );
      const scenarios = dataset.purchaseScenarios.filter(
        (scenario) => scenario.property_id === propertyId,
      );
      const matchingStarted = performance.now();
      const matching = matchProperty({
        userRequest: request,
        property,
        offers,
        purchaseScenarios: scenarios,
        financingEligibility: dataset.propertyFinancingEligibility.filter(
          (eligibility) => eligibility.property_id === propertyId,
        ),
        financingPrograms: dataset.financingPrograms,
        fieldEvidence: dataset.fieldEvidence,
        sourceConflicts: dataset.sourceConflicts,
        currentTime: "2026-08-15T00:00:00.000Z",
      });
      matchingDurations.push(performance.now() - matchingStarted);
      expect(matching.success).toBe(true);
      if (!matching.success) continue;

      const selectedOffer =
        offers.find(
          (offer) => offer.offer_id === matching.result.selected_offer_id,
        ) ?? null;
      const selectedScenario =
        scenarios.find(
          (scenario) =>
            scenario.scenario_id ===
            matching.result.match_result.purchase_scenario_id,
        ) ?? null;
      const confidenceStarted = performance.now();
      const quality = calculateDataQuality({
        userRequest: request,
        matchResult: matching.result.match_result,
        fieldEvidence: dataset.fieldEvidence,
        sourceConflicts: dataset.sourceConflicts,
        sources: dataset.sources,
        selectedOffer,
        selectedPurchaseScenario: selectedScenario,
        selectedPromotion:
          dataset.promotions.find(
            (promotion) =>
              promotion.promotion_id === selectedScenario?.promotion_id,
          ) ?? null,
        currentTime: "2026-08-15T00:00:00.000Z",
      });
      confidenceDurations.push(performance.now() - confidenceStarted);
      expect(quality.success).toBe(true);
      evaluated += 1;
    }

    const totalMs = performance.now() - benchmarkStarted;
    const report = {
      schema_version: "pilot-performance-report-v1",
      fixture_dataset: dataset.metadata.dataset_id,
      candidate_count: candidateCount,
      evaluated_count: evaluated,
      total_ms: Number(totalMs.toFixed(3)),
      matching_p50_ms: Number(percentile(matchingDurations, 0.5).toFixed(3)),
      matching_p95_ms: Number(percentile(matchingDurations, 0.95).toFixed(3)),
      confidence_p50_ms: Number(
        percentile(confidenceDurations, 0.5).toFixed(3),
      ),
      confidence_p95_ms: Number(
        percentile(confidenceDurations, 0.95).toFixed(3),
      ),
    };
    console.info("PILOT_PERFORMANCE", JSON.stringify(report));
    expect(evaluated).toBe(candidateCount);
    // Local/CI runaway guard only; this is not a production SLA.
    expect(totalMs).toBeLessThan(5_000);

    const { application, journey, matching } = await createGoldenJourney();
    application.getShortlist(journey.journey_id);
    const finalistIds = matching.shortlist.cards
      .slice(0, 2)
      .map((card) => card.propertyId);
    application.createJourneyComparison(journey.journey_id, finalistIds);
    application.createJourneyExpertRequest(journey.journey_id, {
      requestType: "choice_assistance",
      triggerType: "comparison_uncertainty",
      questionCategory: "comparison",
      question: "Какой компромисс важнее перед решением?",
    });
    const measurements = application.performanceRecorder.list();
    const stageReport = Object.fromEntries(
      [
        "parser",
        "matching",
        "confidence",
        "shortlist",
        "comparison",
        "expert_context",
      ].map((operation) => {
        const values = measurements.filter(
          (measurement) => measurement.operation === operation,
        );
        return [
          operation,
          {
            count: values.length,
            total_ms: Number(
              values
                .reduce((total, value) => total + value.duration_ms, 0)
                .toFixed(3),
            ),
            max_ms: Number(
              Math.max(0, ...values.map((value) => value.duration_ms)).toFixed(
                3,
              ),
            ),
          },
        ];
      }),
    );
    console.info("PILOT_GOLDEN_JOURNEY_TIMINGS", JSON.stringify(stageReport));
    expect(Object.values(stageReport).every((value) => value.count > 0)).toBe(
      true,
    );
  });
});
