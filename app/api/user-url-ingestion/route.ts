import {
  manualConfirmationFieldsSchema,
  UserUrlIngestionOrchestrator,
} from "../../../src/user-url-ingestion";

export const runtime = "nodejs";

const orchestrator = new UserUrlIngestionOrchestrator();

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
      { error: "INVALID_REQUEST", message: "Не указаны данные." },
      { status: 422 },
    );
  const action = Reflect.get(body, "action");
  if (action === "preview") {
    const url = Reflect.get(body, "url");
    if (typeof url !== "string")
      return Response.json(
        { error: "INVALID_URL", message: "Введите ссылку." },
        { status: 422 },
      );
    const preview = await orchestrator.preview(url);
    return Response.json(
      { preview },
      { status: preview.status === "failed" ? 422 : 200 },
    );
  }
  if (action === "confirm") {
    const suppliedPreview = Reflect.get(body, "preview");
    const fields = manualConfirmationFieldsSchema.safeParse(
      Reflect.get(body, "fields"),
    );
    if (
      !fields.success ||
      typeof suppliedPreview !== "object" ||
      suppliedPreview === null
    )
      return Response.json(
        {
          error: "INVALID_CONFIRMATION",
          message: "Проверьте обязательные поля.",
        },
        { status: 422 },
      );
    const originalUrl = Reflect.get(suppliedPreview, "originalUrl");
    if (typeof originalUrl !== "string")
      return Response.json(
        {
          error: "INVALID_CONFIRMATION",
          message: "Исходная ссылка отсутствует.",
        },
        { status: 422 },
      );
    // Re-run validation, policy and adapter server-side; never trust a client-supplied policy decision.
    const preview = await orchestrator.preview(originalUrl);
    const outcome = orchestrator.confirm(preview, fields.data);
    return Response.json(outcome, { status: outcome.success ? 200 : 422 });
  }
  return Response.json(
    { error: "INVALID_ACTION", message: "Неизвестное действие." },
    { status: 422 },
  );
}
