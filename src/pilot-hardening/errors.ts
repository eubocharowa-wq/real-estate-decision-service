import {
  runInMemoryTransaction,
  type TransactionalRepository,
} from "../persistence";
import type {
  ApplicationErrorLayer,
  ApplicationErrorRecord,
} from "./contracts";
import type { BuyerJourneyStage } from "../buyer-journey/contracts";

export interface ApplicationErrorRepository extends TransactionalRepository {
  record(error: ApplicationErrorRecord): Promise<void>;
  markRecovered(errorId: string, recoveredAt: string): Promise<void>;
  list(journeyId?: string): Promise<readonly ApplicationErrorRecord[]>;
}

export class InMemoryApplicationErrorRepository implements ApplicationErrorRepository {
  private readonly errors = new Map<string, ApplicationErrorRecord>();

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return runInMemoryTransaction(work);
  }

  async record(error: ApplicationErrorRecord): Promise<void> {
    this.errors.set(error.error_id, structuredClone(error));
  }

  async markRecovered(errorId: string, recoveredAt: string): Promise<void> {
    const current = this.errors.get(errorId);
    if (current)
      this.errors.set(errorId, { ...current, recovered_at: recoveredAt });
  }

  async list(journeyId?: string): Promise<readonly ApplicationErrorRecord[]> {
    return [...this.errors.values()]
      .filter((error) => !journeyId || error.journey_id === journeyId)
      .map((error) => structuredClone(error));
  }
}

export class ApplicationError extends Error {
  constructor(readonly record: ApplicationErrorRecord) {
    super(record.error_code);
    this.name = "ApplicationError";
  }
}

let errorSequence = 0;

export const createApplicationError = (input: {
  readonly errorCode: string;
  readonly layer: ApplicationErrorLayer;
  readonly journeyId?: string | null;
  readonly stage?: BuyerJourneyStage | null;
  readonly recoverable: boolean;
  readonly userVisible: boolean;
  readonly occurredAt: string;
  readonly contextIds?: Readonly<Record<string, string>>;
  readonly appVersion: string;
}): ApplicationError =>
  new ApplicationError({
    error_id: `application_error_${++errorSequence}`,
    error_code: input.errorCode,
    layer: input.layer,
    journey_id: input.journeyId ?? null,
    stage: input.stage ?? null,
    recoverable: input.recoverable,
    user_visible: input.userVisible,
    occurred_at: input.occurredAt,
    context_ids: Object.freeze({ ...(input.contextIds ?? {}) }),
    app_version: input.appVersion,
    recovered_at: null,
  });

export interface ApplicationErrorDiagnostics {
  readonly errors_by_code: Readonly<Record<string, number>>;
  readonly errors_by_stage: Readonly<Record<string, number>>;
  readonly recovery_success_count: number;
  readonly failed_transitions: number;
  readonly source_policy_blocks: number;
  readonly adapter_openclaw_failures: number;
  readonly recompute_failures: number;
}

const countBy = (
  values: readonly ApplicationErrorRecord[],
  key: (value: ApplicationErrorRecord) => string,
): Readonly<Record<string, number>> => {
  const result: Record<string, number> = {};
  for (const value of values) {
    const name = key(value);
    result[name] = (result[name] ?? 0) + 1;
  }
  return result;
};

export const aggregateApplicationErrors = (
  errors: readonly ApplicationErrorRecord[],
): ApplicationErrorDiagnostics => ({
  errors_by_code: countBy(errors, (error) => error.error_code),
  errors_by_stage: countBy(errors, (error) => error.stage ?? "unknown"),
  recovery_success_count: errors.filter((error) => error.recovered_at !== null)
    .length,
  failed_transitions: errors.filter(
    (error) => error.error_code === "INVALID_TRANSITION",
  ).length,
  source_policy_blocks: errors.filter(
    (error) => error.layer === "source_policy",
  ).length,
  adapter_openclaw_failures: errors.filter(
    (error) => error.layer === "adapter_openclaw",
  ).length,
  recompute_failures: errors.filter((error) => error.layer === "recompute")
    .length,
});
