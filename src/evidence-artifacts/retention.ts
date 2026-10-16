import { randomUUID } from "node:crypto";

import { z } from "zod";

import { entityIdSchema, isoDateTimeSchema } from "../domain/common/schema";
import type { EvidenceArtifactRetentionPolicy } from "../domain/evidence-artifact/schema";
import type { EvidenceArtifactBlobStore } from "./blob-store";
import type { EvidenceArtifactRepository } from "./repository";

export const evidenceArtifactBlobStateSchema = z.enum([
  "present",
  "deletion_pending",
  "deleted",
]);
export const evidenceArtifactRetentionEventTypeSchema = z.enum([
  "retention_initialized",
  "retention_extended",
  "legal_hold_placed",
  "legal_hold_released",
  "deletion_claimed",
  "blob_deleted",
]);

export const evidenceArtifactRetentionStateSchema = z.strictObject({
  artifact_id: entityIdSchema,
  effective_retain_until: isoDateTimeSchema.nullable(),
  legal_hold_active: z.boolean(),
  blob_state: evidenceArtifactBlobStateSchema,
  updated_at: isoDateTimeSchema,
});

export const evidenceArtifactRetentionEventSchema = z.strictObject({
  event_id: entityIdSchema,
  artifact_id: entityIdSchema,
  event_type: evidenceArtifactRetentionEventTypeSchema,
  actor_type: z.enum(["system", "operator"]),
  actor_ref: entityIdSchema.nullable(),
  occurred_at: isoDateTimeSchema,
});

export type EvidenceArtifactRetentionState = z.infer<
  typeof evidenceArtifactRetentionStateSchema
>;
export type EvidenceArtifactBlobState = z.infer<
  typeof evidenceArtifactBlobStateSchema
>;
export type EvidenceArtifactRetentionEvent = z.infer<
  typeof evidenceArtifactRetentionEventSchema
>;

export interface EvidenceArtifactRetentionRepository {
  initialize(input: {
    readonly artifactId: string;
    readonly retainUntil: string | null;
    readonly retentionPolicy: EvidenceArtifactRetentionPolicy;
    readonly occurredAt: string;
  }): Promise<EvidenceArtifactRetentionState>;
  getState(artifactId: string): Promise<EvidenceArtifactRetentionState | null>;
  listEvents(
    artifactId: string,
  ): Promise<readonly EvidenceArtifactRetentionEvent[]>;
  extendRetention(
    input: RetentionMutationInput & {
      readonly retainUntil: string;
    },
  ): Promise<EvidenceArtifactRetentionState>;
  placeLegalHold(
    input: RetentionMutationInput,
  ): Promise<EvidenceArtifactRetentionState>;
  releaseLegalHold(
    input: RetentionMutationInput,
  ): Promise<EvidenceArtifactRetentionState>;
  claimDeletion(input: {
    readonly artifactId: string;
    readonly now: string;
    readonly eventId: string;
  }): Promise<EvidenceArtifactRetentionState | null>;
  markBlobDeleted(input: {
    readonly artifactId: string;
    readonly occurredAt: string;
    readonly eventId: string;
  }): Promise<EvidenceArtifactRetentionState>;
}

export interface RetentionMutationInput {
  readonly artifactId: string;
  readonly actorType: "system" | "operator";
  readonly actorRef: string;
  readonly occurredAt: string;
  readonly eventId: string;
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryEvidenceArtifactRetentionRepository implements EvidenceArtifactRetentionRepository {
  private readonly states = new Map<string, EvidenceArtifactRetentionState>();
  private readonly events = new Map<string, EvidenceArtifactRetentionEvent>();

  async initialize(input: {
    readonly artifactId: string;
    readonly retainUntil: string | null;
    readonly retentionPolicy: EvidenceArtifactRetentionPolicy;
    readonly occurredAt: string;
  }): Promise<EvidenceArtifactRetentionState> {
    const existing = this.states.get(input.artifactId);
    if (existing) return clone(existing);
    const state = evidenceArtifactRetentionStateSchema.parse({
      artifact_id: input.artifactId,
      effective_retain_until: input.retainUntil,
      legal_hold_active: input.retentionPolicy === "legal_hold",
      blob_state: "present",
      updated_at: input.occurredAt,
    });
    this.states.set(input.artifactId, state);
    this.addEvent({
      event_id: `retention_init_${input.artifactId}`,
      artifact_id: input.artifactId,
      event_type: "retention_initialized",
      actor_type: "system",
      actor_ref: null,
      occurred_at: input.occurredAt,
    });
    return clone(state);
  }

  async getState(id: string) {
    const state = this.states.get(id);
    return state ? clone(state) : null;
  }

  async listEvents(id: string) {
    return [...this.events.values()]
      .filter((event) => event.artifact_id === id)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .map(clone);
  }

  async extendRetention(
    input: RetentionMutationInput & { retainUntil: string },
  ) {
    const state = this.required(input.artifactId);
    const nextDate = isoDateTimeSchema.parse(input.retainUntil);
    if (
      state.effective_retain_until === null ||
      new Date(nextDate).getTime() <=
        new Date(state.effective_retain_until).getTime()
    )
      throw new Error("EVIDENCE_ARTIFACT_RETENTION_MUST_EXTEND_FORWARD");
    return this.mutate(state, input, "retention_extended", {
      effective_retain_until: nextDate,
    });
  }

  async placeLegalHold(input: RetentionMutationInput) {
    const state = this.required(input.artifactId);
    if (state.legal_hold_active) return clone(state);
    return this.mutate(state, input, "legal_hold_placed", {
      legal_hold_active: true,
    });
  }

  async releaseLegalHold(input: RetentionMutationInput) {
    const state = this.required(input.artifactId);
    if (!state.legal_hold_active) return clone(state);
    return this.mutate(state, input, "legal_hold_released", {
      legal_hold_active: false,
    });
  }

  async claimDeletion(input: {
    artifactId: string;
    now: string;
    eventId: string;
  }) {
    const now = isoDateTimeSchema.parse(input.now);
    const state = this.required(input.artifactId);
    if (state.blob_state === "deleted") return null;
    if (
      state.legal_hold_active ||
      state.effective_retain_until === null ||
      new Date(state.effective_retain_until).getTime() > new Date(now).getTime()
    )
      return null;
    if (state.blob_state === "deletion_pending") return clone(state);
    return this.mutate(
      state,
      {
        artifactId: input.artifactId,
        actorType: "system",
        actorRef: "retention_executor",
        occurredAt: now,
        eventId: input.eventId,
      },
      "deletion_claimed",
      { blob_state: "deletion_pending" },
    );
  }

  async markBlobDeleted(input: {
    artifactId: string;
    occurredAt: string;
    eventId: string;
  }) {
    const state = this.required(input.artifactId);
    if (state.blob_state === "deleted") return clone(state);
    if (state.blob_state !== "deletion_pending")
      throw new Error("EVIDENCE_ARTIFACT_DELETION_NOT_CLAIMED");
    return this.mutate(
      state,
      {
        artifactId: input.artifactId,
        actorType: "system",
        actorRef: "retention_executor",
        occurredAt: input.occurredAt,
        eventId: input.eventId,
      },
      "blob_deleted",
      { blob_state: "deleted" },
    );
  }

  private required(id: string): EvidenceArtifactRetentionState {
    const state = this.states.get(id);
    if (!state) throw new Error("EVIDENCE_ARTIFACT_RETENTION_NOT_FOUND");
    return state;
  }

  private mutate(
    state: EvidenceArtifactRetentionState,
    input: RetentionMutationInput,
    eventType: EvidenceArtifactRetentionEvent["event_type"],
    patch: Partial<EvidenceArtifactRetentionState>,
  ): EvidenceArtifactRetentionState {
    if (this.events.has(input.eventId))
      throw new Error("EVIDENCE_ARTIFACT_RETENTION_EVENT_ID_CONFLICT");
    const next = evidenceArtifactRetentionStateSchema.parse({
      ...state,
      ...patch,
      updated_at: input.occurredAt,
    });
    this.addEvent({
      event_id: input.eventId,
      artifact_id: input.artifactId,
      event_type: eventType,
      actor_type: input.actorType,
      actor_ref: input.actorRef,
      occurred_at: input.occurredAt,
    });
    this.states.set(input.artifactId, next);
    return clone(next);
  }

  private addEvent(input: EvidenceArtifactRetentionEvent): void {
    const event = evidenceArtifactRetentionEventSchema.parse(input);
    this.events.set(event.event_id, event);
  }
}

export interface EvidenceArtifactRetentionServiceDependencies {
  readonly repository: EvidenceArtifactRetentionRepository;
  readonly artifactRepository: EvidenceArtifactRepository;
  readonly blobStore: EvidenceArtifactBlobStore;
  readonly now?: () => string;
  readonly createEventId?: () => string;
}

export class EvidenceArtifactRetentionService {
  private readonly now: () => string;
  private readonly createEventId: () => string;

  constructor(
    private readonly dependencies: EvidenceArtifactRetentionServiceDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.createEventId =
      dependencies.createEventId ??
      (() => `retention_event_${randomUUID().replaceAll("-", "_")}`);
  }

  async extendRetention(input: {
    artifactId: string;
    retainUntil: string;
    context: unknown;
  }) {
    const actor = requireRetentionActor(input.context, "place");
    return this.dependencies.repository.extendRetention({
      artifactId: input.artifactId,
      retainUntil: input.retainUntil,
      ...actor,
      occurredAt: this.now(),
      eventId: this.createEventId(),
    });
  }

  async placeLegalHold(input: { artifactId: string; context: unknown }) {
    const actor = requireRetentionActor(input.context, "place");
    return this.dependencies.repository.placeLegalHold({
      artifactId: input.artifactId,
      ...actor,
      occurredAt: this.now(),
      eventId: this.createEventId(),
    });
  }

  async releaseLegalHold(input: { artifactId: string; context: unknown }) {
    const actor = requireRetentionActor(input.context, "release");
    return this.dependencies.repository.releaseLegalHold({
      artifactId: input.artifactId,
      ...actor,
      occurredAt: this.now(),
      eventId: this.createEventId(),
    });
  }

  async deleteExpired(input: { artifactId: string }) {
    const now = this.now();
    const claimed = await this.dependencies.repository.claimDeletion({
      artifactId: input.artifactId,
      now,
      eventId: this.createEventId(),
    });
    if (!claimed) return { outcome: "not_eligible" as const };
    const artifact = await this.dependencies.artifactRepository.getArtifact(
      input.artifactId,
    );
    if (!artifact) throw new Error("EVIDENCE_ARTIFACT_NOT_FOUND");
    try {
      await this.dependencies.blobStore.delete(artifact.storage_key);
    } catch {
      return { outcome: "retry_pending" as const };
    }
    await this.dependencies.repository.markBlobDeleted({
      artifactId: input.artifactId,
      occurredAt: this.now(),
      eventId: this.createEventId(),
    });
    return { outcome: "deleted" as const };
  }
}

const RETENTION_CONTEXT_BRAND = Symbol("evidence-artifact-retention-context");
export type EvidenceArtifactRetentionContext = {
  readonly principalType: "system" | "operator";
  readonly principalRef: string;
  readonly [RETENTION_CONTEXT_BRAND]: true;
};

export const createEvidenceArtifactRetentionContext = (input: {
  principalType: "system" | "operator";
  principalRef: string;
}): EvidenceArtifactRetentionContext => {
  const principalRef = entityIdSchema.parse(input.principalRef);
  const value = { principalType: input.principalType, principalRef };
  Object.defineProperty(value, RETENTION_CONTEXT_BRAND, {
    value: true,
    enumerable: false,
  });
  return Object.freeze(value) as EvidenceArtifactRetentionContext;
};

const requireRetentionActor = (
  context: unknown,
  action: "place" | "release",
): { actorType: "system" | "operator"; actorRef: string } => {
  if (
    typeof context !== "object" ||
    context === null ||
    !(RETENTION_CONTEXT_BRAND in context)
  )
    throw new Error("EVIDENCE_ARTIFACT_RETENTION_ACCESS_DENIED");
  const issued = context as EvidenceArtifactRetentionContext;
  if (action === "release" && issued.principalType !== "operator")
    throw new Error("EVIDENCE_ARTIFACT_RETENTION_ACCESS_DENIED");
  return { actorType: issued.principalType, actorRef: issued.principalRef };
};
