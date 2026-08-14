import { ZodError } from "zod";

import { userRequestSchema } from "../domain/user-request/schema";
import { selectTopClarifications } from "./clarifications";
import { buildConfirmationView } from "./confirmation";
import {
  parserErrorSchema,
  userRequestParserInputSchema,
  userRequestParserResultSchema,
  type UserRequestParserError,
  type UserRequestParserOutcome,
} from "./contracts";
import { calculateInterpretationConfidence } from "./confidence";
import {
  USER_REQUEST_NORMALIZATION_VERSION,
  USER_REQUEST_PARSER_VERSION,
  userRequestParserPolicy,
} from "./config";
import { detectUserRequestContradictions } from "./contradictions";
import { extractRuleBasedDraft } from "./extraction";
import {
  createParserDraft,
  normalizeParsedRequest,
  stableId,
} from "./normalization";
import type { UserRequestParser } from "./parser";

const errorOutcome = (
  type: UserRequestParserError["type"],
  message: string,
  recoverable: boolean,
  rawOutputReference: string | null = null,
): UserRequestParserOutcome => ({
  success: false,
  error: parserErrorSchema.parse({
    schema_version: "1.0",
    type,
    message,
    recoverable,
    raw_output_reference: rawOutputReference,
  }),
});

export class RuleBasedUserRequestParser implements UserRequestParser {
  async parse(input: unknown): Promise<UserRequestParserOutcome> {
    const validatedInput = userRequestParserInputSchema.safeParse(input);
    if (!validatedInput.success) {
      return errorOutcome(
        "invalid_structure",
        "Вход parser не соответствует UserRequestParserInput.",
        true,
      );
    }

    const parserInput = validatedInput.data;
    if (parserInput.raw_text.trim().length === 0) {
      return errorOutcome(
        "empty_request",
        "Текст запроса не должен быть пустым.",
        true,
      );
    }
    if (!parserInput.locale.toLowerCase().startsWith("ru")) {
      return errorOutcome(
        "unsupported_language",
        `Локаль ${parserInput.locale} не поддерживается rule-based adapter.`,
        true,
      );
    }

    try {
      const draft = extractRuleBasedDraft(
        createParserDraft(parserInput),
        parserInput,
      );
      let parsedRequest = normalizeParsedRequest(draft);
      const contradictions = detectUserRequestContradictions(
        parsedRequest,
        draft.extracted_facts,
      );
      const clarifications = selectTopClarifications(
        draft.unknowns,
        contradictions,
        parserInput.raw_text,
      );
      const confidence = calculateInterpretationConfidence(
        draft.extracted_facts,
        draft.unknowns,
        contradictions,
        draft.warnings,
      );

      parsedRequest = userRequestSchema.parse({
        ...parsedRequest,
        confidence: {
          extraction_confidence: confidence.score / 100,
          status: confidence.band,
        },
        clarifications: clarifications.map((clarification) => ({
          clarification_id: clarification.clarification_id,
          question: clarification.proposed_question,
          status: "open" as const,
          answer: null,
        })),
      });
      const confirmationView = buildConfirmationView(
        parsedRequest,
        parserInput.raw_text,
        draft.extracted_facts,
        draft.unknowns,
        contradictions,
        clarifications,
      );
      const result = userRequestParserResultSchema.parse({
        schema_version: "1.0",
        raw_text: parserInput.raw_text,
        locale: parserInput.locale,
        parsed_request: parsedRequest,
        interpretation_confidence: confidence,
        extracted_facts: draft.extracted_facts,
        inferred_candidates: draft.inferred_candidates,
        unknowns: draft.unknowns,
        contradictions,
        clarification_candidates: clarifications,
        warnings: draft.warnings,
        confirmation_view: confirmationView,
        user_requested_limit: draft.user_requested_limit,
        system_default_limit: userRequestParserPolicy.default_result_limit,
        parser_version: USER_REQUEST_PARSER_VERSION,
        prompt_version: null,
        normalization_version: USER_REQUEST_NORMALIZATION_VERSION,
      });
      return { success: true, result };
    } catch (error) {
      if (error instanceof ZodError) {
        return errorOutcome(
          "invalid_structure",
          "Результат extraction или normalization не прошёл runtime validation.",
          true,
          stableId("parser_output", parserInput.raw_text, error.message),
        );
      }
      return errorOutcome(
        "parser_unavailable",
        "Parser временно недоступен.",
        true,
        stableId(
          "parser_failure",
          parserInput.raw_text,
          error instanceof Error ? error.name : "unknown",
        ),
      );
    }
  }
}

const defaultParser = new RuleBasedUserRequestParser();

export const parseUserRequest = (
  input: unknown,
): Promise<UserRequestParserOutcome> => defaultParser.parse(input);
