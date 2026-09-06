import { InMemoryJourneyInstrumentation } from "../buyer-journey/instrumentation";
import type { JourneyInstrumentation } from "../buyer-journey/instrumentation";
import {
  InMemoryBuyerJourneyRepository,
  type BuyerJourneyRepository,
} from "../buyer-journey/repository";
import {
  InMemoryRefreshQueueRepository,
  type RefreshQueueRepository,
} from "../data-collection/refresh/queue";
import {
  InMemoryExpertResultDraftRepository,
  type ExpertResultDraftRepository,
} from "../expert-workbench/draft";
import {
  InMemoryExpertRequestRepository,
  type ExpertRequestRepository,
} from "../expert/repository";
import {
  InMemoryApplicationErrorRepository,
  type ApplicationErrorRepository,
} from "../pilot-hardening/errors";
import {
  InMemoryFeedbackRepository,
  type FeedbackRepository,
} from "../pilot-hardening/feedback";
import { readDatabaseConfig, type EnvironmentSource } from "./config";
import { getDatabasePool } from "./pool";
import { createPostgresRepositories } from "./postgres";

/**
 * The repository set the application runs on.
 *
 * Selection is by configuration, not by a flag: DATABASE_URL present means
 * PostgreSQL, absent means in-memory. The in-memory implementations stay —
 * they are what tests and local development run on, and the conformance suite
 * checks the two behave the same.
 */
export interface RepositorySet {
  readonly backend: "postgres" | "memory";
  readonly repository: BuyerJourneyRepository;
  readonly expertRepository: ExpertRequestRepository;
  readonly refreshQueue: RefreshQueueRepository;
  readonly instrumentation: JourneyInstrumentation;
  readonly feedbackRepository: FeedbackRepository;
  readonly errorRepository: ApplicationErrorRepository;
  readonly draftRepository: ExpertResultDraftRepository;
}

export const createInMemoryRepositorySet = (): RepositorySet => ({
  backend: "memory",
  repository: new InMemoryBuyerJourneyRepository(),
  expertRepository: new InMemoryExpertRequestRepository(),
  refreshQueue: new InMemoryRefreshQueueRepository(),
  instrumentation: new InMemoryJourneyInstrumentation(),
  feedbackRepository: new InMemoryFeedbackRepository(),
  errorRepository: new InMemoryApplicationErrorRepository(),
  draftRepository: new InMemoryExpertResultDraftRepository(),
});

/**
 * Chooses a backend from the environment.
 *
 * A malformed DATABASE_URL is not silently ignored: falling back to memory
 * because a URL had a typo would look like the pilot is working while nothing
 * is being persisted, so the misconfiguration is thrown instead.
 */
export const createRepositorySet = (
  env: EnvironmentSource = process.env,
): RepositorySet => {
  if (env.DATABASE_URL === undefined || env.DATABASE_URL.trim() === "")
    return createInMemoryRepositorySet();

  const config = readDatabaseConfig(env);
  if (!config.success)
    throw new Error(`INVALID_DATABASE_CONFIG: ${config.errors.join("; ")}`);

  const postgres = createPostgresRepositories(getDatabasePool(config.config));
  return {
    backend: "postgres",
    repository: postgres.repository,
    expertRepository: postgres.expertRepository,
    refreshQueue: postgres.refreshQueue,
    instrumentation: postgres.instrumentation,
    feedbackRepository: postgres.feedbackRepository,
    errorRepository: postgres.errorRepository,
    draftRepository: postgres.draftRepository,
  };
};
