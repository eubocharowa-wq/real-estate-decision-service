import type { IngestionPolicyDecision } from "../policy";
import type { RawIngestionResult, ValidatedUserUrl } from "../types";

export interface UserUrlAdapterContext {
  readonly ingestionId: string;
  readonly url: ValidatedUserUrl;
  readonly policy: IngestionPolicyDecision;
  readonly now: string;
}

export interface UserUrlIngestionAdapter {
  readonly name: string;
  readonly version: string;
  supports(context: UserUrlAdapterContext): boolean;
  collect(context: UserUrlAdapterContext): Promise<RawIngestionResult>;
}
