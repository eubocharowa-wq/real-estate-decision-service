import { describe, expect, it, vi } from "vitest";

import {
  GitRepositoryRevisionResolver,
  LocalGitAncestryVerifier,
  NodeSafeCommandExecutor,
  REAL_BUYER_PILOT_DATASET_MANIFEST_V1,
  REPOSITORY_RELEASE_CHECK_IDS,
  evaluateOperationalPilotReleaseGate,
  formatSafeCommandSummary,
  pilotReleaseGateExitCode,
  type RepositoryReleaseCheckResult,
} from "../../src/pilot-hardening";

const evaluatedCommitSha = "a".repeat(40);
const evaluatedAt = "2026-09-28T12:00:00.000Z";

const nodeCommand = (source: string) => ({
  command_id: "sentinel_command",
  command: process.execPath,
  args: ["-e", source],
  cwd: process.cwd(),
  timeout_ms: 5_000,
  max_output_bytes: 64 * 1024,
});

describe("TASK-027C safe subprocess boundary", () => {
  it.each([
    ["stdout", "SENSITIVE_STDOUT_SENTINEL"],
    ["stderr", "SENSITIVE_STDERR_SENTINEL"],
  ] as const)("does not expose failing command %s", (stream, sentinel) => {
    const executor = new NodeSafeCommandExecutor();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = executor.execute(
      nodeCommand(
        `process.${stream}.write(${JSON.stringify(sentinel)}); process.exit(7);`,
      ),
    );
    const publicOutput = JSON.stringify({
      result,
      summary: formatSafeCommandSummary(result),
    });

    expect(result).toMatchObject({
      status: "failed",
      exit_code: 7,
      diagnostic_code: "COMMAND_FAILED",
    });
    expect(publicOutput).not.toContain(sentinel);
    expect(result).not.toHaveProperty("stdout");
    expect(result).not.toHaveProperty("stderr");
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("does not expose credential-shaped child output", () => {
    const sensitiveOutput = [
      "OPENAI_API_KEY=sk-sentinel-not-real",
      "DATABASE_URL=postgres://sentinel:sentinel@example.invalid/db",
      "Authorization: Bearer sentinel-token",
      "REDS_OPENCLAW_GATEWAY_TOKEN=sentinel",
      "VERCEL_AUTOMATION_BYPASS_SECRET=sentinel",
    ].join("\n");
    const result = new NodeSafeCommandExecutor().execute(
      nodeCommand(
        `process.stdout.write(${JSON.stringify(sensitiveOutput)}); process.exit(2);`,
      ),
    );
    const serialized = JSON.stringify(result);

    for (const line of sensitiveOutput.split("\n"))
      expect(serialized).not.toContain(line);
  });

  it("does not expose stdout from a successful command", () => {
    const sentinel = "SUCCESS_STDOUT_SENTINEL";
    const result = new NodeSafeCommandExecutor().execute(
      nodeCommand(`process.stdout.write(${JSON.stringify(sentinel)});`),
    );

    expect(result.status).toBe("passed");
    expect(JSON.stringify(result)).not.toContain(sentinel);
  });

  it("returns a fixed timeout diagnostic without captured output", () => {
    const sentinel = "TIMEOUT_OUTPUT_SENTINEL";
    const result = new NodeSafeCommandExecutor().execute({
      ...nodeCommand(
        `process.stderr.write(${JSON.stringify(sentinel)}); setTimeout(() => {}, 1000);`,
      ),
      timeout_ms: 20,
    });

    expect(result.diagnostic_code).toBe("COMMAND_TIMEOUT");
    expect(result.status).toBe("timed_out");
    expect(JSON.stringify(result)).not.toContain(sentinel);
  });

  it("fails safely when captured output exceeds the bound", () => {
    const result = new NodeSafeCommandExecutor().execute({
      ...nodeCommand(`process.stdout.write("X".repeat(100000));`),
      max_output_bytes: 256,
    });

    expect(result.diagnostic_code).toBe("COMMAND_OUTPUT_LIMIT_EXCEEDED");
    expect(result.status).toBe("output_limit_exceeded");
    expect(JSON.stringify(result)).not.toContain("X".repeat(100));
  });

  it("fails closed on malformed git rev-parse output", () => {
    const sentinel = "MALFORMED_GIT_SHA_SENTINEL";
    const executor = new NodeSafeCommandExecutor(() => ({
      status: 0,
      signal: null,
      stdout: sentinel,
      stderr: "",
    }));
    const resolver = new GitRepositoryRevisionResolver(executor);

    expect(() => resolver.resolveEvaluatedRevision()).toThrow(
      "REPOSITORY_HEAD_UNAVAILABLE",
    );
    try {
      resolver.resolveEvaluatedRevision();
    } catch (error) {
      expect(String(error)).not.toContain(sentinel);
    }
  });

  it("fails merge-base safely without exposing stderr", async () => {
    const sentinel = "MERGE_BASE_STDERR_SENTINEL";
    const executor = new NodeSafeCommandExecutor(() => ({
      status: 2,
      signal: null,
      stdout: "",
      stderr: sentinel,
    }));
    const verifier = new LocalGitAncestryVerifier(executor);

    await expect(
      verifier.isAncestor("a".repeat(40), "b".repeat(40)),
    ).rejects.toThrow("GIT_ANCESTRY_UNAVAILABLE");
    try {
      await verifier.isAncestor("a".repeat(40), "b".repeat(40));
    } catch (error) {
      expect(String(error)).not.toContain(sentinel);
    }
  });

  it("turns a repository command failure into a fixed gate blocker", () => {
    const checks: RepositoryReleaseCheckResult[] =
      REPOSITORY_RELEASE_CHECK_IDS.map((checkId) => ({
        check_id: checkId,
        passed: checkId !== "build",
        evidence_ref: `repository-check:${checkId}`,
        diagnostic_code:
          checkId === "build" ? "COMMAND_FAILED" : "COMMAND_SUCCEEDED",
        exit_code: checkId === "build" ? 1 : 0,
      }));
    const artifact = evaluateOperationalPilotReleaseGate({
      commitSha: evaluatedCommitSha,
      evaluatedAt,
      repositoryChecks: checks,
      sourceReadiness: [],
      realPilotDatasetManifest: REAL_BUYER_PILOT_DATASET_MANIFEST_V1,
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.blockers).toContain("FAILING_BUILD");
    expect(pilotReleaseGateExitCode(artifact)).toBe(1);
  });

  it("keeps sentinels and credential-shaped values out of the artifact", () => {
    const sentinels = [
      "SENSITIVE_STDOUT_SENTINEL",
      "SENSITIVE_STDERR_SENTINEL",
      "Authorization: Bearer sentinel-token",
      "DATABASE_URL=postgres://sentinel@example.invalid/db",
    ];
    const checks: RepositoryReleaseCheckResult[] =
      REPOSITORY_RELEASE_CHECK_IDS.map((checkId) => ({
        check_id: checkId,
        passed: false,
        evidence_ref: `repository-check:${checkId}`,
        diagnostic_code: "COMMAND_FAILED",
        exit_code: 1,
      }));
    const serialized = JSON.stringify(
      evaluateOperationalPilotReleaseGate({
        commitSha: evaluatedCommitSha,
        evaluatedAt,
        repositoryChecks: checks,
        sourceReadiness: [],
        realPilotDatasetManifest: REAL_BUYER_PILOT_DATASET_MANIFEST_V1,
      }),
    );

    for (const sentinel of sentinels)
      expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain("stdout");
    expect(serialized).not.toContain("stderr");
    expect(serialized).not.toContain("environment");
  });
});
