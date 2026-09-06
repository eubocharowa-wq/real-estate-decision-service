import type { Pool } from "pg";

import { createPostgresContext, PostgresContext } from "./context";
import { PostgresBuyerJourneyRepository } from "./buyer-journey-repository";
import { PostgresExpertRequestRepository } from "./expert-request-repository";
import { PostgresRefreshQueueRepository } from "./refresh-queue-repository";
import {
  PostgresApplicationErrorRepository,
  PostgresExpertResultDraftRepository,
  PostgresFeedbackRepository,
  PostgresJourneyInstrumentation,
} from "./pilot-repositories";

export { PostgresContext, createPostgresContext } from "./context";
export { PostgresBuyerJourneyRepository } from "./buyer-journey-repository";
export { PostgresExpertRequestRepository } from "./expert-request-repository";
export { PostgresRefreshQueueRepository } from "./refresh-queue-repository";
export {
  PostgresApplicationErrorRepository,
  PostgresExpertResultDraftRepository,
  PostgresFeedbackRepository,
  PostgresJourneyInstrumentation,
} from "./pilot-repositories";
export { StorageUnavailableError, mapDatabaseError } from "./errors";
export type { Database } from "./database";

export interface PostgresRepositories {
  readonly context: PostgresContext;
  readonly repository: PostgresBuyerJourneyRepository;
  readonly expertRepository: PostgresExpertRequestRepository;
  readonly refreshQueue: PostgresRefreshQueueRepository;
  readonly instrumentation: PostgresJourneyInstrumentation;
  readonly feedbackRepository: PostgresFeedbackRepository;
  readonly errorRepository: PostgresApplicationErrorRepository;
  readonly draftRepository: PostgresExpertResultDraftRepository;
}

/**
 * Builds the whole set on one context.
 *
 * They share the context on purpose: `transaction` on any of them opens a
 * Kysely transaction that the others join, so a flow writing through the
 * journey and the expert repository commits or rolls back as one.
 */
export const createPostgresRepositories = (
  source: Pool | PostgresContext,
): PostgresRepositories => {
  const context =
    source instanceof PostgresContext ? source : createPostgresContext(source);
  return {
    context,
    repository: new PostgresBuyerJourneyRepository(context),
    expertRepository: new PostgresExpertRequestRepository(context),
    refreshQueue: new PostgresRefreshQueueRepository(context),
    instrumentation: new PostgresJourneyInstrumentation(context),
    feedbackRepository: new PostgresFeedbackRepository(context),
    errorRepository: new PostgresApplicationErrorRepository(context),
    draftRepository: new PostgresExpertResultDraftRepository(context),
  };
};
