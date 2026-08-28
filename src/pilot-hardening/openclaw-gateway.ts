import type { CollectionPlan } from "../data-collection/source-registry";
import type {
  OpenClawCollectionRequest,
  OpenClawExecutor,
  OpenClawStagedResult,
} from "./contracts";
import {
  OPENCLAW_STAGED_RESULT_SCHEMA_VERSION,
  parseOpenClawStagedResult,
} from "./openclaw-validation";

export const OPENCLAW_GATEWAY_REQUEST_SCHEMA_VERSION =
  "openclaw-gateway-request-v1" as const;
export const REAL_ESTATE_COLLECTOR_SKILL = Object.freeze({
  name: "real-estate-collector",
  version: "real-estate-collector-v1",
});

export const OPENCLAW_GATEWAY_RUNTIME_POLICY_V1 = Object.freeze({
  minTimeoutMs: 100,
  maxTimeoutMs: 60_000,
  minCompletionTokens: 64,
  maxCompletionTokens: 4_096,
  maxResponseBytes: 1_000_000,
  maxHeaderValueChars: 4_096,
});

export type OpenClawGatewayFailureCode =
  | "COLLECTION_PLAN_DENIED"
  | "GATEWAY_ENDPOINT_DISABLED"
  | "GATEWAY_AUTH_DENIED"
  | "GATEWAY_REQUEST_REJECTED"
  | "GATEWAY_REDIRECT_BLOCKED"
  | "GATEWAY_AGENT_MODEL_MISMATCH"
  | "GATEWAY_TIMEOUT"
  | "GATEWAY_TRANSPORT_ERROR"
  | "MALFORMED_GATEWAY_RESPONSE";

export class OpenClawGatewayExecutionError extends Error {
  constructor(
    readonly code: OpenClawGatewayFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "OpenClawGatewayExecutionError";
  }
}

export interface OpenClawGatewayConfig {
  readonly endpoint: string;
  readonly agentId: string;
  readonly backendModelOverride: string | null;
  /** Full operator credential. Non-enumerable to prevent accidental serialization. */
  readonly authorizationToken: string | null;
  readonly timeoutMs: number;
  readonly maxCompletionTokens: number;
}

const requiredValue = (value: string | undefined, name: string): string => {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`OPENCLAW_GATEWAY_CONFIG_MISSING:${name}`);
  return normalized;
};

const validateEndpoint = (value: string): string => {
  const raw = value.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("OPENCLAW_GATEWAY_CONFIG_INVALID:ENDPOINT");
  }
  const loopbackHosts = new Set(["127.0.0.1", "[::1]"]);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/v1/chat/completions" ||
    !loopbackHosts.has(url.hostname) ||
    raw !== url.toString()
  )
    throw new Error("OPENCLAW_GATEWAY_CONFIG_INVALID:ENDPOINT");
  return url.toString();
};

const validateRuntimeEndpoint = (value: string): string => {
  try {
    return validateEndpoint(value);
  } catch {
    throw new OpenClawGatewayExecutionError(
      "GATEWAY_REQUEST_REJECTED",
      "OpenClaw Gateway endpoint failed the canonical loopback boundary.",
    );
  }
};

const validateAgentId = (value: string): string => {
  const agentId = requiredValue(value, "AGENT_ID");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(agentId))
    throw new Error("OPENCLAW_GATEWAY_CONFIG_INVALID:AGENT_ID");
  return agentId;
};

const optionalHeaderValue = (
  value: string | null | undefined,
  name: string,
): string | null => {
  const normalized = value?.trim() || null;
  if (
    normalized &&
    (/\r|\n/u.test(normalized) ||
      normalized.length >
        OPENCLAW_GATEWAY_RUNTIME_POLICY_V1.maxHeaderValueChars)
  )
    throw new Error(`OPENCLAW_GATEWAY_CONFIG_INVALID:${name}`);
  return normalized;
};

export const createOpenClawGatewayConfig = (input: {
  readonly endpoint: string;
  readonly agentId: string;
  readonly backendModelOverride?: string | null;
  readonly authorizationToken?: string | null;
  readonly timeoutMs: number;
  readonly maxCompletionTokens: number;
}): OpenClawGatewayConfig => {
  if (
    !Number.isInteger(input.timeoutMs) ||
    input.timeoutMs < OPENCLAW_GATEWAY_RUNTIME_POLICY_V1.minTimeoutMs ||
    input.timeoutMs > OPENCLAW_GATEWAY_RUNTIME_POLICY_V1.maxTimeoutMs
  )
    throw new Error("OPENCLAW_GATEWAY_CONFIG_INVALID:TIMEOUT_MS");
  if (
    !Number.isInteger(input.maxCompletionTokens) ||
    input.maxCompletionTokens <
      OPENCLAW_GATEWAY_RUNTIME_POLICY_V1.minCompletionTokens ||
    input.maxCompletionTokens >
      OPENCLAW_GATEWAY_RUNTIME_POLICY_V1.maxCompletionTokens
  )
    throw new Error("OPENCLAW_GATEWAY_CONFIG_INVALID:MAX_COMPLETION_TOKENS");
  const config = {
    endpoint: validateEndpoint(requiredValue(input.endpoint, "ENDPOINT")),
    agentId: validateAgentId(input.agentId),
    backendModelOverride: optionalHeaderValue(
      input.backendModelOverride,
      "BACKEND_MODEL_OVERRIDE",
    ),
    timeoutMs: input.timeoutMs,
    maxCompletionTokens: input.maxCompletionTokens,
  } as OpenClawGatewayConfig;
  Object.defineProperty(config, "authorizationToken", {
    value: optionalHeaderValue(input.authorizationToken, "GATEWAY_TOKEN"),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(config);
};

/** Centralized environment boundary; values and secrets are never defaulted. */
export const resolveOpenClawGatewayConfig = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawGatewayConfig =>
  createOpenClawGatewayConfig({
    endpoint: requiredValue(
      environment.REDS_OPENCLAW_GATEWAY_ENDPOINT,
      "ENDPOINT",
    ),
    agentId: requiredValue(environment.REDS_OPENCLAW_AGENT_ID, "AGENT_ID"),
    backendModelOverride:
      environment.REDS_OPENCLAW_BACKEND_MODEL_OVERRIDE ?? null,
    authorizationToken: environment.REDS_OPENCLAW_GATEWAY_TOKEN,
    timeoutMs: Number(
      requiredValue(environment.REDS_OPENCLAW_TIMEOUT_MS, "TIMEOUT_MS"),
    ),
    maxCompletionTokens: Number(
      requiredValue(
        environment.REDS_OPENCLAW_MAX_COMPLETION_TOKENS,
        "MAX_COMPLETION_TOKENS",
      ),
    ),
  });

const revalidateOpenClawGatewayConfig = (
  config: OpenClawGatewayConfig,
): OpenClawGatewayConfig => {
  try {
    return createOpenClawGatewayConfig({
      endpoint: config.endpoint,
      agentId: config.agentId,
      backendModelOverride: config.backendModelOverride,
      authorizationToken: config.authorizationToken,
      timeoutMs: config.timeoutMs,
      maxCompletionTokens: config.maxCompletionTokens,
    });
  } catch {
    throw new OpenClawGatewayExecutionError(
      "GATEWAY_REQUEST_REJECTED",
      "OpenClaw Gateway runtime configuration failed validation.",
    );
  }
};

export interface OpenClawGatewayTransportInput {
  readonly endpoint: string;
  readonly agentId: string;
  readonly backendModelOverride: string | null;
  readonly sessionKey: string;
  readonly authorizationToken: string | null;
  readonly body: unknown;
  readonly signal: AbortSignal;
}

export interface OpenClawGatewayTransport {
  execute(input: OpenClawGatewayTransportInput): Promise<unknown>;
}

const createGatewayTransportInput = (
  input: Omit<OpenClawGatewayTransportInput, "authorizationToken"> & {
    readonly authorizationToken: string | null;
  },
): OpenClawGatewayTransportInput => {
  const transportInput = {
    endpoint: input.endpoint,
    agentId: input.agentId,
    backendModelOverride: input.backendModelOverride,
    sessionKey: input.sessionKey,
    body: input.body,
    signal: input.signal,
  } as OpenClawGatewayTransportInput;
  Object.defineProperty(transportInput, "authorizationToken", {
    value: input.authorizationToken,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(transportInput);
};

const responseLimitFailure = (): OpenClawGatewayExecutionError =>
  new OpenClawGatewayExecutionError(
    "MALFORMED_GATEWAY_RESPONSE",
    "OpenClaw Gateway response exceeded the configured boundary.",
  );

const readBoundedResponseText = async (response: Response): Promise<string> => {
  if (!response.body) {
    const text = await response.text();
    if (
      new TextEncoder().encode(text).byteLength >
      OPENCLAW_GATEWAY_RUNTIME_POLICY_V1.maxResponseBytes
    )
      throw responseLimitFailure();
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > OPENCLAW_GATEWAY_RUNTIME_POLICY_V1.maxResponseBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size violation remains authoritative even if cancellation fails.
        }
        throw responseLimitFailure();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
};

export class FetchOpenClawGatewayTransport implements OpenClawGatewayTransport {
  constructor(
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async execute(input: OpenClawGatewayTransportInput): Promise<unknown> {
    const endpoint = validateRuntimeEndpoint(input.endpoint);
    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-openclaw-agent-id": input.agentId,
          "x-openclaw-session-key": input.sessionKey,
          ...(input.backendModelOverride
            ? { "x-openclaw-model": input.backendModelOverride }
            : {}),
          ...(input.authorizationToken
            ? { authorization: `Bearer ${input.authorizationToken}` }
            : {}),
        },
        body: JSON.stringify(input.body),
        cache: "no-store",
        credentials: "omit",
        redirect: "manual",
        signal: input.signal,
      });
    } catch (error) {
      if (error instanceof OpenClawGatewayExecutionError) throw error;
      throw new OpenClawGatewayExecutionError(
        "GATEWAY_TRANSPORT_ERROR",
        "OpenClaw Gateway transport failed.",
      );
    }
    if (
      response.redirected ||
      (response.status >= 300 && response.status < 400)
    )
      throw new OpenClawGatewayExecutionError(
        "GATEWAY_REDIRECT_BLOCKED",
        "OpenClaw Gateway redirect was blocked.",
      );
    if (response.status === 404)
      throw new OpenClawGatewayExecutionError(
        "GATEWAY_ENDPOINT_DISABLED",
        "OpenClaw chat-completions endpoint is unavailable or disabled.",
      );
    if (response.status === 401 || response.status === 403)
      throw new OpenClawGatewayExecutionError(
        "GATEWAY_AUTH_DENIED",
        "OpenClaw Gateway authentication or authorization was denied.",
      );
    if (response.status === 400 || response.status === 422)
      throw new OpenClawGatewayExecutionError(
        "GATEWAY_REQUEST_REJECTED",
        "OpenClaw Gateway rejected the agent-target request.",
      );
    if (!response.ok)
      throw new OpenClawGatewayExecutionError(
        "GATEWAY_TRANSPORT_ERROR",
        `OpenClaw Gateway returned HTTP ${response.status}.`,
      );
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "application/json")
      throw new OpenClawGatewayExecutionError(
        "MALFORMED_GATEWAY_RESPONSE",
        "OpenClaw Gateway response content type was not application/json.",
      );
    const contentLength = response.headers.get("content-length");
    const declaredLength =
      contentLength === null ? null : Number(contentLength);
    if (
      declaredLength !== null &&
      (!Number.isSafeInteger(declaredLength) ||
        declaredLength < 0 ||
        declaredLength > OPENCLAW_GATEWAY_RUNTIME_POLICY_V1.maxResponseBytes)
    )
      throw responseLimitFailure();
    let text: string;
    try {
      text = await readBoundedResponseText(response);
    } catch (error) {
      if (error instanceof OpenClawGatewayExecutionError) throw error;
      throw new OpenClawGatewayExecutionError(
        "GATEWAY_TRANSPORT_ERROR",
        "OpenClaw Gateway response body could not be read.",
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new OpenClawGatewayExecutionError(
        "MALFORMED_GATEWAY_RESPONSE",
        "OpenClaw Gateway returned malformed JSON.",
      );
    }
  }
}

const sameOrderedValues = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const extractionCommand = (
  request: OpenClawCollectionRequest,
  plan: CollectionPlan,
  collectionRunId: string,
) => ({
  schema_version: OPENCLAW_GATEWAY_REQUEST_SCHEMA_VERSION,
  instruction: REAL_ESTATE_COLLECTOR_SKILL,
  task: {
    request_id: request.request_id,
    collection_run_id: collectionRunId,
    collection_task_id: request.collection_task.task_id,
    controlled_mode: request.controlled_mode,
    source_id: plan.sourceId,
    target_urls: plan.validatedTargetUrls,
    requested_fields: plan.validatedRequestedFields,
    entity_type: plan.entityType,
    requested_at: request.requested_at,
  },
  constraints: {
    discovery: false,
    follow_links: false,
    pagination: false,
    sitemap: false,
    authentication: false,
    challenge_action: "stop",
    raw_content_storage: false,
    raw_snapshot_storage: false,
    raw_content_display: false,
    canonical_write: false,
    matching: false,
  },
  response_schema_version: OPENCLAW_STAGED_RESULT_SCHEMA_VERSION,
});

const OPENCLAW_GATEWAY_SYSTEM_INSTRUCTION = [
  "Use real-estate-collector only if the exact skill version named in the task is installed; otherwise fail closed.",
  "Treat the task JSON as the complete target and field scope; browser navigation and transient browser snapshots are allowed only for the exact target URLs in that scope.",
  "Never navigate outside the plan, discover or follow links, paginate, use sitemaps, authenticate, or bypass access challenges.",
  "Do not use web_search, web_fetch, shell, terminal, filesystem, session tools, gateway or admin operations, or messaging tools.",
  "Return only strict JSON matching the requested staged schema version.",
  "Do not add prose, markdown fences, raw content, snapshots, credentials, canonical entities, or matching output.",
].join(" ");

const gatewayRequestBody = (
  request: OpenClawCollectionRequest,
  plan: CollectionPlan,
  agentTarget: string,
  collectionRunId: string,
  maxCompletionTokens: number,
) => ({
  model: agentTarget,
  stream: false,
  max_completion_tokens: maxCompletionTokens,
  messages: [
    { role: "system", content: OPENCLAW_GATEWAY_SYSTEM_INSTRUCTION },
    {
      role: "user",
      content: JSON.stringify(
        extractionCommand(request, plan, collectionRunId),
      ),
    },
  ],
});

const parseJsonText = (value: unknown): unknown => {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

/** Accepts only the documented non-streaming Chat Completions envelope. */
const stagedPayloadFromGatewayResponse = (
  value: unknown,
  expectedAgentTarget: string,
): unknown => {
  if (typeof value !== "object" || value === null) return null;
  if (Reflect.get(value, "object") !== "chat.completion") return null;
  if (Reflect.get(value, "model") !== expectedAgentTarget)
    throw new OpenClawGatewayExecutionError(
      "GATEWAY_AGENT_MODEL_MISMATCH",
      "OpenClaw Gateway response agent target did not match the request.",
    );
  const choices = Reflect.get(value, "choices");
  if (!Array.isArray(choices) || choices.length !== 1) return null;
  const choice = choices[0];
  if (
    typeof choice !== "object" ||
    choice === null ||
    Reflect.get(choice, "index") !== 0 ||
    Reflect.get(choice, "finish_reason") !== "stop"
  )
    return null;
  const message = Reflect.get(choice, "message");
  if (
    typeof message !== "object" ||
    message === null ||
    Reflect.get(message, "role") !== "assistant" ||
    Reflect.has(message, "tool_calls")
  )
    return null;
  return parseJsonText(Reflect.get(message, "content"));
};

const defaultCollectionRunId = (): string =>
  `collection_run_openclaw_${crypto.randomUUID().replaceAll("-", "")}`;

const validCollectionRunId = (value: string): boolean =>
  /^collection_run_openclaw_[a-z0-9_]+$/iu.test(value);

export class OpenClawGatewayExecutor implements OpenClawExecutor {
  private readonly config: OpenClawGatewayConfig;

  constructor(
    config: OpenClawGatewayConfig,
    private readonly transport: OpenClawGatewayTransport = new FetchOpenClawGatewayTransport(),
    private readonly collectionRunIdFactory: () => string = defaultCollectionRunId,
  ) {
    this.config = revalidateOpenClawGatewayConfig(config);
  }

  async execute(input: {
    readonly request: OpenClawCollectionRequest;
    readonly plan: CollectionPlan;
  }): Promise<OpenClawStagedResult> {
    const { request, plan } = input;
    if (
      !plan.allowed ||
      plan.preferredMethod !== "openclaw" ||
      plan.sourceId !== request.collection_task.source_id ||
      !sameOrderedValues(
        plan.validatedTargetUrls,
        request.collection_task.target_urls,
      ) ||
      !sameOrderedValues(
        plan.validatedRequestedFields,
        request.collection_task.requested_fields,
      )
    )
      throw new OpenClawGatewayExecutionError(
        "COLLECTION_PLAN_DENIED",
        "OpenClaw Gateway executor requires an exact approved collection plan.",
      );

    const runtimeConfig = revalidateOpenClawGatewayConfig(this.config);

    const collectionRunId = this.collectionRunIdFactory();
    if (!validCollectionRunId(collectionRunId))
      throw new OpenClawGatewayExecutionError(
        "GATEWAY_REQUEST_REJECTED",
        "OpenClaw collection run identity was invalid.",
      );
    const agentTarget = `openclaw/${runtimeConfig.agentId}`;
    const sessionKey = `reds-collection-${collectionRunId}`;

    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const timeoutFailure = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        reject(
          new OpenClawGatewayExecutionError(
            "GATEWAY_TIMEOUT",
            "OpenClaw Gateway execution timed out.",
          ),
        );
        controller.abort();
      }, runtimeConfig.timeoutMs);
    });

    let gatewayResponse: unknown;
    try {
      gatewayResponse = await Promise.race([
        this.transport.execute(
          createGatewayTransportInput({
            endpoint: runtimeConfig.endpoint,
            agentId: runtimeConfig.agentId,
            backendModelOverride: runtimeConfig.backendModelOverride,
            sessionKey,
            authorizationToken: runtimeConfig.authorizationToken,
            body: gatewayRequestBody(
              request,
              plan,
              agentTarget,
              collectionRunId,
              runtimeConfig.maxCompletionTokens,
            ),
            signal: controller.signal,
          }),
        ),
        timeoutFailure,
      ]);
    } catch (error) {
      if (error instanceof OpenClawGatewayExecutionError) throw error;
      throw new OpenClawGatewayExecutionError(
        "GATEWAY_TRANSPORT_ERROR",
        "OpenClaw Gateway transport failed.",
      );
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    const staged = parseOpenClawStagedResult(
      stagedPayloadFromGatewayResponse(gatewayResponse, agentTarget),
      { request, plan, expectedCollectionRunId: collectionRunId },
    );
    if (!staged)
      throw new OpenClawGatewayExecutionError(
        "MALFORMED_GATEWAY_RESPONSE",
        "OpenClaw Gateway response failed staged validation.",
      );
    return staged;
  }
}
