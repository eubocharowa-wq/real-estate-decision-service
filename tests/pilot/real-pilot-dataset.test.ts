import { describe, expect, it } from "vitest";

import {
  REAL_BUYER_PILOT_DATASET_MANIFEST_V1,
  evaluateAllPilotSources,
  evaluatePilotReleaseGate,
  resolveRealPilotDatasetRuntime,
  validateRealPilotDatasetManifest,
} from "../../src/pilot-hardening";
import { createSyntheticPilotCandidate } from "./helpers";

const now = "2026-08-24T12:00:00.000Z";

const emptyManifest = {
  schema_version: "real-pilot-dataset-manifest-v1",
  manifest_id: "empty_real_pilot_manifest",
  dataset_version: "test-empty-v1",
  environment: "pilot",
  created_at: now,
  candidates: [],
  manual_selection_sources: [],
} as const;

const releaseEvidence = (
  manifest: unknown,
  overrides: Partial<
    Parameters<typeof evaluatePilotReleaseGate>[0]["evidence"]
  > = {},
): Parameters<typeof evaluatePilotReleaseGate>[0]["evidence"] => ({
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
  realPilotDatasetManifest: manifest,
  lowCoverage: true,
  expertSlaDefined: false,
  comparisonSampleSufficient: false,
  refreshFixtureBacked: true,
  openclawLiveEnabled: false,
  ...overrides,
});

describe("real pilot dataset manifest", () => {
  it("configures a non-empty validated user-supplied real dataset", () => {
    const validation = validateRealPilotDatasetManifest(
      REAL_BUYER_PILOT_DATASET_MANIFEST_V1,
      { now },
    );
    expect(validation).toMatchObject({
      valid: true,
      configured: true,
      candidate_count: 2,
      valid_candidate_count: 2,
      manual_selection_source_count: 1,
    });
    expect(validation.errors).toEqual([]);

    const runtime = resolveRealPilotDatasetRuntime(
      REAL_BUYER_PILOT_DATASET_MANIFEST_V1,
      { now },
    );
    expect(runtime.candidates).toHaveLength(2);
    expect(
      REAL_BUYER_PILOT_DATASET_MANIFEST_V1.candidates.every(
        (entry) =>
          entry.origin === "user_supplied" &&
          entry.collection_mode === "manual_fallback" &&
          entry.automated_fetch_performed === false &&
          entry.candidate.source.policy_metadata.access_status === "restricted",
      ),
    ).toBe(true);
  });

  it("keeps only URL-explicit Avito facts and all other facts unknown", () => {
    const [first, second] = REAL_BUYER_PILOT_DATASET_MANIFEST_V1.candidates;
    expect(
      first?.observed_facts.map(({ field, value }) => [field, value]),
    ).toEqual([
      ["rooms", 1],
      ["total_area_m2", 40.9],
      ["floor", 1],
      ["floors_total", 10],
    ]);
    expect(
      second?.observed_facts.map(({ field, value }) => [field, value]),
    ).toEqual([
      ["rooms", 1],
      ["total_area_m2", 36],
      ["floor", 2],
      ["floors_total", 9],
    ]);
    for (const entry of [first!, second!]) {
      expect(entry.candidate.offer.listing_price).toBeNull();
      expect(entry.candidate.offer.availability).toBe("unknown");
      expect(entry.candidate.property.location.address.city).toBeNull();
      expect(entry.candidate.financing_claims).toEqual([]);
      expect(
        entry.observed_facts.every(
          (fact) => fact.verification_status === "claimed",
        ),
      ).toBe(true);
    }
  });

  it("rejects a synthetic-only real pilot dataset", () => {
    const synthetic = createSyntheticPilotCandidate();
    const validation = validateRealPilotDatasetManifest(
      {
        ...emptyManifest,
        candidates: [
          {
            schema_version: "real-pilot-dataset-candidate-v1",
            candidate_id: "synthetic_candidate",
            origin: "synthetic",
            source_url: "https://fixture.example/property/1",
            observed_facts: [],
            explicit_unknown_fields: [],
            evidence_refs: synthetic.evidence.map((item) => item.evidence_id),
            observed_at: synthetic.observed_at,
            freshness_status: synthetic.offer.freshness_status,
            collection_mode: "manual_fallback",
            automated_fetch_performed: false,
            candidate: synthetic,
          },
        ],
      },
      { now },
    );
    expect(validation.configured).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        "candidate[0]:REAL_DATA_ORIGIN_REQUIRED",
        "candidate[0]:SYNTHETIC_FORBIDDEN",
      ]),
    );
  });

  it("rejects an invalid candidate and an empty dataset", () => {
    const validEntry = REAL_BUYER_PILOT_DATASET_MANIFEST_V1.candidates[0]!;
    const invalid = validateRealPilotDatasetManifest(
      {
        ...REAL_BUYER_PILOT_DATASET_MANIFEST_V1,
        candidates: [
          {
            ...validEntry,
            candidate: {
              ...validEntry.candidate,
              offer: {
                ...validEntry.candidate.offer,
                property_id: "property_wrong",
              },
            },
          },
        ],
      },
      { now },
    );
    expect(invalid.configured).toBe(false);
    expect(invalid.errors).toContain(
      "candidate[0]:OFFER_PROPERTY_REFERENCE_MISMATCH",
    );

    const empty = validateRealPilotDatasetManifest(emptyManifest, { now });
    expect(empty.configured).toBe(false);
    expect(empty.errors).toContain("REAL_PILOT_DATASET_EMPTY");
  });

  it("rejects claimed-to-confirmed promotion", () => {
    const entry = REAL_BUYER_PILOT_DATASET_MANIFEST_V1.candidates[0]!;
    const promoted = validateRealPilotDatasetManifest(
      {
        ...REAL_BUYER_PILOT_DATASET_MANIFEST_V1,
        candidates: [
          {
            ...entry,
            observed_facts: [
              {
                ...entry.observed_facts[0]!,
                verification_status: "confirmed",
              },
              ...entry.observed_facts.slice(1),
            ],
          },
        ],
      },
      { now },
    );
    expect(promoted.configured).toBe(false);
    expect(promoted.errors).toContain(
      "candidate[0]:CLAIMED_PROMOTED_TO_CONFIRMED",
    );
  });

  it("represents restricted URLs without fetch and keeps Edinstvo pending manual selection", () => {
    const urls = REAL_BUYER_PILOT_DATASET_MANIFEST_V1.candidates.map(
      (entry) => entry.source_url,
    );
    expect(urls).toEqual([
      "https://www.avito.ru/tula/kvartiry/1-k._kvartira_409_m_110_et._7336470679",
      "https://www.avito.ru/tula/kvartiry/1-k._kvartira_36_m_29_et._8383508344",
    ]);
    expect(
      REAL_BUYER_PILOT_DATASET_MANIFEST_V1.manual_selection_sources,
    ).toEqual([
      expect.objectContaining({
        source_url: "https://edinstvo71.ru/flat/10",
        origin: "user_supplied",
        status: "manual_selection_required",
        freshness_status: "unknown",
        automated_fetch_performed: false,
      }),
    ]);
  });
});

describe("real pilot dataset release evidence", () => {
  it("derives configured from the validated manifest and removes only its blocker", () => {
    const before = evaluatePilotReleaseGate({
      evidence: releaseEvidence(emptyManifest),
      evaluatedAt: now,
      appVersion: "test",
    });
    const after = evaluatePilotReleaseGate({
      evidence: releaseEvidence(REAL_BUYER_PILOT_DATASET_MANIFEST_V1),
      evaluatedAt: now,
      appVersion: "test",
    });
    expect(before.blockers).toContain("REAL_PILOT_DATASET_NOT_CONFIGURED");
    expect(before.ready).toBe(false);
    expect(after.blockers).not.toContain("REAL_PILOT_DATASET_NOT_CONFIGURED");
    expect(after.blockers).toEqual([]);
    expect(after.ready).toBe(true);
    expect(after.warnings).toEqual(
      expect.arrayContaining([
        "LOW_COVERAGE",
        "EXPERT_SLA_UNDEFINED",
        "LOW_COMPARISON_SAMPLE",
        "REFRESH_FIXTURE_BACKED",
        "OPENCLAW_LIVE_DISABLED_PENDING_SOURCE_APPROVAL",
        "SOURCES_REQUIRE_APPROVAL",
      ]),
    );
  });

  it("does not let configured data bypass another hard blocker", () => {
    const gate = evaluatePilotReleaseGate({
      evidence: releaseEvidence(REAL_BUYER_PILOT_DATASET_MANIFEST_V1, {
        hardCriteriaPassed: false,
      }),
      evaluatedAt: now,
      appVersion: "test",
    });
    expect(gate.ready).toBe(false);
    expect(gate.blockers).toContain("BROKEN_HARD_CRITERIA");
    expect(gate.blockers).not.toContain("REAL_PILOT_DATASET_NOT_CONFIGURED");
  });
});
