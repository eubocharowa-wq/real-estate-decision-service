import { Buffer } from "node:buffer";
import { lookup } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import type { TLSSocket } from "node:tls";

import { SOURCE_ADAPTER_HTTP_CONFIG } from "./config";
import type { HttpCollectionResponse, HttpCollector } from "./contracts";

export type HttpTransportErrorCode =
  | "FETCH_FAILED"
  | "TIMEOUT"
  | "RESPONSE_TOO_LARGE"
  | "REDIRECT_DENIED"
  | "TARGET_NOT_TLS"
  | "TARGET_NOT_PUBLIC"
  | "TARGET_ADDRESS_MISMATCH";

export class HttpTransportError extends Error {
  constructor(
    readonly code: HttpTransportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpTransportError";
  }
}

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

export const matchesPinnedAddress = (
  expected: string,
  actual: string,
): boolean => {
  const version = isIP(expected);
  if (version === 0 || isIP(actual) !== version) return false;
  const blockList = new BlockList();
  const type = version === 4 ? "ipv4" : "ipv6";
  blockList.addAddress(expected, type);
  return blockList.check(actual, type);
};

export interface PinnedHttpsTransportInput {
  readonly url: string;
  readonly pinnedAddress: string;
  readonly timeoutMs: number;
  readonly maximumResponseBytes: number;
}

export interface PinnedHttpsTransport {
  get(input: PinnedHttpsTransportInput): Promise<HttpCollectionResponse>;
}

/**
 * Keeps the original hostname for Host/SNI/certificate validation while the
 * custom lookup can return only the address that passed SSRF validation.
 */
export const buildPinnedHttpsRequestOptions = (
  url: string,
  pinnedAddress: string,
): RequestOptions => {
  const parsed = new URL(url);
  const family = isIP(pinnedAddress);
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: pinnedAddress, family }]);
      return;
    }
    callback(null, pinnedAddress, family);
  };
  return {
    protocol: "https:",
    hostname: parsed.hostname,
    port: 443,
    path: `${parsed.pathname}${parsed.search}`,
    method: "GET",
    headers: { Accept: "text/html", "Accept-Encoding": "identity" },
    agent: false,
    lookup: pinnedLookup,
    servername: parsed.hostname,
    rejectUnauthorized: true,
  };
};

const headerValue = (
  value: string | readonly string[] | undefined,
): string | null => (typeof value === "string" ? value : (value?.[0] ?? null));

/** One DNS-pinned TLS connection. Node never follows redirects here. */
export class NodePinnedHttpsTransport implements PinnedHttpsTransport {
  get(input: PinnedHttpsTransportInput): Promise<HttpCollectionResponse> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout: { handle?: ReturnType<typeof setTimeout> } = {};
      const settleReject = (error: unknown) => {
        if (settled) return;
        settled = true;
        if (timeout.handle) clearTimeout(timeout.handle);
        reject(
          error instanceof HttpTransportError
            ? error
            : new HttpTransportError("FETCH_FAILED", "HTTP collection failed."),
        );
      };
      const settleResolve = (response: HttpCollectionResponse) => {
        if (settled) return;
        settled = true;
        if (timeout.handle) clearTimeout(timeout.handle);
        resolve(response);
      };
      const request = httpsRequest(
        buildPinnedHttpsRequestOptions(input.url, input.pinnedAddress),
        (response) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            response.destroy();
            settleReject(
              new HttpTransportError(
                "REDIRECT_DENIED",
                "Redirects are denied for explicit-target collection.",
              ),
            );
            return;
          }
          const contentLength = headerValue(response.headers["content-length"]);
          if (
            contentLength !== null &&
            Number(contentLength) > input.maximumResponseBytes
          ) {
            response.destroy();
            settleReject(
              new HttpTransportError(
                "RESPONSE_TOO_LARGE",
                "Response exceeds the configured byte limit.",
              ),
            );
            return;
          }
          const chunks: Buffer[] = [];
          let bytesRead = 0;
          response.on("data", (chunk: Buffer | Uint8Array) => {
            const buffer = Buffer.from(chunk);
            bytesRead += buffer.byteLength;
            if (bytesRead > input.maximumResponseBytes) {
              response.destroy();
              settleReject(
                new HttpTransportError(
                  "RESPONSE_TOO_LARGE",
                  "Response exceeds the configured byte limit.",
                ),
              );
              return;
            }
            chunks.push(buffer);
          });
          response.once("error", settleReject);
          response.once("end", () => {
            try {
              settleResolve({
                status,
                finalUrl: input.url,
                contentType: headerValue(response.headers["content-type"]),
                body: new TextDecoder("utf-8", { fatal: true }).decode(
                  Buffer.concat(chunks),
                ),
              });
            } catch {
              settleReject(
                new HttpTransportError(
                  "FETCH_FAILED",
                  "Response was not valid UTF-8.",
                ),
              );
            }
          });
        },
      );
      request.once("socket", (socket) => {
        const tlsSocket = socket as TLSSocket;
        tlsSocket.once("secureConnect", () => {
          const remoteAddress = tlsSocket.remoteAddress;
          if (
            !tlsSocket.authorized ||
            !remoteAddress ||
            !matchesPinnedAddress(input.pinnedAddress, remoteAddress)
          )
            request.destroy(
              new HttpTransportError(
                "TARGET_ADDRESS_MISMATCH",
                "The HTTPS connection did not use the policy-vetted address.",
              ),
            );
        });
      });
      request.once("error", settleReject);
      timeout.handle = setTimeout(
        () =>
          request.destroy(
            new HttpTransportError("TIMEOUT", "HTTP collection timed out."),
          ),
        input.timeoutMs,
      );
      request.end();
    });
  }
}

/** DNS/SSRF validation plus binding of the vetted IP to the TLS connection. */
export class SecureHttpCollector implements HttpCollector {
  readonly version = "secure-http-collector-v2";

  constructor(
    private readonly transport: PinnedHttpsTransport = new NodePinnedHttpsTransport(),
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

    const response = await this.transport.get({
      url,
      pinnedAddress: addresses[0]!,
      timeoutMs: SOURCE_ADAPTER_HTTP_CONFIG.timeoutMs,
      maximumResponseBytes: SOURCE_ADAPTER_HTTP_CONFIG.maximumResponseBytes,
    });
    if (response.status >= 300 && response.status < 400)
      throw new HttpTransportError(
        "REDIRECT_DENIED",
        "Redirects are denied for explicit-target collection.",
      );
    if (response.finalUrl !== url)
      throw new HttpTransportError(
        "REDIRECT_DENIED",
        "The final URL differs from the policy-validated target.",
      );
    return response;
  }
}
