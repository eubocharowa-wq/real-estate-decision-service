import { z } from "zod";

import type { UserRequest } from "../domain";
import { COMPARISON_POLICY_V1 } from "./policy";

export const COMPARISON_SELECTION_STORAGE_KEY = "reds.comparison-selection.v1";
export const COMPARISON_SELECTION_EVENT = "reds:comparison-selection-change";

export const comparisonSelectionItemSchema = z.strictObject({
  propertyId: z.string().min(1),
  offerId: z.string().min(1).nullable(),
  scenarioId: z.string().min(1).nullable(),
});

export const comparisonSelectionSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  userRequestId: z.string().min(1),
  userRequestSchemaVersion: z.string().min(1),
  items: z
    .array(comparisonSelectionItemSchema)
    .max(COMPARISON_POLICY_V1.maximumItems),
});

export type ComparisonSelectionItem = z.infer<
  typeof comparisonSelectionItemSchema
>;
export type ComparisonSelection = z.infer<typeof comparisonSelectionSchema>;

export type ComparisonSelectionOutcome =
  | {
      readonly success: true;
      readonly state: ComparisonSelection;
      readonly changed: boolean;
    }
  | {
      readonly success: false;
      readonly state: ComparisonSelection;
      readonly code:
        "DUPLICATE_PROPERTY" | "LIMIT_REACHED" | "ITEM_NOT_SELECTED";
      readonly message: string;
    };

export const createComparisonSelection = (
  request: Pick<UserRequest, "user_request_id" | "schema_version">,
): ComparisonSelection => ({
  schemaVersion: "1.0",
  userRequestId: request.user_request_id,
  userRequestSchemaVersion: request.schema_version,
  items: [],
});

export const addComparisonItem = (
  state: ComparisonSelection,
  item: ComparisonSelectionItem,
): ComparisonSelectionOutcome => {
  if (
    state.items.some((candidate) => candidate.propertyId === item.propertyId)
  ) {
    return {
      success: false,
      state,
      code: "DUPLICATE_PROPERTY",
      message: "Этот объект уже участвует в сравнении.",
    };
  }
  if (state.items.length >= COMPARISON_POLICY_V1.maximumItems) {
    return {
      success: false,
      state,
      code: "LIMIT_REACHED",
      message:
        "В сравнении уже 4 варианта. Удалите один, чтобы добавить новый.",
    };
  }
  return {
    success: true,
    changed: true,
    state: { ...state, items: [...state.items, item] },
  };
};

export const removeComparisonItem = (
  state: ComparisonSelection,
  propertyId: string,
): ComparisonSelectionOutcome => {
  if (!state.items.some((item) => item.propertyId === propertyId)) {
    return {
      success: false,
      state,
      code: "ITEM_NOT_SELECTED",
      message: "Этого объекта нет в сравнении.",
    };
  }
  return {
    success: true,
    changed: true,
    state: {
      ...state,
      items: state.items.filter((item) => item.propertyId !== propertyId),
    },
  };
};

export const parseComparisonSelection = (
  raw: string | null,
): ComparisonSelection | null => {
  if (!raw) return null;
  try {
    const parsed = comparisonSelectionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const comparisonSelectionMatchesRequest = (
  state: ComparisonSelection,
  request: Pick<UserRequest, "user_request_id" | "schema_version">,
): boolean =>
  state.userRequestId === request.user_request_id &&
  state.userRequestSchemaVersion === request.schema_version;

export const getComparisonSelectionSnapshot = (): string | null =>
  typeof window === "undefined"
    ? null
    : window.sessionStorage.getItem(COMPARISON_SELECTION_STORAGE_KEY);

export const subscribeComparisonSelection = (
  listener: () => void,
): (() => void) => {
  if (typeof window === "undefined") return () => undefined;
  const storageListener = (event: StorageEvent) => {
    if (event.key === COMPARISON_SELECTION_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", storageListener);
  window.addEventListener(COMPARISON_SELECTION_EVENT, listener);
  return () => {
    window.removeEventListener("storage", storageListener);
    window.removeEventListener(COMPARISON_SELECTION_EVENT, listener);
  };
};

export const writeComparisonSelection = (state: ComparisonSelection): void => {
  window.sessionStorage.setItem(
    COMPARISON_SELECTION_STORAGE_KEY,
    JSON.stringify(state),
  );
  window.dispatchEvent(new Event(COMPARISON_SELECTION_EVENT));
};
