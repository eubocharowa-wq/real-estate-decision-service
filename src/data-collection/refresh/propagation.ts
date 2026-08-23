import type {
  AffectedEntities,
  RecomputeDirective,
  RefreshRecomputeHook,
} from "./contracts";

const unique = (values: readonly string[]): string[] =>
  [...new Set(values)].sort();

/**
 * Produces narrow recompute instructions only. Application persistence or a
 * worker may execute them later; this module never starts a global recompute.
 */
export class AffectedOnlyRefreshRecomputeHook implements RefreshRecomputeHook {
  readonly version = "affected-only-recompute-v1";

  async recompute({
    affectedEntities,
  }: {
    readonly affectedEntities: AffectedEntities;
  }): Promise<RecomputeDirective> {
    const dataEntityIds = unique([
      ...affectedEntities.affected_property_ids,
      ...affectedEntities.affected_offer_ids,
      ...affectedEntities.affected_scenario_ids,
    ]);
    return {
      data_confidence_entity_ids: dataEntityIds,
      data_completeness_entity_ids: dataEntityIds,
      match_result_pairs: affectedEntities.affected_user_request_ids.flatMap(
        (userRequestId) =>
          affectedEntities.affected_property_ids.map((propertyId) => ({
            user_request_id: userRequestId,
            property_id: propertyId,
          })),
      ),
    };
  }
}

export const EMPTY_AFFECTED_ENTITIES: AffectedEntities = {
  affected_property_ids: [],
  affected_offer_ids: [],
  affected_scenario_ids: [],
  affected_user_request_ids: [],
};

export const EMPTY_RECOMPUTE_DIRECTIVE: RecomputeDirective = {
  data_confidence_entity_ids: [],
  data_completeness_entity_ids: [],
  match_result_pairs: [],
};
