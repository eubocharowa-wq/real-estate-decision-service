#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  buildRepositoryRealPilotManifest,
  bindVerifiedEvidenceToRevision,
  evaluateAllPilotSources,
  evaluateOperationalPilotReleaseGate,
  GitRepositoryRevisionResolver,
  HttpExternalEvidenceVerifier,
  LocalGitAncestryVerifier,
  NodeSafeCommandExecutor,
  formatSafeCommandSummary,
  pilotReleaseGateExitCode,
  verifyPilotReleaseEvidence,
  type RepositoryReleaseCheckId,
  type RepositoryReleaseCheckResult,
  type SafeCommandExecutor,
} from "../src/pilot-hardening";

const DEFAULT_OUTPUT = "artifacts/pilot-release-gate.json";

const parseArguments = (): {
  readonly evidencePath: string | null;
  readonly outputPath: string;
} => {
  const args = process.argv.slice(2);
  let evidencePath: string | null = null;
  let outputPath = DEFAULT_OUTPUT;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--evidence" && value) {
      evidencePath = value;
      index += 1;
    } else if (argument === "--output" && value) {
      outputPath = value;
      index += 1;
    } else {
      throw new Error(
        "Usage: pilot:release-gate [--evidence <json>] [--output <json>]",
      );
    }
  }
  return { evidencePath, outputPath };
};

const commandCheck = (
  executor: SafeCommandExecutor,
  checkId: RepositoryReleaseCheckId,
  command: string,
  args: readonly string[],
  evidenceRef: string,
): RepositoryReleaseCheckResult => {
  const result = executor.execute({
    command_id: checkId,
    command,
    args,
    cwd: process.cwd(),
    timeout_ms: 10 * 60 * 1_000,
    max_output_bytes: 1024 * 1024,
  });
  console.log(`[release-gate] ${formatSafeCommandSummary(result)}`);
  return {
    check_id: checkId,
    passed: result.status === "passed",
    evidence_ref: evidenceRef,
    diagnostic_code: result.diagnostic_code,
    exit_code: result.exit_code,
  };
};

const repositoryCleanCheck = (
  executor: SafeCommandExecutor,
): RepositoryReleaseCheckResult => {
  const result = executor.execute({
    command_id: "repository_clean",
    command: "git",
    args: ["status", "--porcelain", "--untracked-files=all"],
    cwd: process.cwd(),
    timeout_ms: 10_000,
    max_output_bytes: 1024 * 1024,
    validate_stdout: (stdout) => stdout.trim().length === 0,
  });
  const clean = result.status === "passed" && result.validated_output === true;
  const diagnosticCode =
    result.status !== "passed"
      ? result.diagnostic_code
      : clean
        ? "REPOSITORY_CLEAN"
        : "REPOSITORY_DIRTY";
  console.log(
    `[release-gate] repository_clean: ${clean ? "passed" : "failed"} (${diagnosticCode}, exit=${result.exit_code ?? "none"})`,
  );
  return {
    check_id: "repository_clean",
    passed: clean,
    evidence_ref: "git:status-porcelain",
    diagnostic_code: diagnosticCode,
    exit_code: result.exit_code,
  };
};

const SECRET_DETECTORS: readonly {
  readonly id: string;
  readonly pattern: RegExp;
}[] = [
  {
    id: "PRIVATE_KEY",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    id: "GITHUB_TOKEN",
    pattern: /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/,
  },
  { id: "OPENAI_KEY", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { id: "NEON_PASSWORD", pattern: /\bnpg_[A-Za-z0-9]{10,}\b/ },
];

const secretsCheck = (
  executor: SafeCommandExecutor,
): RepositoryReleaseCheckResult => {
  const filesResult = executor.execute({
    command_id: "git_tracked_files",
    command: "git",
    args: ["ls-files", "-z"],
    cwd: process.cwd(),
    timeout_ms: 10_000,
    max_output_bytes: 16 * 1024 * 1024,
    validate_stdout: (stdout) =>
      stdout
        .split("\0")
        .filter(Boolean)
        .map((file) => {
          if (path.isAbsolute(file) || file.includes(".."))
            throw new Error("INVALID_TRACKED_PATH");
          return file;
        }),
  });
  if (
    filesResult.status !== "passed" ||
    !Array.isArray(filesResult.validated_output) ||
    !filesResult.validated_output.every((file) => typeof file === "string")
  )
    return {
      check_id: "secrets",
      passed: false,
      evidence_ref: "repository-scan:tracked-files-high-confidence",
      diagnostic_code: filesResult.diagnostic_code,
      exit_code: filesResult.exit_code,
    };
  try {
    const tracked = filesResult.validated_output;
    const detected = tracked.some((file) => {
      let content: Buffer;
      try {
        content = readFileSync(path.resolve(process.cwd(), file));
      } catch {
        return true;
      }
      if (content.includes(0)) return false;
      const text = content.toString("utf8");
      return SECRET_DETECTORS.some(({ pattern }) => pattern.test(text));
    });
    return {
      check_id: "secrets",
      passed: !detected,
      evidence_ref: "repository-scan:tracked-files-high-confidence",
      diagnostic_code: detected ? "SECRETS_DETECTED" : "SECRETS_SCAN_PASSED",
      exit_code: filesResult.exit_code,
    };
  } catch {
    return {
      check_id: "secrets",
      passed: false,
      evidence_ref: "repository-scan:tracked-files-high-confidence",
      diagnostic_code: "SECRETS_SCAN_FAILED",
      exit_code: filesResult.exit_code,
    };
  }
};

const readExternalEvidence = (file: string | null): unknown => {
  if (!file) return undefined;
  try {
    return JSON.parse(readFileSync(path.resolve(process.cwd(), file), "utf8"));
  } catch {
    return { schema_version: "invalid", evidence: [] };
  }
};

const assertSafeArtifact = (serialized: string): void => {
  const forbidden = [
    /DATABASE_URL\s*=/i,
    /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i,
    /VERCEL_AUTOMATION_BYPASS_SECRET\s*=/i,
    /_vercel_jwt\s*=/i,
    /\bBearer\s+[A-Za-z0-9._-]+/i,
    /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\bnpg_[A-Za-z0-9]{10,}\b/,
  ];
  if (forbidden.some((pattern) => pattern.test(serialized)))
    throw new Error("Refusing to write sensitive release-gate artifact");
};

const main = async (): Promise<void> => {
  const options = parseArguments();
  const commandExecutor = new NodeSafeCommandExecutor();
  const evaluatedRevision = new GitRepositoryRevisionResolver(
    commandExecutor,
  ).resolveEvaluatedRevision();
  const commitSha = evaluatedRevision.evaluated_commit_sha;
  const checks: RepositoryReleaseCheckResult[] = [
    repositoryCleanCheck(commandExecutor),
    commandCheck(
      commandExecutor,
      "typecheck",
      "npm",
      ["run", "typecheck"],
      "package.json#scripts.typecheck",
    ),
    commandCheck(
      commandExecutor,
      "lint",
      "npm",
      ["run", "lint"],
      "package.json#scripts.lint",
    ),
    commandCheck(
      commandExecutor,
      "core_regressions",
      "npm",
      ["test"],
      "package.json#scripts.test",
    ),
    commandCheck(
      commandExecutor,
      "pilot_regressions",
      "npm",
      ["run", "test:pilot"],
      "package.json#scripts.test:pilot",
    ),
    commandCheck(
      commandExecutor,
      "dependency_security",
      "npm",
      ["audit", "--omit=dev", "--audit-level=high"],
      "npm-audit:production-high",
    ),
    secretsCheck(commandExecutor),
    commandCheck(
      commandExecutor,
      "build",
      "npm",
      ["run", "build"],
      "package.json#scripts.build",
    ),
  ];
  const evaluatedAt = new Date().toISOString();
  const verifiedExternalEvidence = await verifyPilotReleaseEvidence({
    rawEvidence: readExternalEvidence(options.evidencePath),
    verifier: new HttpExternalEvidenceVerifier({
      githubToken: process.env.GITHUB_TOKEN ?? null,
      vercelToken: process.env.VERCEL_TOKEN ?? null,
      vercelTeamId: process.env.VERCEL_TEAM_ID ?? null,
    }),
    verifiedAt: evaluatedAt,
  });
  const revisionBoundExternalEvidence = await bindVerifiedEvidenceToRevision({
    verifiedEvidence: verifiedExternalEvidence,
    evaluatedRevision,
    ancestryVerifier: new LocalGitAncestryVerifier(commandExecutor),
  });
  const artifact = evaluateOperationalPilotReleaseGate({
    commitSha,
    evaluatedAt,
    repositoryChecks: checks,
    revisionBoundExternalEvidence,
    sourceReadiness: evaluateAllPilotSources(),
    realPilotDatasetManifest: buildRepositoryRealPilotManifest(),
  });
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  assertSafeArtifact(serialized);
  const output = path.resolve(process.cwd(), options.outputPath);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, serialized, { encoding: "utf8", mode: 0o600 });
  console.log(
    `\n[release-gate] artifact: ${path.relative(process.cwd(), output)}`,
  );
  console.log(`[release-gate] ready: ${artifact.ready}`);
  console.log(
    `[release-gate] blockers: ${artifact.blockers.length > 0 ? artifact.blockers.join(",") : "none"}`,
  );
  console.log(
    `[release-gate] warnings: ${artifact.warnings.length > 0 ? artifact.warnings.join(",") : "none"}`,
  );
  process.exitCode = pilotReleaseGateExitCode(artifact);
};

void main().catch((error: unknown) => {
  console.error(
    `[release-gate] ${error instanceof Error ? error.message : "unexpected failure"}`,
  );
  process.exitCode = 1;
});
