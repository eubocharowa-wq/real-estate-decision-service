import { sourceRegistry } from "../data-collection/source-registry";
import type { SourceIdentification, ValidatedUserUrl } from "./types";

export const identifyUserUrlSource = (
  url: ValidatedUserUrl,
): SourceIdentification => {
  const identification = sourceRegistry.identify(url.canonicalUrl);
  return {
    hostname: identification.hostname ?? url.hostname,
    knownSourceId: identification.sourceId,
    sourceType: identification.sourceType,
    confidence: identification.matchType,
    policyStatus:
      identification.status === "known" ? "configured" : "unknown_source",
  };
};
