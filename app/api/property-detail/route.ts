import { userRequestSchema } from "../../../src/domain";
import {
  buildPilotPropertyDetailInput,
  buildPropertyDetailView,
} from "../../../src/property-detail";

export const runtime = "nodejs";

const optionalString = (body: object, key: string): string | null => {
  const value = Reflect.get(body, key);
  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

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
  if (typeof body !== "object" || body === null) {
    return Response.json(
      { error: "INVALID_REQUEST", message: "Не указан объект." },
      { status: 422 },
    );
  }
  const propertyId = optionalString(body, "propertyId");
  if (!propertyId) {
    return Response.json(
      { error: "INVALID_PROPERTY_ID", message: "Не указан объект." },
      { status: 422 },
    );
  }
  const rawUserRequest = Reflect.get(body, "userRequest");
  const parsedUserRequest =
    rawUserRequest === null || rawUserRequest === undefined
      ? null
      : userRequestSchema.safeParse(rawUserRequest);
  if (parsedUserRequest !== null && !parsedUserRequest.success) {
    return Response.json(
      {
        error: "INVALID_USER_REQUEST",
        message: "Подтверждённый запрос повреждён или устарел.",
      },
      { status: 422 },
    );
  }

  try {
    const adapted = buildPilotPropertyDetailInput({
      propertyId,
      offerId: optionalString(body, "offerId"),
      scenarioId: optionalString(body, "scenarioId"),
      userRequest: parsedUserRequest?.data ?? null,
      contextNotice: optionalString(body, "contextNotice"),
    });
    if (!adapted.success) {
      const status = adapted.error.code === "PROPERTY_NOT_FOUND" ? 404 : 422;
      return Response.json(
        { error: adapted.error.code, message: adapted.error.message },
        { status },
      );
    }
    const built = buildPropertyDetailView(adapted.input);
    if (!built.success) {
      return Response.json(
        { error: built.error.code, message: built.error.message },
        { status: 422 },
      );
    }
    return Response.json({ view: built.view });
  } catch {
    return Response.json(
      {
        error: "PROPERTY_DETAIL_UNAVAILABLE",
        message: "Не удалось загрузить объект. Попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }
}
