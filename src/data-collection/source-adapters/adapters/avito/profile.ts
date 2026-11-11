import {
  AVITO_ADAPTER_VERSION,
  AVITO_NORMALIZATION_VERSION,
  AVITO_SOURCE_ID,
} from "../../config";
import type { SourceNormalizationProfile } from "../../source-profile";

export const AVITO_PROFILE: SourceNormalizationProfile = {
  sourceId: AVITO_SOURCE_ID,
  adapterVersion: AVITO_ADAPTER_VERSION,
  normalizationVersion: AVITO_NORMALIZATION_VERSION,
  attributionLabel: "Авито",
  seller: { seller_type: "unknown", seller_id: null, name: null },
  collectionContract: {
    method: "http",
    environments: ["development", "test"],
    requiredConditions: [
      "AVITO_NORMALIZED_DATA_USE_APPROVED",
      "AVITO_CARD_HTTP_ACCESS_APPROVED",
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
