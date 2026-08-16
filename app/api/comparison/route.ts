import { userRequestSchema } from "../../../src/domain";
import {
  buildComparisonView,
  buildPilotComparisonInput,
  comparisonSelectionSchema,
} from "../../../src/comparison";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "INVALID_JSON", message: "Тело запроса должно быть JSON." },
      { status: 400 },
    );
  }
  if (typeof body !== "object" || body === null)
    return Response.json(
      { error: "INVALID_REQUEST", message: "Не указаны данные сравнения." },
      { status: 422 },
    );
  const userRequest = userRequestSchema.safeParse(
    Reflect.get(body, "userRequest"),
  );
  const selection = comparisonSelectionSchema.safeParse(
    Reflect.get(body, "selection"),
  );
  if (!userRequest.success)
    return Response.json(
      {
        error: "INVALID_USER_REQUEST",
        message: "Подтверждённый запрос повреждён или устарел.",
      },
      { status: 422 },
    );
  if (!selection.success)
    return Response.json(
      { error: "INVALID_SELECTION", message: "Состав сравнения повреждён." },
      { status: 422 },
    );
  if (
    selection.data.userRequestId !== userRequest.data.user_request_id ||
    selection.data.userRequestSchemaVersion !== userRequest.data.schema_version
  )
    return Response.json(
      {
        error: "MIXED_USER_REQUEST",
        message: "Условия изменились — пересчитайте сравнение.",
      },
      { status: 409 },
    );
  try {
    const built = buildComparisonView(
      buildPilotComparisonInput({
        userRequest: userRequest.data,
        selection: selection.data,
      }),
    );
    if (!built.success)
      return Response.json(
        { error: built.error.code, message: built.error.message },
        { status: 422 },
      );
    return Response.json({ view: built.view });
  } catch {
    return Response.json(
      {
        error: "COMPARISON_UNAVAILABLE",
        message: "Не удалось подготовить сравнение. Попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }
}
