import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
} from "node:child_process";

export type SafeCommandDiagnosticCode =
  | "COMMAND_SUCCEEDED"
  | "COMMAND_FAILED"
  | "COMMAND_TIMEOUT"
  | "COMMAND_OUTPUT_LIMIT_EXCEEDED"
  | "COMMAND_OUTPUT_INVALID"
  | "COMMAND_EXECUTION_ERROR";

export interface SafeCommandRequest {
  readonly command_id: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeout_ms?: number;
  readonly max_output_bytes?: number;
  readonly validate_stdout?: (capturedStdout: string) => unknown;
}

export interface SafeCommandExecutionResult {
  readonly command_id: string;
  readonly status: "passed" | "failed" | "timed_out" | "output_limit_exceeded";
  readonly exit_code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly diagnostic_code: SafeCommandDiagnosticCode;
  readonly duration_ms: number;
  readonly validated_output?: unknown;
}

export interface SafeCommandExecutor {
  execute(request: SafeCommandRequest): SafeCommandExecutionResult;
}

interface SafeSpawnResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error & { readonly code?: string };
}

type SafeSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => SafeSpawnResult;

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const SAFE_COMMAND_ID_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

const safeDuration = (startedAt: number): number =>
  Math.max(0, Date.now() - startedAt);

export class NodeSafeCommandExecutor implements SafeCommandExecutor {
  readonly #spawn: SafeSpawn;

  constructor(spawn: SafeSpawn = spawnSync) {
    this.#spawn = spawn;
  }

  execute(request: SafeCommandRequest): SafeCommandExecutionResult {
    const startedAt = Date.now();
    if (!SAFE_COMMAND_ID_PATTERN.test(request.command_id))
      return {
        command_id: "invalid_command",
        status: "failed",
        exit_code: null,
        signal: null,
        diagnostic_code: "COMMAND_EXECUTION_ERROR",
        duration_ms: safeDuration(startedAt),
      };
    const timeout = request.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    const maxBuffer = request.max_output_bytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    let child: SafeSpawnResult;
    try {
      child = this.#spawn(request.command, request.args, {
        cwd: request.cwd,
        env: process.env,
        encoding: "utf8",
        maxBuffer,
        timeout,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      return {
        command_id: request.command_id,
        status: "failed",
        exit_code: null,
        signal: null,
        diagnostic_code: "COMMAND_EXECUTION_ERROR",
        duration_ms: safeDuration(startedAt),
      };
    }
    const duration = safeDuration(startedAt);
    if (child.error?.code === "ETIMEDOUT")
      return {
        command_id: request.command_id,
        status: "timed_out",
        exit_code: child.status,
        signal: child.signal,
        diagnostic_code: "COMMAND_TIMEOUT",
        duration_ms: duration,
      };
    if (child.error?.code === "ENOBUFS")
      return {
        command_id: request.command_id,
        status: "output_limit_exceeded",
        exit_code: child.status,
        signal: child.signal,
        diagnostic_code: "COMMAND_OUTPUT_LIMIT_EXCEEDED",
        duration_ms: duration,
      };
    if (child.error)
      return {
        command_id: request.command_id,
        status: "failed",
        exit_code: child.status,
        signal: child.signal,
        diagnostic_code: "COMMAND_EXECUTION_ERROR",
        duration_ms: duration,
      };
    if (child.status !== 0)
      return {
        command_id: request.command_id,
        status: "failed",
        exit_code: child.status,
        signal: child.signal,
        diagnostic_code: "COMMAND_FAILED",
        duration_ms: duration,
      };
    if (!request.validate_stdout)
      return {
        command_id: request.command_id,
        status: "passed",
        exit_code: 0,
        signal: child.signal,
        diagnostic_code: "COMMAND_SUCCEEDED",
        duration_ms: duration,
      };
    try {
      return {
        command_id: request.command_id,
        status: "passed",
        exit_code: 0,
        signal: child.signal,
        diagnostic_code: "COMMAND_SUCCEEDED",
        duration_ms: duration,
        validated_output: request.validate_stdout(child.stdout),
      };
    } catch {
      return {
        command_id: request.command_id,
        status: "failed",
        exit_code: 0,
        signal: child.signal,
        diagnostic_code: "COMMAND_OUTPUT_INVALID",
        duration_ms: duration,
      };
    }
  }
}

export const formatSafeCommandSummary = (
  result: SafeCommandExecutionResult,
): string =>
  `${result.command_id}: ${result.status} (${result.diagnostic_code}, exit=${result.exit_code ?? "none"})`;
