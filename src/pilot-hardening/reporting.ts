import type {
  ApplicationErrorRecord,
  JourneyFeedback,
  PilotFeedbackStage,
  PilotTelemetryEvent,
  PilotTelemetryEventName,
} from "./contracts";

export interface PilotOutcomeMetrics {
  readonly journey_count: number;
  readonly request_confirmation_rate: number;
  readonly request_edit_rate: number;
  readonly shortlist_open_rate: number;
  readonly property_detail_open_rate: number;
  readonly comparison_creation_rate: number;
  readonly expert_request_rate: number;
  readonly journey_completion_rate: number;
  readonly decision_quality_proxies: Readonly<
    Record<
      PilotFeedbackStage,
      Readonly<Record<JourneyFeedback["answer"], number>>
    >
  >;
}

const journeyIdsFor = (
  events: readonly PilotTelemetryEvent[],
  eventName: PilotTelemetryEventName,
): ReadonlySet<string> =>
  new Set(
    events
      .filter((event) => event.event_name === eventName)
      .map((event) => event.journey_id),
  );

const rate = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));

const emptyAnswers = (): Record<JourneyFeedback["answer"], number> => ({
  yes: 0,
  partly: 0,
  no: 0,
  not_sure: 0,
});

export const buildPilotOutcomeMetrics = (input: {
  readonly events: readonly PilotTelemetryEvent[];
  readonly feedback: readonly JourneyFeedback[];
}): PilotOutcomeMetrics => {
  const started = journeyIdsFor(input.events, "buyer_journey_started");
  const submitted = journeyIdsFor(input.events, "request_submitted");
  const confirmed = journeyIdsFor(input.events, "request_confirmed");
  const shortlist = journeyIdsFor(input.events, "shortlist_viewed");
  const property = journeyIdsFor(input.events, "property_opened");
  const comparison = journeyIdsFor(input.events, "comparison_created");
  const expert = journeyIdsFor(input.events, "expert_request_created");
  const edited = journeyIdsFor(input.events, "request_edited");
  const completed = new Set(
    input.feedback
      .filter((item) => item.stage === "journey_end")
      .map((item) => item.journey_id),
  );
  const decisionQualityProxies: Record<
    PilotFeedbackStage,
    Record<JourneyFeedback["answer"], number>
  > = {
    shortlist: emptyAnswers(),
    comparison: emptyAnswers(),
    expert_result: emptyAnswers(),
    journey_end: emptyAnswers(),
  };
  for (const item of input.feedback)
    decisionQualityProxies[item.stage][item.answer] += 1;
  return {
    journey_count: started.size,
    request_confirmation_rate: rate(confirmed.size, submitted.size),
    request_edit_rate: rate(edited.size, submitted.size),
    shortlist_open_rate: rate(shortlist.size, confirmed.size),
    property_detail_open_rate: rate(property.size, shortlist.size),
    comparison_creation_rate: rate(comparison.size, shortlist.size),
    expert_request_rate: rate(expert.size, shortlist.size),
    journey_completion_rate: rate(completed.size, started.size),
    decision_quality_proxies: decisionQualityProxies,
  };
};

export interface PilotFeedbackReviewReport {
  readonly schema_version: "pilot-feedback-review-v1";
  readonly outcome_metrics: PilotOutcomeMetrics;
  readonly feedback_by_stage: Readonly<Record<PilotFeedbackStage, number>>;
  readonly common_errors: readonly {
    readonly code: string;
    readonly count: number;
  }[];
  readonly common_edits: readonly {
    readonly code: string;
    readonly count: number;
  }[];
  readonly common_unknowns: readonly {
    readonly field: string;
    readonly count: number;
  }[];
  readonly common_source_gaps: readonly {
    readonly gap: string;
    readonly count: number;
  }[];
  readonly generated_at: string;
}

const ranked = (
  values: readonly string[],
  key: "code" | "field" | "gap",
): readonly Record<string, string | number>[] => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort(
      ([leftValue, leftCount], [rightValue, rightCount]) =>
        rightCount - leftCount || leftValue.localeCompare(rightValue),
    )
    .map(([value, count]) => ({ [key]: value, count }));
};

export const buildPilotFeedbackReviewReport = (input: {
  readonly events: readonly PilotTelemetryEvent[];
  readonly feedback: readonly JourneyFeedback[];
  readonly errors: readonly ApplicationErrorRecord[];
  readonly unknownFields: readonly string[];
  readonly sourceGaps: readonly string[];
  readonly generatedAt: string;
}): PilotFeedbackReviewReport => ({
  schema_version: "pilot-feedback-review-v1",
  outcome_metrics: buildPilotOutcomeMetrics(input),
  feedback_by_stage: {
    shortlist: input.feedback.filter((item) => item.stage === "shortlist")
      .length,
    comparison: input.feedback.filter((item) => item.stage === "comparison")
      .length,
    expert_result: input.feedback.filter(
      (item) => item.stage === "expert_result",
    ).length,
    journey_end: input.feedback.filter((item) => item.stage === "journey_end")
      .length,
  },
  common_errors: ranked(
    input.errors.map((error) => error.error_code),
    "code",
  ) as PilotFeedbackReviewReport["common_errors"],
  common_edits: ranked(
    input.events
      .filter((event) => event.event_name === "request_edited")
      .map(() => "request_edited"),
    "code",
  ) as PilotFeedbackReviewReport["common_edits"],
  common_unknowns: ranked(
    input.unknownFields,
    "field",
  ) as PilotFeedbackReviewReport["common_unknowns"],
  common_source_gaps: ranked(
    input.sourceGaps,
    "gap",
  ) as PilotFeedbackReviewReport["common_source_gaps"],
  generated_at: input.generatedAt,
});
