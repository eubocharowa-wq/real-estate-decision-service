import { describe, expect, it, vi } from "vitest";

import type { CollectionPlan } from "../../src/data-collection/source-registry";
import type { OpenClawCollectionRequest } from "../../src/pilot-hardening";
import {
  FetchOpenClawGatewayTransport,
  OPENCLAW_GATEWAY_RUNTIME_POLICY_V1,
  OpenClawGatewayExecutionError,
  OpenClawGatewayExecutor,
  createOpenClawGatewayConfig,
  resolveOpenClawGatewayConfig,
  type OpenClawGatewayTransport,
} from "../../src/pilot-hardening";
import { OPENCLAW_STAGED_RESULT_FIXTURE } from "./fixtures/openclaw-staged-result";

const request: OpenClawCollectionRequest = {
  request_id: "openclaw_request_fixture",
  controlled_mode: "verify",
  environment: "test",
  collection_task: {
    schema_version: "1.0",
    task_id: "collection_task_openclaw_fixture",
    source_id: "src_dev_02",
    mode: "collect",
    target_urls: ["https://vneshstroi.ru/kvartiry/123/"],
    requested_fields: ["listing_price"],
    entity_type: "offer",
    freshness_requirement: "current_observation",
    priority: "normal",
    created_at: "2026-08-24T00:00:00.000Z",
  },
  satisfied_conditions: ["TEST_OPENCLAW_APPROVED"],
  requested_at: "2026-08-24T00:00:00.000Z",
};

/** Shape-only plan: policy decisions themselves remain covered by canonical gate tests. */
const approvedPlan: CollectionPlan = {
  sourceId: "src_dev_02",
  operation: "scheduled_collect",
  environment: "test",
  entityType: "offer",
  targetField: null,
  validatedTargetUrls: request.collection_task.target_urls,
  validatedRequestedFields: request.collection_task.requested_fields,
  allowed: true,
  preferredMethod: "openclaw",
  fallbackMethods: [],
  storagePolicy: {
    rawContent: { status: "denied", allowed: false },
    normalizedData: { status: "conditional", allowed: true },
    evidenceMetadata: { status: "conditional", allowed: true },
    snapshots: { status: "denied", allowed: false },
    derivedData: { status: "denied", allowed: false },
  },
  displayPolicy: {
    normalizedFacts: { status: "conditional", allowed: true },
    sourceLink: { status: "approved", allowed: true },
    evidenceSnippet: { status: "denied", allowed: false },
    rawContent: { status: "denied", allowed: false },
    imageMedia: { status: "denied", allowed: false },
  },
  fieldCoverage: null,
  freshnessPolicy: null,
  fieldAuthority: null,
  attributionPolicy: {
    attribution_required: true,
    attribution_label: "Fixture source",
    link_required: true,
    logo_allowed: false,
    display_restrictions: [],
  },
  collectionScope: {
    explicit_targets_only: true,
    allowed_hosts: ["vneshstroi.ru"],
    allowed_path_patterns: ["^/kvartiry/[0-9]+/?$"],
    maximum_target_urls: 1,
    discovery_allowed: false,
    follow_links_allowed: false,
    pagination_allowed: false,
    sitemap_allowed: false,
    authentication_allowed: false,
    challenge_action: "stop",
  },
  fieldPolicy: {
    requested_fields_required: true,
    allowed_fields: ["listing_price"],
    required_evidence_metadata: ["source_url", "observed_at"],
    verification_ceilings: [],
  },
  retentionPolicy: {
    normalized_facts: "transient_only",
    evidence_metadata: "transient_only",
    raw_content: "prohibited",
    raw_snapshots: "prohibited",
  },
  requiredConditions: ["TEST_OPENCLAW_APPROVED"],
  reasonCodes: ["POLICY_ALLOWED"],
  registryVersion: "test-registry-v1",
  policyVersion: "test-policy-v1",
  decidedAt: "2026-08-24T00:00:00.000Z",
};

const config = createOpenClawGatewayConfig({
  endpoint: "http://127.0.0.1:18789/v1/chat/completions",
  agentId: "fixture-agent",
  backendModelOverride: "fixture-provider/fixture-model",
  authorizationToken: "fixture-token",
  timeoutMs: 500,
  maxCompletionTokens: 512,
});

const AGENT_TARGET = "openclaw/fixture-agent";
const COLLECTION_RUN_ID = "collection_run_openclaw_fixture";

const chatCompletion = (
  staged: unknown,
  overrides: Readonly<Record<string, unknown>> = {},
) => ({
  id: "chatcmpl_fixture",
  object: "chat.completion",
  created: 1,
  model: AGENT_TARGET,
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: typeof staged === "string" ? staged : JSON.stringify(staged),
      },
      finish_reason: "stop",
    },
  ],
  ...overrides,
});

const transportReturning = (value: unknown): OpenClawGatewayTransport => ({
  execute: vi.fn(async () => value),
});

const gatewayExecutor = (
  transport: OpenClawGatewayTransport,
  gatewayConfig: typeof config = config,
  collectionRunIdFactory: () => string = () => COLLECTION_RUN_ID,
) =>
  new OpenClawGatewayExecutor(gatewayConfig, transport, collectionRunIdFactory);

const expectGatewayFailure = async (
  action: Promise<unknown>,
  code: OpenClawGatewayExecutionError["code"],
): Promise<void> => {
  await expect(action).rejects.toMatchObject({ code });
};

describe("OpenClaw Gateway executor", async () => {
  it("requires deployment-supplied endpoint, agent, timeout and output limit", () => {
    expect(() => resolveOpenClawGatewayConfig({})).toThrow(
      "OPENCLAW_GATEWAY_CONFIG_MISSING:ENDPOINT",
    );
    expect(
      resolveOpenClawGatewayConfig({
        REDS_OPENCLAW_GATEWAY_ENDPOINT:
          "http://127.0.0.1:18789/v1/chat/completions",
        REDS_OPENCLAW_AGENT_ID: "configured-agent",
        REDS_OPENCLAW_BACKEND_MODEL_OVERRIDE: "provider/configured-model",
        REDS_OPENCLAW_TIMEOUT_MS: "500",
        REDS_OPENCLAW_MAX_COMPLETION_TOKENS: "512",
      }),
    ).toMatchObject({
      agentId: "configured-agent",
      backendModelOverride: "provider/configured-model",
      authorizationToken: null,
      maxCompletionTokens: 512,
    });
    expect(() =>
      resolveOpenClawGatewayConfig({
        REDS_OPENCLAW_GATEWAY_ENDPOINT:
          "http://127.0.0.1:18789/v1/chat/completions",
        REDS_OPENCLAW_AGENT_ID: "configured-agent",
        REDS_OPENCLAW_TIMEOUT_MS: "500",
      }),
    ).toThrow("OPENCLAW_GATEWAY_CONFIG_MISSING:MAX_COMPLETION_TOKENS");
    expect(() =>
      resolveOpenClawGatewayConfig({
        REDS_OPENCLAW_GATEWAY_ENDPOINT:
          "http://127.0.0.1:18789/v1/chat/completions",
        REDS_OPENCLAW_AGENT_ID: "configured-agent",
        REDS_OPENCLAW_TIMEOUT_MS: "500",
        REDS_OPENCLAW_MAX_COMPLETION_TOKENS: "not-an-integer",
      }),
    ).toThrow("OPENCLAW_GATEWAY_CONFIG_INVALID:MAX_COMPLETION_TOKENS");
    for (const maxCompletionTokens of [
      OPENCLAW_GATEWAY_RUNTIME_POLICY_V1.minCompletionTokens - 1,
      OPENCLAW_GATEWAY_RUNTIME_POLICY_V1.maxCompletionTokens + 1,
      512.5,
    ])
      expect(() =>
        createOpenClawGatewayConfig({
          endpoint: "http://127.0.0.1:18789/v1/chat/completions",
          agentId: "configured-agent",
          timeoutMs: 500,
          maxCompletionTokens,
        }),
      ).toThrow("OPENCLAW_GATEWAY_CONFIG_INVALID:MAX_COMPLETION_TOKENS");
    expect(() =>
      createOpenClawGatewayConfig({
        endpoint: "https://gateway.example/v1/chat/completions",
        agentId: "configured-agent",
        timeoutMs: 500,
        maxCompletionTokens: 512,
      }),
    ).toThrow("OPENCLAW_GATEWAY_CONFIG_INVALID:ENDPOINT");
    expect(() =>
      createOpenClawGatewayConfig({
        endpoint: "http://localhost:18789/v1/chat/completions",
        agentId: "configured-agent",
        timeoutMs: 500,
        maxCompletionTokens: 512,
      }),
    ).toThrow("OPENCLAW_GATEWAY_CONFIG_INVALID:ENDPOINT");
    expect(() =>
      createOpenClawGatewayConfig({
        endpoint: "http://2130706433:18789/v1/chat/completions",
        agentId: "configured-agent",
        timeoutMs: 500,
        maxCompletionTokens: 512,
      }),
    ).toThrow("OPENCLAW_GATEWAY_CONFIG_INVALID:ENDPOINT");
    expect(() =>
      createOpenClawGatewayConfig({
        endpoint: "http://user@127.0.0.1:18789/v1/chat/completions",
        agentId: "configured-agent",
        timeoutMs: 500,
        maxCompletionTokens: 512,
      }),
    ).toThrow("OPENCLAW_GATEWAY_CONFIG_INVALID:ENDPOINT");
    expect(() =>
      createOpenClawGatewayConfig({
        endpoint: "http://[::2]:18789/v1/chat/completions",
        agentId: "configured-agent",
        timeoutMs: 500,
        maxCompletionTokens: 512,
      }),
    ).toThrow("OPENCLAW_GATEWAY_CONFIG_INVALID:ENDPOINT");
    expect(
      createOpenClawGatewayConfig({
        endpoint: "http://[::1]:18789/v1/chat/completions",
        agentId: "configured-agent",
        timeoutMs: 500,
        maxCompletionTokens: 512,
      }).endpoint,
    ).toBe("http://[::1]:18789/v1/chat/completions");
  });

  it.each([
    "https://gateway.example/v1/chat/completions",
    "http://localhost:18789/v1/chat/completions",
    "http://2130706433:18789/v1/chat/completions",
    "http://user@127.0.0.1:18789/v1/chat/completions",
    "http://127.0.0.1:18789/v1/chat/completions?target=remote",
    "http://127.0.0.1:18789/v1/chat/completions#fragment",
  ])(
    "revalidates direct executor and transport endpoint %s immediately before use",
    async (endpoint) => {
      const fetchImpl = vi.fn<typeof globalThis.fetch>();
      await expectGatewayFailure(
        new FetchOpenClawGatewayTransport(fetchImpl).execute({
          endpoint,
          agentId: config.agentId,
          backendModelOverride: null,
          sessionKey: "reds-collection-fixture-run",
          authorizationToken: null,
          body: {},
          signal: new AbortController().signal,
        }),
        "GATEWAY_REQUEST_REJECTED",
      );
      expect(fetchImpl).not.toHaveBeenCalled();

      const transport = transportReturning(
        chatCompletion(OPENCLAW_STAGED_RESULT_FIXTURE),
      );
      let constructorError: unknown = null;
      try {
        gatewayExecutor(transport, {
          ...config,
          endpoint,
          authorizationToken: config.authorizationToken,
        });
      } catch (error) {
        constructorError = error;
      }
      expect(constructorError).toMatchObject({
        code: "GATEWAY_REQUEST_REJECTED",
      });
      expect(transport.execute).not.toHaveBeenCalled();
    },
  );

  it("sanitizes a plain enumerable-token config before retaining it", async () => {
    const plainToken = "plain-enumerable-fixture-token";
    const plainConfig = {
      endpoint: "http://127.0.0.1:18789/v1/chat/completions",
      agentId: "fixture-agent",
      backendModelOverride: null,
      authorizationToken: plainToken,
      timeoutMs: 500,
      maxCompletionTokens: 512,
    };
    expect(Object.keys(plainConfig)).toContain("authorizationToken");

    const transport = transportReturning(
      chatCompletion(OPENCLAW_STAGED_RESULT_FIXTURE),
    );
    const executor = gatewayExecutor(transport, plainConfig);
    expect(JSON.stringify(executor)).not.toContain(plainToken);
    const retainedConfig = Reflect.get(executor, "config") as object;
    expect(Object.keys(retainedConfig)).not.toContain("authorizationToken");

    await executor.execute({ request, plan: approvedPlan });
    const transportInput = vi.mocked(transport.execute).mock.calls[0]![0];
    expect(transportInput.authorizationToken).toBe(plainToken);
    expect(Object.keys(transportInput)).not.toContain("authorizationToken");
    expect(JSON.stringify(transportInput)).not.toContain(plainToken);
  });

  it("keeps the full-operator token out of config serialization", () => {
    expect(config.authorizationToken).toBe("fixture-token");
    expect(JSON.stringify(config)).not.toContain("fixture-token");
    expect(Object.keys(config)).not.toContain("authorizationToken");
  });

  it("sends only plan-validated scope and returns a strictly staged result", async () => {
    const transport = transportReturning(
      chatCompletion(OPENCLAW_STAGED_RESULT_FIXTURE),
    );
    const result = await gatewayExecutor(transport).execute({
      request,
      plan: approvedPlan,
    });
    expect(result).toEqual(OPENCLAW_STAGED_RESULT_FIXTURE);
    expect(transport.execute).toHaveBeenCalledOnce();
    const call = vi.mocked(transport.execute).mock.calls[0]![0];
    expect(call).toMatchObject({
      agentId: "fixture-agent",
      backendModelOverride: "fixture-provider/fixture-model",
      sessionKey: "reds-collection-collection_run_openclaw_fixture",
      body: {
        model: "openclaw/fixture-agent",
        stream: false,
        max_completion_tokens: 512,
      },
    });
    expect(call.authorizationToken).toBe("fixture-token");
    expect(JSON.stringify(call)).not.toContain("fixture-token");
    expect(Object.keys(call)).not.toContain("authorizationToken");
    const body = call.body as {
      readonly messages: readonly { readonly content: string }[];
    };
    expect(body.messages[0]!.content).toContain("web_search");
    expect(body.messages[0]!.content).toContain("browser navigation");
    expect(body.messages[0]!.content).toContain("exact target URLs");
    const command = JSON.parse(body.messages[1]!.content) as object;
    expect(command).toMatchObject({
      task: {
        collection_run_id: "collection_run_openclaw_fixture",
        source_id: "src_dev_02",
        target_urls: request.collection_task.target_urls,
        requested_fields: ["listing_price"],
      },
      constraints: {
        discovery: false,
        follow_links: false,
        canonical_write: false,
        matching: false,
        raw_content_storage: false,
      },
    });
    expect(command).not.toHaveProperty("match_score");
    expect(command).not.toHaveProperty("canonical");
    expect(body).not.toHaveProperty("user");
  });

  it("uses the OpenClaw HTTP agent/model headers without putting the token in the body", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () =>
      Promise.resolve(
        new Response(JSON.stringify(OPENCLAW_STAGED_RESULT_FIXTURE), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const transport = new FetchOpenClawGatewayTransport(fetchImpl);
    const body = { model: AGENT_TARGET, stream: false, messages: [] };
    await expect(
      transport.execute({
        endpoint: config.endpoint,
        agentId: config.agentId,
        backendModelOverride: config.backendModelOverride,
        sessionKey: "reds-collection-fixture-run",
        authorizationToken: config.authorizationToken,
        body,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(OPENCLAW_STAGED_RESULT_FIXTURE);
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify(body),
      credentials: "omit",
      redirect: "manual",
    });
    expect(init.headers).toMatchObject({
      authorization: "Bearer fixture-token",
      "x-openclaw-agent-id": "fixture-agent",
      "x-openclaw-model": "fixture-provider/fixture-model",
      "x-openclaw-session-key": "reds-collection-fixture-run",
    });
    expect(init.body).not.toContain("fixture-token");
  });

  it("rejects malformed JSON returned by the HTTP transport", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () =>
      Promise.resolve(
        new Response("{not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expectGatewayFailure(
      new FetchOpenClawGatewayTransport(fetchImpl).execute({
        endpoint: config.endpoint,
        agentId: config.agentId,
        backendModelOverride: null,
        sessionKey: "reds-collection-fixture-run",
        authorizationToken: null,
        body: {},
        signal: new AbortController().signal,
      }),
      "MALFORMED_GATEWAY_RESPONSE",
    );
  });

  it("omits x-openclaw-model when no backend override is configured", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () =>
      Promise.resolve(
        new Response(JSON.stringify(chatCompletion({})), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await new FetchOpenClawGatewayTransport(fetchImpl).execute({
      endpoint: config.endpoint,
      agentId: config.agentId,
      backendModelOverride: null,
      sessionKey: "reds-collection-fixture-run",
      authorizationToken: null,
      body: {},
      signal: new AbortController().signal,
    });
    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(headers).not.toHaveProperty("x-openclaw-model");
  });

  it.each([
    { status: 404, code: "GATEWAY_ENDPOINT_DISABLED" },
    { status: 401, code: "GATEWAY_AUTH_DENIED" },
    { status: 403, code: "GATEWAY_AUTH_DENIED" },
    { status: 400, code: "GATEWAY_REQUEST_REJECTED" },
    { status: 302, code: "GATEWAY_REDIRECT_BLOCKED" },
  ] as const)("fails closed for HTTP $status", async ({ status, code }) => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () =>
      Promise.resolve(
        new Response(null, {
          status,
          ...(status === 302
            ? { headers: { location: "http://127.0.0.1:9999/other" } }
            : {}),
        }),
      ),
    );
    await expectGatewayFailure(
      new FetchOpenClawGatewayTransport(fetchImpl).execute({
        endpoint: config.endpoint,
        agentId: config.agentId,
        backendModelOverride: config.backendModelOverride,
        sessionKey: "reds-collection-fixture-run",
        authorizationToken: config.authorizationToken,
        body: {},
        signal: new AbortController().signal,
      }),
      code,
    );
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ redirect: "manual" });
  });

  it("rejects a successful response with a non-JSON content type", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () =>
      Promise.resolve(
        new Response("not JSON", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    await expectGatewayFailure(
      new FetchOpenClawGatewayTransport(fetchImpl).execute({
        endpoint: config.endpoint,
        agentId: config.agentId,
        backendModelOverride: null,
        sessionKey: "reds-collection-fixture-run",
        authorizationToken: null,
        body: {},
        signal: new AbortController().signal,
      }),
      "MALFORMED_GATEWAY_RESPONSE",
    );
  });

  it("cancels a streamed response immediately after the byte limit", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new Uint8Array(OPENCLAW_GATEWAY_RUNTIME_POLICY_V1.maxResponseBytes),
        );
        controller.enqueue(new Uint8Array(1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () =>
      Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expectGatewayFailure(
      new FetchOpenClawGatewayTransport(fetchImpl).execute({
        endpoint: config.endpoint,
        agentId: config.agentId,
        backendModelOverride: null,
        sessionKey: "reds-collection-fixture-run",
        authorizationToken: null,
        body: {},
        signal: new AbortController().signal,
      }),
      "MALFORMED_GATEWAY_RESPONSE",
    );
    expect(cancelled).toBe(true);
  });

  it("rejects an agent-target or backend-model response mismatch", async () => {
    await expectGatewayFailure(
      gatewayExecutor(
        transportReturning(
          chatCompletion(OPENCLAW_STAGED_RESULT_FIXTURE, {
            model: "fixture-provider/fixture-model",
          }),
        ),
      ).execute({ request, plan: approvedPlan }),
      "GATEWAY_AGENT_MODEL_MISMATCH",
    );
  });

  it("uses a fresh dedicated session for every collection run", async () => {
    const runIds = [
      "collection_run_openclaw_first",
      "collection_run_openclaw_second",
    ];
    const transport: OpenClawGatewayTransport = {
      execute: vi.fn(async (input) => {
        const body = input.body as {
          readonly messages: readonly { readonly content: string }[];
        };
        const command = JSON.parse(body.messages[1]!.content) as {
          readonly task: { readonly collection_run_id: string };
        };
        return chatCompletion({
          ...OPENCLAW_STAGED_RESULT_FIXTURE,
          collection_run_id: command.task.collection_run_id,
        });
      }),
    };
    const executor = gatewayExecutor(
      transport,
      config,
      () => runIds.shift() ?? "collection_run_openclaw_unexpected",
    );
    await executor.execute({ request, plan: approvedPlan });
    await executor.execute({ request, plan: approvedPlan });
    const calls = vi.mocked(transport.execute).mock.calls;
    expect(calls[0]![0].sessionKey).toBe(
      "reds-collection-collection_run_openclaw_first",
    );
    expect(calls[1]![0].sessionKey).toBe(
      "reds-collection-collection_run_openclaw_second",
    );
    expect(calls[0]![0].sessionKey).not.toBe(calls[1]![0].sessionKey);
    expect(calls[0]![0].body).not.toHaveProperty("user");
  });

  it("allows a canonical browser fallback when OpenClaw remains preferred", async () => {
    const transport = transportReturning(
      chatCompletion(OPENCLAW_STAGED_RESULT_FIXTURE),
    );
    await expect(
      gatewayExecutor(transport).execute({
        request,
        plan: { ...approvedPlan, fallbackMethods: ["browser"] },
      }),
    ).resolves.toEqual(OPENCLAW_STAGED_RESULT_FIXTURE);
    expect(transport.execute).toHaveBeenCalledOnce();
  });

  it("accounts for absent and ambiguous facts through missing_fields", async () => {
    const unknownFact = {
      ...OPENCLAW_STAGED_RESULT_FIXTURE.facts[0],
      value: null,
      verification_status: "unknown" as const,
      evidence: {
        ...OPENCLAW_STAGED_RESULT_FIXTURE.facts[0]!.evidence,
        raw_value: "ambiguous fixture value",
      },
    };
    const ambiguous = {
      ...OPENCLAW_STAGED_RESULT_FIXTURE,
      facts: [unknownFact],
      missing_fields: ["listing_price"],
    };
    await expect(
      gatewayExecutor(transportReturning(chatCompletion(ambiguous))).execute({
        request,
        plan: approvedPlan,
      }),
    ).resolves.toEqual(ambiguous);

    const absent = {
      ...OPENCLAW_STAGED_RESULT_FIXTURE,
      facts: [],
      missing_fields: ["listing_price"],
    };
    await expect(
      gatewayExecutor(transportReturning(chatCompletion(absent))).execute({
        request,
        plan: approvedPlan,
      }),
    ).resolves.toEqual(absent);

    const completeKnown = {
      ...OPENCLAW_STAGED_RESULT_FIXTURE,
      status: "complete" as const,
    };
    await expect(
      gatewayExecutor(
        transportReturning(chatCompletion(completeKnown)),
      ).execute({ request, plan: approvedPlan }),
    ).resolves.toEqual(completeKnown);
  });

  it.each([
    {
      name: "unknown fact omitted from missing_fields",
      staged: {
        ...OPENCLAW_STAGED_RESULT_FIXTURE,
        facts: [
          {
            ...OPENCLAW_STAGED_RESULT_FIXTURE.facts[0],
            value: null,
            verification_status: "unknown",
          },
        ],
      },
    },
    {
      name: "complete result containing an unknown fact",
      staged: {
        ...OPENCLAW_STAGED_RESULT_FIXTURE,
        status: "complete",
        facts: [
          {
            ...OPENCLAW_STAGED_RESULT_FIXTURE.facts[0],
            value: null,
            verification_status: "unknown",
          },
        ],
        missing_fields: ["listing_price"],
      },
    },
    {
      name: "ambiguous fact without an observed evidence value",
      staged: {
        ...OPENCLAW_STAGED_RESULT_FIXTURE,
        facts: [
          {
            ...OPENCLAW_STAGED_RESULT_FIXTURE.facts[0],
            value: null,
            verification_status: "unknown",
            evidence: {
              ...OPENCLAW_STAGED_RESULT_FIXTURE.facts[0]!.evidence,
              raw_value: null,
            },
          },
        ],
        missing_fields: ["listing_price"],
      },
    },
  ])("rejects $name", async ({ staged }) => {
    await expectGatewayFailure(
      gatewayExecutor(transportReturning(chatCompletion(staged))).execute({
        request,
        plan: approvedPlan,
      }),
      "MALFORMED_GATEWAY_RESPONSE",
    );
  });

  it("does not invoke transport without an exact OpenClaw Collection Plan", async () => {
    const transport = transportReturning(OPENCLAW_STAGED_RESULT_FIXTURE);
    await expectGatewayFailure(
      gatewayExecutor(transport).execute({
        request,
        plan: { ...approvedPlan, allowed: false, preferredMethod: null },
      }),
      "COLLECTION_PLAN_DENIED",
    );
    expect(transport.execute).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "malformed JSON payload",
      response: chatCompletion("not-json"),
    },
    {
      name: "unknown staged field",
      response: chatCompletion({
        ...OPENCLAW_STAGED_RESULT_FIXTURE,
        invented: true,
      }),
    },
    {
      name: "incomplete evidence",
      response: chatCompletion({
        ...OPENCLAW_STAGED_RESULT_FIXTURE,
        facts: [
          {
            ...OPENCLAW_STAGED_RESULT_FIXTURE.facts[0],
            evidence: {
              ...OPENCLAW_STAGED_RESULT_FIXTURE.facts[0]!.evidence,
              evidence_reference: "",
            },
          },
        ],
      }),
    },
    {
      name: "unaccounted requested field",
      response: chatCompletion({
        ...OPENCLAW_STAGED_RESULT_FIXTURE,
        facts: [],
        missing_fields: [],
      }),
    },
    {
      name: "direct staged payload outside choices content",
      response: OPENCLAW_STAGED_RESULT_FIXTURE,
    },
    {
      name: "tool-call response instead of final content",
      response: chatCompletion(OPENCLAW_STAGED_RESULT_FIXTURE, {
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
    },
  ])("fails closed for $name", async ({ response }) => {
    await expectGatewayFailure(
      gatewayExecutor(transportReturning(response)).execute({
        request,
        plan: approvedPlan,
      }),
      "MALFORMED_GATEWAY_RESPONSE",
    );
  });

  it("classifies transport failures without exposing credentials", async () => {
    const transport: OpenClawGatewayTransport = {
      execute: vi.fn(async () => {
        throw new Error("fixture transport failure");
      }),
    };
    await expectGatewayFailure(
      gatewayExecutor(transport).execute({
        request,
        plan: approvedPlan,
      }),
      "GATEWAY_TRANSPORT_ERROR",
    );
  });

  it("aborts a non-responsive transport at the configured timeout", async () => {
    const timeoutConfig = createOpenClawGatewayConfig({
      ...config,
      timeoutMs: 100,
    });
    const transport: OpenClawGatewayTransport = {
      execute: vi.fn(
        (input) =>
          new Promise((_resolve, reject) => {
            input.signal.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      ),
    };
    await expectGatewayFailure(
      gatewayExecutor(transport, timeoutConfig).execute({
        request,
        plan: approvedPlan,
      }),
      "GATEWAY_TIMEOUT",
    );
  });
});
