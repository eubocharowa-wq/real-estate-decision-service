import {
  JOURNEY_INSTRUMENTATION_VERSION,
  type BuyerJourney,
  type JourneyAuditEvent,
  type JourneyAuditEventType,
} from "./contracts";

export interface JourneyInstrumentation {
  record(input: {
    readonly journey: BuyerJourney;
    readonly eventType: JourneyAuditEventType;
    readonly occurredAt: string;
    readonly metadata?: Readonly<
      Record<string, string | number | boolean | null>
    >;
  }): Promise<void>;
  list(journeyId: string): Promise<readonly JourneyAuditEvent[]>;
}

const safeMetadata = (
  metadata: Readonly<Record<string, string | number | boolean | null>>,
) =>
  Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) =>
        ![
          "raw_request_text",
          "document_content",
          "private_url",
          "personal_finance",
        ].includes(key),
    ),
  );

export class InMemoryJourneyInstrumentation implements JourneyInstrumentation {
  private readonly events = new Map<string, JourneyAuditEvent[]>();
  private sequence = 0;

  async record(input: {
    readonly journey: BuyerJourney;
    readonly eventType: JourneyAuditEventType;
    readonly occurredAt: string;
    readonly metadata?: Readonly<
      Record<string, string | number | boolean | null>
    >;
  }): Promise<void> {
    const event: JourneyAuditEvent = {
      instrumentation_version: JOURNEY_INSTRUMENTATION_VERSION,
      event_id: `journey_event_${++this.sequence}`,
      journey_id: input.journey.journey_id,
      session_id: input.journey.session_id,
      event_type: input.eventType,
      occurred_at: input.occurredAt,
      metadata: safeMetadata(input.metadata ?? {}),
    };
    const current = this.events.get(input.journey.journey_id) ?? [];
    current.push(structuredClone(event));
    this.events.set(input.journey.journey_id, current);
  }

  async list(journeyId: string): Promise<readonly JourneyAuditEvent[]> {
    return (this.events.get(journeyId) ?? []).map((event) =>
      structuredClone(event),
    );
  }
}
