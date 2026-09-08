import { z } from "zod";

import type { UserRequest } from "../domain";
import { COMPARISON_POLICY_V1 } from "./policy";

/**
 * The selection is journey state on the server.
 *
 * It used to be a sessionStorage key with a change event; a closed tab took
 * the shortlist with it. This module now holds only the rules — what a valid
 * selection is and how adding or removing an item changes it.
 */
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

export const comparisonSelectionMatchesRequest = (
  state: ComparisonSelection,
  request: Pick<UserRequest, "user_request_id" | "schema_version">,
): boolean =>
  state.userRequestId === request.user_request_id &&
  state.userRequestSchemaVersion === request.schema_version;
