import {
  matchResultSchema,
  type DataQuality,
  type MatchResult,
} from "../../domain";

export const applyDataQualityToMatchResult = (
  matchResult: MatchResult,
  dataQuality: DataQuality,
): MatchResult =>
  matchResultSchema.parse({
    ...matchResult,
    data_confidence_score: dataQuality.data_confidence_score,
    data_completeness_score: dataQuality.data_completeness_score,
  });
