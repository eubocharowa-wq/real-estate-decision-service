import type { UserRequest } from "../domain";
import { buildPilotPropertyDetailInput } from "../property-detail";
import type { ComparisonSelection } from "./selection";
import type { ComparisonInput, ComparisonItemInput } from "./types";
import type { NormalizedUserUrlCandidate } from "../user-url-ingestion/types";
import { buildUserUrlPropertyDetailInput } from "../user-url-ingestion/matching-adapter";

export interface PilotComparisonRequest {
  readonly userRequest: UserRequest;
  readonly selection: ComparisonSelection;
  readonly importedCandidates?: readonly NormalizedUserUrlCandidate[];
}

export const buildPilotComparisonInput = ({
  userRequest,
  selection,
  importedCandidates = [],
}: PilotComparisonRequest): ComparisonInput => {
  let createdAt = new Date(0).toISOString();
  let partial = false;
  const items: ComparisonItemInput[] = selection.items.map((selected) => {
    const imported = importedCandidates.find(
      (candidate) =>
        candidate.propertyCandidate.identity.property_id ===
          selected.propertyId &&
        candidate.offerCandidate.offer_id === selected.offerId,
    );
    if (imported) {
      const detail = buildUserUrlPropertyDetailInput({
        candidate: imported,
        userRequest,
      });
      if (!detail) {
        partial = true;
        return {
          status: "unavailable",
          selection: selected,
          message: "Не удалось оценить вариант по ссылке.",
        };
      }
      createdAt = detail.generatedAt;
      partial = partial || detail.partial;
      return { status: "ready", selection: selected, detail };
    }
    const outcome = buildPilotPropertyDetailInput({
      propertyId: selected.propertyId,
      offerId: selected.offerId,
      scenarioId: selected.scenarioId,
      userRequest,
      contextNotice: "Сравнение использует один подтверждённый запрос.",
    });
    if (!outcome.success) {
      partial = true;
      return {
        status: "unavailable",
        selection: selected,
        message: outcome.error.message,
      };
    }
    createdAt = outcome.input.generatedAt;
    partial = partial || outcome.input.partial;
    return { status: "ready", selection: selected, detail: outcome.input };
  });
  return {
    comparisonId: `comparison_${userRequest.user_request_id}`,
    userRequest,
    selection,
    items,
    createdAt,
    partial,
  };
};
