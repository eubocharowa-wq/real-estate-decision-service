import { performance } from "node:perf_hooks";

import type { PilotTimingMeasurement } from "./contracts";

export interface PilotPerformanceRecorder {
  record(measurement: PilotTimingMeasurement): void;
  list(): readonly PilotTimingMeasurement[];
}

export class InMemoryPilotPerformanceRecorder implements PilotPerformanceRecorder {
  private readonly measurements: PilotTimingMeasurement[] = [];

  record(measurement: PilotTimingMeasurement): void {
    this.measurements.push(structuredClone(measurement));
  }

  list(): readonly PilotTimingMeasurement[] {
    return this.measurements.map((item) => structuredClone(item));
  }
}

export const measurePilotOperation = <T>(input: {
  readonly operation: PilotTimingMeasurement["operation"];
  readonly candidateCount?: number | null;
  readonly recorder: PilotPerformanceRecorder;
  readonly clock?: () => string;
  readonly execute: () => T;
}): T => {
  const startedAt = performance.now();
  try {
    return input.execute();
  } finally {
    input.recorder.record({
      operation: input.operation,
      duration_ms: Number((performance.now() - startedAt).toFixed(3)),
      candidate_count: input.candidateCount ?? null,
      recorded_at: (input.clock ?? (() => new Date().toISOString()))(),
    });
  }
};

export const measurePilotOperationAsync = async <T>(input: {
  readonly operation: PilotTimingMeasurement["operation"];
  readonly candidateCount?: number | null;
  readonly recorder: PilotPerformanceRecorder;
  readonly clock?: () => string;
  readonly execute: () => Promise<T>;
}): Promise<T> => {
  const startedAt = performance.now();
  try {
    return await input.execute();
  } finally {
    input.recorder.record({
      operation: input.operation,
      duration_ms: Number((performance.now() - startedAt).toFixed(3)),
      candidate_count: input.candidateCount ?? null,
      recorded_at: (input.clock ?? (() => new Date().toISOString()))(),
    });
  }
};
