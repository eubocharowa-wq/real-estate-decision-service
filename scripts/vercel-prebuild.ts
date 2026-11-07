import { spawnSync } from "node:child_process";

import { shouldRunMigrationsBeforeBuild } from "../src/persistence";

/**
 * Runs before `next build` on every build (see package.json's "build"
 * script). Only applies pending migrations when this is a production
 * Vercel build with a database configured — never on preview or a local
 * build (shouldRunMigrationsBeforeBuild in src/persistence/vercel-build.ts).
 *
 * A failed migration fails this script, which fails the `&&`-chained
 * `next build` after it: the old schema is never published alongside new
 * code. The migration child's stderr is discarded rather than printed — a
 * connection failure here routinely names the database host, and this
 * script's output lands in Vercel's public build log.
 */
const write = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

if (!shouldRunMigrationsBeforeBuild()) {
  write(
    process.env.VERCEL_ENV === "production"
      ? "vercel-prebuild: production build, but no database is configured — skipping migrations."
      : "vercel-prebuild: not a production Vercel build — skipping migrations.",
  );
  process.exit(0);
}

write(
  "vercel-prebuild: production build with a database configured — applying pending migrations.",
);

const result = spawnSync("npm", ["run", "db:migrate"], {
  stdio: ["ignore", "inherit", "ignore"],
});

if (result.error || result.status !== 0) {
  process.stderr.write(
    "vercel-prebuild: migration failed; aborting the build so the old schema is never published with new code.\n",
  );
  process.exit(result.status ?? 1);
}

write("vercel-prebuild: migrations applied — continuing to next build.");
