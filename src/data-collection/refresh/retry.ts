import type { RefreshErrorCode, RefreshTask } from "./contracts";
import { REFRESH_RETRY_CONFIG } from "./config/retries";

export interface RetryDecision {
  readonly retryable: boolean;
  readonly errorCode: RefreshErrorCode;
  readonly notBefore: string | null;
  readonly reason:
    | "retry_scheduled"
    | "non_retryable"
    | "attempts_exhausted"
    | "deadline_would_be_missed";
  readonly policyVersion: typeof REFRESH_RETRY_CONFIG.version;
}

export const classifyRefreshError = (
  errorCode: RefreshErrorCode,
  credentialsApproved = false,
): boolean => {
  if (errorCode === "AUTH_REQUIRED") return credentialsApproved;
  return (REFRESH_RETRY_CONFIG.retryableErrors as readonly string[]).includes(
    errorCode,
  );
};

const addSeconds = (isoDate: string, seconds: number): string =>
  new Date(Date.parse(isoDate) + seconds * 1000).toISOString();

export const decideRefreshRetry = ({
  task,
  errorCode,
  now,
  retryAfterSeconds,
  credentialsApproved = false,
}: {
  readonly task: RefreshTask;
  readonly errorCode: RefreshErrorCode;
  readonly now: string;
  readonly retryAfterSeconds?: number | null;
  readonly credentialsApproved?: boolean;
}): RetryDecision => {
  if (!classifyRefreshError(errorCode, credentialsApproved))
    return {
      retryable: false,
      errorCode,
      notBefore: null,
      reason: "non_retryable",
      policyVersion: REFRESH_RETRY_CONFIG.version,
    };
  if (task.attempt_count >= task.max_attempts)
    return {
      retryable: false,
      errorCode,
      notBefore: null,
      reason: "attempts_exhausted",
      policyVersion: REFRESH_RETRY_CONFIG.version,
    };

  const base =
    errorCode === "AUTH_REQUIRED"
      ? 60
      : ((
          REFRESH_RETRY_CONFIG.baseDelaySeconds as Partial<
            Record<RefreshErrorCode, number>
          >
        )[errorCode] ?? 60);
  const exponential = Math.min(
    REFRESH_RETRY_CONFIG.maximumDelaySeconds,
    base *
      REFRESH_RETRY_CONFIG.multiplier ** Math.max(0, task.attempt_count - 1),
  );
  const delaySeconds = Math.max(exponential, retryAfterSeconds ?? 0);
  const notBefore = addSeconds(now, delaySeconds);
  if (task.deadline && Date.parse(notBefore) > Date.parse(task.deadline))
    return {
      retryable: false,
      errorCode,
      notBefore: null,
      reason: "deadline_would_be_missed",
      policyVersion: REFRESH_RETRY_CONFIG.version,
    };
  return {
    retryable: true,
    errorCode,
    notBefore,
    reason: "retry_scheduled",
    policyVersion: REFRESH_RETRY_CONFIG.version,
  };
};
