import { describe, expect, it } from "vitest";

import { shouldRunMigrationsBeforeBuild } from "../../src/persistence";

const databaseUrl = "postgres://user:pass@host/reds";

describe("shouldRunMigrationsBeforeBuild", () => {
  it("runs migrations on a production build with DATABASE_URL set", () => {
    expect(
      shouldRunMigrationsBeforeBuild({
        VERCEL_ENV: "production",
        DATABASE_URL: databaseUrl,
      }),
    ).toBe(true);
  });

  it("runs migrations on a production build with REDS_DATABASE_URL set", () => {
    expect(
      shouldRunMigrationsBeforeBuild({
        VERCEL_ENV: "production",
        REDS_DATABASE_URL: databaseUrl,
      }),
    ).toBe(true);
  });

  it("never runs migrations on a production build without a database configured", () => {
    expect(shouldRunMigrationsBeforeBuild({ VERCEL_ENV: "production" })).toBe(
      false,
    );
  });

  it("never runs migrations on a preview build, even with a database configured", () => {
    expect(
      shouldRunMigrationsBeforeBuild({
        VERCEL_ENV: "preview",
        DATABASE_URL: databaseUrl,
      }),
    ).toBe(false);
  });

  it("never runs migrations on a local build (no VERCEL_ENV), even with a database configured", () => {
    expect(shouldRunMigrationsBeforeBuild({ DATABASE_URL: databaseUrl })).toBe(
      false,
    );
  });
});
