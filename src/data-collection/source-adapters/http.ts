import { SOURCE_ADAPTER_HTTP_CONFIG } from "./config";
import type { HttpCollectionResponse, HttpCollector } from "./contracts";

export type HttpTransportErrorCode =
  | "FETCH_FAILED"
  | "TIMEOUT"
  | "RESPONSE_TOO_LARGE"
  | "REDIRECT_DENIED"
  | "TARGET_NOT_TLS";

export class HttpTransportError extends Error {
  constructor(
    readonly code: HttpTransportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpTransportError";
  }
}

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";

const readBoundedBody = async (
  response: Response,
  maximumBytes: number,
): Promise<string> => {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maximumBytes)
    throw new HttpTransportError(
      "RESPONSE_TOO_LARGE",
      "Response exceeds the configured byte limit.",
    );
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let body = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytesRead += chunk.value.byteLength;
    if (bytesRead > maximumBytes) {
      await reader.cancel();
      throw new HttpTransportError(
        "RESPONSE_TOO_LARGE",
        "Response exceeds the configured byte limit.",
      );
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  body += decoder.decode();
  return body;
};

/**
 * Network boundary for the one approved HTTP adapter. Redirects are never
 * followed, credentials are omitted, and the caller can only pass a URL that
 * has already survived the Source Policy Engine scope check.
 */
export class SecureHttpCollector implements HttpCollector {
  readonly version = "secure-http-collector-v1";

  constructor(
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  async get(url: string): Promise<HttpCollectionResponse> {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port
    )
      throw new HttpTransportError(
        "TARGET_NOT_TLS",
        "Only credential-free HTTPS targets on the default port are allowed.",
      );

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      SOURCE_ADAPTER_HTTP_CONFIG.timeoutMs,
    );
    try {
      const response = await this.fetchImplementation(url, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { Accept: "text/html" },
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400)
        throw new HttpTransportError(
          "REDIRECT_DENIED",
          "Redirects are denied for the explicit-target PoC.",
        );
      if (response.url && response.url !== url)
        throw new HttpTransportError(
          "REDIRECT_DENIED",
          "The final URL differs from the policy-validated target.",
        );
      return {
        status: response.status,
        finalUrl: response.url || url,
        contentType: response.headers.get("content-type"),
        body: await readBoundedBody(
          response,
          SOURCE_ADAPTER_HTTP_CONFIG.maximumResponseBytes,
        ),
      };
    } catch (error) {
      if (error instanceof HttpTransportError) throw error;
      if (isAbortError(error))
        throw new HttpTransportError("TIMEOUT", "HTTP collection timed out.");
      throw new HttpTransportError(
        "FETCH_FAILED",
        error instanceof Error ? error.message : "HTTP collection failed.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
