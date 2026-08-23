import type {
  RefreshErrorCode,
  RefreshPriority,
  RefreshReason,
  RefreshResult,
} from "./contracts";
import type { RefreshQueueMetrics } from "./queue";

export interface RefreshStructuredLog {
  readonly refresh_task_id: string;
  readonly entity_id: string;
  readonly source_id: string;
  readonly reason: RefreshReason;
  readonly priority: RefreshPriority;
  readonly status: RefreshResult["status"];
  readonly attempt: number;
  readonly adapter_version: string | null;
  readonly policy_version: string;
  readonly duration_ms: number;
  readonly changed_field_count: number;
  readonly error_code: RefreshErrorCode | null;
  readonly retry_scheduled: boolean;
}

export interface RefreshMetricsSnapshot {
  readonly queue_depth: number;
  readonly oldest_task_age_ms: number;
  readonly attempts: number;
  readonly success_rate: number;
  readonly partial_rate: number;
  readonly retry_rate: number;
  readonly policy_block_rate: number;
  readonly source_changed_rate: number;
  readonly average_duration_ms: number;
  readonly critical_refresh_latency_ms: number;
}

export class InMemoryRefreshTelemetry {
  private readonly entries: RefreshStructuredLog[] = [];

  record(entry: RefreshStructuredLog): void {
    this.entries.push(structuredClone(entry));
  }

  logs(): readonly RefreshStructuredLog[] {
    return structuredClone(this.entries);
  }

  metrics(queue: RefreshQueueMetrics): RefreshMetricsSnapshot {
    const attempts = this.entries.length;
    const ratio = (predicate: (entry: RefreshStructuredLog) => boolean) =>
      attempts === 0 ? 0 : this.entries.filter(predicate).length / attempts;
    const averageDuration =
      attempts === 0
        ? 0
        : this.entries.reduce((sum, entry) => sum + entry.duration_ms, 0) /
          attempts;
    const critical = this.entries.filter(
      (entry) => entry.priority === "critical",
    );
    return {
      queue_depth: queue.queueDepth,
      oldest_task_age_ms: queue.oldestTaskAgeMs,
      attempts,
      success_rate: ratio((entry) => entry.status === "succeeded"),
      partial_rate: ratio((entry) => entry.status === "partial"),
      retry_rate: ratio((entry) => entry.retry_scheduled),
      policy_block_rate: ratio((entry) => entry.error_code === "POLICY_DENIED"),
      source_changed_rate: ratio(
        (entry) => entry.error_code === "SOURCE_CHANGED",
      ),
      average_duration_ms: averageDuration,
      critical_refresh_latency_ms:
        critical.length === 0
          ? 0
          : critical.reduce((sum, entry) => sum + entry.duration_ms, 0) /
            critical.length,
    };
  }
}
