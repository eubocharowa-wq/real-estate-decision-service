import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../../app/api/buyer-journeys/route";
import {
  getBuyerJourneyRuntime,
  resetBuyerJourneyRuntimeForTests,
} from "../../src/buyer-journey";

const originalApplicationMode = process.env.REDS_APPLICATION_MODE;
const originalDatabaseUrl = process.env.DATABASE_URL;

const restoreEnvironmentValue = (
  key: "DATABASE_URL" | "REDS_APPLICATION_MODE",
  value: string | undefined,
): void => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

const startJourneyThroughHttpRoute = async (sessionId: string) => {
  const response = await POST(
    new Request("http://local.test/api/buyer-journeys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "start_and_parse",
        sessionId,
        rawRequestText: "Ищу квартиру для жизни.",
      }),
    }),
  );
  const body: unknown = await response.json();
  const journey = Reflect.get(body as object, "journey") as
    { readonly journey_id?: unknown } | undefined;
  const journeyId = journey?.journey_id;
  if (typeof journeyId !== "string")
    throw new Error("HTTP route did not return a journey id");
  return journeyId;
};

beforeEach(() => {
  delete process.env.DATABASE_URL;
  resetBuyerJourneyRuntimeForTests();
});

afterEach(() => {
  restoreEnvironmentValue("REDS_APPLICATION_MODE", originalApplicationMode);
  restoreEnvironmentValue("DATABASE_URL", originalDatabaseUrl);
  resetBuyerJourneyRuntimeForTests();
});

describe("buyer journey runtime mode wiring", () => {
  it("passes pilot mode through the runtime used by the HTTP route", async () => {
    process.env.REDS_APPLICATION_MODE = "pilot";

    const journeyId = await startJourneyThroughHttpRoute(
      "session_runtime_mode_pilot",
    );
    const event = getBuyerJourneyRuntime()
      .pilotTelemetry.list(journeyId)
      .find((candidate) => candidate.event_name === "buyer_journey_started");

    expect(event?.environment).toBe("pilot");
  });

  it("keeps demo mode when the environment variable is absent", async () => {
    delete process.env.REDS_APPLICATION_MODE;

    const journeyId = await startJourneyThroughHttpRoute(
      "session_runtime_mode_demo",
    );
    const event = getBuyerJourneyRuntime()
      .pilotTelemetry.list(journeyId)
      .find((candidate) => candidate.event_name === "buyer_journey_started");

    expect(event?.environment).toBe("demo");
  });
});
