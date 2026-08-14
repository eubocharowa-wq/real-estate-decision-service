export const USER_REQUEST_PARSER_VERSION = "user-request-parser-v1";
export const USER_REQUEST_NORMALIZATION_VERSION =
  "user-request-normalization-v1";

export const userRequestParserPolicy = {
  default_result_limit: 7,
  maximum_clarifications: 3,
  confidence: {
    high_minimum: 85,
    medium_minimum: 60,
    blocking_contradiction_penalty: 25,
    critical_unknown_penalty: 15,
    high_unknown_penalty: 8,
    medium_unknown_penalty: 3,
    ambiguous_warning_penalty: 5,
  },
} as const;
