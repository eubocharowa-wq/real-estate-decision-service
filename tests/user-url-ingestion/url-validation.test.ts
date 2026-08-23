import { describe, expect, it } from "vitest";

import { validateUserUrl } from "../../src/user-url-ingestion";

describe("user URL validation security boundary", () => {
  it.each([
    "http://localhost/listing",
    "http://127.0.0.1/listing",
    "http://10.0.0.4/listing",
    "http://172.16.2.4/listing",
    "http://192.168.1.5/listing",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/listing",
    "http://metadata.google.internal/computeMetadata/v1",
  ])("blocks private or metadata target %s", (url) => {
    expect(validateUserUrl(url)).toMatchObject({
      success: false,
      error: { code: "PRIVATE_NETWORK_BLOCKED" },
    });
  });

  it("rejects unsupported protocols and credentials", () => {
    expect(validateUserUrl("file:///etc/passwd")).toMatchObject({
      success: false,
      error: { code: "UNSUPPORTED_PROTOCOL" },
    });
    expect(
      validateUserUrl("https://user:secret@fixture.example/a"),
    ).toMatchObject({
      success: false,
      error: { code: "INVALID_URL" },
    });
  });

  it("removes only obvious tracking and keeps semantic parameters", () => {
    const result = validateUserUrl(
      "HTTPS://fixture.example:443/listing/apartment?utm_source=x&unit=42&fbclid=y#photo",
    );
    expect(result).toEqual({
      success: true,
      value: {
        originalUrl:
          "HTTPS://fixture.example:443/listing/apartment?utm_source=x&unit=42&fbclid=y#photo",
        canonicalUrl: "https://fixture.example/listing/apartment?unit=42",
        protocol: "https:",
        hostname: "fixture.example",
        pathname: "/listing/apartment",
      },
    });
  });
});
