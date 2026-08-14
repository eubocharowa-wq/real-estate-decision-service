import type { UserRequestParserOutcome } from "./contracts";

export interface UserRequestParser {
  parse(input: unknown): Promise<UserRequestParserOutcome>;
}
