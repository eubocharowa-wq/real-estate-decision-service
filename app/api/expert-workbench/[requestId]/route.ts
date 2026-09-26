import { z } from "zod";

import {
  buildExpertResultReviewView,
  expertCheckItemDraftSchema,
  expertFindingDraftSchema,
  expertResultDraftSchema,
  getRealExpertWorkbenchRuntime,
} from "../../../../src/expert-workbench";
import { requestOwnerSchema } from "../../../../src/expert";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("open_result"),
    owner: requestOwnerSchema,
  }),
  z.strictObject({ type: z.literal("claim") }),
  z.strictObject({
    type: z.literal("transition"),
    status: z.enum([
      "in_progress",
      "waiting_for_user",
      "waiting_for_external_info",
    ]),
    reasonCode: z.enum([
      "EXPERT_STARTED_WORK",
      "EXPERT_REQUESTED_USER_INFO",
      "EXPERT_WAITING_EXTERNAL_INFO",
      "EXPERT_RECEIVED_REQUIRED_INFO",
    ]),
  }),
  z.strictObject({
    type: z.literal("update_check"),
    item: expertCheckItemDraftSchema,
  }),
  z.strictObject({
    type: z.literal("add_finding"),
    finding: expertFindingDraftSchema,
  }),
  z.strictObject({
    type: z.literal("save_draft"),
    draft: expertResultDraftSchema,
  }),
  z.strictObject({ type: z.literal("complete") }),
]);

const failure = (status: number, error: string): Response =>
  Response.json({ error }, { status });

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly requestId: string }> },
): Promise<Response> {
  const { requestId } = await context.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return failure(400, "INVALID_JSON");
  }
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) return failure(422, "INVALID_WORKBENCH_ACTION");
  const runtime = getRealExpertWorkbenchRuntime();
  try {
    const action = parsed.data;
    if (action.type === "open_result") {
      const input = await runtime.application.openResultReview(
        {
          actor_type: "owner",
          actor_ref: action.owner.owner_id,
          owner: action.owner,
        },
        requestId,
      );
      return Response.json({
        view: buildExpertResultReviewView(
          input,
          runtime.application.buildTechnicalEscalationHref(input),
        ),
      });
    }
    const actor = runtime.actor;
    if (actor.actor_type !== "expert")
      return failure(403, "EXPERT_RUNTIME_ACTOR_NOT_CONFIGURED");
    if (action.type === "claim")
      return Response.json(
        await runtime.application.claimRequest(actor, requestId),
      );
    if (action.type === "transition")
      return Response.json(
        runtime.application.transition({
          actor,
          requestId,
          status: action.status,
          reasonCode: action.reasonCode,
        }),
      );
    if (action.type === "update_check")
      return Response.json(
        runtime.application.updateCheckItem({
          actor,
          requestId,
          item: action.item,
        }),
      );
    if (action.type === "add_finding")
      return Response.json(
        runtime.application.addFinding({
          actor,
          requestId,
          finding: action.finding,
        }),
      );
    if (action.type === "save_draft")
      return Response.json(
        runtime.application.saveDraft({
          actor,
          requestId,
          draft: action.draft,
        }),
      );
    return Response.json(
      await runtime.application.complete({ actor, requestId }),
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "WORKBENCH_ERROR";
    const status = code.includes("DENIED") ? 403 : 422;
    return failure(status, code);
  }
}
