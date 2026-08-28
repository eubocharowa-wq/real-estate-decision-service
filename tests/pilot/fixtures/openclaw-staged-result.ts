import type { OpenClawStagedResult } from "../../../src/pilot-hardening";

/** Synthetic shape-only fixture. It contains no copied source page content. */
export const OPENCLAW_STAGED_RESULT_FIXTURE: OpenClawStagedResult = {
  schema_version: "openclaw-staged-result-v2",
  request_id: "openclaw_request_fixture",
  collection_run_id: "collection_run_openclaw_fixture",
  source_id: "src_dev_02",
  source_url: "https://vneshstroi.ru/kvartiry/123/",
  observed_at: "2026-08-24T00:00:00.000Z",
  identity_hints: {
    property_external_id: "123",
    offer_external_id: "123",
  },
  status: "partial",
  facts: [
    {
      field: "listing_price",
      value: { amount: "5000000.00", currency: "RUB" },
      verification_status: "claimed",
      evidence: {
        source_id: "src_dev_02",
        source_url: "https://vneshstroi.ru/kvartiry/123/",
        observed_at: "2026-08-24T00:00:00.000Z",
        evidence_type: "extraction",
        evidence_reference: "fixture:price-label",
        raw_value: "5 000 000 ₽",
        extraction_confidence: 0.98,
      },
    },
  ],
  missing_fields: [],
  raw_content_reference: null,
  warnings: ["Synthetic offline capability-boundary fixture."],
};
