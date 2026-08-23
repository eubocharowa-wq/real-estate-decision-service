import type { SourceIdentification, ValidatedUserUrl } from "./types";

const sources: Readonly<
  Record<string, Omit<SourceIdentification, "hostname">>
> = Object.freeze({
  "fixture.example": {
    knownSourceId: "fixture_user_url",
    sourceType: "user_link",
    confidence: "exact",
    policyStatus: "configured",
  },
  "manual.fixture.example": {
    knownSourceId: "manual_fixture_source",
    sourceType: "user_link",
    confidence: "exact",
    policyStatus: "configured",
  },
  "blocked.fixture.example": {
    knownSourceId: "blocked_fixture_source",
    sourceType: "user_link",
    confidence: "exact",
    policyStatus: "configured",
  },
  "unsupported.fixture.example": {
    knownSourceId: "unsupported_fixture_source",
    sourceType: "other",
    confidence: "exact",
    policyStatus: "configured",
  },
  "familia71.ru": {
    knownSourceId: "source_dev_06",
    sourceType: "developer_site",
    confidence: "exact",
    policyStatus: "configured",
  },
  "www.cian.ru": {
    knownSourceId: "source_mkt_01",
    sourceType: "classified",
    confidence: "exact",
    policyStatus: "configured",
  },
  "domclick.ru": {
    knownSourceId: "source_mkt_03",
    sourceType: "classified",
    confidence: "exact",
    policyStatus: "configured",
  },
  "www.avito.ru": {
    knownSourceId: "source_mkt_04",
    sourceType: "classified",
    confidence: "exact",
    policyStatus: "configured",
  },
});

export const identifyUserUrlSource = (
  url: ValidatedUserUrl,
): SourceIdentification => ({
  hostname: url.hostname,
  ...(sources[url.hostname] ?? {
    knownSourceId: null,
    sourceType: "other" as const,
    confidence: "unknown" as const,
    policyStatus: "unknown_source" as const,
  }),
});
