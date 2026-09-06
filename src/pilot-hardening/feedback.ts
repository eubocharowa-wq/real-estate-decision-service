import type {
  JourneyFeedback,
  PilotFeedbackStage,
  PilotTelemetryEvent,
} from "./contracts";
import {
  runInMemoryTransaction,
  type TransactionalRepository,
} from "../persistence";
import type { PilotTelemetry } from "./telemetry";

export interface FeedbackRepository extends TransactionalRepository {
  save(feedback: JourneyFeedback): Promise<void>;
  list(journeyId: string): Promise<readonly JourneyFeedback[]>;
}

export class InMemoryFeedbackRepository implements FeedbackRepository {
  private readonly values = new Map<string, JourneyFeedback[]>();

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return runInMemoryTransaction(work);
  }

  async save(feedback: JourneyFeedback): Promise<void> {
    const current = this.values.get(feedback.journey_id) ?? [];
    current.push(structuredClone(feedback));
    this.values.set(feedback.journey_id, current);
  }

  async list(journeyId: string): Promise<readonly JourneyFeedback[]> {
    return (this.values.get(journeyId) ?? []).map((value) =>
      structuredClone(value),
    );
  }
}

const stages = new Set<PilotFeedbackStage>([
  "shortlist",
  "comparison",
  "expert_result",
  "journey_end",
]);
const answers = new Set<JourneyFeedback["answer"]>([
  "yes",
  "partly",
  "no",
  "not_sure",
]);

export class JourneyFeedbackService {
  private sequence = 0;

  constructor(
    private readonly repository: FeedbackRepository,
    private readonly telemetry: PilotTelemetry,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async submit(input: {
    readonly journeyId: string;
    readonly sessionId: string;
    readonly journeyStage: PilotTelemetryEvent["stage"];
    readonly stage: PilotFeedbackStage;
    readonly questionCode: string;
    readonly answer: JourneyFeedback["answer"];
    readonly optionalComment?: string | null;
  }): Promise<JourneyFeedback> {
    if (
      !input.journeyId.trim() ||
      !input.sessionId.trim() ||
      !input.questionCode.trim() ||
      !stages.has(input.stage) ||
      !answers.has(input.answer)
    )
      throw new Error("INVALID_JOURNEY_FEEDBACK");
    const comment = input.optionalComment?.trim() || null;
    if (comment && comment.length > 2_000)
      throw new Error("FEEDBACK_COMMENT_TOO_LONG");
    const feedback: JourneyFeedback = {
      feedback_id: `journey_feedback_${++this.sequence}`,
      journey_id: input.journeyId,
      stage: input.stage,
      question_code: input.questionCode,
      answer: input.answer,
      optional_comment: comment,
      created_at: this.clock(),
    };
    await this.repository.save(feedback);
    this.telemetry.record({
      eventName: "journey_feedback_submitted",
      journeyId: input.journeyId,
      sessionId: input.sessionId,
      stage: input.journeyStage,
      occurredAt: feedback.created_at,
      metadata: {
        feedback_id: feedback.feedback_id,
        feedback_stage: feedback.stage,
        question_code: feedback.question_code,
        answer: feedback.answer,
        has_comment: feedback.optional_comment !== null,
      },
    });
    return structuredClone(feedback);
  }
}
