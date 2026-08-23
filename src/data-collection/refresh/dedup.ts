import type { RefreshTask, RefreshTaskRequest } from "./contracts";

const normalize = (values: readonly string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();

export const stableRefreshHash = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const normalizeRefreshFields = normalize;

export const createRefreshDedupKey = (
  input: Pick<
    RefreshTaskRequest,
    "entityType" | "entityId" | "sourceId" | "fieldPaths"
  >,
): string =>
  `refresh:${stableRefreshHash(
    [
      "targeted_refresh",
      input.entityType,
      input.entityId,
      input.sourceId,
      normalize(input.fieldPaths).join(","),
    ].join("|"),
  )}`;

export const createRefreshTaskId = (
  dedupKey: string,
  requestedAt: string,
): string => `refresh_task_${stableRefreshHash(`${dedupKey}|${requestedAt}`)}`;

export const createCollectionRunIdentity = (
  task: RefreshTask,
): { readonly collectionRunId: string; readonly idempotencyKey: string } => {
  const digest = stableRefreshHash(
    `${task.refresh_task_id}|attempt:${task.attempt_count}`,
  );
  return {
    collectionRunId: `refresh_run_${digest}`,
    idempotencyKey: `refresh:${task.refresh_task_id}:attempt:${task.attempt_count}`,
  };
};

export const fieldSetCovers = (
  covering: readonly string[],
  covered: readonly string[],
): boolean => {
  const coveringSet = new Set(normalize(covering));
  return normalize(covered).every((field) => coveringSet.has(field));
};
