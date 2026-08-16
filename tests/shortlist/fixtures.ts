import type { ShortlistCandidateInput } from "../../src/shortlist";
import {
  buildPilotShortlistInput,
  buildShortlistView,
} from "../../src/shortlist";
import { loadPilotDataset } from "../../src/pilot-dataset";

export const pilotDataset = loadPilotDataset();
export const pilotRequest = pilotDataset.userRequests.find(
  (request) => request.user_request_id === "request_pilot_b",
)!;
export const pilotAdapterResult = buildPilotShortlistInput(pilotRequest);

export const candidate = (propertyId: string): ShortlistCandidateInput => {
  const found = pilotAdapterResult.input.candidates.find(
    (item) => item.property.identity.property_id === propertyId,
  );
  if (!found) throw new Error(`Missing shortlist candidate ${propertyId}`);
  return found;
};

export const pilotView = (() => {
  const outcome = buildShortlistView(pilotAdapterResult.input);
  if (!outcome.success) throw new Error(outcome.error.message);
  return outcome.view;
})();
