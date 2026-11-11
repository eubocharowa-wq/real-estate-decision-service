import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:https";
import type { LookupFunction } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildPinnedHttpsRequestOptions,
  HttpTransportError,
  matchesPinnedAddress,
  NodePinnedHttpsTransport,
  SOURCE_ADAPTER_HTTP_CONFIG,
  SecureHttpCollector,
  type PinnedHttpsTransport,
  type PinnedHttpsTransportInput,
} from "../../src/data-collection/source-adapters";
import { UNIT_URL } from "./helpers";

class ControlledPinnedTransport implements PinnedHttpsTransport {
  inputs: PinnedHttpsTransportInput[] = [];

  constructor(
    private readonly response: Parameters<
      PinnedHttpsTransport["get"]
    > extends never
      ? never
      : Awaited<ReturnType<PinnedHttpsTransport["get"]>>,
  ) {}

  async get(input: PinnedHttpsTransportInput) {
    this.inputs.push(input);
    return this.response;
  }
}

describe("SecureHttpCollector", () => {
  const servers: Server[] = [];
  const temporaryDirectories: string[] = [];
  const publicDns = async () => ["93.184.216.34"];
  const response = {
    status: 200,
    finalUrl: UNIT_URL,
    contentType: "text/html",
    body: "<html>synthetic</html>",
  };

  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            ),
        ),
    );
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  const startTlsServer = async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "reds-pinned-tls-"));
    temporaryDirectories.push(directory);
    const certificatePath = path.join(directory, "localhost-cert.pem");
    const privateKeyPath = path.join(directory, "localhost-key.pem");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-sha256",
        "-days",
        "1",
        "-nodes",
        "-keyout",
        privateKeyPath,
        "-out",
        certificatePath,
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost",
      ],
      { stdio: "ignore" },
    );
    const [certificate, privateKey] = await Promise.all([
      readFile(certificatePath, "utf8"),
      readFile(privateKeyPath, "utf8"),
    ]);
    const received: string[] = [];
    const server = createServer(
      { cert: certificate, key: privateKey },
      (request, response) => {
        received.push(request.socket.localAddress ?? "");
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<html>controlled TLS response</html>");
      },
    );
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    servers.push(server);
    const address = server.address() as AddressInfo;
    return { certificate, port: address.port, received };
  };

  it("pins the vetted DNS address to the request transport", async () => {
    const transport = new ControlledPinnedTransport(response);
    const collector = new SecureHttpCollector(transport, publicDns);
    await expect(collector.get(UNIT_URL)).resolves.toEqual(response);
    expect(transport.inputs).toEqual([
      {
        url: UNIT_URL,
        pinnedAddress: "93.184.216.34",
        timeoutMs: SOURCE_ADAPTER_HTTP_CONFIG.timeoutMs,
        maximumResponseBytes: SOURCE_ADAPTER_HTTP_CONFIG.maximumResponseBytes,
      },
    ]);
  });

  it("keeps hostname TLS verification while lookup returns only the pinned IP", () => {
    const options = buildPinnedHttpsRequestOptions(
      "https://example.com/card?item=1",
      "93.184.216.34",
    );
    expect(options).toMatchObject({
      protocol: "https:",
      hostname: "example.com",
      port: 443,
      path: "/card?item=1",
      method: "GET",
      servername: "example.com",
      rejectUnauthorized: true,
      agent: false,
    });
    let resolved: string | undefined;
    (options.lookup as LookupFunction)(
      "example.com",
      { all: false },
      (_error, address) => {
        resolved = address as string;
      },
    );
    expect(resolved).toBe("93.184.216.34");
    expect(matchesPinnedAddress("93.184.216.34", "93.184.216.34")).toBe(true);
    expect(matchesPinnedAddress("93.184.216.34", "10.0.0.1")).toBe(false);
  });

  it("uses the pinned IP for an actual TLS connection and validates the hostname", async () => {
    const controlled = await startTlsServer();
    const transport = new NodePinnedHttpsTransport(controlled.certificate);
    const result = await transport.get({
      url: `https://localhost:${controlled.port}/card`,
      pinnedAddress: "127.0.0.1",
      timeoutMs: 2_000,
      maximumResponseBytes: 10_000,
    });
    expect(result.status).toBe(200);
    expect(result.body).toContain("controlled TLS response");
    expect(controlled.received).toEqual(["127.0.0.1"]);

    await expect(
      transport.get({
        url: `https://wrong-host.invalid:${controlled.port}/card`,
        pinnedAddress: "127.0.0.1",
        timeoutMs: 2_000,
        maximumResponseBytes: 10_000,
      }),
    ).rejects.toMatchObject({ code: "FETCH_FAILED" });
  });

  it("aborts an actual TLS request when the connected peer fails the pinned-IP check", async () => {
    const controlled = await startTlsServer();
    const transport = new NodePinnedHttpsTransport(
      controlled.certificate,
      () => false,
    );
    await expect(
      transport.get({
        url: `https://localhost:${controlled.port}/card`,
        pinnedAddress: "127.0.0.1",
        timeoutMs: 2_000,
        maximumResponseBytes: 10_000,
      }),
    ).rejects.toMatchObject({ code: "TARGET_ADDRESS_MISMATCH" });
  });

  it("rejects non-TLS or credential-bearing targets before transport", async () => {
    const transport = new ControlledPinnedTransport(response);
    const collector = new SecureHttpCollector(transport, publicDns);
    await expect(
      collector.get("http://vneshstroi.ru/kvartiry/73124/"),
    ).rejects.toMatchObject({ code: "TARGET_NOT_TLS" });
    await expect(
      collector.get("https://user:secret@vneshstroi.ru/kvartiry/73124/"),
    ).rejects.toMatchObject({ code: "TARGET_NOT_TLS" });
    expect(transport.inputs).toHaveLength(0);
  });

  it.each([
    ["https://127.0.0.1/card", ["127.0.0.1"]],
    ["https://metadata.internal/card", ["169.254.169.254"]],
    ["https://mixed.example/card", ["93.184.216.34", "10.0.0.1"]],
    ["https://ipv6.example/card", ["::1"]],
  ])(
    "rejects non-public target %s before transport",
    async (url, addresses) => {
      const transport = new ControlledPinnedTransport(response);
      const collector = new SecureHttpCollector(
        transport,
        async () => addresses,
      );
      await expect(collector.get(url)).rejects.toMatchObject({
        code: "TARGET_NOT_PUBLIC",
      });
      expect(transport.inputs).toHaveLength(0);
    },
  );

  it("denies redirects instead of accepting a transport redirect response", async () => {
    const collector = new SecureHttpCollector(
      new ControlledPinnedTransport({ ...response, status: 302 }),
      publicDns,
    );
    await expect(collector.get(UNIT_URL)).rejects.toMatchObject({
      code: "REDIRECT_DENIED",
    });
  });

  it("rejects a final URL different from the validated target", async () => {
    const collector = new SecureHttpCollector(
      new ControlledPinnedTransport({
        ...response,
        finalUrl: "https://example.com/other",
      }),
      publicDns,
    );
    await expect(collector.get(UNIT_URL)).rejects.toMatchObject({
      code: "REDIRECT_DENIED",
    });
  });

  it("keeps response-size and single-attempt limits centralized", async () => {
    const transport: PinnedHttpsTransport = {
      async get(input) {
        expect(input.maximumResponseBytes).toBe(
          SOURCE_ADAPTER_HTTP_CONFIG.maximumResponseBytes,
        );
        throw new HttpTransportError(
          "RESPONSE_TOO_LARGE",
          "Response exceeds the configured byte limit.",
        );
      },
    };
    const collector = new SecureHttpCollector(transport, publicDns);
    await expect(collector.get(UNIT_URL)).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
    });
    expect(SOURCE_ADAPTER_HTTP_CONFIG.maximumAttempts).toBe(1);
  });
});
