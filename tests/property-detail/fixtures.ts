import {
  buildPilotPropertyDetailInput,
  buildPropertyDetailView,
  type PropertyDetailView,
} from "../../src/property-detail";
import { loadPilotDataset } from "../../src/pilot-dataset";

export const propertyDetailDataset = loadPilotDataset();

export const detailView = ({
  propertyId,
  requestId = null,
  offerId = null,
  scenarioId = null,
}: {
  readonly propertyId: string;
  readonly requestId?: string | null;
  readonly offerId?: string | null;
  readonly scenarioId?: string | null;
}): PropertyDetailView => {
  const userRequest = requestId
    ? propertyDetailDataset.userRequests.find(
        (item) => item.user_request_id === requestId,
      )
    : null;
  if (requestId && !userRequest)
    throw new Error(`Missing user request ${requestId}`);
  const adapted = buildPilotPropertyDetailInput({
    propertyId,
    offerId,
    scenarioId,
    userRequest,
  });
  if (!adapted.success) throw new Error(adapted.error.message);
  const built = buildPropertyDetailView(adapted.input);
  if (!built.success) throw new Error(built.error.message);
  return built.view;
};

export const personalizedDetailView = detailView({
  propertyId: "prop_nb_001",
  requestId: "request_pilot_a",
  offerId: "offer_nb_001_agency",
  scenarioId: "scenario_nb_001_zero",
});
