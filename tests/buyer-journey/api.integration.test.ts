import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "../../app/api/buyer-journeys/route";
import { resetBuyerJourneyRuntimeForTests } from "../../src/buyer-journey";
import {
  confirmRequest,
  createConfirmationSession,
} from "../../src/request-confirmation";
import { userRequestParserOutcomeSchema } from "../../src/user-request-parser";
import { UserUrlIngestionOrchestrator } from "../../src/user-url-ingestion";
import { GOLDEN_RAW_REQUEST } from "./helpers";

const post = (body: unknown) =>
  POST(
    new Request("http://local.test/api/buyer-journeys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("buyer journey HTTP application boundary", async () => {
  beforeEach(() => resetBuyerJourneyRuntimeForTests());

  it("propagates journey/session refs without putting domain objects in URLs", async () => {
    const started = await post({
      action: "start_and_parse",
      sessionId: "session_api_golden",
      rawRequestText: GOLDEN_RAW_REQUEST,
    });
    expect(started.status).toBe(201);
    const startedBody: unknown = await started.json();
    const journey = Reflect.get(startedBody as object, "journey") as {
      journey_id: string;
    };
    const parserOutcome = userRequestParserOutcomeSchema.parse(
      Reflect.get(startedBody as object, "parserOutcome"),
    );
    if (!parserOutcome.success) throw new Error(parserOutcome.error.message);
    const confirmation = confirmRequest(
      createConfirmationSession(parserOutcome.result),
      "2026-08-15T00:00:00.000Z",
    ).confirmation_result;
    expect(confirmation).not.toBeNull();

    const confirmed = await post({
      action: "confirm_and_match",
      journeyId: journey.journey_id,
      sessionId: "session_api_golden",
      confirmationResult: confirmation,
    });
    expect(confirmed.status).toBe(200);
    const confirmedBody: unknown = await confirmed.json();
    expect(
      Reflect.get(
        Reflect.get(confirmedBody as object, "bundle") as object,
        "user_request_version",
      ),
    ).toBe(1);

    const shortlist = await post({
      action: "shortlist",
      journeyId: journey.journey_id,
      sessionId: "session_api_golden",
    });
    expect(shortlist.status).toBe(200);
    const shortlistBody: unknown = await shortlist.json();
    expect(
      Reflect.get(
        Reflect.get(shortlistBody as object, "view") as object,
        "cards",
      ),
    ).toHaveLength(5);

    const denied = await post({
      action: "shortlist",
      journeyId: journey.journey_id,
      sessionId: "session_other",
    });
    expect(denied.status).toBe(422);
    const deniedBody: unknown = await denied.json();
    expect(Reflect.get(deniedBody as object, "message")).toBe(
      "Активный путь выбора не найден. Начните с описания условий.",
    );
  });

  it("attaches an offline URL candidate to the owned journey matching bundle", async () => {
    const started = await post({
      action: "start_and_parse",
      sessionId: "session_api_url",
      rawRequestText: GOLDEN_RAW_REQUEST,
    });
    const startedBody: unknown = await started.json();
    const journeyId = String(
      Reflect.get(
        Reflect.get(startedBody as object, "journey") as object,
        "journey_id",
      ),
    );
    const parserOutcome = userRequestParserOutcomeSchema.parse(
      Reflect.get(startedBody as object, "parserOutcome"),
    );
    if (!parserOutcome.success) throw new Error(parserOutcome.error.message);
    const confirmation = confirmRequest(
      createConfirmationSession(parserOutcome.result),
      "2026-08-15T00:00:00.000Z",
    ).confirmation_result;
    await post({
      action: "confirm_and_match",
      journeyId,
      sessionId: "session_api_url",
      confirmationResult: confirmation,
    });

    const ingestion = new UserUrlIngestionOrchestrator({
      now: () => new Date("2026-08-15T00:00:00.000Z"),
    });
    const preview = await ingestion.preview(
      "https://fixture.example/listing/apartment",
    );
    const outcome = ingestion.confirm(preview, preview.editableFields);
    if (!outcome.success) throw new Error(outcome.error.message);

    const attached = await post({
      action: "add_user_url",
      journeyId,
      sessionId: "session_api_url",
      candidate: outcome.candidate,
    });
    expect(attached.status).toBe(200);
    const attachedBody: unknown = await attached.json();
    expect(
      Reflect.get(
        Reflect.get(attachedBody as object, "update") as object,
        "trigger_type",
      ),
    ).toBe("user_url_ingestion");

    const snapshot = await post({
      action: "snapshot",
      journeyId,
      sessionId: "session_api_url",
    });
    const snapshotBody: unknown = await snapshot.json();
    const data = Reflect.get(snapshotBody as object, "snapshot") as object;
    expect(Reflect.get(data, "imported_candidates")).toHaveLength(1);
  });
});
