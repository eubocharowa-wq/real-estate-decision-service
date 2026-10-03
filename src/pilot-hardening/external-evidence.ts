import { z } from "zod";

export const PILOT_RELEASE_EXTERNAL_EVIDENCE_VERSION =
  "pilot-release-external-evidence-v2" as const;
export const PILOT_RELEASE_EVIDENCE_DESCRIPTOR_VERSION =
  "pilot-release-evidence-descriptor-v1" as const;
export const PILOT_RELEASE_VERIFIED_EVIDENCE_VERSION =
  "pilot-release-verified-evidence-v2" as const;

export const REQUIRED_EXTERNAL_RELEASE_CHECK_IDS = [
  "postgresql_database",
  "browser_e2e",
  "rollback_readiness",
  "task_028_evidence_artifact_lifecycle",
  "task_029_canonical_catalogue",
  "task_029b_semantic_dedup",
  "task_031_public_readiness",
  "task_031b_privacy_legal_readiness",
  "operational_backup_monitoring_restore",
] as const;

export const OPTIONAL_EXTERNAL_RELEASE_CHECK_IDS = [
  "known_limitations",
] as const;

export type RequiredExternalReleaseCheckId =
  (typeof REQUIRED_EXTERNAL_RELEASE_CHECK_IDS)[number];
export type ExternalReleaseCheckId =
  | RequiredExternalReleaseCheckId
  | (typeof OPTIONAL_EXTERNAL_RELEASE_CHECK_IDS)[number];

const checkIdSchema = z.enum([
  ...REQUIRED_EXTERNAL_RELEASE_CHECK_IDS,
  ...OPTIONAL_EXTERNAL_RELEASE_CHECK_IDS,
]);
const repositorySchema = z
  .string()
  .max(201)
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  .refine((value) =>
    value.split("/").every((segment) => segment !== "." && segment !== ".."),
  );
const commitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);

const descriptorBase = {
  schema_version: z.literal(PILOT_RELEASE_EVIDENCE_DESCRIPTOR_VERSION),
  check_id: checkIdSchema,
};

const githubActionsRunDescriptorSchema = z
  .object({
    ...descriptorBase,
    evidence_kind: z.literal("github_actions_run"),
    repository: repositorySchema,
    run_id: z.number().int().positive(),
    job_name: z.string().min(1).max(128).optional(),
  })
  .strict();

const githubPullRequestDescriptorSchema = z
  .object({
    ...descriptorBase,
    evidence_kind: z.literal("github_pull_request"),
    repository: repositorySchema,
    pr_number: z.number().int().positive(),
  })
  .strict();

const vercelDeploymentDescriptorSchema = z
  .object({
    ...descriptorBase,
    evidence_kind: z.literal("vercel_deployment"),
    project: z.string().regex(/^[A-Za-z0-9_.-]+$/),
    deployment_id: z.string().regex(/^dpl_[A-Za-z0-9]+$/),
  })
  .strict();

const descriptorSchema = z.discriminatedUnion("evidence_kind", [
  githubActionsRunDescriptorSchema,
  githubPullRequestDescriptorSchema,
  vercelDeploymentDescriptorSchema,
]);

const descriptorEnvelopeSchema = z
  .object({
    schema_version: z.literal(PILOT_RELEASE_EXTERNAL_EVIDENCE_VERSION),
    evidence: z.array(descriptorSchema).max(32),
  })
  .strict();

export type PilotReleaseEvidenceDescriptor = z.infer<typeof descriptorSchema>;

export interface PilotReleaseEvidenceDescriptorEnvelope {
  readonly schema_version: typeof PILOT_RELEASE_EXTERNAL_EVIDENCE_VERSION;
  readonly evidence: readonly PilotReleaseEvidenceDescriptor[];
}

export type ProviderEvidenceState =
  | "success"
  | "failed"
  | "pending"
  | "cancelled"
  | "timed_out"
  | "not_found"
  | "provider_error"
  | "configuration_missing"
  | "malformed_response";

export interface ProviderEvidenceObservation {
  readonly provider_state: ProviderEvidenceState;
  readonly provider_status:
    | "completed"
    | "queued"
    | "in_progress"
    | "ready"
    | "error"
    | "cancelled"
    | "unknown";
  readonly provider_conclusion:
    | "success"
    | "failure"
    | "cancelled"
    | "timed_out"
    | "neutral"
    | "action_required"
    | "stale"
    | "skipped"
    | null;
  readonly revision: {
    readonly tested_commit_sha: string | null;
    readonly source_commit_sha: string | null;
    readonly merge_commit_sha: string | null;
  };
  readonly provider_checked_at: string;
  readonly evidence_ref: string;
}

export interface ExternalEvidenceVerifier {
  verify(
    descriptor: PilotReleaseEvidenceDescriptor,
    verifiedAt: string,
  ): Promise<ProviderEvidenceObservation>;
}

export interface VerifiedExternalEvidence {
  readonly schema_version: typeof PILOT_RELEASE_VERIFIED_EVIDENCE_VERSION;
  readonly check_id: ExternalReleaseCheckId;
  readonly evidence_kind: PilotReleaseEvidenceDescriptor["evidence_kind"];
  readonly verification_status: "pass" | "fail";
  readonly provider_state: ProviderEvidenceState;
  readonly provider_status: ProviderEvidenceObservation["provider_status"];
  readonly provider_conclusion: ProviderEvidenceObservation["provider_conclusion"];
  readonly revision: ProviderEvidenceObservation["revision"];
  readonly provider_checked_at: string;
  readonly verified_at: string;
  readonly evidence_ref: string;
}

export interface VerifiedExternalEvidenceBundle {
  readonly schema_version: "pilot-release-verified-evidence-bundle-v2";
  readonly evidence: readonly VerifiedExternalEvidence[];
  readonly errors: readonly string[];
}

const evidenceReferenceSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/:#-]{0,511}$/);

const providerObservationSchema = z
  .object({
    provider_state: z.enum([
      "success",
      "failed",
      "pending",
      "cancelled",
      "timed_out",
      "not_found",
      "provider_error",
      "configuration_missing",
      "malformed_response",
    ]),
    provider_status: z.enum([
      "completed",
      "queued",
      "in_progress",
      "ready",
      "error",
      "cancelled",
      "unknown",
    ]),
    provider_conclusion: z
      .enum([
        "success",
        "failure",
        "cancelled",
        "timed_out",
        "neutral",
        "action_required",
        "stale",
        "skipped",
      ])
      .nullable(),
    revision: z
      .object({
        tested_commit_sha: commitShaSchema.nullable(),
        source_commit_sha: commitShaSchema.nullable(),
        merge_commit_sha: commitShaSchema.nullable(),
      })
      .strict(),
    provider_checked_at: z.iso.datetime(),
    evidence_ref: evidenceReferenceSchema,
  })
  .strict();

const trustedBundles = new WeakSet<object>();

const verificationFailure = (input: {
  readonly descriptor: PilotReleaseEvidenceDescriptor;
  readonly verifiedAt: string;
  readonly state: ProviderEvidenceState;
}): ProviderEvidenceObservation => ({
  provider_state: input.state,
  provider_status: "unknown",
  provider_conclusion: null,
  revision: {
    tested_commit_sha: null,
    source_commit_sha: null,
    merge_commit_sha: null,
  },
  provider_checked_at: input.verifiedAt,
  evidence_ref: `provider-verification:${input.descriptor.evidence_kind}`,
});

export const verifyPilotReleaseEvidence = async (input: {
  readonly rawEvidence: unknown;
  readonly verifier: ExternalEvidenceVerifier;
  readonly verifiedAt: string;
}): Promise<VerifiedExternalEvidenceBundle> => {
  if (input.rawEvidence === undefined) {
    const empty: VerifiedExternalEvidenceBundle = {
      schema_version: "pilot-release-verified-evidence-bundle-v2",
      evidence: [],
      errors: [],
    };
    trustedBundles.add(empty);
    return empty;
  }
  const parsed = descriptorEnvelopeSchema.safeParse(input.rawEvidence);
  if (!parsed.success) {
    const malformed: VerifiedExternalEvidenceBundle = {
      schema_version: "pilot-release-verified-evidence-bundle-v2",
      evidence: [],
      errors: ["MALFORMED_EXTERNAL_EVIDENCE_DESCRIPTOR"],
    };
    trustedBundles.add(malformed);
    return malformed;
  }
  const duplicateIds = parsed.data.evidence
    .map((descriptor) => descriptor.check_id)
    .filter((checkId, index, values) => values.indexOf(checkId) !== index);
  if (duplicateIds.length > 0) {
    const duplicate: VerifiedExternalEvidenceBundle = {
      schema_version: "pilot-release-verified-evidence-bundle-v2",
      evidence: [],
      errors: [
        ...new Set(
          duplicateIds.map(
            (checkId) =>
              `${checkId.toUpperCase()}:DUPLICATE_EVIDENCE_DESCRIPTOR`,
          ),
        ),
      ],
    };
    trustedBundles.add(duplicate);
    return duplicate;
  }
  const verified = await Promise.all(
    parsed.data.evidence.map(async (descriptor) => {
      let observation: ProviderEvidenceObservation;
      try {
        const candidate = await input.verifier.verify(
          descriptor,
          input.verifiedAt,
        );
        const result = providerObservationSchema.safeParse(candidate);
        observation = result.success
          ? result.data
          : verificationFailure({
              descriptor,
              verifiedAt: input.verifiedAt,
              state: "malformed_response",
            });
      } catch {
        observation = verificationFailure({
          descriptor,
          verifiedAt: input.verifiedAt,
          state: "provider_error",
        });
      }
      return {
        schema_version: PILOT_RELEASE_VERIFIED_EVIDENCE_VERSION,
        check_id: descriptor.check_id,
        evidence_kind: descriptor.evidence_kind,
        verification_status:
          observation.provider_state === "success" ? "pass" : "fail",
        ...observation,
        verified_at: input.verifiedAt,
      } satisfies VerifiedExternalEvidence;
    }),
  );
  const bundle: VerifiedExternalEvidenceBundle = {
    schema_version: "pilot-release-verified-evidence-bundle-v2",
    evidence: verified,
    errors: [],
  };
  trustedBundles.add(bundle);
  return bundle;
};

export const isVerifiedExternalEvidenceBundle = (
  value: unknown,
): value is VerifiedExternalEvidenceBundle =>
  typeof value === "object" && value !== null && trustedBundles.has(value);

const githubRunSchema = z
  .object({
    id: z.number().int().positive(),
    status: z.string(),
    conclusion: z.string().nullable(),
    head_sha: commitShaSchema,
    updated_at: z.iso.datetime(),
    repository: z.object({ full_name: repositorySchema }).passthrough(),
  })
  .passthrough();

const githubJobsSchema = z
  .object({
    jobs: z.array(
      z
        .object({
          name: z.string(),
          status: z.string(),
          conclusion: z.string().nullable(),
          completed_at: z.iso.datetime().nullable(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const githubPullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    state: z.string(),
    merged: z.boolean(),
    merge_commit_sha: commitShaSchema.nullable(),
    updated_at: z.iso.datetime(),
    head: z.object({ sha: commitShaSchema }).passthrough(),
    base: z
      .object({ repo: z.object({ full_name: repositorySchema }).passthrough() })
      .passthrough(),
  })
  .passthrough();

const vercelDeploymentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    readyState: z.string().optional(),
    state: z.string().optional(),
    ready: z.number().int().nonnegative().optional(),
    createdAt: z.number().int().nonnegative().optional(),
    gitSource: z
      .object({ sha: z.string().optional() })
      .passthrough()
      .optional(),
    meta: z
      .object({ githubCommitSha: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const githubConclusion = (
  value: string | null,
): ProviderEvidenceObservation["provider_conclusion"] => {
  const allowed = [
    "success",
    "failure",
    "cancelled",
    "timed_out",
    "neutral",
    "action_required",
    "stale",
    "skipped",
  ] as const;
  return allowed.find((candidate) => candidate === value) ?? null;
};

const githubObservation = (input: {
  readonly status: string;
  readonly conclusion: string | null;
  readonly commitSha: string;
  readonly checkedAt: string;
  readonly evidenceRef: string;
}): ProviderEvidenceObservation => {
  const conclusion = githubConclusion(input.conclusion);
  const completed = input.status === "completed";
  const state: ProviderEvidenceState = !completed
    ? "pending"
    : conclusion === "success"
      ? "success"
      : conclusion === "cancelled"
        ? "cancelled"
        : conclusion === "timed_out"
          ? "timed_out"
          : "failed";
  return {
    provider_state: state,
    provider_status: completed
      ? "completed"
      : input.status === "queued"
        ? "queued"
        : "in_progress",
    provider_conclusion: conclusion,
    revision: {
      tested_commit_sha: input.commitSha,
      source_commit_sha: input.commitSha,
      merge_commit_sha: null,
    },
    provider_checked_at: input.checkedAt,
    evidence_ref: input.evidenceRef,
  };
};

export interface HttpExternalEvidenceVerifierConfig {
  readonly fetchImpl?: typeof fetch;
  readonly githubToken?: string | null;
  readonly vercelToken?: string | null;
  readonly vercelTeamId?: string | null;
}

export class HttpExternalEvidenceVerifier implements ExternalEvidenceVerifier {
  readonly #fetchImpl: typeof fetch;
  readonly #githubToken: string | null;
  readonly #vercelToken: string | null;
  readonly #vercelTeamId: string | null;

  constructor(config: HttpExternalEvidenceVerifierConfig = {}) {
    this.#fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.#githubToken = config.githubToken?.trim() || null;
    this.#vercelToken = config.vercelToken?.trim() || null;
    this.#vercelTeamId = config.vercelTeamId?.trim() || null;
  }

  async verify(
    descriptor: PilotReleaseEvidenceDescriptor,
    verifiedAt: string,
  ): Promise<ProviderEvidenceObservation> {
    if (descriptor.evidence_kind === "github_actions_run")
      return this.#verifyGitHubRun(descriptor, verifiedAt);
    if (descriptor.evidence_kind === "github_pull_request")
      return this.#verifyGitHubPullRequest(descriptor, verifiedAt);
    return this.#verifyVercelDeployment(descriptor, verifiedAt);
  }

  async #githubRequest(url: string): Promise<Response> {
    return this.#fetchImpl(url, {
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(this.#githubToken
          ? { authorization: `Bearer ${this.#githubToken}` }
          : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  }

  async #verifyGitHubRun(
    descriptor: Extract<
      PilotReleaseEvidenceDescriptor,
      { evidence_kind: "github_actions_run" }
    >,
    verifiedAt: string,
  ): Promise<ProviderEvidenceObservation> {
    const evidenceRef = `github:actions-run:${descriptor.repository}:${descriptor.run_id}`;
    const [owner, repository] = descriptor.repository.split("/");
    const repositoryPath = `${encodeURIComponent(owner!)}/${encodeURIComponent(repository!)}`;
    let response: Response;
    try {
      response = await this.#githubRequest(
        `https://api.github.com/repos/${repositoryPath}/actions/runs/${descriptor.run_id}`,
      );
    } catch {
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "provider_error",
      });
    }
    if (response.status === 404)
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "not_found",
      });
    if (!response.ok)
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "provider_error",
      });
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "malformed_response",
      });
    }
    const parsed = githubRunSchema.safeParse(raw);
    if (
      !parsed.success ||
      parsed.data.id !== descriptor.run_id ||
      parsed.data.repository.full_name !== descriptor.repository
    )
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "malformed_response",
      });
    if (!descriptor.job_name)
      return githubObservation({
        status: parsed.data.status,
        conclusion: parsed.data.conclusion,
        commitSha: parsed.data.head_sha,
        checkedAt: parsed.data.updated_at,
        evidenceRef,
      });
    let jobsResponse: Response;
    try {
      jobsResponse = await this.#githubRequest(
        `https://api.github.com/repos/${repositoryPath}/actions/runs/${descriptor.run_id}/jobs?per_page=100`,
      );
    } catch {
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "provider_error",
      });
    }
    if (!jobsResponse.ok)
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: jobsResponse.status === 404 ? "not_found" : "provider_error",
      });
    let jobsRaw: unknown;
    try {
      jobsRaw = await jobsResponse.json();
    } catch {
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "malformed_response",
      });
    }
    const jobs = githubJobsSchema.safeParse(jobsRaw);
    const job = jobs.success
      ? jobs.data.jobs.find(
          (candidate) => candidate.name === descriptor.job_name,
        )
      : null;
    if (!job)
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "not_found",
      });
    return githubObservation({
      status: job.status,
      conclusion: job.conclusion,
      commitSha: parsed.data.head_sha,
      checkedAt: job.completed_at ?? parsed.data.updated_at,
      evidenceRef: `${evidenceRef}:job`,
    });
  }

  async #verifyGitHubPullRequest(
    descriptor: Extract<
      PilotReleaseEvidenceDescriptor,
      { evidence_kind: "github_pull_request" }
    >,
    verifiedAt: string,
  ): Promise<ProviderEvidenceObservation> {
    const [owner, repository] = descriptor.repository.split("/");
    const repositoryPath = `${encodeURIComponent(owner!)}/${encodeURIComponent(repository!)}`;
    let response: Response;
    try {
      response = await this.#githubRequest(
        `https://api.github.com/repos/${repositoryPath}/pulls/${descriptor.pr_number}`,
      );
    } catch {
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "provider_error",
      });
    }
    if (response.status === 404)
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "not_found",
      });
    if (!response.ok)
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "provider_error",
      });
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "malformed_response",
      });
    }
    const parsed = githubPullRequestSchema.safeParse(raw);
    if (
      !parsed.success ||
      parsed.data.number !== descriptor.pr_number ||
      parsed.data.base.repo.full_name !== descriptor.repository
    )
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "malformed_response",
      });
    return {
      provider_state:
        parsed.data.merged && parsed.data.state === "closed"
          ? "success"
          : parsed.data.state === "open"
            ? "pending"
            : "failed",
      provider_status:
        parsed.data.state === "closed" ? "completed" : "in_progress",
      provider_conclusion: parsed.data.merged ? "success" : null,
      revision: {
        tested_commit_sha: null,
        source_commit_sha: parsed.data.head.sha,
        merge_commit_sha: parsed.data.merge_commit_sha,
      },
      provider_checked_at: parsed.data.updated_at,
      evidence_ref: `github:pull-request:${descriptor.repository}:${descriptor.pr_number}`,
    };
  }

  async #verifyVercelDeployment(
    descriptor: Extract<
      PilotReleaseEvidenceDescriptor,
      { evidence_kind: "vercel_deployment" }
    >,
    verifiedAt: string,
  ): Promise<ProviderEvidenceObservation> {
    if (!this.#vercelToken)
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "configuration_missing",
      });
    const url = new URL(
      `https://api.vercel.com/v13/deployments/${descriptor.deployment_id}`,
    );
    if (this.#vercelTeamId) url.searchParams.set("teamId", this.#vercelTeamId);
    let response: Response;
    try {
      response = await this.#fetchImpl(url, {
        headers: { authorization: `Bearer ${this.#vercelToken}` },
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "provider_error",
      });
    }
    if (response.status === 404)
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "not_found",
      });
    if (!response.ok)
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "provider_error",
      });
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "malformed_response",
      });
    }
    const parsed = vercelDeploymentSchema.safeParse(raw);
    if (
      !parsed.success ||
      parsed.data.id !== descriptor.deployment_id ||
      parsed.data.name !== descriptor.project
    )
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "malformed_response",
      });
    const rawSha =
      parsed.data.gitSource?.sha ?? parsed.data.meta?.githubCommitSha ?? null;
    if (rawSha !== null && !commitShaSchema.safeParse(rawSha).success)
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "malformed_response",
      });
    const providerState = parsed.data.readyState ?? parsed.data.state ?? "";
    const checkedAtMs = parsed.data.ready ?? parsed.data.createdAt;
    if (checkedAtMs === undefined || checkedAtMs > 8_640_000_000_000_000)
      return verificationFailure({
        descriptor,
        verifiedAt,
        state: "malformed_response",
      });
    const normalized = providerState.toUpperCase();
    const state: ProviderEvidenceState =
      normalized === "READY"
        ? "success"
        : normalized === "ERROR"
          ? "failed"
          : normalized === "CANCELED" || normalized === "CANCELLED"
            ? "cancelled"
            : "pending";
    return {
      provider_state: state,
      provider_status:
        state === "success"
          ? "ready"
          : state === "failed"
            ? "error"
            : state === "cancelled"
              ? "cancelled"
              : "in_progress",
      provider_conclusion:
        state === "success"
          ? "success"
          : state === "failed"
            ? "failure"
            : state === "cancelled"
              ? "cancelled"
              : null,
      revision: {
        tested_commit_sha: null,
        source_commit_sha: rawSha,
        merge_commit_sha: null,
      },
      provider_checked_at: new Date(checkedAtMs).toISOString(),
      evidence_ref: `vercel:deployment:${descriptor.project}:${descriptor.deployment_id}`,
    };
  }
}
