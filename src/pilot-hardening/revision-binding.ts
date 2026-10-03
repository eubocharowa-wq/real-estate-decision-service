import {
  isVerifiedExternalEvidenceBundle,
  type ExternalReleaseCheckId,
  type PilotReleaseEvidenceDescriptor,
  type VerifiedExternalEvidence,
} from "./external-evidence";
import {
  NodeSafeCommandExecutor,
  type SafeCommandExecutor,
} from "./safe-command";

export const PILOT_RELEASE_REVISION_BINDING_VERSION =
  "pilot-release-revision-binding-v1" as const;
export const PILOT_RELEASE_BOUND_EVIDENCE_BUNDLE_VERSION =
  "pilot-release-bound-evidence-bundle-v1" as const;

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

export interface EvaluatedRevision {
  readonly evaluated_commit_sha: string;
}

export type RevisionBindingRelation =
  | "exact_tested_commit"
  | "exact_source_commit"
  | "merged_commit_exact"
  | "merged_commit_ancestor"
  | "commit_mismatch"
  | "merge_commit_not_ancestor"
  | "missing_provider_revision"
  | "evidence_kind_not_allowed"
  | "provider_evidence_unverified"
  | "ancestry_unverifiable";

export interface RevisionBindingResult {
  readonly schema_version: typeof PILOT_RELEASE_REVISION_BINDING_VERSION;
  readonly relation: RevisionBindingRelation;
  readonly valid: boolean;
  readonly diagnostic_code:
    | "COMMIT_BINDING_EXACT"
    | "COMMIT_BINDING_ANCESTOR"
    | "COMMIT_BINDING_MISMATCH"
    | "COMMIT_BINDING_MISSING"
    | "EVIDENCE_KIND_NOT_ALLOWED"
    | "PROVIDER_VERIFICATION_FAILED"
    | "ANCESTRY_VERIFICATION_FAILED";
}

export interface RevisionBoundExternalEvidence extends VerifiedExternalEvidence {
  readonly revision_binding: RevisionBindingResult;
}

export interface RevisionBoundExternalEvidenceBundle {
  readonly schema_version: typeof PILOT_RELEASE_BOUND_EVIDENCE_BUNDLE_VERSION;
  readonly evaluated_revision: EvaluatedRevision;
  readonly evidence: readonly RevisionBoundExternalEvidence[];
  readonly errors: readonly string[];
}

export interface RepositoryRevisionResolver {
  resolveEvaluatedRevision(): EvaluatedRevision;
}

export interface GitAncestryVerifier {
  isAncestor(
    ancestorCommitSha: string,
    descendantCommitSha: string,
  ): Promise<boolean>;
}

export class GitRepositoryRevisionResolver implements RepositoryRevisionResolver {
  readonly #executor: SafeCommandExecutor;

  constructor(executor: SafeCommandExecutor = new NodeSafeCommandExecutor()) {
    this.#executor = executor;
  }

  resolveEvaluatedRevision(): EvaluatedRevision {
    const result = this.#executor.execute({
      command_id: "git_rev_parse_head",
      command: "git",
      args: ["rev-parse", "HEAD"],
      cwd: process.cwd(),
      timeout_ms: 10_000,
      max_output_bytes: 1024,
      validate_stdout: (stdout) => {
        const commitSha = stdout.trim();
        if (!COMMIT_SHA_PATTERN.test(commitSha))
          throw new Error("INVALID_GIT_SHA");
        return commitSha;
      },
    });
    if (
      result.status !== "passed" ||
      typeof result.validated_output !== "string" ||
      !COMMIT_SHA_PATTERN.test(result.validated_output)
    )
      throw new Error("REPOSITORY_HEAD_UNAVAILABLE");
    return { evaluated_commit_sha: result.validated_output };
  }
}

export class LocalGitAncestryVerifier implements GitAncestryVerifier {
  readonly #executor: SafeCommandExecutor;

  constructor(executor: SafeCommandExecutor = new NodeSafeCommandExecutor()) {
    this.#executor = executor;
  }

  async isAncestor(
    ancestorCommitSha: string,
    descendantCommitSha: string,
  ): Promise<boolean> {
    if (
      !COMMIT_SHA_PATTERN.test(ancestorCommitSha) ||
      !COMMIT_SHA_PATTERN.test(descendantCommitSha)
    )
      throw new Error("INVALID_COMMIT_SHA");
    const result = this.#executor.execute({
      command_id: "git_merge_base_is_ancestor",
      command: "git",
      args: [
        "merge-base",
        "--is-ancestor",
        ancestorCommitSha,
        descendantCommitSha,
      ],
      cwd: process.cwd(),
      timeout_ms: 10_000,
      max_output_bytes: 1024,
    });
    if (result.exit_code === 0 && result.status === "passed") return true;
    if (result.exit_code === 1 && result.status === "failed") return false;
    throw new Error("GIT_ANCESTRY_UNAVAILABLE");
  }
}

type RevisionBindingMode =
  "exact_tested_commit" | "exact_source_commit" | "merged_pr_ancestor";

interface CheckBindingPolicy {
  readonly evidence_kind: PilotReleaseEvidenceDescriptor["evidence_kind"];
  readonly mode: RevisionBindingMode;
}

export const PILOT_RELEASE_CHECK_BINDING_POLICIES: Readonly<
  Record<ExternalReleaseCheckId, CheckBindingPolicy>
> = {
  postgresql_database: {
    evidence_kind: "github_actions_run",
    mode: "exact_tested_commit",
  },
  browser_e2e: {
    evidence_kind: "github_actions_run",
    mode: "exact_tested_commit",
  },
  rollback_readiness: {
    evidence_kind: "vercel_deployment",
    mode: "exact_source_commit",
  },
  task_028_evidence_artifact_lifecycle: {
    evidence_kind: "github_pull_request",
    mode: "merged_pr_ancestor",
  },
  task_029_canonical_catalogue: {
    evidence_kind: "github_pull_request",
    mode: "merged_pr_ancestor",
  },
  task_029b_semantic_dedup: {
    evidence_kind: "github_pull_request",
    mode: "merged_pr_ancestor",
  },
  task_031_public_readiness: {
    evidence_kind: "github_pull_request",
    mode: "merged_pr_ancestor",
  },
  task_031b_privacy_legal_readiness: {
    evidence_kind: "github_pull_request",
    mode: "merged_pr_ancestor",
  },
  operational_backup_monitoring_restore: {
    evidence_kind: "github_actions_run",
    mode: "exact_tested_commit",
  },
  known_limitations: {
    evidence_kind: "github_pull_request",
    mode: "merged_pr_ancestor",
  },
};

const bindingResult = (
  relation: RevisionBindingRelation,
  valid: boolean,
  diagnosticCode: RevisionBindingResult["diagnostic_code"],
): RevisionBindingResult => ({
  schema_version: PILOT_RELEASE_REVISION_BINDING_VERSION,
  relation,
  valid,
  diagnostic_code: diagnosticCode,
});

const exactBinding = (
  actualCommitSha: string | null,
  evaluatedCommitSha: string,
  exactRelation: "exact_tested_commit" | "exact_source_commit",
): RevisionBindingResult => {
  if (!actualCommitSha)
    return bindingResult(
      "missing_provider_revision",
      false,
      "COMMIT_BINDING_MISSING",
    );
  if (actualCommitSha !== evaluatedCommitSha)
    return bindingResult("commit_mismatch", false, "COMMIT_BINDING_MISMATCH");
  return bindingResult(exactRelation, true, "COMMIT_BINDING_EXACT");
};

const bindEvidence = async (input: {
  readonly evidence: VerifiedExternalEvidence;
  readonly evaluatedRevision: EvaluatedRevision;
  readonly ancestryVerifier: GitAncestryVerifier;
}): Promise<RevisionBindingResult> => {
  const policy = PILOT_RELEASE_CHECK_BINDING_POLICIES[input.evidence.check_id];
  if (input.evidence.evidence_kind !== policy.evidence_kind)
    return bindingResult(
      "evidence_kind_not_allowed",
      false,
      "EVIDENCE_KIND_NOT_ALLOWED",
    );
  if (input.evidence.verification_status !== "pass")
    return bindingResult(
      "provider_evidence_unverified",
      false,
      "PROVIDER_VERIFICATION_FAILED",
    );
  if (policy.mode === "exact_tested_commit")
    return exactBinding(
      input.evidence.revision.tested_commit_sha,
      input.evaluatedRevision.evaluated_commit_sha,
      "exact_tested_commit",
    );
  if (policy.mode === "exact_source_commit")
    return exactBinding(
      input.evidence.revision.source_commit_sha,
      input.evaluatedRevision.evaluated_commit_sha,
      "exact_source_commit",
    );
  const mergeCommitSha = input.evidence.revision.merge_commit_sha;
  if (!mergeCommitSha)
    return bindingResult(
      "missing_provider_revision",
      false,
      "COMMIT_BINDING_MISSING",
    );
  if (mergeCommitSha === input.evaluatedRevision.evaluated_commit_sha)
    return bindingResult("merged_commit_exact", true, "COMMIT_BINDING_EXACT");
  try {
    const isAncestor = await input.ancestryVerifier.isAncestor(
      mergeCommitSha,
      input.evaluatedRevision.evaluated_commit_sha,
    );
    return isAncestor
      ? bindingResult("merged_commit_ancestor", true, "COMMIT_BINDING_ANCESTOR")
      : bindingResult(
          "merge_commit_not_ancestor",
          false,
          "COMMIT_BINDING_MISMATCH",
        );
  } catch {
    return bindingResult(
      "ancestry_unverifiable",
      false,
      "ANCESTRY_VERIFICATION_FAILED",
    );
  }
};

const trustedBoundBundles = new WeakSet<object>();

export const bindVerifiedEvidenceToRevision = async (input: {
  readonly verifiedEvidence: unknown;
  readonly evaluatedRevision: EvaluatedRevision;
  readonly ancestryVerifier: GitAncestryVerifier;
}): Promise<RevisionBoundExternalEvidenceBundle> => {
  if (
    !COMMIT_SHA_PATTERN.test(input.evaluatedRevision.evaluated_commit_sha) ||
    !isVerifiedExternalEvidenceBundle(input.verifiedEvidence)
  ) {
    const invalid: RevisionBoundExternalEvidenceBundle = {
      schema_version: PILOT_RELEASE_BOUND_EVIDENCE_BUNDLE_VERSION,
      evaluated_revision: input.evaluatedRevision,
      evidence: [],
      errors: ["UNVERIFIED_OR_INVALID_REVISION_EVIDENCE"],
    };
    trustedBoundBundles.add(invalid);
    return invalid;
  }
  const evidence = await Promise.all(
    input.verifiedEvidence.evidence.map(async (verified) => ({
      ...verified,
      revision_binding: await bindEvidence({
        evidence: verified,
        evaluatedRevision: input.evaluatedRevision,
        ancestryVerifier: input.ancestryVerifier,
      }),
    })),
  );
  const bundle: RevisionBoundExternalEvidenceBundle = {
    schema_version: PILOT_RELEASE_BOUND_EVIDENCE_BUNDLE_VERSION,
    evaluated_revision: input.evaluatedRevision,
    evidence,
    errors: input.verifiedEvidence.errors,
  };
  trustedBoundBundles.add(bundle);
  return bundle;
};

export const isRevisionBoundExternalEvidenceBundle = (
  value: unknown,
): value is RevisionBoundExternalEvidenceBundle =>
  typeof value === "object" && value !== null && trustedBoundBundles.has(value);
