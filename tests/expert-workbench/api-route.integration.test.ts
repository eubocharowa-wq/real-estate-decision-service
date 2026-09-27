import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../app/api/expert-workbench/[requestId]/route";
import {
  getBuyerJourneyRuntime,
  resetBuyerJourneyRuntimeForTests,
} from "../../src/buyer-journey";
import {
  expertResultDraftSchema,
  getRealExpertWorkbenchRuntime,
} from "../../src/expert-workbench";
import {
  confirmParsedJourney,
  GOLDEN_RAW_REQUEST,
} from "../buyer-journey/helpers";

const post = (requestId: string, body: unknown) =>
  POST(
    new Request(
      `http://local.test/api/expert-workbench/${encodeURIComponent(requestId)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ requestId }) },
  );

describe("expert workbench HTTP mutation boundary", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDS_EXPERT_ACTOR_REF", "specialist_http_regression");
    vi.stubEnv("REDS_EXPERT_SPECIALIST_TYPE", "real_estate_expert");
    resetBuyerJourneyRuntimeForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetBuyerJourneyRuntimeForTests();
  });

  it("awaits a saved draft before a separate completion request", async () => {
    const buyerApplication = getBuyerJourneyRuntime();
    const journey = await buyerApplication.startBuyerJourney({
      sessionId: "session_expert_http_regression",
      rawRequestText: GOLDEN_RAW_REQUEST,
    });
    await confirmParsedJourney(buyerApplication, journey);
    await buyerApplication.runJourneyMatching(journey.journey_id);
    await buyerApplication.openJourneyProperty(
      journey.journey_id,
      "prop_nb_002",
    );
    const expertRequest = await buyerApplication.createJourneyExpertRequest(
      journey.journey_id,
      {
        requestType: "information_verification",
        triggerType: "user_requested",
        questionCategory: "price",
        question: "Подтвердите цену выбранного предложения перед решением.",
        propertyIds: ["prop_nb_002"],
        field: "listing_price",
        questionCode: "verify_selected_offer_price",
      },
    );

    const workbench = getRealExpertWorkbenchRuntime();
    const actor = workbench.actor;
    if (actor.actor_type !== "expert")
      throw new Error("Expected configured expert actor");
    await workbench.application.claimRequest(actor, expertRequest.request_id);
    await workbench.application.transition({
      actor,
      requestId: expertRequest.request_id,
      status: "in_progress",
      reasonCode: "EXPERT_STARTED_WORK",
    });
    const input = await workbench.application.openWorkbench(
      actor,
      expertRequest.request_id,
    );
    const draft = {
      ...input.currentResultDraft,
      check_items: input.currentResultDraft.check_items.map((item) => ({
        ...item,
        status: "not_required" as const,
      })),
    };

    const saveResponse = await post(expertRequest.request_id, {
      type: "save_draft",
      draft,
    });
    expect(saveResponse.status).toBe(200);
    const savedDraft = expertResultDraftSchema.parse(await saveResponse.json());
    expect(savedDraft.request_id).toBe(expertRequest.request_id);
    expect(savedDraft).toEqual(
      await workbench.drafts.get(expertRequest.request_id),
    );

    const completeResponse = await post(expertRequest.request_id, {
      type: "complete",
    });
    const completion: unknown = await completeResponse.json();
    expect(completeResponse.status).toBe(200);
    expect(completion).not.toEqual({
      error: "EXPERT_RESULT_DRAFT_NOT_FOUND",
    });
  });
});
