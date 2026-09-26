import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BuyerJourneyApplication } from "../../src/buyer-journey";
import {
  resolveExpertWorkbenchActor,
  ScopedExpertWorkbenchPermissionPolicy,
} from "../../src/expert-workbench";
import { createInMemoryRepositorySet } from "../../src/persistence";
import {
  demoRuntimeConfig,
  runRealExpertRuntimeGoldenFlow,
} from "./real-runtime-cases";

describe("TASK-025A real expert runtime", () => {
  it("carries one persisted request through workbench, result and affected recompute", async () => {
    const repositories = createInMemoryRepositorySet();
    await runRealExpertRuntimeGoldenFlow({
      open: () => ({
        repositories,
        application: new BuyerJourneyApplication({
          repository: repositories.repository,
          expertRepository: repositories.expertRepository,
          instrumentation: repositories.instrumentation,
          feedbackRepository: repositories.feedbackRepository,
          errorRepository: repositories.errorRepository,
          pilotRuntimeConfig: demoRuntimeConfig,
        }),
      }),
    });
  });

  it("keeps fixture runtime out of production expert route boundaries", () => {
    for (const file of [
      "app/expert/requests/page.tsx",
      "app/expert/requests/[requestId]/page.tsx",
      "app/expert/results/[requestId]/page.tsx",
      "app/api/expert-workbench/[requestId]/route.ts",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source, file).not.toContain("getExpertWorkbenchFixtureRuntime");
      expect(source, file).not.toContain("EXPERT_FIXTURE_ACTORS");
    }
  });

  it("fails closed when the trusted expert actor is absent or invalid", () => {
    expect(resolveExpertWorkbenchActor({})).toEqual({
      actor_type: "unknown",
      actor_ref: null,
    });
    expect(
      resolveExpertWorkbenchActor({
        REDS_EXPERT_ACTOR_REF: "operator",
        REDS_EXPERT_SPECIALIST_TYPE: "not_a_specialist",
      }),
    ).toEqual({ actor_type: "unknown", actor_ref: null });
    expect(
      resolveExpertWorkbenchActor({
        REDS_EXPERT_ACTOR_REF: "operator",
        REDS_EXPERT_SPECIALIST_TYPE: "real_estate_expert",
      }),
    ).toMatchObject({
      actor_type: "expert",
      actor_ref: "operator",
      specialist_type: "real_estate_expert",
    });
  });

  it("does not grant owner access from request id alone", () => {
    const policy = new ScopedExpertWorkbenchPermissionPolicy();
    const request = {
      owner: { owner_type: "session" as const, owner_id: "owner_a" },
    } as Parameters<typeof policy.canViewExpertRequest>[1];
    expect(
      policy.canViewExpertRequest(
        {
          actor_type: "owner",
          actor_ref: "owner_b",
          owner: { owner_type: "session", owner_id: "owner_b" },
        },
        request,
      ),
    ).toBe(false);
  });
});
