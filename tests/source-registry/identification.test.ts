import { describe, expect, it } from "vitest";

import { sourceRegistry } from "../../src/data-collection/source-registry";

describe("source identification", () => {
  it("matches an exact domain", () => {
    expect(sourceRegistry.identify("https://cian.ru/sale/1")).toMatchObject({
      status: "known",
      sourceId: "src_mkt_01",
      matchType: "exact",
      matchedDomain: "cian.ru",
    });
  });

  it.each([
    ["https://www.cian.ru/sale/1", "src_mkt_01"],
    ["https://tula.vneshstroi.ru/project/1", "src_dev_02"],
  ])("matches the controlled subdomain %s", (url, sourceId) => {
    expect(sourceRegistry.identify(url)).toMatchObject({
      status: "known",
      sourceId,
      matchType: "subdomain",
    });
  });

  it("returns an unknown source explicitly", () => {
    expect(
      sourceRegistry.identify("https://unknown.example/item/1"),
    ).toMatchObject({
      status: "unknown",
      sourceId: null,
      matchType: "unknown",
    });
  });

  it("does not match malicious lookalikes", () => {
    expect(
      sourceRegistry.identify("https://cian.ru.evil.example/item/1"),
    ).toMatchObject({ status: "unknown", sourceId: null });
    expect(sourceRegistry.identify("https://notcian.ru/item/1")).toMatchObject({
      status: "unknown",
      sourceId: null,
    });
  });

  it("normalizes and matches the configured internationalized domain", () => {
    expect(
      sourceRegistry.identify("https://новостройки-тула.рф/object/1"),
    ).toMatchObject({
      status: "known",
      sourceId: "src_dev_04",
      matchType: "exact",
    });
  });

  it("returns invalid URL without making a policy decision", () => {
    expect(sourceRegistry.identify("not a URL")).toMatchObject({
      status: "invalid_url",
      sourceId: null,
    });
  });
});
