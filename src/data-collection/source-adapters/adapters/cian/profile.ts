import {
  CIAN_ADAPTER_VERSION,
  CIAN_NORMALIZATION_VERSION,
  CIAN_SOURCE_ID,
} from "../../config";
import type { SourceNormalizationProfile } from "../../source-profile";

/**
 * Cian listing cards, parsed offline from pages saved by hand.
 *
 * No environment is listed: live collection is denied by `policy.automation`
 * in the Source Registry and stays so until the owner decides otherwise. The
 * seller is unknown on purpose — the adapter never reads who posted a card.
 */
export const CIAN_PROFILE: SourceNormalizationProfile = {
  sourceId: CIAN_SOURCE_ID,
  adapterVersion: CIAN_ADAPTER_VERSION,
  normalizationVersion: CIAN_NORMALIZATION_VERSION,
  attributionLabel: "ЦИАН",
  seller: {
    seller_type: "unknown",
    seller_id: null,
    name: null,
  },
  collectionContract: {
    method: "http",
    environments: [],
    requiredConditions: [],
    maximumTargetUrls: 1,
    retention: {
      normalized_facts: "transient_only",
      evidence_metadata: "transient_only",
      raw_content: "prohibited",
      raw_snapshots: "prohibited",
    },
  },
};
