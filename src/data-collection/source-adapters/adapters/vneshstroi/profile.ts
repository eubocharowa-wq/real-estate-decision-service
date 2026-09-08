import {
  VNESHSTROI_ADAPTER_VERSION,
  VNESHSTROI_APPROVAL_CONDITION,
  VNESHSTROI_NORMALIZATION_VERSION,
  VNESHSTROI_SOURCE_ID,
} from "../../config";
import type { SourceNormalizationProfile } from "../../source-profile";

/**
 * The scoped PoC contract for ВНЕШСТРОЙ, unchanged: one explicit unit URL over
 * HTTP in development and test, nothing retained beyond the request.
 */
export const VNESHSTROI_PROFILE: SourceNormalizationProfile = {
  sourceId: VNESHSTROI_SOURCE_ID,
  adapterVersion: VNESHSTROI_ADAPTER_VERSION,
  normalizationVersion: VNESHSTROI_NORMALIZATION_VERSION,
  attributionLabel: "ВНЕШСТРОЙ",
  seller: {
    seller_type: "developer",
    seller_id: VNESHSTROI_SOURCE_ID,
    name: "ВНЕШСТРОЙ",
  },
  collectionContract: {
    method: "http",
    environments: ["development", "test"],
    requiredConditions: [VNESHSTROI_APPROVAL_CONDITION],
    maximumTargetUrls: 1,
    retention: {
      normalized_facts: "transient_only",
      evidence_metadata: "transient_only",
      raw_content: "prohibited",
      raw_snapshots: "prohibited",
    },
  },
};
