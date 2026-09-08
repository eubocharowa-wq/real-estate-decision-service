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

const failure = (error: unknown, errorId?: string): Response => {
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
      errorId: errorId ?? null,
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

const requireOwnedJourney = async (
  body: object,
): Promise<{ readonly journeyId: string; readonly sessionId: string }> => {
  const journeyId = stringValue(body, "journeyId");
  const sessionId = stringValue(body, "sessionId");
  if (!journeyId || !sessionId)
    throw new BuyerJourneyError(
      "MISSING_JOURNEY_CONTEXT",
      "Journey and session are required",
      true,
    );
  const journey = await getBuyerJourneyRuntime().getJourney(journeyId);
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
      const journey = await application.startBuyerJourney({
        sessionId,
        rawRequestText,
      });
      const parserOutcome = await application.parseBuyerRequest(
        journey.journey_id,
      );
      return Response.json(
        {
          journey: await application.getJourney(journey.journey_id),
          parserOutcome,
        },
        { status: parserOutcome.success ? 201 : 422 },
      );
    }

    const { journeyId } = await requireOwnedJourney(body);
    if (action === "confirm_and_match") {
      await application.confirmBuyerRequest(
        journeyId,
        Reflect.get(body, "confirmationResult"),
      );
      const result = await application.runJourneyMatching(journeyId);
      return Response.json(result);
    }
    if (action === "shortlist")
      return Response.json({
        view: await application.getShortlist(journeyId),
        coverage: await application.getJourneyCoverage(journeyId),
      });
    if (action === "open_property") {
      const propertyId = stringValue(body, "propertyId");
      if (!propertyId)
        throw new BuyerJourneyError(
          "ENTITY_NOT_FOUND",
          "Property ID is required",
          false,
        );
      return Response.json({
        view: await application.openJourneyProperty(journeyId, propertyId),
      });
    }
    if (action === "comparison") {
      const result = await application.createJourneyComparison(
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
        await application.addUserUrlCandidate(journeyId, candidate),
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
        {
          request: await application.createJourneyExpertRequest(
            journeyId,
            input,
          ),
        },
        { status: 201 },
      );
    }
    if (action === "submit_feedback") {
      const stage = stringValue(body, "stage");
      const questionCode = stringValue(body, "questionCode");
      const answer = stringValue(body, "answer");
      const optionalComment =
        typeof Reflect.get(body, "optionalComment") === "string"
          ? String(Reflect.get(body, "optionalComment"))
          : null;
      if (!stage || !questionCode || !answer)
        throw new BuyerJourneyError(
          "INVALID_TRANSITION",
          "Feedback boundary requires stage, question and answer",
          true,
        );
      const feedback = await application.submitJourneyFeedback({
        journeyId,
        stage: stage as Parameters<
          typeof application.submitJourneyFeedback
        >[0]["stage"],
        questionCode,
        answer: answer as Parameters<
          typeof application.submitJourneyFeedback
        >[0]["answer"],
        optionalComment,
      });
      return Response.json({ feedback }, { status: 201 });
    }
    if (action === "journey_state")
      return Response.json({
        state: await application.getJourneyClientState(journeyId),
      });
    if (action === "comparison_selection") {
      const selection = Reflect.get(body, "selection");
      const journey = await application.saveComparisonSelection(
        journeyId,
        selection === null || selection === undefined
          ? null
          : (selection as Parameters<
              typeof application.saveComparisonSelection
            >[1]),
      );
      return Response.json({
        selection: journey.comparison_selection,
      });
    }
    if (action === "snapshot")
      return Response.json({
        journey: await application.getJourney(journeyId),
        snapshot: await application.getJourneySnapshot(journeyId),
        diagnostics: await application.getJourneyDiagnostics(journeyId),
      });
    throw new BuyerJourneyError(
      "INVALID_TRANSITION",
      "Unknown buyer journey action",
      true,
    );
  } catch (error) {
    const journeyId = stringValue(body, "journeyId");
    const errorCode =
      error instanceof BuyerJourneyError ? error.code : "INVALID_TRANSITION";
    const layer =
      errorCode === "SOURCE_POLICY_BLOCKED"
        ? ("source_policy" as const)
        : action === "start_and_parse"
          ? ("parser" as const)
          : action === "confirm_and_match"
            ? ("matching" as const)
            : action === "shortlist" || action === "open_property"
              ? ("shortlist" as const)
              : action === "comparison"
                ? ("comparison" as const)
                : action === "add_user_url"
                  ? ("user_url_ingestion" as const)
                  : action === "create_expert_request"
                    ? ("expert_workflow" as const)
                    : ("recompute" as const);
    const record = await application.recordApplicationError({
      errorCode,
      layer,
      journeyId,
      recoverable:
        error instanceof BuyerJourneyError ? error.recoverable : true,
      userVisible: true,
      contextIds: action ? { action } : {},
    });
    return failure(error, record.error_id);
  }
}
