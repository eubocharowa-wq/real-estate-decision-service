import type {
  BuyerJourney,
  JourneyAuditEvent,
  JourneyAuditEventType,
} from "../../buyer-journey/contracts";
import { JOURNEY_INSTRUMENTATION_VERSION } from "../../buyer-journey/contracts";
import type { JourneyInstrumentation } from "../../buyer-journey/instrumentation";
import type { ExpertResultDraftRepository } from "../../expert-workbench/draft";
import { expertResultDraftSchema } from "../../expert-workbench/contracts";
import type { ExpertResultDraft } from "../../expert-workbench/contracts";
import type { ApplicationErrorRepository } from "../../pilot-hardening/errors";
import type { FeedbackRepository } from "../../pilot-hardening/feedback";
import type {
  ApplicationErrorRecord,
  JourneyFeedback,
} from "../../pilot-hardening/contracts";
import { toIsoString } from "./buyer-journey-repository";
import type { PostgresContext } from "./context";
import {
  applicationErrorDocumentSchema,
  journeyAuditEventSchema,
  journeyFeedbackDocumentSchema,
  parseStored,
} from "./documents";
import { withMappedErrors } from "./errors";

/** Metadata keys the instrumentation refuses to persist. */
const FORBIDDEN_METADATA_KEYS = [
  "raw_request_text",
  "document_content",
  "private_url",
  "personal_finance",
];

const safeMetadata = (
  metadata: Readonly<Record<string, string | number | boolean | null>>,
) =>
  Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) => !FORBIDDEN_METADATA_KEYS.includes(key),
    ),
  );

/**
 * PostgreSQL JourneyInstrumentation.
 *
 * The privacy filter is applied before the write, exactly as the in-memory
 * implementation does: raw request text and document content never reach
 * storage, which matters more once storage is durable.
 */
export class PostgresJourneyInstrumentation implements JourneyInstrumentation {
  private sequence = 0;

  constructor(private readonly context: PostgresContext) {}

  private get db() {
    return this.context.executor;
  }

  record(input: {
    readonly journey: BuyerJourney;
    readonly eventType: JourneyAuditEventType;
    readonly occurredAt: string;
    readonly metadata?: Readonly<
      Record<string, string | number | boolean | null>
    >;
  }): Promise<void> {
    return withMappedErrors(async () => {
      // The in-memory counter is per instance; across processes it would
      // collide, so the id carries the journey and the timestamp too.
      const eventId = `journey_event_${input.journey.journey_id}_${Date.parse(
        input.occurredAt,
      )}_${++this.sequence}`;
      await this.db
        .insertInto("journey_audit_events")
        .values({
          event_id: eventId,
          instrumentation_version: JOURNEY_INSTRUMENTATION_VERSION,
          journey_id: input.journey.journey_id,
          session_id: input.journey.session_id,
          event_type: input.eventType,
          occurred_at: input.occurredAt,
          metadata: safeMetadata(input.metadata ?? {}),
        })
        .execute();
    });
  }

  list(journeyId: string): Promise<readonly JourneyAuditEvent[]> {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("journey_audit_events")
        .selectAll()
        .where("journey_id", "=", journeyId)
        .orderBy("occurred_at")
        .orderBy("event_id")
        .execute();
      return rows.map((row) =>
        parseStored(
          journeyAuditEventSchema,
          {
            instrumentation_version: row.instrumentation_version,
            event_id: row.event_id,
            journey_id: row.journey_id,
            session_id: row.session_id,
            event_type: row.event_type,
            occurred_at: toIsoString(row.occurred_at),
            metadata: row.metadata,
          },
          `journey_audit_events:${row.event_id}`,
        ),
      ) as readonly JourneyAuditEvent[];
    });
  }
}

/** PostgreSQL FeedbackRepository. */
export class PostgresFeedbackRepository implements FeedbackRepository {
  constructor(private readonly context: PostgresContext) {}

  private get db() {
    return this.context.executor;
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return withMappedErrors(() => this.context.transaction(work));
  }

  save(feedback: JourneyFeedback): Promise<void> {
    return withMappedErrors(async () => {
      await this.db
        .insertInto("journey_feedback")
        .values({
          feedback_id: feedback.feedback_id,
          journey_id: feedback.journey_id,
          stage: feedback.stage,
          question_code: feedback.question_code,
          answer: feedback.answer,
          optional_comment: feedback.optional_comment,
          created_at: feedback.created_at,
        })
        .execute();
    });
  }

  list(journeyId: string): Promise<readonly JourneyFeedback[]> {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("journey_feedback")
        .selectAll()
        .where("journey_id", "=", journeyId)
        .orderBy("created_at")
        .orderBy("feedback_id")
        .execute();
      return rows.map((row) =>
        parseStored(
          journeyFeedbackDocumentSchema,
          { ...row, created_at: toIsoString(row.created_at) },
          `journey_feedback:${row.feedback_id}`,
        ),
      ) as readonly JourneyFeedback[];
    });
  }
}

/** PostgreSQL ApplicationErrorRepository. */
export class PostgresApplicationErrorRepository implements ApplicationErrorRepository {
  constructor(private readonly context: PostgresContext) {}

  private get db() {
    return this.context.executor;
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return withMappedErrors(() => this.context.transaction(work));
  }

  record(error: ApplicationErrorRecord): Promise<void> {
    return withMappedErrors(async () => {
      await this.db
        .insertInto("application_errors")
        .values({
          error_id: error.error_id,
          error_code: error.error_code,
          layer: error.layer,
          journey_id: error.journey_id,
          stage: error.stage,
          recoverable: error.recoverable,
          user_visible: error.user_visible,
          occurred_at: error.occurred_at,
          recovered_at: error.recovered_at,
          context_ids: { ...error.context_ids },
          app_version: error.app_version,
        })
        .onConflict((conflict) =>
          conflict.column("error_id").doUpdateSet({
            recovered_at: error.recovered_at,
          }),
        )
        .execute();
    });
  }

  markRecovered(errorId: string, recoveredAt: string): Promise<void> {
    return withMappedErrors(async () => {
      await this.db
        .updateTable("application_errors")
        .set({ recovered_at: recoveredAt })
        .where("error_id", "=", errorId)
        .execute();
    });
  }

  list(journeyId?: string): Promise<readonly ApplicationErrorRecord[]> {
    return withMappedErrors(async () => {
      let query = this.db
        .selectFrom("application_errors")
        .selectAll()
        .orderBy("occurred_at")
        .orderBy("error_id");
      if (journeyId) query = query.where("journey_id", "=", journeyId);
      const rows = await query.execute();
      return rows.map((row) =>
        parseStored(
          applicationErrorDocumentSchema,
          {
            ...row,
            occurred_at: toIsoString(row.occurred_at),
            recovered_at: row.recovered_at
              ? toIsoString(row.recovered_at)
              : null,
          },
          `application_errors:${row.error_id}`,
        ),
      ) as readonly ApplicationErrorRecord[];
    });
  }
}

/** PostgreSQL ExpertResultDraftRepository. Drafts stay mutable by design. */
export class PostgresExpertResultDraftRepository implements ExpertResultDraftRepository {
  constructor(private readonly context: PostgresContext) {}

  private get db() {
    return this.context.executor;
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return withMappedErrors(() => this.context.transaction(work));
  }

  get(requestId: string): Promise<ExpertResultDraft | null> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("expert_result_drafts")
        .select("document")
        .where("request_id", "=", requestId)
        .executeTakeFirst();
      if (!row) return null;
      return parseStored(
        expertResultDraftSchema,
        row.document,
        `expert_result_drafts:${requestId}`,
      );
    });
  }

  save(draft: ExpertResultDraft): Promise<ExpertResultDraft> {
    return withMappedErrors(async () => {
      const parsed = expertResultDraftSchema.parse(draft);
      const row = {
        request_id: parsed.request_id,
        draft_version: parsed.draft_version,
        specialist_ref: parsed.specialist_ref,
        specialist_type: parsed.specialist_type,
        document: parsed,
        updated_at: parsed.updated_at,
      };
      await this.db
        .insertInto("expert_result_drafts")
        .values(row)
        .onConflict((conflict) =>
          conflict.column("request_id").doUpdateSet({
            draft_version: row.draft_version,
            specialist_ref: row.specialist_ref,
            specialist_type: row.specialist_type,
            document: row.document,
            updated_at: row.updated_at,
          }),
        )
        .execute();
      return parsed;
    });
  }
}
