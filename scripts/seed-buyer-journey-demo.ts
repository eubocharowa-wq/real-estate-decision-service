import { BuyerJourneyApplication } from "../src/buyer-journey";
import {
  confirmRequest,
  createConfirmationSession,
} from "../src/request-confirmation";

const rawRequestText = `Найди 5 квартир до 5 млн.
Семейная ипотека обязательна.
Желательно без первоначального взноса.
Первый этаж не рассматриваю.`;
const now = "2026-08-15T00:00:00.000Z";
const application = new BuyerJourneyApplication({ clock: () => now });
const journey = application.startBuyerJourney({
  sessionId: "session_demo_seed",
  rawRequestText,
});
const parsed = await application.parseBuyerRequest(journey.journey_id);
if (!parsed.success) throw new Error(parsed.error.message);
const confirmation = confirmRequest(
  createConfirmationSession(parsed.result),
  now,
).confirmation_result;
if (!confirmation) throw new Error("Demo request cannot be confirmed");
application.confirmBuyerRequest(journey.journey_id, confirmation);
const matching = application.runJourneyMatching(journey.journey_id);

process.stdout.write(
  `${JSON.stringify(
    {
      journey_id: journey.journey_id,
      dataset_type: matching.bundle.dataset_snapshot.dataset_type,
      dataset_version: matching.bundle.dataset_snapshot.dataset_version,
      user_request_id: matching.bundle.user_request_id,
      user_request_version: matching.bundle.user_request_version,
      matching_bundle_id: matching.bundle.matching_bundle_id,
      shortlist_property_ids: matching.shortlist.cards.map(
        (card) => card.propertyId,
      ),
      note: "Deterministic in-memory demo seed; no network or production persistence.",
    },
    null,
    2,
  )}\n`,
);
