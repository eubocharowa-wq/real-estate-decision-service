import {
  expertAuditEventSchema,
  expertContextPackageSchema,
  expertRequestSchema,
  expertResultSchema,
  type ExpertAuditEvent,
  type ExpertContextPackage,
  type ExpertRequest,
  type ExpertResult,
  type ExpertWorkflowStatus,
} from "../../expert/contracts";
import type {
  ExpertRequestRepository,
  RepositoryCreateExpertRequestOutcome,
} from "../../expert/repository";
import { assertExpertRequestTransition } from "../../expert/state-machine";
import { toIsoString } from "./buyer-journey-repository";
import type { PostgresContext } from "./context";
import { parseStored } from "./documents";
import { withMappedErrors } from "./errors";

const ACTIVE_STATUSES: readonly ExpertWorkflowStatus[] = [
  "draft",
  "submitted",
  "queued",
  "assigned",
  "in_progress",
  "waiting_for_user",
  "waiting_for_external_info",
];

const LOCKED_FOR_CONTEXT: readonly ExpertWorkflowStatus[] = [
  "in_progress",
  "waiting_for_user",
  "waiting_for_external_info",
];

/**
 * PostgreSQL ExpertRequestRepository.
 *
 * The dedup race the in-memory version has is closed by the partial unique
 * index on active statuses: a losing insert raises a unique violation which
 * the error mapping turns back into EXPERT_REQUEST_ALREADY_EXISTS.
 */
export class PostgresExpertRequestRepository implements ExpertRequestRepository {
  constructor(private readonly context: PostgresContext) {}

  private get db() {
    return this.context.executor;
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return withMappedErrors(() => this.context.transaction(work));
  }

  create(
    request: ExpertRequest,
    contextPackage: ExpertContextPackage,
  ): Promise<RepositoryCreateExpertRequestOutcome> {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const duplicate = await this.findActiveByDedupKey(request.dedup_key);
        if (duplicate) return { request: duplicate, created: false };
        if (await this.get(request.request_id))
          throw new Error("EXPERT_REQUEST_ALREADY_EXISTS");
        if (await this.getContext(contextPackage.context_package_id))
          throw new Error("EXPERT_CONTEXT_ALREADY_EXISTS");

        await this.db
          .insertInto("expert_context_packages")
          .values({
            context_package_id: contextPackage.context_package_id,
            package_version: contextPackage.package_version,
            expert_request_id: contextPackage.expert_request_id,
            user_request_ref: contextPackage.user_request_ref,
            journey_id: contextPackage.decision_snapshot?.journey_id ?? null,
            user_request_version:
              contextPackage.decision_snapshot?.user_request_version ?? null,
            matching_bundle_id:
              contextPackage.decision_snapshot?.matching_bundle_id ?? null,
            comparison_id:
              contextPackage.decision_snapshot?.comparison_id ?? null,
            comparison_version:
              contextPackage.decision_snapshot?.comparison_version ?? null,
            document: contextPackage,
          })
          .execute();
        await this.db
          .insertInto("expert_requests")
          .values(this.toRow(request))
          .execute();
        return { request, created: true };
      }),
    );
  }

  private toRow(request: ExpertRequest) {
    return {
      request_id: request.request_id,
      request_schema_version: request.request_schema_version,
      owner_type: request.owner.owner_type,
      owner_id: request.owner.owner_id,
      request_type: request.request_type,
      trigger_type: request.trigger_type,
      question_category: request.question_category,
      user_request_id: request.user_request_id,
      comparison_id: request.comparison_id,
      question: request.question,
      priority: request.priority,
      priority_score: request.priority_score,
      priority_policy_version: request.priority_policy_version,
      required_specialist: request.required_specialist,
      routing_version: request.routing_version,
      status: request.status,
      context_package_id: request.context_package_id,
      dedup_key: request.dedup_key,
      assigned_specialist_ref: request.assigned_specialist_ref,
      document: request,
      created_at: request.created_at,
      updated_at: request.updated_at,
    };
  }

  private parseRequest(document: unknown, requestId: string): ExpertRequest {
    return parseStored(
      expertRequestSchema,
      document,
      `expert_requests:${requestId}`,
    );
  }

  get(requestId: string): Promise<ExpertRequest | null> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("expert_requests")
        .select("document")
        .where("request_id", "=", requestId)
        .executeTakeFirst();
      return row ? this.parseRequest(row.document, requestId) : null;
    });
  }

  getContext(contextPackageId: string): Promise<ExpertContextPackage | null> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("expert_context_packages")
        .select("document")
        .where("context_package_id", "=", contextPackageId)
        .executeTakeFirst();
      if (!row) return null;
      return parseStored(
        expertContextPackageSchema,
        row.document,
        `expert_context_packages:${contextPackageId}`,
      );
    });
  }

  findActiveByDedupKey(dedupKey: string): Promise<ExpertRequest | null> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("expert_requests")
        .select(["request_id", "document"])
        .where("dedup_key", "=", dedupKey)
        .where("status", "in", ACTIVE_STATUSES)
        .executeTakeFirst();
      return row ? this.parseRequest(row.document, row.request_id) : null;
    });
  }

  listAll(): Promise<readonly ExpertRequest[]> {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("expert_requests")
        .select(["request_id", "document"])
        .orderBy("created_at")
        .orderBy("request_id")
        .execute();
      return rows.map((row) => this.parseRequest(row.document, row.request_id));
    });
  }

  listQueued(): Promise<readonly ExpertRequest[]> {
    return withMappedErrors(async () => {
      // Same ordering as the in-memory repository: priority rank, then score,
      // then creation time, then id.
      const rows = await this.db
        .selectFrom("expert_requests")
        .select(["request_id", "document"])
        .where("status", "=", "queued")
        .orderBy(
          (builder) =>
            builder
              .case()
              .when("priority", "=", "critical")
              .then(4)
              .when("priority", "=", "high")
              .then(3)
              .when("priority", "=", "normal")
              .then(2)
              .else(1)
              .end(),
          "desc",
        )
        .orderBy("priority_score", "desc")
        .orderBy("created_at")
        .orderBy("request_id")
        .execute();
      return rows.map((row) => this.parseRequest(row.document, row.request_id));
    });
  }

  updateStatus(
    requestId: string,
    status: ExpertWorkflowStatus,
    updatedAt: string,
  ): Promise<ExpertRequest> {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const current = await this.requireRequest(requestId);
        assertExpertRequestTransition(current.status, status);
        const updated: ExpertRequest = {
          ...current,
          status,
          updated_at: updatedAt,
        };
        await this.db
          .updateTable("expert_requests")
          .set({ status, updated_at: updatedAt, document: updated })
          .where("request_id", "=", requestId)
          .execute();
        return updated;
      }),
    );
  }

  assign(
    requestId: string,
    specialistRef: string,
    updatedAt: string,
  ): Promise<ExpertRequest> {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const current = await this.requireRequest(requestId);
        assertExpertRequestTransition(current.status, "assigned");
        const updated: ExpertRequest = {
          ...current,
          status: "assigned",
          assigned_specialist_ref: specialistRef,
          updated_at: updatedAt,
        };
        await this.db
          .updateTable("expert_requests")
          .set({
            status: "assigned",
            assigned_specialist_ref: specialistRef,
            updated_at: updatedAt,
            document: updated,
          })
          .where("request_id", "=", requestId)
          .execute();
        return updated;
      }),
    );
  }

  replaceContext(
    requestId: string,
    contextPackage: ExpertContextPackage,
    updatedAt: string,
  ): Promise<ExpertRequest> {
    return withMappedErrors(() =>
      this.context.transaction(async () => {
        const current = await this.requireRequest(requestId);
        if (LOCKED_FOR_CONTEXT.includes(current.status))
          throw new Error("CONTEXT_SNAPSHOT_LOCKED_AFTER_WORK_START");
        if (!ACTIVE_STATUSES.includes(current.status))
          throw new Error("FINAL_REQUEST_IS_IMMUTABLE");

        await this.db
          .insertInto("expert_context_packages")
          .values({
            context_package_id: contextPackage.context_package_id,
            package_version: contextPackage.package_version,
            expert_request_id: contextPackage.expert_request_id,
            user_request_ref: contextPackage.user_request_ref,
            journey_id: contextPackage.decision_snapshot?.journey_id ?? null,
            user_request_version:
              contextPackage.decision_snapshot?.user_request_version ?? null,
            matching_bundle_id:
              contextPackage.decision_snapshot?.matching_bundle_id ?? null,
            comparison_id:
              contextPackage.decision_snapshot?.comparison_id ?? null,
            comparison_version:
              contextPackage.decision_snapshot?.comparison_version ?? null,
            document: contextPackage,
          })
          .onConflict((conflict) =>
            conflict
              .column("context_package_id")
              .doUpdateSet({ document: contextPackage }),
          )
          .execute();

        const updated: ExpertRequest = {
          ...current,
          context_package_id: contextPackage.context_package_id,
          updated_at: updatedAt,
        };
        await this.db
          .updateTable("expert_requests")
          .set({
            context_package_id: contextPackage.context_package_id,
            updated_at: updatedAt,
            document: updated,
          })
          .where("request_id", "=", requestId)
          .execute();
        return updated;
      }),
    );
  }

  saveResult(result: ExpertResult): Promise<void> {
    return withMappedErrors(async () => {
      // One result per request: the primary key rejects the second write and
      // the append-only trigger rejects a rewrite. Both map to the same code.
      await this.db
        .insertInto("expert_results")
        .values({
          request_id: result.request_id,
          expert_result_id: result.expert_result_id,
          result_version: result.result_version,
          status: result.status,
          specialist_ref: result.specialist.specialist_ref,
          specialist_type: result.specialist.specialist_type,
          document: result,
          completed_at: result.completed_at,
        })
        .execute();
    });
  }

  getResult(requestId: string): Promise<ExpertResult | null> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("expert_results")
        .select("document")
        .where("request_id", "=", requestId)
        .executeTakeFirst();
      if (!row) return null;
      return parseStored(
        expertResultSchema,
        row.document,
        `expert_results:${requestId}`,
      );
    });
  }

  appendAudit(event: ExpertAuditEvent): Promise<void> {
    return withMappedErrors(async () => {
      await this.db
        .insertInto("expert_audit_events")
        .values({
          event_id: event.event_id,
          request_id: event.request_id,
          event_type: event.event_type,
          actor_type: event.actor_type,
          actor_ref: event.actor_ref,
          metadata: { ...event.metadata },
          created_at: event.created_at,
        })
        .execute();
    });
  }

  listAudit(requestId: string): Promise<readonly ExpertAuditEvent[]> {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("expert_audit_events")
        .selectAll()
        .where("request_id", "=", requestId)
        .orderBy("created_at")
        .orderBy("event_id")
        .execute();
      return rows.map((row) =>
        parseStored(
          expertAuditEventSchema,
          {
            event_id: row.event_id,
            request_id: row.request_id,
            event_type: row.event_type,
            actor_type: row.actor_type,
            actor_ref: row.actor_ref,
            metadata: row.metadata,
            created_at: toIsoString(row.created_at),
          },
          `expert_audit_events:${row.event_id}`,
        ),
      );
    });
  }

  private async requireRequest(requestId: string): Promise<ExpertRequest> {
    const request = await this.get(requestId);
    if (!request) throw new Error("EXPERT_REQUEST_NOT_FOUND");
    return request;
  }
}
