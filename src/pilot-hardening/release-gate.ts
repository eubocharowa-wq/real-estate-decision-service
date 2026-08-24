import {
  PILOT_RELEASE_GATE_VERSION,
  type PilotReleaseCheck,
  type PilotReleaseGate,
  type SourcePilotReadiness,
} from "./contracts";
import { validateRealPilotDatasetManifest } from "./real-pilot-dataset";

export interface PilotReleaseEvidence {
  readonly buildPassed: boolean;
  readonly coreRegressionsPassed: boolean;
  readonly secretsScanPassed: boolean;
  readonly provenanceValidationPassed: boolean;
  readonly hardCriteriaPassed: boolean;
  readonly matchConfidenceSeparationPassed: boolean;
  readonly expertEvidenceBoundaryPassed: boolean;
  readonly urlFetchSafetyPassed: boolean;
  readonly openclawPolicyGatePassed: boolean;
  readonly sourceReadiness: readonly SourcePilotReadiness[];
  readonly realPilotDatasetManifest: unknown;
  readonly lowCoverage: boolean;
  readonly expertSlaDefined: boolean;
  readonly comparisonSampleSufficient: boolean;
  readonly refreshFixtureBacked: boolean;
  readonly openclawLiveEnabled: boolean;
}

const check = (
  checkId: string,
  passed: boolean,
  failure: string,
): PilotReleaseCheck => ({
  check_id: checkId,
  status: passed ? "pass" : "fail",
  hard_blocker: true,
  details: passed ? [] : [failure],
});

export const evaluatePilotReleaseGate = (input: {
  readonly evidence: PilotReleaseEvidence;
  readonly evaluatedAt: string;
  readonly appVersion: string;
}): PilotReleaseGate => {
  const sourceFailures = input.evidence.sourceReadiness.filter(
    (source) => !source.ready,
  );
  const realPilotDataset = validateRealPilotDatasetManifest(
    input.evidence.realPilotDatasetManifest,
    { now: input.evaluatedAt },
  );
  const checks: PilotReleaseCheck[] = [
    check("build", input.evidence.buildPassed, "FAILING_BUILD"),
    check(
      "core_regressions",
      input.evidence.coreRegressionsPassed,
      "FAILING_CORE_REGRESSIONS",
    ),
    check("secrets", input.evidence.secretsScanPassed, "SECRETS_DETECTED"),
    check(
      "provenance",
      input.evidence.provenanceValidationPassed,
      "SYNTHETIC_MASQUERADING_AS_LIVE",
    ),
    check(
      "hard_criteria",
      input.evidence.hardCriteriaPassed,
      "BROKEN_HARD_CRITERIA",
    ),
    check(
      "match_confidence_separation",
      input.evidence.matchConfidenceSeparationPassed,
      "BROKEN_MATCH_CONFIDENCE_SEPARATION",
    ),
    check(
      "expert_evidence_boundary",
      input.evidence.expertEvidenceBoundaryPassed,
      "EXPERT_EVIDENCE_BYPASS",
    ),
    check(
      "url_fetch_safety",
      input.evidence.urlFetchSafetyPassed,
      "UNSAFE_URL_FETCH_PATH",
    ),
    check(
      "openclaw_policy_readiness_gate",
      input.evidence.openclawPolicyGatePassed,
      "OPENCLAW_POLICY_READINESS_BYPASS",
    ),
    check(
      "real_pilot_dataset",
      realPilotDataset.configured,
      "REAL_PILOT_DATASET_NOT_CONFIGURED",
    ),
    {
      check_id: "pilot_sources",
      status: sourceFailures.length === 0 ? "pass" : "warning",
      hard_blocker: false,
      details: sourceFailures.map(
        (source) => `${source.source_id}:${source.blockers.join(",")}`,
      ),
    },
  ];
  const warnings = [
    ...(input.evidence.lowCoverage ? ["LOW_COVERAGE"] : []),
    ...(!input.evidence.expertSlaDefined ? ["EXPERT_SLA_UNDEFINED"] : []),
    ...(!input.evidence.comparisonSampleSufficient
      ? ["LOW_COMPARISON_SAMPLE"]
      : []),
    ...(input.evidence.refreshFixtureBacked ? ["REFRESH_FIXTURE_BACKED"] : []),
    ...(!input.evidence.openclawLiveEnabled
      ? ["OPENCLAW_LIVE_DISABLED_PENDING_SOURCE_APPROVAL"]
      : []),
    ...(sourceFailures.length > 0 ? ["SOURCES_REQUIRE_APPROVAL"] : []),
  ];
  const blockers = checks
    .filter((item) => item.hard_blocker && item.status === "fail")
    .flatMap((item) => item.details);
  return {
    schema_version: PILOT_RELEASE_GATE_VERSION,
    ready: blockers.length === 0,
    blockers,
    warnings: [...new Set(warnings)],
    checks,
    evaluated_at: input.evaluatedAt,
    app_version: input.appVersion,
  };
};
