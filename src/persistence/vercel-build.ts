import type { EnvironmentSource } from "./config";
import { resolveDatabaseUrlSource } from "./config";

/**
 * Whether a Vercel build should run pending migrations before `next build`.
 *
 * Only a production deployment (VERCEL_ENV === "production") with a
 * database configured auto-migrates. A preview deployment or a local build
 * must never touch a shared database as a side effect of building — see
 * scripts/vercel-prebuild.ts, which gates on this before shelling out to
 * `npm run db:migrate`.
 */
export const shouldRunMigrationsBeforeBuild = (
  env: EnvironmentSource = process.env,
): boolean =>
  env.VERCEL_ENV === "production" &&
  resolveDatabaseUrlSource(env).value !== undefined;
