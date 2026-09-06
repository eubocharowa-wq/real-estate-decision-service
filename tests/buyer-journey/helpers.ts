import {
  BuyerJourneyApplication,
  InMemoryBuyerJourneyRepository,
  type BuyerJourney,
} from "../../src/buyer-journey";
import {
  confirmRequest,
  createConfirmationSession,
  type RequestConfirmationResult,
} from "../../src/request-confirmation";

export const GOLDEN_RAW_REQUEST = `Найди 5 квартир до 5 млн.
Семейная ипотека обязательна.
Желательно без первоначального взноса.
Первый этаж не рассматриваю.`;

export class MutableJourneyClock {
  value = "2026-08-15T00:00:00.000Z";
  readonly now = () => this.value;
}

export const confirmParsedJourney = async (
  application: BuyerJourneyApplication,
  journey: BuyerJourney,
): Promise<RequestConfirmationResult> => {
  const parsed = await application.parseBuyerRequest(journey.journey_id);
  if (!parsed.success) throw new Error(parsed.error.message);
  const confirmation = confirmRequest(
    createConfirmationSession(parsed.result),
    "2026-08-15T00:00:00.000Z",
  ).confirmation_result;
  if (!confirmation) throw new Error("Golden request did not confirm");
  await application.confirmBuyerRequest(journey.journey_id, confirmation);
  return confirmation;
};

export const createGoldenJourney = async (input?: {
  readonly repository?: InMemoryBuyerJourneyRepository;
}) => {
  const clock = new MutableJourneyClock();
  const application = new BuyerJourneyApplication({
    clock: clock.now,
    repository: input?.repository,
  });
  const journey = await application.startBuyerJourney({
    sessionId: "session_golden_buyer",
    rawRequestText: GOLDEN_RAW_REQUEST,
  });
  const confirmation = await confirmParsedJourney(application, journey);
  const matching = await application.runJourneyMatching(journey.journey_id);
  return { application, clock, journey, confirmation, matching };
};

export const completeFamilyMortgageResult = (input: {
  readonly requestId: string;
  readonly specialistRef: string;
  readonly specialistType:
    | "real_estate_expert"
    | "lawyer"
    | "mortgage_specialist"
    | "property_inspector"
    | "technical_specialist";
  readonly completedAt?: string;
}) => {
  const evidenceCandidateId = "expert_candidate_family_eligibility";
  return {
    result_version: "expert-result-v1" as const,
    expert_result_id: "expert_result_family_eligibility",
    request_id: input.requestId,
    status: "completed" as const,
    checked_items: [
      {
        item_id: "check_family_eligibility",
        subject: "Применимость семейной ипотеки",
        method: "Ручная проверка экспертом",
        outcome: "confirmed" as const,
        evidence_refs: [evidenceCandidateId],
        note: null,
      },
    ],
    findings: [],
    confirmed: [
      {
        entity_id: "elig_nb_002_family",
        field: "eligibility_status",
        value: "confirmed",
        evidence_refs: [evidenceCandidateId],
      },
    ],
    unconfirmed: [],
    conflicts: [],
    risks: [],
    recommendations: ["Использовать подтверждённую применимость программы."],
    next_actions: [],
    evidence_refs: [],
    evidence_candidates: [
      {
        evidence_candidate_id: evidenceCandidateId,
        evidence_type: "manual_expert" as const,
        entity_type: "property_financing_eligibility",
        entity_id: "elig_nb_002_family",
        field: "eligibility_status",
        value: "confirmed",
        verification_status: "confirmed" as const,
        checked_at: input.completedAt ?? "2026-08-15T01:00:00.000Z",
        checked_by: input.specialistRef,
        method: "manual_program_verification",
        supporting_reference: null,
        note: "Synthetic expert fixture; no live source content.",
      },
    ],
    specialist: {
      specialist_ref: input.specialistRef,
      specialist_type: input.specialistType,
    },
    choice_assistance: null,
    disclaimer: null,
    completed_at: input.completedAt ?? "2026-08-15T01:00:00.000Z",
  };
};
