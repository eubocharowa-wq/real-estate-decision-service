import { describe, expect, it, vi } from "vitest";

import {
  GitRepositoryRevisionResolver,
  HttpExternalEvidenceVerifier,
  PILOT_RELEASE_EVIDENCE_DESCRIPTOR_VERSION,
  PILOT_RELEASE_EXTERNAL_EVIDENCE_VERSION,
  REAL_BUYER_PILOT_DATASET_MANIFEST_V1,
  REQUIRED_EXTERNAL_RELEASE_CHECK_IDS,
  REPOSITORY_RELEASE_CHECK_IDS,
  bindVerifiedEvidenceToRevision,
  evaluateOperationalPilotReleaseGate,
  verifyPilotReleaseEvidence,
  type ExternalEvidenceVerifier,
  type GitAncestryVerifier,
  type PilotReleaseEvidenceDescriptor,
  type ProviderEvidenceObservation,
  type RepositoryReleaseCheckResult,
  type RevisionBoundExternalEvidence,
  type SafeCommandExecutor,
} from "../../src/pilot-hardening";

const evaluatedCommitSha = "a".repeat(40);
const alternateCommitSha = "b".repeat(40);
const ancestorCommitSha = "c".repeat(40);
const evaluatedAt = "2026-09-28T12:00:00.000Z";

const repositoryChecks = (): readonly RepositoryReleaseCheckResult[] =>
  REPOSITORY_RELEASE_CHECK_IDS.map((checkId) => ({
    check_id: checkId,
    passed: true,
    evidence_ref: `repository-check:${checkId}`,
    diagnostic_code: "COMMAND_SUCCEEDED",
    exit_code: 0,
  }));

const actionsDescriptor = (
  checkId: PilotReleaseEvidenceDescriptor["check_id"],
  runId = 42,
): PilotReleaseEvidenceDescriptor => ({
  schema_version: PILOT_RELEASE_EVIDENCE_DESCRIPTOR_VERSION,
  check_id: checkId,
  evidence_kind: "github_actions_run",
  repository: "owner/repository",
  run_id: runId,
});

const pullRequestDescriptor = (
  checkId: PilotReleaseEvidenceDescriptor["check_id"],
  prNumber = 27,
): PilotReleaseEvidenceDescriptor => ({
  schema_version: PILOT_RELEASE_EVIDENCE_DESCRIPTOR_VERSION,
  check_id: checkId,
  evidence_kind: "github_pull_request",
  repository: "owner/repository",
  pr_number: prNumber,
});

const deploymentDescriptor = (
  checkId: PilotReleaseEvidenceDescriptor["check_id"],
): PilotReleaseEvidenceDescriptor => ({
  schema_version: PILOT_RELEASE_EVIDENCE_DESCRIPTOR_VERSION,
  check_id: checkId,
  evidence_kind: "vercel_deployment",
  project: "real-estate-decision-service",
  deployment_id: "dpl_abc123",
});

const completeDescriptors = (): readonly PilotReleaseEvidenceDescriptor[] =>
  REQUIRED_EXTERNAL_RELEASE_CHECK_IDS.map((checkId, index) => {
    if (checkId === "rollback_readiness") return deploymentDescriptor(checkId);
    if (checkId.startsWith("task_"))
      return pullRequestDescriptor(checkId, index + 1);
    return actionsDescriptor(checkId, index + 1);
  });

const envelope = (evidence: readonly PilotReleaseEvidenceDescriptor[]) => ({
  schema_version: PILOT_RELEASE_EXTERNAL_EVIDENCE_VERSION,
  evidence,
});

const successfulObservation = (
  descriptor: PilotReleaseEvidenceDescriptor,
): ProviderEvidenceObservation => ({
  provider_state: "success",
  provider_status:
    descriptor.evidence_kind === "vercel_deployment" ? "ready" : "completed",
  provider_conclusion: "success",
  revision:
    descriptor.evidence_kind === "github_actions_run"
      ? {
          tested_commit_sha: evaluatedCommitSha,
          source_commit_sha: evaluatedCommitSha,
          merge_commit_sha: null,
        }
      : descriptor.evidence_kind === "vercel_deployment"
        ? {
            tested_commit_sha: null,
            source_commit_sha: evaluatedCommitSha,
            merge_commit_sha: null,
          }
        : {
            tested_commit_sha: null,
            source_commit_sha: alternateCommitSha,
            merge_commit_sha: evaluatedCommitSha,
          },
  provider_checked_at: evaluatedAt,
  evidence_ref: `provider:${descriptor.evidence_kind}`,
});

const successVerifier: ExternalEvidenceVerifier = {
  verify: async (descriptor) => successfulObservation(descriptor),
};

const ancestorVerifier = (isAncestor = true): GitAncestryVerifier => ({
  isAncestor: vi.fn(async () => isAncestor),
});

const verifyBindAndEvaluate = async (input: {
  readonly rawEvidence: unknown;
  readonly verifier?: ExternalEvidenceVerifier;
  readonly ancestryVerifier?: GitAncestryVerifier;
  readonly commitSha?: string;
}) => {
  const commitSha = input.commitSha ?? evaluatedCommitSha;
  const verifiedEvidence = await verifyPilotReleaseEvidence({
    rawEvidence: input.rawEvidence,
    verifier: input.verifier ?? successVerifier,
    verifiedAt: evaluatedAt,
  });
  const revisionBoundExternalEvidence = await bindVerifiedEvidenceToRevision({
    verifiedEvidence,
    evaluatedRevision: { evaluated_commit_sha: commitSha },
    ancestryVerifier: input.ancestryVerifier ?? ancestorVerifier(),
  });
  const artifact = evaluateOperationalPilotReleaseGate({
    commitSha,
    evaluatedAt,
    repositoryChecks: repositoryChecks(),
    revisionBoundExternalEvidence,
    sourceReadiness: [],
    realPilotDatasetManifest: REAL_BUYER_PILOT_DATASET_MANIFEST_V1,
  });
  return { artifact, revisionBoundExternalEvidence, verifiedEvidence };
};

const boundEvidence = (
  artifact: Awaited<ReturnType<typeof verifyBindAndEvaluate>>["artifact"],
  checkId: string,
): RevisionBoundExternalEvidence => {
  const evidence = artifact.evidence[checkId];
  if (!evidence || !("revision_binding" in evidence))
    throw new Error(`Missing bound evidence for ${checkId}`);
  return evidence;
};

const githubRunResponse = (overrides: Record<string, unknown> = {}) => ({
  id: 42,
  status: "completed",
  conclusion: "success",
  head_sha: evaluatedCommitSha,
  updated_at: evaluatedAt,
  repository: { full_name: "owner/repository" },
  ...overrides,
});

const githubPullRequestResponse = (
  overrides: Record<string, unknown> = {},
) => ({
  number: 27,
  state: "closed",
  merged: true,
  merge_commit_sha: evaluatedCommitSha,
  updated_at: evaluatedAt,
  head: { sha: alternateCommitSha },
  base: { repo: { full_name: "owner/repository" } },
  ...overrides,
});

const httpVerifier = (
  response: Response | Error,
  config: { readonly vercelToken?: string } = {},
) =>
  new HttpExternalEvidenceVerifier({
    vercelToken: config.vercelToken,
    fetchImpl: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }) as unknown as typeof fetch,
  });

describe("TASK-027A provider verification remains fail-closed", () => {
  it("rejects arbitrary HTTPS and self-asserted status fields", async () => {
    const arbitrary = await verifyBindAndEvaluate({
      rawEvidence: {
        schema_version: PILOT_RELEASE_EXTERNAL_EVIDENCE_VERSION,
        evidence: [
          {
            schema_version: PILOT_RELEASE_EVIDENCE_DESCRIPTOR_VERSION,
            check_id: "browser_e2e",
            evidence_kind: "generic_url",
            url: "https://example.com/evidence",
          },
        ],
      },
    });
    const asserted = await verifyBindAndEvaluate({
      rawEvidence: {
        schema_version: PILOT_RELEASE_EXTERNAL_EVIDENCE_VERSION,
        evidence: [
          {
            ...actionsDescriptor("browser_e2e"),
            status: "pass",
            ready: true,
          },
        ],
      },
    });

    expect(arbitrary.artifact.blockers).toContain(
      "MALFORMED_EXTERNAL_EVIDENCE_DESCRIPTOR",
    );
    expect(asserted.artifact.blockers).toContain(
      "MALFORMED_EXTERNAL_EVIDENCE_DESCRIPTOR",
    );
  });

  it("fails closed for nonexistent, failed and provider-error runs", async () => {
    const nonexistent = await verifyBindAndEvaluate({
      rawEvidence: envelope([actionsDescriptor("browser_e2e")]),
      verifier: httpVerifier(new Response(null, { status: 404 })),
    });
    const failed = await verifyBindAndEvaluate({
      rawEvidence: envelope([actionsDescriptor("browser_e2e")]),
      verifier: httpVerifier(
        Response.json(githubRunResponse({ conclusion: "failure" })),
      ),
    });
    const unavailable = await verifyBindAndEvaluate({
      rawEvidence: envelope([actionsDescriptor("browser_e2e")]),
      verifier: httpVerifier(new Error("unavailable")),
    });

    expect(nonexistent.artifact.blockers).toContain(
      "BROWSER_E2E:PROVIDER_NOT_FOUND",
    );
    expect(failed.artifact.blockers).toContain("BROWSER_E2E:PROVIDER_FAILED");
    expect(unavailable.artifact.blockers).toContain(
      "BROWSER_E2E:PROVIDER_PROVIDER_ERROR",
    );
  });

  it("rejects duplicate descriptors and caller-constructed bundles", async () => {
    const duplicate = await verifyBindAndEvaluate({
      rawEvidence: envelope([
        actionsDescriptor("browser_e2e"),
        actionsDescriptor("browser_e2e"),
      ]),
    });
    const artifact = evaluateOperationalPilotReleaseGate({
      commitSha: evaluatedCommitSha,
      evaluatedAt,
      repositoryChecks: repositoryChecks(),
      revisionBoundExternalEvidence: {
        schema_version: "pilot-release-bound-evidence-bundle-v1",
        evaluated_revision: { evaluated_commit_sha: evaluatedCommitSha },
        evidence: [],
        errors: [],
      },
      sourceReadiness: [],
      realPilotDatasetManifest: REAL_BUYER_PILOT_DATASET_MANIFEST_V1,
    });

    expect(duplicate.artifact.blockers).toContain(
      "BROWSER_E2E:DUPLICATE_EVIDENCE_DESCRIPTOR",
    );
    expect(artifact.blockers).toContain("UNBOUND_EXTERNAL_EVIDENCE");
  });
});

describe("TASK-027B exact runtime revision binding", () => {
  it("accepts the exact GitHub Actions tested SHA", async () => {
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([actionsDescriptor("browser_e2e")]),
      verifier: httpVerifier(Response.json(githubRunResponse())),
    });
    const evidence = boundEvidence(artifact, "browser_e2e");

    expect(evidence.revision.tested_commit_sha).toBe(evaluatedCommitSha);
    expect(evidence.revision_binding).toMatchObject({
      relation: "exact_tested_commit",
      valid: true,
      diagnostic_code: "COMMIT_BINDING_EXACT",
    });
  });

  it("blocks a different GitHub Actions tested SHA", async () => {
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([actionsDescriptor("browser_e2e")]),
      verifier: httpVerifier(
        Response.json(githubRunResponse({ head_sha: alternateCommitSha })),
      ),
    });

    expect(artifact.blockers).toContain("BROWSER_E2E:COMMIT_BINDING_MISMATCH");
  });

  it("blocks missing provider SHA", async () => {
    const verifier: ExternalEvidenceVerifier = {
      verify: async (descriptor) => ({
        ...successfulObservation(descriptor),
        revision: {
          tested_commit_sha: null,
          source_commit_sha: null,
          merge_commit_sha: null,
        },
      }),
    };
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([actionsDescriptor("browser_e2e")]),
      verifier,
    });

    expect(artifact.blockers).toContain("BROWSER_E2E:COMMIT_BINDING_MISSING");
  });

  it("accepts exact Vercel source SHA and blocks a different SHA", async () => {
    const deployment = (sha: string) =>
      Response.json({
        id: "dpl_abc123",
        name: "real-estate-decision-service",
        readyState: "READY",
        ready: Date.parse(evaluatedAt),
        gitSource: { sha },
      });
    const exact = await verifyBindAndEvaluate({
      rawEvidence: envelope([deploymentDescriptor("rollback_readiness")]),
      verifier: httpVerifier(deployment(evaluatedCommitSha), {
        vercelToken: "test-vercel-token",
      }),
    });
    const mismatch = await verifyBindAndEvaluate({
      rawEvidence: envelope([deploymentDescriptor("rollback_readiness")]),
      verifier: httpVerifier(deployment(alternateCommitSha), {
        vercelToken: "test-vercel-token",
      }),
    });

    expect(
      boundEvidence(exact.artifact, "rollback_readiness").revision_binding,
    ).toMatchObject({ relation: "exact_source_commit", valid: true });
    expect(mismatch.artifact.blockers).toContain(
      "ROLLBACK_READINESS:COMMIT_BINDING_MISMATCH",
    );
  });

  it("blocks Vercel deployment metadata without a source SHA", async () => {
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([deploymentDescriptor("rollback_readiness")]),
      verifier: httpVerifier(
        Response.json({
          id: "dpl_abc123",
          name: "real-estate-decision-service",
          readyState: "READY",
          ready: Date.parse(evaluatedAt),
        }),
        { vercelToken: "test-vercel-token" },
      ),
    });

    expect(artifact.blockers).toContain(
      "ROLLBACK_READINESS:COMMIT_BINDING_MISSING",
    );
  });

  it("does not treat the old staging cherry-pick as current main", async () => {
    const oldStagingSha = "75d7910b9430e6868c14960d26578a72d01c315d";
    const currentMainSha = "1759686ac00729b0c66a6255a52a765a7a013c4f";
    const verifier: ExternalEvidenceVerifier = {
      verify: async (descriptor) => ({
        ...successfulObservation(descriptor),
        revision: {
          tested_commit_sha: oldStagingSha,
          source_commit_sha: oldStagingSha,
          merge_commit_sha: null,
        },
      }),
    };
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([actionsDescriptor("browser_e2e")]),
      verifier,
      commitSha: currentMainSha,
    });

    expect(artifact.blockers).toContain("BROWSER_E2E:COMMIT_BINDING_MISMATCH");
  });
});

describe("TASK-027B merged task-completion binding", () => {
  it("accepts a merged PR whose merge commit equals evaluated HEAD", async () => {
    const ancestry = ancestorVerifier(false);
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([
        pullRequestDescriptor("task_028_evidence_artifact_lifecycle"),
      ]),
      verifier: httpVerifier(Response.json(githubPullRequestResponse())),
      ancestryVerifier: ancestry,
    });
    const evidence = boundEvidence(
      artifact,
      "task_028_evidence_artifact_lifecycle",
    );

    expect(evidence.revision_binding).toMatchObject({
      relation: "merged_commit_exact",
      valid: true,
    });
    expect(ancestry.isAncestor).not.toHaveBeenCalled();
  });

  it("accepts a merged PR only when its merge commit is an ancestor", async () => {
    const ancestry = ancestorVerifier(true);
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([
        pullRequestDescriptor("task_028_evidence_artifact_lifecycle"),
      ]),
      verifier: httpVerifier(
        Response.json(
          githubPullRequestResponse({ merge_commit_sha: ancestorCommitSha }),
        ),
      ),
      ancestryVerifier: ancestry,
    });

    expect(
      boundEvidence(artifact, "task_028_evidence_artifact_lifecycle")
        .revision_binding,
    ).toMatchObject({ relation: "merged_commit_ancestor", valid: true });
    expect(ancestry.isAncestor).toHaveBeenCalledWith(
      ancestorCommitSha,
      evaluatedCommitSha,
    );
  });

  it("blocks a merged PR that is not an ancestor", async () => {
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([
        pullRequestDescriptor("task_028_evidence_artifact_lifecycle"),
      ]),
      verifier: httpVerifier(
        Response.json(
          githubPullRequestResponse({ merge_commit_sha: ancestorCommitSha }),
        ),
      ),
      ancestryVerifier: ancestorVerifier(false),
    });

    expect(artifact.blockers).toContain(
      "TASK_028_EVIDENCE_ARTIFACT_LIFECYCLE:COMMIT_BINDING_MISMATCH",
    );
  });

  it("blocks an unmerged PR and a merged PR without merge SHA", async () => {
    const unmerged = await verifyBindAndEvaluate({
      rawEvidence: envelope([
        pullRequestDescriptor("task_028_evidence_artifact_lifecycle"),
      ]),
      verifier: httpVerifier(
        Response.json(
          githubPullRequestResponse({
            state: "open",
            merged: false,
            merge_commit_sha: null,
          }),
        ),
      ),
    });
    const missing = await verifyBindAndEvaluate({
      rawEvidence: envelope([
        pullRequestDescriptor("task_028_evidence_artifact_lifecycle"),
      ]),
      verifier: httpVerifier(
        Response.json(githubPullRequestResponse({ merge_commit_sha: null })),
      ),
    });

    expect(unmerged.artifact.blockers).toContain(
      "TASK_028_EVIDENCE_ARTIFACT_LIFECYCLE:PROVIDER_PENDING",
    );
    expect(missing.artifact.blockers).toContain(
      "TASK_028_EVIDENCE_ARTIFACT_LIFECYCLE:COMMIT_BINDING_MISSING",
    );
  });

  it("fails closed when ancestry cannot be verified", async () => {
    const ancestry: GitAncestryVerifier = {
      isAncestor: async () => {
        throw new Error("git unavailable");
      },
    };
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([
        pullRequestDescriptor("task_028_evidence_artifact_lifecycle"),
      ]),
      verifier: httpVerifier(
        Response.json(
          githubPullRequestResponse({ merge_commit_sha: ancestorCommitSha }),
        ),
      ),
      ancestryVerifier: ancestry,
    });

    expect(artifact.blockers).toContain(
      "TASK_028_EVIDENCE_ARTIFACT_LIFECYCLE:ANCESTRY_VERIFICATION_FAILED",
    );
  });
});

describe("TASK-027B check-specific policy and integrity", () => {
  it("does not allow PR evidence to satisfy browser E2E", async () => {
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([pullRequestDescriptor("browser_e2e")]),
      verifier: httpVerifier(Response.json(githubPullRequestResponse())),
    });

    expect(artifact.blockers).toContain(
      "BROWSER_E2E:EVIDENCE_KIND_NOT_ALLOWED",
    );
  });

  it("does not allow Actions evidence to satisfy a future task", async () => {
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([
        actionsDescriptor("task_028_evidence_artifact_lifecycle"),
      ]),
    });

    expect(artifact.blockers).toContain(
      "TASK_028_EVIDENCE_ARTIFACT_LIFECYCLE:EVIDENCE_KIND_NOT_ALLOWED",
    );
  });

  it("rejects an externally supplied relation or valid flag", async () => {
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: {
        schema_version: PILOT_RELEASE_EXTERNAL_EVIDENCE_VERSION,
        evidence: [
          {
            ...actionsDescriptor("browser_e2e"),
            relation: "equivalent",
            valid: true,
          },
        ],
      },
    });

    expect(artifact.blockers).toContain(
      "MALFORMED_EXTERNAL_EVIDENCE_DESCRIPTOR",
    );
  });

  it("gets evaluated HEAD from the repository resolver, not REDS_APP_VERSION", () => {
    const previous = process.env.REDS_APP_VERSION;
    process.env.REDS_APP_VERSION = alternateCommitSha;
    try {
      const executor: SafeCommandExecutor = {
        execute: () => ({
          command_id: "git_rev_parse_head",
          status: "passed",
          exit_code: 0,
          signal: null,
          diagnostic_code: "COMMAND_SUCCEEDED",
          duration_ms: 1,
          validated_output: evaluatedCommitSha,
        }),
      };
      const resolver = new GitRepositoryRevisionResolver(executor);
      expect(resolver.resolveEvaluatedRevision()).toEqual({
        evaluated_commit_sha: evaluatedCommitSha,
      });
    } finally {
      if (previous === undefined) delete process.env.REDS_APP_VERSION;
      else process.env.REDS_APP_VERSION = previous;
    }
  });

  it("keeps future hard gates closed without correctly bound evidence", async () => {
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([
        actionsDescriptor("postgresql_database", 1),
        actionsDescriptor("browser_e2e", 2),
      ]),
    });

    for (const checkId of [
      "task_028_evidence_artifact_lifecycle",
      "task_029_canonical_catalogue",
      "task_029b_semantic_dedup",
      "task_031_public_readiness",
      "task_031b_privacy_legal_readiness",
      "operational_backup_monitoring_restore",
    ] as const)
      expect(artifact.blockers).toContain(
        `${checkId.toUpperCase()}:REQUIRED_EVIDENCE_MISSING`,
      );
  });

  it("can become ready only with provider-verified, revision-bound evidence", async () => {
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope(completeDescriptors()),
    });

    expect(artifact.ready).toBe(true);
    expect(artifact.blockers).toEqual([]);
  });

  it("does not serialize provider credentials", async () => {
    const token = "vercel-sensitive-token-value";
    const { artifact } = await verifyBindAndEvaluate({
      rawEvidence: envelope([deploymentDescriptor("rollback_readiness")]),
      verifier: httpVerifier(
        Response.json({
          id: "dpl_abc123",
          name: "real-estate-decision-service",
          readyState: "READY",
          ready: Date.parse(evaluatedAt),
          gitSource: { sha: evaluatedCommitSha },
        }),
        { vercelToken: token },
      ),
    });

    expect(JSON.stringify(artifact)).not.toContain(token);
  });

  it("produces deterministic blockers and warnings for identical inputs", async () => {
    const first = await verifyBindAndEvaluate({
      rawEvidence: envelope([
        actionsDescriptor("postgresql_database", 1),
        actionsDescriptor("browser_e2e", 2),
      ]),
    });
    const second = await verifyBindAndEvaluate({
      rawEvidence: envelope([
        actionsDescriptor("postgresql_database", 1),
        actionsDescriptor("browser_e2e", 2),
      ]),
    });

    expect(second.artifact.blockers).toEqual(first.artifact.blockers);
    expect(second.artifact.warnings).toEqual(first.artifact.warnings);
  });
});
