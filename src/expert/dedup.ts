import type {
  ExpertRequestType,
  RequestOwner,
  StructuredQuestion,
} from "./contracts";

export interface ExpertDedupInput {
  readonly owner: RequestOwner;
  readonly requestType: ExpertRequestType;
  readonly propertyIds: readonly string[];
  readonly offerIds: readonly string[];
  readonly purchaseScenarioIds: readonly string[];
  readonly comparisonId: string | null;
  readonly question: string;
  readonly structuredQuestions: readonly StructuredQuestion[];
}

const normalize = (value: string): string =>
  value.trim().toLocaleLowerCase("ru-RU").replaceAll(/\s+/g, " ");

const stableHash = (value: string): string => {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
};

const sorted = (values: readonly string[]): string =>
  [...new Set(values)].sort().join(",");

export const createExpertRequestDedupKey = (
  input: ExpertDedupInput,
): string => {
  const structuredIdentity =
    input.structuredQuestions.length > 0
      ? sorted(
          input.structuredQuestions.map(
            (question) => `${question.question_code}:${question.field ?? ""}`,
          ),
        )
      : "unstructured";
  const questionIdentity = `${structuredIdentity}:${stableHash(
    normalize(input.question),
  )}`;
  return [
    "expert-dedup-v1",
    `${input.owner.owner_type}:${input.owner.owner_id}`,
    input.requestType,
    sorted(input.propertyIds),
    sorted(input.offerIds),
    sorted(input.purchaseScenarioIds),
    input.comparisonId ?? "none",
    questionIdentity,
  ].join("|");
};
