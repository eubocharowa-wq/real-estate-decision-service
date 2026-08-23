import type { ExpertWorkflowStatus } from "./contracts";

const ALLOWED_TRANSITIONS: Readonly<
  Record<ExpertWorkflowStatus, readonly ExpertWorkflowStatus[]>
> = Object.freeze({
  draft: ["submitted", "cancelled"],
  submitted: ["queued", "cancelled", "unable_to_complete"],
  queued: ["assigned", "cancelled", "unable_to_complete"],
  assigned: ["in_progress", "cancelled", "unable_to_complete"],
  in_progress: [
    "waiting_for_user",
    "waiting_for_external_info",
    "completed",
    "cancelled",
    "unable_to_complete",
  ],
  waiting_for_user: ["in_progress", "cancelled", "unable_to_complete"],
  waiting_for_external_info: ["in_progress", "cancelled", "unable_to_complete"],
  completed: [],
  cancelled: [],
  unable_to_complete: [],
});

export const canTransitionExpertRequest = (
  from: ExpertWorkflowStatus,
  to: ExpertWorkflowStatus,
): boolean => ALLOWED_TRANSITIONS[from].includes(to);

export const assertExpertRequestTransition = (
  from: ExpertWorkflowStatus,
  to: ExpertWorkflowStatus,
): void => {
  if (!canTransitionExpertRequest(from, to))
    throw new Error(`INVALID_EXPERT_REQUEST_TRANSITION: ${from} -> ${to}`);
};

export const isFinalExpertRequestStatus = (
  status: ExpertWorkflowStatus,
): boolean => ALLOWED_TRANSITIONS[status].length === 0;

export const expertRequestTransitions = ALLOWED_TRANSITIONS;
