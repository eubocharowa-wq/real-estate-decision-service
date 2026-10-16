import {
  evidenceArtifactRetentionEventSchema,
  evidenceArtifactRetentionStateSchema,
  type EvidenceArtifactRetentionEvent,
  type EvidenceArtifactRetentionRepository,
  type EvidenceArtifactRetentionState,
  type RetentionMutationInput,
} from "../../evidence-artifacts/retention";
import type { EvidenceArtifactRetentionPolicy } from "../../domain/evidence-artifact/schema";
import { toIsoString } from "./buyer-journey-repository";
import type { PostgresContext } from "./context";
import { withMappedErrors } from "./errors";

export class PostgresEvidenceArtifactRetentionRepository implements EvidenceArtifactRetentionRepository {
  constructor(private readonly context: PostgresContext) {}
  private get db() {
    return this.context.executor;
  }

  async initialize(input: {
    artifactId: string;
    retainUntil: string | null;
    retentionPolicy: EvidenceArtifactRetentionPolicy;
    occurredAt: string;
  }) {
    return withMappedErrors(async () => {
      await this.context.transaction(async () => {
        await this.db
          .insertInto("evidence_artifact_retention_state")
          .values({
            artifact_id: input.artifactId,
            effective_retain_until: input.retainUntil,
            legal_hold_active: input.retentionPolicy === "legal_hold",
            blob_state: "present",
            updated_at: input.occurredAt,
          })
          .onConflict((conflict) => conflict.column("artifact_id").doNothing())
          .execute();
        await this.db
          .insertInto("evidence_artifact_retention_events")
          .values({
            event_id: `retention_init_${input.artifactId}`,
            artifact_id: input.artifactId,
            event_type: "retention_initialized",
            actor_type: "system",
            actor_ref: null,
            occurred_at: input.occurredAt,
          })
          .onConflict((conflict) => conflict.column("event_id").doNothing())
          .execute();
      });
      return this.requiredState(input.artifactId);
    });
  }

  getState(artifactId: string) {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("evidence_artifact_retention_state")
        .selectAll()
        .where("artifact_id", "=", artifactId)
        .executeTakeFirst();
      return row ? this.parseState(row) : null;
    });
  }

  listEvents(artifactId: string) {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("evidence_artifact_retention_events")
        .selectAll()
        .where("artifact_id", "=", artifactId)
        .orderBy("occurred_at")
        .orderBy("event_id")
        .execute();
      return rows.map((row) =>
        evidenceArtifactRetentionEventSchema.parse({
          ...row,
          occurred_at: toIsoString(row.occurred_at),
        }),
      );
    });
  }

  extendRetention(input: RetentionMutationInput & { retainUntil: string }) {
    return this.mutate(input.artifactId, async (state) => {
      if (
        state.effective_retain_until === null ||
        new Date(input.retainUntil).getTime() <=
          new Date(state.effective_retain_until).getTime()
      )
        throw new Error("EVIDENCE_ARTIFACT_RETENTION_MUST_EXTEND_FORWARD");
      await this.db
        .updateTable("evidence_artifact_retention_state")
        .set({
          effective_retain_until: input.retainUntil,
          updated_at: input.occurredAt,
        })
        .where("artifact_id", "=", input.artifactId)
        .executeTakeFirstOrThrow();
      await this.insertEvent(input, "retention_extended");
    });
  }

  placeLegalHold(input: RetentionMutationInput) {
    return this.mutate(input.artifactId, async (state) => {
      if (state.legal_hold_active) return;
      await this.db
        .updateTable("evidence_artifact_retention_state")
        .set({ legal_hold_active: true, updated_at: input.occurredAt })
        .where("artifact_id", "=", input.artifactId)
        .executeTakeFirstOrThrow();
      await this.insertEvent(input, "legal_hold_placed");
    });
  }

  releaseLegalHold(input: RetentionMutationInput) {
    return this.mutate(input.artifactId, async (state) => {
      if (!state.legal_hold_active) return;
      await this.db
        .updateTable("evidence_artifact_retention_state")
        .set({ legal_hold_active: false, updated_at: input.occurredAt })
        .where("artifact_id", "=", input.artifactId)
        .executeTakeFirstOrThrow();
      await this.insertEvent(input, "legal_hold_released");
    });
  }

  claimDeletion(input: { artifactId: string; now: string; eventId: string }) {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const state = await this.lockState(input.artifactId);
        if (
          state.blob_state === "deleted" ||
          state.legal_hold_active ||
          state.effective_retain_until === null ||
          new Date(state.effective_retain_until).getTime() >
            new Date(input.now).getTime()
        )
          return null;
        if (state.blob_state === "deletion_pending") return state;
        await this.db
          .updateTable("evidence_artifact_retention_state")
          .set({ blob_state: "deletion_pending", updated_at: input.now })
          .where("artifact_id", "=", input.artifactId)
          .executeTakeFirstOrThrow();
        await this.insertEvent(
          {
            artifactId: input.artifactId,
            actorType: "system",
            actorRef: "retention_executor",
            occurredAt: input.now,
            eventId: input.eventId,
          },
          "deletion_claimed",
        );
        return this.requiredState(input.artifactId);
      }),
    );
  }

  markBlobDeleted(input: {
    artifactId: string;
    occurredAt: string;
    eventId: string;
  }) {
    return this.mutate(input.artifactId, async (state) => {
      if (state.blob_state === "deleted") return;
      if (state.blob_state !== "deletion_pending")
        throw new Error("EVIDENCE_ARTIFACT_DELETION_NOT_CLAIMED");
      await this.db
        .updateTable("evidence_artifact_retention_state")
        .set({ blob_state: "deleted", updated_at: input.occurredAt })
        .where("artifact_id", "=", input.artifactId)
        .executeTakeFirstOrThrow();
      await this.insertEvent(
        {
          artifactId: input.artifactId,
          actorType: "system",
          actorRef: "retention_executor",
          occurredAt: input.occurredAt,
          eventId: input.eventId,
        },
        "blob_deleted",
      );
    });
  }

  private mutate(
    artifactId: string,
    work: (state: EvidenceArtifactRetentionState) => Promise<void>,
  ) {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const state = await this.lockState(artifactId);
        await work(state);
        return this.requiredState(artifactId);
      }),
    );
  }

  private async lockState(artifactId: string) {
    const row = await this.db
      .selectFrom("evidence_artifact_retention_state")
      .selectAll()
      .where("artifact_id", "=", artifactId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw new Error("EVIDENCE_ARTIFACT_RETENTION_NOT_FOUND");
    return this.parseState(row);
  }

  private async requiredState(artifactId: string) {
    const state = await this.getState(artifactId);
    if (!state) throw new Error("EVIDENCE_ARTIFACT_RETENTION_NOT_FOUND");
    return state;
  }

  private parseState(row: {
    artifact_id: string;
    effective_retain_until: Date | string | null;
    legal_hold_active: boolean;
    blob_state: string;
    updated_at: Date | string;
  }) {
    return evidenceArtifactRetentionStateSchema.parse({
      ...row,
      effective_retain_until: row.effective_retain_until
        ? toIsoString(row.effective_retain_until)
        : null,
      updated_at: toIsoString(row.updated_at),
    });
  }

  private async insertEvent(
    input: RetentionMutationInput,
    eventType: EvidenceArtifactRetentionEvent["event_type"],
  ) {
    await this.db
      .insertInto("evidence_artifact_retention_events")
      .values({
        event_id: input.eventId,
        artifact_id: input.artifactId,
        event_type: eventType,
        actor_type: input.actorType,
        actor_ref: input.actorRef,
        occurred_at: input.occurredAt,
      })
      .execute();
  }
}
