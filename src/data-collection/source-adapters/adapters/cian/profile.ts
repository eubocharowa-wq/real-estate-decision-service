import {
  CIAN_ADAPTER_VERSION,
  CIAN_NORMALIZATION_VERSION,
  CIAN_SOURCE_ID,
} from "../../config";
import type { SourceNormalizationProfile } from "../../source-profile";

/**
 * Cian listing cards. The profile can execute only in development/test and
 * only when both independent access and normalized-use approval conditions
 * are present in an allowed Collection Plan. They are absent by default.
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
    environments: ["development", "test"],
    requiredConditions: [
      "CIAN_NORMALIZED_DATA_USE_APPROVED",
      "CIAN_CARD_HTTP_ACCESS_APPROVED",
    ],
    maximumTargetUrls: 1,
    retention: {
      normalized_facts: "transient_only",
      evidence_metadata: "transient_only",
      raw_content: "prohibited",
      raw_snapshots: "prohibited",
    },
  },
};
