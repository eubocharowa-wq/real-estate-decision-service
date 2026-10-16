import {
  evidenceArtifactEventSchema,
  evidenceArtifactLinkSchema,
  evidenceArtifactSchema,
  type EvidenceArtifact,
  type EvidenceArtifactEvent,
  type EvidenceArtifactLink,
  type EvidenceArtifactState,
} from "../../domain/evidence-artifact/schema";
import { assertEvidenceArtifactTransition } from "../../evidence-artifacts/lifecycle";
import type { EvidenceArtifactRepository } from "../../evidence-artifacts/repository";
import { toIsoString } from "./buyer-journey-repository";
import type { PostgresContext } from "./context";
import { withMappedErrors } from "./errors";

export class PostgresEvidenceArtifactRepository implements EvidenceArtifactRepository {
  constructor(private readonly context: PostgresContext) {}

  private get db() {
    return this.context.executor;
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return withMappedErrors(() => this.context.transaction(work));
  }

  createQuarantinedArtifact(
    artifactInput: EvidenceArtifact,
    eventInput: EvidenceArtifactEvent,
  ): Promise<EvidenceArtifact> {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const artifact = evidenceArtifactSchema.parse(artifactInput);
        const event = evidenceArtifactEventSchema.parse(eventInput);
        if (artifact.state !== "quarantine")
          throw new Error("EVIDENCE_ARTIFACT_MUST_START_IN_QUARANTINE");
        if (
          event.artifact_id !== artifact.artifact_id ||
          event.event_type !== "artifact_created" ||
          event.from_state !== null ||
          event.to_state !== "quarantine"
        )
          throw new Error("EVIDENCE_ARTIFACT_CREATED_EVENT_MISMATCH");

        await this.db
          .insertInto("evidence_artifacts")
          .values({
            artifact_id: artifact.artifact_id,
            schema_version: artifact.schema_version,
            artifact_kind: artifact.artifact_kind,
            source_id: artifact.source_id,
            source_url: artifact.source_url,
            source_reference: artifact.source_reference,
            collected_at: artifact.collected_at,
            mime_type: artifact.mime_type,
            byte_size: artifact.byte_size,
            sha256: artifact.sha256,
            storage_key: artifact.storage_key,
            state: artifact.state,
            access_scope: artifact.access_scope,
            retention_policy: artifact.retention_policy,
            retain_until: artifact.retain_until,
            created_at: artifact.created_at,
          })
          .execute();
        await this.insertEvent(event);
        return artifact;
      }),
    );
  }

  getArtifact(artifactId: string): Promise<EvidenceArtifact | null> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("evidence_artifacts")
        .selectAll()
        .where("artifact_id", "=", artifactId)
        .executeTakeFirst();
      if (!row) return null;
      return evidenceArtifactSchema.parse({
        artifact_id: row.artifact_id,
        schema_version: row.schema_version,
        artifact_kind: row.artifact_kind,
        source_id: row.source_id,
        source_url: row.source_url,
        source_reference: row.source_reference,
        collected_at: toIsoString(row.collected_at),
        mime_type: row.mime_type,
        byte_size: Number(row.byte_size),
        sha256: row.sha256,
        storage_key: row.storage_key,
        state: row.state,
        access_scope: row.access_scope,
        retention_policy: row.retention_policy,
        retain_until: row.retain_until ? toIsoString(row.retain_until) : null,
        created_at: toIsoString(row.created_at),
      });
    });
  }

  hasStorageKey(storageKey: string): Promise<boolean> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("evidence_artifacts")
        .select("artifact_id")
        .where("storage_key", "=", storageKey)
        .executeTakeFirst();
      return row !== undefined;
    });
  }

  transitionArtifact(
    artifactId: string,
    toState: EvidenceArtifactState,
    eventInput: EvidenceArtifactEvent,
  ): Promise<EvidenceArtifact> {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const current = await this.getArtifact(artifactId);
        if (!current) throw new Error("EVIDENCE_ARTIFACT_NOT_FOUND");
        assertEvidenceArtifactTransition(current.state, toState);
        const event = evidenceArtifactEventSchema.parse(eventInput);
        if (
          event.artifact_id !== artifactId ||
          event.event_type !== "state_transitioned" ||
          event.from_state !== current.state ||
          event.to_state !== toState
        )
          throw new Error("EVIDENCE_ARTIFACT_TRANSITION_EVENT_MISMATCH");

        await this.db
          .updateTable("evidence_artifacts")
          .set({ state: toState })
          .where("artifact_id", "=", artifactId)
          .executeTakeFirstOrThrow();
        await this.insertEvent(event);
        return evidenceArtifactSchema.parse({ ...current, state: toState });
      }),
    );
  }

  linkArtifact(linkInput: EvidenceArtifactLink): Promise<void> {
    return withMappedErrors(async () => {
      const link = evidenceArtifactLinkSchema.parse(linkInput);
      await this.db
        .insertInto("evidence_artifact_links")
        .values({
          artifact_id: link.artifact_id,
          subject_type: link.subject_type,
          subject_id: link.subject_id,
          relation: link.relation,
          created_at: link.created_at,
        })
        .onConflict((conflict) =>
          conflict
            .columns(["artifact_id", "subject_type", "subject_id", "relation"])
            .doNothing(),
        )
        .execute();
    });
  }

  listArtifactLinks(
    artifactId: string,
  ): Promise<readonly EvidenceArtifactLink[]> {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("evidence_artifact_links")
        .selectAll()
        .where("artifact_id", "=", artifactId)
        .orderBy("created_at")
        .orderBy("subject_type")
        .orderBy("subject_id")
        .orderBy("relation")
        .execute();
      return rows.map((row) =>
        evidenceArtifactLinkSchema.parse({
          artifact_id: row.artifact_id,
          subject_type: row.subject_type,
          subject_id: row.subject_id,
          relation: row.relation,
          created_at: toIsoString(row.created_at),
        }),
      );
    });
  }

  listArtifactEvents(
    artifactId: string,
  ): Promise<readonly EvidenceArtifactEvent[]> {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("evidence_artifact_events")
        .selectAll()
        .where("artifact_id", "=", artifactId)
        .orderBy("occurred_at")
        .orderBy("event_id")
        .execute();
      return rows.map((row) =>
        evidenceArtifactEventSchema.parse({
          event_id: row.event_id,
          artifact_id: row.artifact_id,
          event_type: row.event_type,
          from_state: row.from_state,
          to_state: row.to_state,
          actor_type: row.actor_type,
          actor_ref: row.actor_ref,
          occurred_at: toIsoString(row.occurred_at),
          metadata: row.metadata,
        }),
      );
    });
  }

  private async insertEvent(event: EvidenceArtifactEvent): Promise<void> {
    await this.db
      .insertInto("evidence_artifact_events")
      .values({
        event_id: event.event_id,
        artifact_id: event.artifact_id,
        event_type: event.event_type,
        from_state: event.from_state,
        to_state: event.to_state,
        actor_type: event.actor_type,
        actor_ref: event.actor_ref,
        occurred_at: event.occurred_at,
        metadata: event.metadata,
      })
      .execute();
  }
}
