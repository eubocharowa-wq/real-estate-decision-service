import { describe, expect, it } from "vitest";

import {
  SOURCE_ADAPTER_HTTP_CONFIG,
  SecureHttpCollector,
} from "../../src/data-collection/source-adapters";
import { UNIT_URL } from "./helpers";

describe("SecureHttpCollector", () => {
  it("uses a credential-free, no-redirect GET with a bounded HTML response", async () => {
    let captured: RequestInit | undefined;
    const collector = new SecureHttpCollector(async (_input, init) => {
      captured = init;
      return new Response("<html>synthetic</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    const response = await collector.get(UNIT_URL);
    expect(response.body).toBe("<html>synthetic</html>");
    expect(captured).toMatchObject({
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  });

  it("rejects non-TLS or credential-bearing targets before fetch", async () => {
    let calls = 0;
    const collector = new SecureHttpCollector(async () => {
      calls += 1;
      return new Response("");
    });
    await expect(
      collector.get("http://vneshstroi.ru/kvartiry/73124/"),
    ).rejects.toMatchObject({ code: "TARGET_NOT_TLS" });
    await expect(
      collector.get("https://user:secret@vneshstroi.ru/kvartiry/73124/"),
    ).rejects.toMatchObject({ code: "TARGET_NOT_TLS" });
    expect(calls).toBe(0);
  });

  it("denies redirects instead of following them", async () => {
    const collector = new SecureHttpCollector(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "/kvartiry/99999/" },
        }),
    );
    await expect(collector.get(UNIT_URL)).rejects.toMatchObject({
      code: "REDIRECT_DENIED",
    });
  });

  it("enforces the centralized response-size and single-attempt limits", async () => {
    const collector = new SecureHttpCollector(
      async () =>
        new Response("small", {
          status: 200,
          headers: {
            "content-type": "text/html",
            "content-length": String(
              SOURCE_ADAPTER_HTTP_CONFIG.maximumResponseBytes + 1,
            ),
          },
        }),
    );
    await expect(collector.get(UNIT_URL)).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
    });
    expect(SOURCE_ADAPTER_HTTP_CONFIG.maximumAttempts).toBe(1);
  });
});
