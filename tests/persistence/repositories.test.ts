import { afterEach, describe, expect, it } from "vitest";

import { closeDatabasePool, createRepositorySet } from "../../src/persistence";

afterEach(async () => {
  await closeDatabasePool();
});

describe("createRepositorySet backend selection", () => {
  it("stays on the in-memory backend when neither variable is set", () => {
    expect(createRepositorySet({}).backend).toBe("memory");
  });

  it("selects postgres from DATABASE_URL, as before", () => {
    expect(
      createRepositorySet({ DATABASE_URL: "postgres://user:pass@host/reds" })
        .backend,
    ).toBe("postgres");
  });

  it("selects postgres from REDS_DATABASE_URL, taking priority over DATABASE_URL", () => {
    expect(
      createRepositorySet({
        REDS_DATABASE_URL: "postgres://user:pass@reds-host/reds",
        DATABASE_URL: "postgres://user:pass@plain-host/reds",
      }).backend,
    ).toBe("postgres");
  });

  it("throws rather than falling back to memory when the configured URL is malformed", () => {
    expect(() =>
      createRepositorySet({ REDS_DATABASE_URL: "not-a-url" }),
    ).toThrowError(/INVALID_DATABASE_CONFIG/);
  });
});
