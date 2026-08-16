import {
  addComparisonItem,
  buildComparisonView,
  buildPilotComparisonInput,
  createComparisonSelection,
  type ComparisonSelection,
  type ComparisonView,
} from "../../src/comparison";
import { buildPilotPropertyDetailInput } from "../../src/property-detail";
import { loadPilotDataset } from "../../src/pilot-dataset";

export const comparisonDataset = loadPilotDataset();

export const comparisonRequest = (requestId = "request_pilot_a") => {
  const request = comparisonDataset.userRequests.find(
    (candidate) => candidate.user_request_id === requestId,
  );
  if (!request) throw new Error(`Missing request ${requestId}`);
  return request;
};

export const comparisonSelection = (
  propertyIds: readonly string[],
  requestId = "request_pilot_a",
): ComparisonSelection => {
  const request = comparisonRequest(requestId);
  let state = createComparisonSelection(request);
  for (const propertyId of propertyIds) {
    const detail = buildPilotPropertyDetailInput({
      propertyId,
      userRequest: request,
    });
    if (!detail.success) throw new Error(detail.error.message);
    const added = addComparisonItem(state, {
      propertyId,
      offerId: detail.input.selectedOffer?.offer_id ?? null,
      scenarioId: detail.input.selectedPurchaseScenario?.scenario_id ?? null,
    });
    if (!added.success) throw new Error(added.message);
    state = added.state;
  }
  return state;
};

export const comparisonView = (
  propertyIds: readonly string[] = ["prop_special_template_001", "prop_nb_001"],
  requestId = "request_pilot_a",
): ComparisonView => {
  const userRequest = comparisonRequest(requestId);
  const selection = comparisonSelection(propertyIds, requestId);
  const outcome = buildComparisonView(
    buildPilotComparisonInput({ userRequest, selection }),
  );
  if (!outcome.success) throw new Error(outcome.error.message);
  return outcome.view;
};

export const uncertainComparisonView = comparisonView();
export const crossTypeComparisonView = comparisonView(
  ["prop_sec_002", "prop_house_001"],
  "request_pilot_c",
);
