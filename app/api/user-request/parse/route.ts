import { parseUserRequest } from "../../../../src/user-request-parser";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        success: false,
        error: {
          schema_version: "1.0",
          type: "invalid_structure",
          message: "Тело запроса должно быть валидным JSON.",
          recoverable: true,
          raw_output_reference: null,
        },
      },
      { status: 400 },
    );
  }

  const rawText =
    typeof body === "object" &&
    body !== null &&
    "raw_text" in body &&
    typeof body.raw_text === "string"
      ? body.raw_text
      : "";
  const outcome = await parseUserRequest({
    schema_version: "1.0",
    raw_text: rawText,
    locale: "ru-RU",
    context: {
      continuation: false,
      previous_request: null,
      reference_date: new Date().toISOString().slice(0, 10),
    },
  });
  return Response.json(outcome, { status: outcome.success ? 200 : 400 });
}
