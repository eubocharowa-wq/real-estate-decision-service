import type { ExpertRequest } from "../expert";
import type { ExpertWorkbenchActor } from "./contracts";

export interface ExpertWorkbenchPermissionPolicy {
  canViewExpertRequest(
    actor: ExpertWorkbenchActor,
    request: ExpertRequest,
  ): boolean;
  canEditExpertRequest(
    actor: ExpertWorkbenchActor,
    request: ExpertRequest,
  ): boolean;
  canCompleteExpertRequest(
    actor: ExpertWorkbenchActor,
    request: ExpertRequest,
  ): boolean;
}

const isAssignedExpert = (
  actor: ExpertWorkbenchActor,
  request: ExpertRequest,
): boolean =>
  actor.actor_type === "expert" &&
  actor.actor_ref === request.assigned_specialist_ref &&
  actor.specialist_type === request.required_specialist;

export class ScopedExpertWorkbenchPermissionPolicy implements ExpertWorkbenchPermissionPolicy {
  canViewExpertRequest(
    actor: ExpertWorkbenchActor,
    request: ExpertRequest,
  ): boolean {
    if (actor.actor_type === "unknown") return false;
    if (actor.actor_type === "owner")
      return (
        actor.owner.owner_type === request.owner.owner_type &&
        actor.owner.owner_id === request.owner.owner_id
      );
    if (request.status === "queued")
      return actor.specialist_type === request.required_specialist;
    return isAssignedExpert(actor, request);
  }

  canEditExpertRequest(
    actor: ExpertWorkbenchActor,
    request: ExpertRequest,
  ): boolean {
    return (
      isAssignedExpert(actor, request) &&
      [
        "assigned",
        "in_progress",
        "waiting_for_user",
        "waiting_for_external_info",
      ].includes(request.status)
    );
  }

  canCompleteExpertRequest(
    actor: ExpertWorkbenchActor,
    request: ExpertRequest,
  ): boolean {
    return isAssignedExpert(actor, request) && request.status === "in_progress";
  }
}

export const canViewExpertRequest = (
  policy: ExpertWorkbenchPermissionPolicy,
  actor: ExpertWorkbenchActor,
  request: ExpertRequest,
): boolean => policy.canViewExpertRequest(actor, request);

export const canEditExpertRequest = (
  policy: ExpertWorkbenchPermissionPolicy,
  actor: ExpertWorkbenchActor,
  request: ExpertRequest,
): boolean => policy.canEditExpertRequest(actor, request);

export const canCompleteExpertRequest = (
  policy: ExpertWorkbenchPermissionPolicy,
  actor: ExpertWorkbenchActor,
  request: ExpertRequest,
): boolean => policy.canCompleteExpertRequest(actor, request);
