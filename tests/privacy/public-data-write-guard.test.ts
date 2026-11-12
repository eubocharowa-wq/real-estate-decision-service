import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as postBuyerJourney } from "../../app/api/buyer-journeys/route";
import { POST as postExpertRequest } from "../../app/api/expert-requests/route";
import { POST as postExpertWorkbench } from "../../app/api/expert-workbench/[requestId]/route";
import { resetBuyerJourneyRuntimeForTests } from "../../src/buyer-journey";
import { getApplicationRepositorySet } from "../../src/persistence";
import {
  PUBLIC_DATA_WRITE_DISABLED,
  evaluatePublicDataWriteAccess,
} from "../../src/privacy";

const postBuyer = (body: unknown, headers: HeadersInit = {}) =>
  postBuyerJourney(
    new Request("http://public.example/api/buyer-journeys", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

describe("server-only public data write policy", () => {
  it("fails closed for missing, disabled, unknown, and incomplete approval config", () => {
    expect(evaluatePublicDataWriteAccess("buyer_journey", {})).toEqual({
      allowed: false,
      reason: "disabled",
    });
    expect(
      evaluatePublicDataWriteAccess("buyer_journey", {
        REDS_PUBLIC_DATA_WRITE_MODE: "disabled",
        NODE_ENV: "test",
      }),
    ).toEqual({ allowed: false, reason: "disabled" });
    expect(
      evaluatePublicDataWriteAccess("buyer_journey", {
        REDS_PUBLIC_DATA_WRITE_MODE: "caller_says_yes",
      }),
    ).toEqual({ allowed: false, reason: "invalid_mode" });
    expect(
      evaluatePublicDataWriteAccess("buyer_journey", {
        REDS_PUBLIC_DATA_WRITE_MODE: "approved_public",
      }),
    ).toEqual({ allowed: false, reason: "public_approval_missing" });
  });

  it("accepts only complete trusted server contexts", () => {
    expect(
      evaluatePublicDataWriteAccess("expert_request", {
        REDS_PUBLIC_DATA_WRITE_MODE: "approved_public",
        REDS_PUBLIC_DATA_PROCESSING_APPROVAL_REF: "approval_issue_29_reviewed",
      }),
    ).toEqual({ allowed: true, mode: "approved_public" });

    const trustedPilot = {
      REDS_PUBLIC_DATA_WRITE_MODE: "trusted_pilot",
      REDS_APPLICATION_MODE: "pilot",
      REDS_TRUSTED_DEPLOYMENT_ACCESS: "vercel_sso",
      VERCEL: "1",
      VERCEL_ENV: "preview",
    };
    expect(
      evaluatePublicDataWriteAccess("expert_workbench", trustedPilot),
    ).toEqual({ allowed: true, mode: "trusted_pilot" });
    expect(
      evaluatePublicDataWriteAccess("expert_workbench", {
        ...trustedPilot,
        REDS_TRUSTED_DEPLOYMENT_ACCESS: undefined,
      }),
    ).toEqual({
      allowed: false,
      reason: "trusted_pilot_context_incomplete",
    });
  });

  it("keeps the synthetic seam limited to NODE_ENV=test", () => {
    expect(
      evaluatePublicDataWriteAccess("buyer_journey", { NODE_ENV: "test" }),
    ).toEqual({ allowed: true, mode: "synthetic_test" });
    expect(
      evaluatePublicDataWriteAccess("buyer_journey", {
        NODE_ENV: "production",
        REDS_PUBLIC_DATA_WRITE_MODE: "synthetic_test",
      }),
    ).toEqual({ allowed: false, reason: "invalid_mode" });
  });
});

describe("public HTTP write boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", "disabled");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDS_DATABASE_URL", "");
    resetBuyerJourneyRuntimeForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetBuyerJourneyRuntimeForTests();
  });

  it("denies a direct buyer POST before runtime/storage and ignores forged permission", async () => {
    // If the route reached repository configuration this deliberately invalid
    // value would throw. A fixed denial proves the guard runs first.
    vi.stubEnv("REDS_DATABASE_URL", "not-a-postgres-url");
    vi.stubEnv(
      "REDS_PUBLIC_DATA_PROCESSING_APPROVAL_REF",
      "PRIVATE_APPROVAL_CONFIG_MARKER",
    );
    const rawText = "PRIVATE_REQUEST_MARKER_ISSUE_29";
    const response = await postBuyer(
      {
        action: "start_and_parse",
        sessionId: "session_public_bypass_attempt",
        rawRequestText: rawText,
        processingApproved: true,
      },
      {
        "x-processing-approved": "true",
        cookie: "processing_approved=true",
      },
    );
    const payload: unknown = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ error: PUBLIC_DATA_WRITE_DISABLED });
    expect(JSON.stringify(payload)).not.toContain(rawText);
    expect(JSON.stringify(payload)).not.toContain(
      "PRIVATE_APPROVAL_CONFIG_MARKER",
    );
    expect(JSON.stringify(payload)).not.toContain("not-a-postgres-url");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("creates no journey, audit, error, or expert row when writes are denied", async () => {
    const repositories = getApplicationRepositorySet();
    const saveJourney = vi.spyOn(repositories.repository, "saveJourney");
    const recordAudit = vi.spyOn(repositories.instrumentation, "record");
    const recordError = vi.spyOn(repositories.errorRepository, "record");
    const createExpert = vi.spyOn(repositories.expertRepository, "create");

    const buyerResponse = await postBuyer({
      action: "start_and_parse",
      sessionId: "session_no_write",
      rawRequestText: "Синтетический запрос не должен сохраниться.",
    });
    const expertResponse = await postExpertRequest(
      new Request("http://public.example/api/expert-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ processingApproved: true }),
      }),
    );
    const workbenchResponse = await postExpertWorkbench(
      new Request("http://public.example/api/expert-workbench/request_forged", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "claim" }),
      }),
      { params: Promise.resolve({ requestId: "request_forged" }) },
    );

    expect(buyerResponse.status).toBe(503);
    expect(expertResponse.status).toBe(503);
    expect(workbenchResponse.status).toBe(503);
    expect(saveJourney).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    expect(recordError).not.toHaveBeenCalled();
    expect(createExpert).not.toHaveBeenCalled();
    expect(await repositories.expertRepository.listAll()).toEqual([]);
  });

  it("keeps read-only recovery available without writing an error row", async () => {
    const repositories = getApplicationRepositorySet();
    const recordError = vi.spyOn(repositories.errorRepository, "record");

    const response = await postBuyer({
      action: "snapshot",
      journeyId: "missing_journey",
      sessionId: "session_read_only",
    });

    expect(response.status).toBe(422);
    expect(recordError).not.toHaveBeenCalled();
  });

  it("reads an existing journey without creating repository records", async () => {
    vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", "synthetic_test");
    const startedResponse = await postBuyer({
      action: "start_and_parse",
      sessionId: "session_read_existing",
      rawRequestText: "Синтетический запрос для проверки восстановления.",
    });
    expect(startedResponse.status).toBe(201);
    const started: unknown = await startedResponse.json();
    const journey =
      typeof started === "object" && started !== null
        ? Reflect.get(started, "journey")
        : null;
    const journeyId =
      typeof journey === "object" && journey !== null
        ? Reflect.get(journey, "journey_id")
        : null;
    expect(typeof journeyId).toBe("string");
    if (typeof journeyId !== "string") throw new Error("journey id missing");

    const repositories = getApplicationRepositorySet();
    const auditBefore = await repositories.instrumentation.list(journeyId);
    const errorsBefore = await repositories.errorRepository.list(journeyId);
    const expertsBefore = await repositories.expertRepository.listAll();
    const journeyBefore = await repositories.repository.getJourney(journeyId);

    vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", "disabled");
    const stateResponse = await postBuyer({
      action: "journey_state",
      journeyId,
      sessionId: "session_read_existing",
    });
    const snapshotResponse = await postBuyer({
      action: "snapshot",
      journeyId,
      sessionId: "session_read_existing",
    });

    expect(stateResponse.status).toBe(200);
    expect(snapshotResponse.status).toBe(200);
    expect(await repositories.instrumentation.list(journeyId)).toEqual(
      auditBefore,
    );
    expect(await repositories.errorRepository.list(journeyId)).toEqual(
      errorsBefore,
    );
    expect(await repositories.expertRepository.listAll()).toEqual(
      expertsBefore,
    );
    expect(await repositories.repository.getJourney(journeyId)).toEqual(
      journeyBefore,
    );
  });

  it("preserves the explicitly trusted synthetic HTTP scenario", async () => {
    vi.stubEnv("REDS_PUBLIC_DATA_WRITE_MODE", "synthetic_test");
    const response = await postBuyer({
      action: "start_and_parse",
      sessionId: "session_synthetic_issue_29",
      rawRequestText: "Ищу квартиру для жизни.",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      journey: { session_id: "session_synthetic_issue_29" },
    });
  });
});
