import {
  PILOT_TELEMETRY_VERSION,
  type PilotTelemetryEvent,
  type PilotTelemetryEventName,
} from "./contracts";
import type { PilotRuntimeConfig } from "./config";

const forbiddenKeyFragments = [
  "raw_request",
  "document",
  "phone",
  "email",
  "financing_profile",
  "token",
  "secret",
  "password",
  "cookie",
  "authorization",
  "private_url",
  "expert_text",
  "optional_comment",
] as const;

const isSafeMetadataKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return !forbiddenKeyFragments.some((fragment) =>
    normalized.includes(fragment),
  );
};

const looksSensitive = (value: string): boolean =>
  /(?:https?:\/\/|@|\+?\d[\d\s()-]{8,}|bearer\s)/iu.test(value);

export const sanitizeTelemetryMetadata = (
  metadata: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string | number | boolean | null>> => {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!isSafeMetadataKey(key)) continue;
    if (
      value === null ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      safe[key] = value;
    else if (typeof value === "string" && !looksSensitive(value))
      safe[key] = value.slice(0, 160);
  }
  return Object.freeze(safe);
};

export interface PilotTelemetry {
  record(input: {
    readonly eventName: PilotTelemetryEventName;
    readonly journeyId: string;
    readonly sessionId: string;
    readonly stage: PilotTelemetryEvent["stage"];
    readonly occurredAt: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }): PilotTelemetryEvent;
  list(journeyId: string): readonly PilotTelemetryEvent[];
}

export class InMemoryPilotTelemetry implements PilotTelemetry {
  private readonly events = new Map<string, PilotTelemetryEvent[]>();
  private sequence = 0;

  constructor(private readonly config: PilotRuntimeConfig) {}

  record(input: {
    readonly eventName: PilotTelemetryEventName;
    readonly journeyId: string;
    readonly sessionId: string;
    readonly stage: PilotTelemetryEvent["stage"];
    readonly occurredAt: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }): PilotTelemetryEvent {
    const event: PilotTelemetryEvent = {
      schema_version: PILOT_TELEMETRY_VERSION,
      event_id: `pilot_event_${++this.sequence}`,
      event_name: input.eventName,
      journey_id: input.journeyId,
      session_id: input.sessionId,
      stage: input.stage,
      occurred_at: input.occurredAt,
      app_version: this.config.appVersion,
      environment: this.config.mode,
      cohort: this.config.cohort,
      metadata: sanitizeTelemetryMetadata(input.metadata ?? {}),
    };
    const events = this.events.get(input.journeyId) ?? [];
    events.push(structuredClone(event));
    this.events.set(input.journeyId, events);
    return structuredClone(event);
  }

  list(journeyId: string): readonly PilotTelemetryEvent[] {
    return (this.events.get(journeyId) ?? []).map((event) =>
      structuredClone(event),
    );
  }
}
