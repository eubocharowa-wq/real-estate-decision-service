# TASK-025 — Production-like Dynamic Staging

## Goal

Prove, and close the repository-side gaps required for, a production-like
staging deployment of the complete dynamic Next.js application backed by
PostgreSQL. A successful platform build alone is not staging evidence.

## Scope

- Keep the normal Next.js build on the Node.js dynamic runtime; GitHub Pages
  remains an explicitly prepared static review artifact only.
- Select PostgreSQL through `DATABASE_URL`, use the existing bounded
  per-process pool, and verify database reachability and migration
  compatibility without mutating the schema from a health request.
- Persist buyer journeys and expert requests through the existing repository
  contracts and prove restoration through a fresh application instance.
- Keep `demo` on `synthetic_pilot` and deliberate `pilot` operation on
  `manual_curated_pilot`; never merge the two datasets implicitly.
- Add a minimal, cache-disabled readiness endpoint that reports only safe
  booleans/counts for application runtime, database/migrations, application
  mode, dataset isolation and the configured public staging origin.
- Document staging configuration, migration, verification and rollback.
- Verify the existing application golden flow through decision recomputation,
  plus page reload/recovery and cross-instance PostgreSQL restoration.

## Out of scope

- TASK-020 and any real-buyer pilot execution.
- TASK-026 browser automation and broad visual/browser E2E coverage.
- Source approvals, Source Registry/Policy, OpenClaw/Gateway/OAuth/sandbox,
  matching weights or canonical-data semantics.
- Production cron/queues, new persistence technologies, authentication,
  billing, expert marketplace and real network collection.
- Treating GitHub Pages as the application deployment.

## Acceptance criteria

- The checked-in `next.config.ts` does not enable static export and API routes
  execute in the Node.js runtime.
- The Pages export mutation is gated to its disposable Pages workflow and has
  no effect on the normal Vercel build.
- `DATABASE_URL` selects PostgreSQL; missing/malformed staging database
  configuration fails readiness rather than silently reporting ready.
- Readiness proves database connectivity and that every checked-in migration,
  with the expected name, is applied; missing, renamed or unknown applied
  migrations fail closed.
- Buyer-journey and expert-request records survive a fresh
  runtime/application instance in PostgreSQL.
- `REDS_APPLICATION_MODE=pilot` selects the manually curated pilot dataset;
  unset mode remains `demo`, and synthetic and curated candidates are not
  implicitly mixed.
- Readiness and API failures do not expose `DATABASE_URL`, credentials, stack
  traces or database error details.
- `NEXT_PUBLIC_SITE_URL` is an explicit valid origin and matches the staging
  request origin before readiness can pass.
- The documented golden flow covers home, request entry, confirmation,
  shortlist, property detail, comparison, expert request/workbench/result and
  decision recomputation, including reload/recovery.
- A rollback/deployment runbook exists and does not require destructive or
  automatic migration rollback.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm test` without `DATABASE_URL`
- migrations, persistence conformance and restoration tests with PostgreSQL
- `npm run test:pilot`
- `npm run test:e2e`
- `npm run test:pilot-performance`
- `npm run build`
- `npm run format:check`
- `git diff --check`
- normal dynamic build artifact inspection (API route present, no static
  export)
- isolated GitHub Pages build and internal-link check
- client bundle secret scan using sentinel values
- external staging readiness and golden-flow smoke after an operator supplies
  the staging URL and managed database configuration

## Known external dependencies

- A Vercel project/environment that runs the normal Next.js build.
- A managed PostgreSQL database and pooled staging `DATABASE_URL` held in
  Vercel secret storage.
- Operator access to set `REDS_APPLICATION_MODE`, `REDS_PILOT_COHORT` and
  `NEXT_PUBLIC_SITE_URL` for the staging environment.
- A deployment of the reviewed commit and an externally reachable staging URL
  are required for the final external exit criterion; repository tests cannot
  manufacture either credential or deployment evidence.
- The current expert workbench/result web route is fixture-backed. A coherent
  authenticated runtime boundary from the persisted journey expert request
  through result application/recompute is required before the external golden
  flow can pass; TASK-025 must not paper over it with a public test bypass.
