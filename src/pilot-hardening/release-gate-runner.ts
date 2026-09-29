import {
  buildCuratedPilotManifest,
  readCuratedPilotCandidateFiles,
} from "./curated-dataset";
import type {
  PilotReleaseCheck,
  PilotReleaseGate,
  RealPilotDatasetManifest,
  SourcePilotReadiness,
} from "./contracts";
import {
  REQUIRED_EXTERNAL_RELEASE_CHECK_IDS,
  type RequiredExternalReleaseCheckId,
} from "./external-evidence";
import { evaluatePilotReleaseGate } from "./release-gate";
import {
  isRevisionBoundExternalEvidenceBundle,
  type RevisionBoundExternalEvidence,
} from "./revision-binding";

export const PILOT_RELEASE_ARTIFACT_VERSION =
  "pilot-release-gate-artifact-v1" as const;
export const PILOT_RELEASE_EVIDENCE_RECORD_VERSION =
  "pilot-release-evidence-record-v1" as const;

export const REPOSITORY_RELEASE_CHECK_IDS = [
  "repository_clean",
  "build",
  "typecheck",
  "lint",
  "core_regressions",
  "pilot_regressions",
  "dependency_security",
  "secrets",
] as const;

export type RepositoryReleaseCheckId =
  (typeof REPOSITORY_RELEASE_CHECK_IDS)[number];

export interface RepositoryReleaseCheckResult {
  readonly check_id: RepositoryReleaseCheckId;
  readonly passed: boolean;
  readonly evidence_ref: string;
  readonly diagnostic_code: string;
  readonly exit_code: number | null;
}

export interface PilotReleaseEvidenceRecord {
  readonly schema_version: typeof PILOT_RELEASE_EVIDENCE_RECORD_VERSION;
  readonly check_id: string;
  readonly status: "pass" | "fail" | "warning";
  readonly commit_sha: string;
  readonly checked_at: string;
  readonly evidence_ref: string;
  readonly details: readonly string[];
}

export interface PilotReleaseArtifact {
  readonly schema_version: typeof PILOT_RELEASE_ARTIFACT_VERSION;
  readonly ready: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly checks: readonly PilotReleaseCheck[];
  readonly evidence: Readonly<
    Record<string, PilotReleaseEvidenceRecord | RevisionBoundExternalEvidence>
  >;
  readonly evaluated_at: string;
  readonly app_version: string;
}

const isSafeEvidenceReference = (value: string): boolean => {
  if (value.length === 0 || value.length > 512) return false;
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return /^[A-Za-z0-9][A-Za-z0-9._/:#-]{0,511}$/.test(value);
  }
};

const evidenceRecord = (input: {
  readonly checkId: string;
  readonly status: "pass" | "fail" | "warning";
  readonly commitSha: string;
  readonly checkedAt: string;
  readonly evidenceRef: string;
  readonly details?: readonly string[];
}): PilotReleaseEvidenceRecord => ({
  schema_version: PILOT_RELEASE_EVIDENCE_RECORD_VERSION,
  check_id: input.checkId,
  status: input.status,
  commit_sha: input.commitSha,
  checked_at: input.checkedAt,
  evidence_ref: input.evidenceRef,
  details: input.details ?? [],
});

const releaseCheck = (input: {
  readonly checkId: string;
  readonly status: "pass" | "fail" | "warning";
  readonly hardBlocker: boolean;
  readonly details?: readonly string[];
}): PilotReleaseCheck => ({
  check_id: input.checkId,
  status: input.status,
  hard_blocker: input.hardBlocker,
  details: input.details ?? [],
});

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const repositoryRecord = (
  result: RepositoryReleaseCheckResult | undefined,
  checkId: RepositoryReleaseCheckId,
  commitSha: string,
  checkedAt: string,
): PilotReleaseEvidenceRecord => {
  const passed = result?.passed === true;
  const failure = `${checkId.toUpperCase()}:${
    result ? result.diagnostic_code : "REPOSITORY_CHECK_UNAVAILABLE"
  }`;
  return evidenceRecord({
    checkId,
    status: passed ? "pass" : "fail",
    commitSha,
    checkedAt,
    evidenceRef:
      result && isSafeEvidenceReference(result.evidence_ref)
        ? result.evidence_ref
        : `repository-check:${checkId}`,
    details: passed ? [] : [failure],
  });
};

const derivedRecord = (
  source: PilotReleaseEvidenceRecord,
  checkId: string,
): PilotReleaseEvidenceRecord => ({ ...source, check_id: checkId });

const externalCheck = (input: {
  readonly checkId: RequiredExternalReleaseCheckId;
  readonly records: readonly RevisionBoundExternalEvidence[];
  readonly commitSha: string;
  readonly evaluatedAt: string;
  readonly maxEvidenceAgeMs: number;
}): {
  readonly check: PilotReleaseCheck;
  readonly evidence: PilotReleaseEvidenceRecord | RevisionBoundExternalEvidence;
} => {
  const candidates = input.records.filter(
    (record) => record.check_id === input.checkId,
  );
  const record = candidates[0];
  let failure: string | null = null;
  if (candidates.length === 0) failure = "REQUIRED_EVIDENCE_MISSING";
  else if (candidates.length > 1) failure = "DUPLICATE_EVIDENCE";
  else {
    const checkedAt = Date.parse(record.provider_checked_at);
    const evaluatedAt = Date.parse(input.evaluatedAt);
    if (
      !Number.isFinite(checkedAt) ||
      checkedAt > evaluatedAt ||
      evaluatedAt - checkedAt > input.maxEvidenceAgeMs
    )
      failure = "EVIDENCE_STALE_OR_INVALID_TIME";
    else if (record.verification_status !== "pass")
      failure = `PROVIDER_${record.provider_state.toUpperCase()}`;
    else if (!record.revision_binding.valid)
      failure = record.revision_binding.diagnostic_code;
  }
  const accepted = failure === null;
  const failureCode = failure
    ? `${input.checkId.toUpperCase()}:${failure}`
    : null;
  const normalized =
    record ??
    evidenceRecord({
      checkId: input.checkId,
      status: "fail",
      commitSha: input.commitSha,
      checkedAt: input.evaluatedAt,
      evidenceRef: `external-evidence:${input.checkId}`,
      details: [failureCode!],
    });
  return {
    check: releaseCheck({
      checkId: input.checkId,
      status: accepted ? "pass" : "fail",
      hardBlocker: true,
      details: accepted ? [] : [failureCode!],
    }),
    evidence: normalized,
  };
};

const optionalWarnings = (input: {
  readonly records: readonly RevisionBoundExternalEvidence[];
  readonly evaluatedAt: string;
}): {
  readonly checks: readonly PilotReleaseCheck[];
  readonly evidence: readonly RevisionBoundExternalEvidence[];
  readonly warnings: readonly string[];
} => {
  const records = input.records.filter(
    (record) => record.check_id === "known_limitations",
  );
  const accepted = records.filter(
    (record) =>
      record.verification_status === "pass" &&
      record.revision_binding.valid &&
      Date.parse(record.provider_checked_at) <= Date.parse(input.evaluatedAt),
  );
  return {
    checks: accepted.map((record) =>
      releaseCheck({
        checkId: record.check_id,
        status: "warning",
        hardBlocker: false,
        details: ["KNOWN_LIMITATIONS_EVIDENCE_PRESENT"],
      }),
    ),
    evidence: accepted,
    warnings: accepted.map(() => "KNOWN_LIMITATIONS_EVIDENCE_PRESENT"),
  };
};

export interface OperationalPilotReleaseGateInput {
  readonly commitSha: string;
  readonly evaluatedAt: string;
  readonly repositoryChecks: readonly RepositoryReleaseCheckResult[];
  readonly revisionBoundExternalEvidence?: unknown;
  readonly sourceReadiness: readonly SourcePilotReadiness[];
  readonly realPilotDatasetManifest: RealPilotDatasetManifest;
  readonly maxEvidenceAgeMs?: number;
}

export const evaluateOperationalPilotReleaseGate = (
  input: OperationalPilotReleaseGateInput,
): PilotReleaseArtifact => {
  const boundBundle = isRevisionBoundExternalEvidenceBundle(
    input.revisionBoundExternalEvidence,
  )
    ? input.revisionBoundExternalEvidence
    : null;
  const externalRecords = boundBundle?.evidence ?? [];
  const externalErrors = boundBundle
    ? [
        ...boundBundle.errors,
        ...(boundBundle.evaluated_revision.evaluated_commit_sha ===
        input.commitSha
          ? []
          : ["BOUND_EVIDENCE_EVALUATED_REVISION_MISMATCH"]),
      ]
    : input.revisionBoundExternalEvidence === undefined
      ? []
      : ["UNBOUND_EXTERNAL_EVIDENCE"];
  const repository = Object.fromEntries(
    REPOSITORY_RELEASE_CHECK_IDS.map((checkId) => [
      checkId,
      repositoryRecord(
        input.repositoryChecks.find((record) => record.check_id === checkId),
        checkId,
        input.commitSha,
        input.evaluatedAt,
      ),
    ]),
  ) as Record<RepositoryReleaseCheckId, PilotReleaseEvidenceRecord>;
  const pilotRegressions = repository.pilot_regressions;
  const coreGate: PilotReleaseGate = evaluatePilotReleaseGate({
    evidence: {
      buildPassed: repository.build.status === "pass",
      coreRegressionsPassed: repository.core_regressions.status === "pass",
      secretsScanPassed: repository.secrets.status === "pass",
      provenanceValidationPassed: pilotRegressions.status === "pass",
      hardCriteriaPassed: pilotRegressions.status === "pass",
      matchConfidenceSeparationPassed: pilotRegressions.status === "pass",
      expertEvidenceBoundaryPassed: pilotRegressions.status === "pass",
      urlFetchSafetyPassed: pilotRegressions.status === "pass",
      openclawPolicyGatePassed: pilotRegressions.status === "pass",
      sourceReadiness: input.sourceReadiness,
      realPilotDatasetManifest: input.realPilotDatasetManifest,
      lowCoverage: input.sourceReadiness.every((source) => !source.ready),
      expertSlaDefined: false,
      comparisonSampleSufficient: false,
      refreshFixtureBacked: true,
      openclawLiveEnabled: false,
    },
    evaluatedAt: input.evaluatedAt,
    appVersion: input.commitSha,
  });

  const coreEvidence: Record<string, PilotReleaseEvidenceRecord> = {
    build: repository.build,
    core_regressions: repository.core_regressions,
    secrets: repository.secrets,
    provenance: derivedRecord(pilotRegressions, "provenance"),
    hard_criteria: derivedRecord(pilotRegressions, "hard_criteria"),
    match_confidence_separation: derivedRecord(
      pilotRegressions,
      "match_confidence_separation",
    ),
    expert_evidence_boundary: derivedRecord(
      pilotRegressions,
      "expert_evidence_boundary",
    ),
    url_fetch_safety: derivedRecord(pilotRegressions, "url_fetch_safety"),
    openclaw_policy_readiness_gate: derivedRecord(
      pilotRegressions,
      "openclaw_policy_readiness_gate",
    ),
    real_pilot_dataset: evidenceRecord({
      checkId: "real_pilot_dataset",
      status:
        coreGate.checks.find((check) => check.check_id === "real_pilot_dataset")
          ?.status ?? "fail",
      commitSha: input.commitSha,
      checkedAt: input.evaluatedAt,
      evidenceRef: "data/examples/real-pilot/candidates",
    }),
    pilot_sources: evidenceRecord({
      checkId: "pilot_sources",
      status:
        coreGate.checks.find((check) => check.check_id === "pilot_sources")
          ?.status ?? "warning",
      commitSha: input.commitSha,
      checkedAt: input.evaluatedAt,
      evidenceRef: "src/pilot-hardening/source-readiness.ts",
    }),
  };
  const repositoryChecks: PilotReleaseCheck[] = [
    releaseCheck({
      checkId: "repository_clean",
      status: repository.repository_clean.status,
      hardBlocker: true,
      details: repository.repository_clean.details,
    }),
    releaseCheck({
      checkId: "typecheck",
      status: repository.typecheck.status,
      hardBlocker: true,
      details: repository.typecheck.details,
    }),
    releaseCheck({
      checkId: "lint",
      status: repository.lint.status,
      hardBlocker: true,
      details: repository.lint.details,
    }),
    releaseCheck({
      checkId: "dependency_security",
      status: repository.dependency_security.status,
      hardBlocker: true,
      details: repository.dependency_security.details,
    }),
    releaseCheck({
      checkId: "pilot_regressions",
      status: repository.pilot_regressions.status,
      hardBlocker: true,
      details: repository.pilot_regressions.details,
    }),
  ];
  const external = REQUIRED_EXTERNAL_RELEASE_CHECK_IDS.map((checkId) =>
    externalCheck({
      checkId,
      records: externalRecords,
      commitSha: input.commitSha,
      evaluatedAt: input.evaluatedAt,
      maxEvidenceAgeMs: input.maxEvidenceAgeMs ?? 14 * 24 * 60 * 60 * 1_000,
    }),
  );
  const optional = optionalWarnings({
    records: externalRecords,
    evaluatedAt: input.evaluatedAt,
  });
  const formatCheck =
    externalErrors.length === 0
      ? []
      : [
          releaseCheck({
            checkId: "external_evidence_format",
            status: "fail",
            hardBlocker: true,
            details: externalErrors,
          }),
        ];
  const checks = [
    ...repositoryChecks,
    ...coreGate.checks,
    ...formatCheck,
    ...external.map((item) => item.check),
    ...optional.checks,
  ];
  const blockers = unique(
    checks
      .filter((check) => check.hard_blocker && check.status === "fail")
      .flatMap((check) => check.details),
  );
  const evidence = Object.fromEntries(
    [
      ...Object.values(repository),
      ...Object.values(coreEvidence),
      ...external.map((item) => item.evidence),
      ...optional.evidence,
    ].map((record) => [record.check_id, record]),
  );
  return {
    schema_version: PILOT_RELEASE_ARTIFACT_VERSION,
    ready: blockers.length === 0,
    blockers,
    warnings: unique([...coreGate.warnings, ...optional.warnings]),
    checks,
    evidence,
    evaluated_at: input.evaluatedAt,
    app_version: input.commitSha,
  };
};

export const buildRepositoryRealPilotManifest =
  (): RealPilotDatasetManifest => {
    const candidates = readCuratedPilotCandidateFiles();
    return buildCuratedPilotManifest({
      candidates,
      createdAt: candidates[0]?.observed_at ?? new Date(0).toISOString(),
    });
  };

export const pilotReleaseGateExitCode = (
  artifact: Pick<PilotReleaseArtifact, "ready">,
): 0 | 1 => (artifact.ready ? 0 : 1);
