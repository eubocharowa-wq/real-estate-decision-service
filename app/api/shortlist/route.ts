import { userRequestSchema } from "../../../src/domain";
import {
  buildPilotShortlistInput,
  buildShortlistView,
} from "../../../src/shortlist";

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
  const payload =
    typeof body === "object" && body !== null
      ? Reflect.get(body, "userRequest")
      : undefined;
  const parsed = userRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        error: "INVALID_USER_REQUEST",
        message: "Подтверждённый запрос повреждён или устарел.",
      },
      { status: 422 },
    );
  }

  try {
    const adapted = buildPilotShortlistInput(parsed.data);
    const built = buildShortlistView(adapted.input);
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
        error: "SHORTLIST_UNAVAILABLE",
        message: "Не удалось подготовить подбор. Попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }
}
