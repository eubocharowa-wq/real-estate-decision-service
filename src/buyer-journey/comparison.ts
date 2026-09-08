import {
  buildComparisonView,
  type ComparisonInput,
  type ComparisonSelection,
  type ComparisonView,
} from "../comparison";
import {
  COMPARISON_STATE_SCHEMA_VERSION,
  type ComparisonState,
  type ConfirmedRequestRecord,
  type MatchingBundle,
} from "./contracts";
import { BuyerJourneyError } from "./errors";
import type { BuyerJourneyIdFactory } from "./id";
import { resolveBundlePropertyDetail } from "./matching";
import type { BuyerJourneyRepository } from "./repository";

export const createComparisonState = (input: {
  readonly repository: BuyerJourneyRepository;
  readonly journeyId: string;
  readonly confirmed: ConfirmedRequestRecord;
  readonly bundle: MatchingBundle;
  readonly propertyIds: readonly string[];
  readonly previous: ComparisonState | null;
  readonly now: string;
  readonly createId: BuyerJourneyIdFactory;
}): ComparisonState => {
  const propertyIds = [...new Set(input.propertyIds)];
  if (propertyIds.length < 2 || propertyIds.length > 4)
    throw new BuyerJourneyError(
      "INVALID_TRANSITION",
      "Comparison requires 2 to 4 distinct properties",
      true,
    );
  if (
    input.bundle.stale ||
    input.bundle.user_request_id !== input.confirmed.user_request_id ||
    input.bundle.user_request_version !== input.confirmed.user_request_version
  )
    throw new BuyerJourneyError(
      "STALE_REQUEST_VERSION",
      "Comparison cannot mix request versions",
      true,
    );
  const items = propertyIds.map((propertyId) => {
    const entry = input.bundle.entries.find(
      (candidate) => candidate.property_id === propertyId,
    );
    if (!entry)
      throw new BuyerJourneyError(
        "ENTITY_NOT_FOUND",
        `Property ${propertyId} is absent from MatchingBundle`,
        false,
      );
    return {
      property_id: propertyId,
      offer_id: entry.selected_offer_id,
      purchase_scenario_id: entry.selected_purchase_scenario_id,
      matching_bundle_id: input.bundle.matching_bundle_id,
    };
  });
  return {
    schema_version: COMPARISON_STATE_SCHEMA_VERSION,
    comparison_id:
      input.previous?.status === "active"
        ? input.previous.comparison_id
        : input.createId("comparison"),
    journey_id: input.journeyId,
    user_request_id: input.confirmed.user_request_id,
    user_request_version: input.confirmed.user_request_version,
    version: (input.previous?.version ?? 0) + 1,
    items,
    status: "active",
    created_at: input.previous?.created_at ?? input.now,
    updated_at: input.now,
  };
};

export const buildComparisonFromState = async (input: {
  readonly repository: BuyerJourneyRepository;
  readonly confirmed: ConfirmedRequestRecord;
  readonly bundle: MatchingBundle;
  readonly comparison: ComparisonState;
  /** See `runMatchingForConfirmedRequest`'s field of the same name. */
  readonly curatedPilotDirectory?: string;
}): Promise<ComparisonView> => {
  if (
    input.comparison.status !== "active" ||
    input.comparison.user_request_id !== input.confirmed.user_request_id ||
    input.comparison.user_request_version !==
      input.confirmed.user_request_version ||
    input.comparison.items.some(
      (item) => item.matching_bundle_id !== input.bundle.matching_bundle_id,
    )
  )
    throw new BuyerJourneyError(
      "STALE_REQUEST_VERSION",
      "Comparison contains mixed or stale result versions",
      true,
    );
  const selection: ComparisonSelection = {
    schemaVersion: "1.0",
    userRequestId: input.confirmed.user_request_id,
    userRequestSchemaVersion: input.confirmed.request.schema_version,
    items: input.comparison.items.map((item) => ({
      propertyId: item.property_id,
      offerId: item.offer_id,
      scenarioId: item.purchase_scenario_id,
    })),
  };
  const comparisonInput: ComparisonInput = {
    comparisonId: input.comparison.comparison_id,
    userRequest: input.confirmed.request,
    selection,
    items: await Promise.all(
      input.comparison.items.map(async (item) => ({
        status: "ready" as const,
        selection: {
          propertyId: item.property_id,
          offerId: item.offer_id,
          scenarioId: item.purchase_scenario_id,
        },
        detail: await resolveBundlePropertyDetail({
          repository: input.repository,
          confirmed: input.confirmed,
          bundle: input.bundle,
          propertyId: item.property_id,
          curatedPilotDirectory: input.curatedPilotDirectory,
        }),
      })),
    ),
    createdAt: input.comparison.created_at,
    partial: input.bundle.partial,
  };
  const outcome = buildComparisonView(comparisonInput);
  if (!outcome.success)
    throw new BuyerJourneyError(
      outcome.error.code === "MIXED_USER_REQUEST"
        ? "STALE_REQUEST_VERSION"
        : "INVALID_TRANSITION",
      outcome.error.message,
      true,
    );
  return outcome.view;
};
