import { evaluateStagingReadiness } from "../../../src/staging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request): Promise<Response> {
  const readiness = await evaluateStagingReadiness({
    requestUrl: request.url,
  });
  return Response.json(readiness, {
    status: readiness.status === "ready" ? 200 : 503,
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
