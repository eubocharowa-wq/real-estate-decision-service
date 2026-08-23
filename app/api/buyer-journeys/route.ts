import {
  BuyerJourneyError,
  getBuyerJourneyRuntime,
  presentJourneyError,
  type CreateJourneyExpertRequestInput,
} from "../../../src/buyer-journey";

export const runtime = "nodejs";

const stringValue = (body: object, key: string): string | null => {
  const value = Reflect.get(body, key);
  return typeof value === "string" && value.trim() ? value : null;
};

const stringList = (body: object, key: string): readonly string[] => {
  const value = Reflect.get(body, key);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
};

const failure = (error: unknown): Response => {
  const journeyError =
    error instanceof BuyerJourneyError
      ? error
      : new BuyerJourneyError(
          "INVALID_TRANSITION",
          "Buyer journey action failed",
          true,
        );
  const presentation = presentJourneyError(journeyError.code);
  return Response.json(
    {
      error: journeyError.code,
      title: presentation.title,
      message: presentation.message,
      recovery: {
        label: presentation.action_label,
        href: presentation.action_href,
      },
    },
    { status: journeyError.code === "ENTITY_NOT_FOUND" ? 404 : 422 },
  );
};

const requireOwnedJourney = (
  body: object,
): { readonly journeyId: string; readonly sessionId: string } => {
  const journeyId = stringValue(body, "journeyId");
  const sessionId = stringValue(body, "sessionId");
  if (!journeyId || !sessionId)
    throw new BuyerJourneyError(
      "MISSING_JOURNEY_CONTEXT",
      "Journey and session are required",
      true,
    );
  const journey = getBuyerJourneyRuntime().getJourney(journeyId);
  if (journey.session_id !== sessionId)
    throw new BuyerJourneyError(
      "MISSING_JOURNEY_CONTEXT",
      "Journey is not owned by this session",
      true,
    );
  return { journeyId, sessionId };
};

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(
      new BuyerJourneyError(
        "INVALID_TRANSITION",
        "Request body must be JSON",
        true,
      ),
    );
  }
  if (typeof body !== "object" || body === null) return failure(body);
  const action = stringValue(body, "action");
  const application = getBuyerJourneyRuntime();
  try {
    if (action === "start_and_parse") {
      const sessionId = stringValue(body, "sessionId");
      const rawRequestText = stringValue(body, "rawRequestText");
      if (!sessionId || !rawRequestText)
        throw new BuyerJourneyError(
          "MISSING_JOURNEY_CONTEXT",
          "Session and request text are required",
          true,
        );
      const journey = application.startBuyerJourney({
        sessionId,
        rawRequestText,
      });
      const parserOutcome = await application.parseBuyerRequest(
        journey.journey_id,
      );
      return Response.json(
        { journey: application.getJourney(journey.journey_id), parserOutcome },
        { status: parserOutcome.success ? 201 : 422 },
      );
    }

    const { journeyId } = requireOwnedJourney(body);
    if (action === "confirm_and_match") {
      application.confirmBuyerRequest(
        journeyId,
        Reflect.get(body, "confirmationResult"),
      );
      const result = application.runJourneyMatching(journeyId);
      return Response.json(result);
    }
    if (action === "shortlist")
      return Response.json({ view: application.getShortlist(journeyId) });
    if (action === "open_property") {
      const propertyId = stringValue(body, "propertyId");
      if (!propertyId)
        throw new BuyerJourneyError(
          "ENTITY_NOT_FOUND",
          "Property ID is required",
          false,
        );
      return Response.json({
        view: application.openJourneyProperty(journeyId, propertyId),
      });
    }
    if (action === "comparison") {
      const result = application.createJourneyComparison(
        journeyId,
        stringList(body, "propertyIds"),
      );
      return Response.json(result);
    }
    if (action === "add_user_url") {
      const candidate = Reflect.get(body, "candidate");
      if (!candidate)
        throw new BuyerJourneyError(
          "INGESTION_FAILED",
          "Normalized URL candidate is required",
          true,
        );
      return Response.json(
        application.addUserUrlCandidate(journeyId, candidate),
      );
    }
    if (action === "create_expert_request") {
      const input = Reflect.get(body, "input") as
        CreateJourneyExpertRequestInput | undefined;
      if (!input)
        throw new BuyerJourneyError(
          "INVALID_TRANSITION",
          "Expert request input is required",
          true,
        );
      return Response.json(
        { request: application.createJourneyExpertRequest(journeyId, input) },
        { status: 201 },
      );
    }
    if (action === "snapshot")
      return Response.json({
        journey: application.getJourney(journeyId),
        snapshot: application.getJourneySnapshot(journeyId),
      });
    throw new BuyerJourneyError(
      "INVALID_TRANSITION",
      "Unknown buyer journey action",
      true,
    );
  } catch (error) {
    return failure(error);
  }
}
