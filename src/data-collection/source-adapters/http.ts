import { SOURCE_ADAPTER_HTTP_CONFIG } from "./config";
import type { HttpCollectionResponse, HttpCollector } from "./contracts";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type HttpTransportErrorCode =
  | "FETCH_FAILED"
  | "TIMEOUT"
  | "RESPONSE_TOO_LARGE"
  | "REDIRECT_DENIED"
  | "TARGET_NOT_TLS"
  | "TARGET_NOT_PUBLIC";

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

export type AddressResolver = (hostname: string) => Promise<readonly string[]>;

const defaultAddressResolver: AddressResolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map(
    (entry) => entry.address,
  );

const publicIpv4 = (address: string): boolean => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return false;
  const [a, b, c] = parts as [number, number, number, number];
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
};

const publicAddress = (address: string): boolean => {
  const version = isIP(address);
  if (version === 4) return publicIpv4(address);
  if (version !== 6) return false;
  const normalized = address.toLowerCase();
  return (
    !normalized.startsWith("::ffff:") &&
    !normalized.startsWith("fc") &&
    !normalized.startsWith("fd") &&
    !normalized.startsWith("fe8") &&
    !normalized.startsWith("fe9") &&
    !normalized.startsWith("fea") &&
    !normalized.startsWith("feb") &&
    normalized !== "::" &&
    normalized !== "::1" &&
    !normalized.startsWith("2001:db8:") &&
    /^(?:2|3)[0-9a-f]{3}:/u.test(normalized)
  );
};

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
    private readonly resolveAddresses: AddressResolver = defaultAddressResolver,
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

    if (isIP(parsed.hostname) !== 0)
      throw new HttpTransportError(
        "TARGET_NOT_PUBLIC",
        "IP-literal targets are not allowed.",
      );
    let addresses: readonly string[];
    try {
      addresses = await this.resolveAddresses(parsed.hostname);
    } catch {
      throw new HttpTransportError(
        "TARGET_NOT_PUBLIC",
        "The target hostname could not be safely resolved.",
      );
    }
    if (
      addresses.length === 0 ||
      addresses.some((item) => !publicAddress(item))
    )
      throw new HttpTransportError(
        "TARGET_NOT_PUBLIC",
        "The target hostname does not resolve exclusively to public addresses.",
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
      throw new HttpTransportError("FETCH_FAILED", "HTTP collection failed.");
    } finally {
      clearTimeout(timeout);
    }
  }
}
