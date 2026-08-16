import type { UserRequest } from "../domain";
import { buildPilotPropertyDetailInput } from "../property-detail";
import type { ComparisonSelection } from "./selection";
import type { ComparisonInput, ComparisonItemInput } from "./types";

export interface PilotComparisonRequest {
  readonly userRequest: UserRequest;
  readonly selection: ComparisonSelection;
}

export const buildPilotComparisonInput = ({
  userRequest,
  selection,
}: PilotComparisonRequest): ComparisonInput => {
  let createdAt = new Date(0).toISOString();
  let partial = false;
  const items: ComparisonItemInput[] = selection.items.map((selected) => {
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
