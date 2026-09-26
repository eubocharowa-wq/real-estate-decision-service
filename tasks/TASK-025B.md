# TASK-025B — Managed Dynamic Staging, Trusted Expert Access and External Golden Flow

## Goal

Prove the complete application on a separate production-like staging
environment:

```text
Vercel dynamic runtime
→ managed PostgreSQL
→ pilot mode
→ persisted buyer journey
→ persisted expert request
→ trusted expert access
→ expert completion
→ decision recompute
→ restoration from a new runtime instance
```

Repository tests and a successful Vercel build are prerequisites, not evidence
that this external flow works.

## Proof boundary

TASK-025B has two deliberately separate evidence sets:

### Repository-side evidence

The task contract, runbook, runtime/configuration regressions, local PostgreSQL
conformance, security checks and dynamic production build can be completed in
the repository. Green repository checks prove that the application is ready to
be deployed and inspected; they do not prove that a managed staging service
exists.

### External staging proof

Completion of the external goal requires an actual non-production staging URL,
managed PostgreSQL, protected expert access, HTTP readiness, the golden flow
and restoration from a demonstrably new runtime. Local PostgreSQL, mocked HTTP,
a Vercel build status or the existing Production deployment cannot substitute
for this evidence. Every unavailable dependency remains an explicit blocker.

## Scope

- Use a Vercel Preview or dedicated staging environment. Never use the
  production deployment as the test environment.
- Configure an isolated managed PostgreSQL database through protected staging
  environment variables and apply migrations `0001` through `0004` from a
  protected one-off migration job.
- Configure staging deliberately with `REDS_APPLICATION_MODE=pilot`, the exact
  staging `NEXT_PUBLIC_SITE_URL`, and the server-only expert actor settings.
- Protect the staging deployment with a confirmed platform-native trusted
  access mechanism before using expert pages or mutation APIs.
- Verify the public readiness response, the full buyer/expert golden flow,
  owner/session denial, evidence integrity, demo/pilot isolation and
  cross-runtime PostgreSQL restoration.
- Keep deployment, rollback, diagnostics, migration and verification steps in
  `docs/09-pilot/dynamic-staging.md`.
- Record the current branch-protection state and the required rules for a
  controlled pilot without claiming that unavailable settings were enabled.

## Out of scope

- Production traffic, production database use, production domain or DNS
  changes, and real buyers.
- TASK-020, TASK-026, Playwright/browser-suite implementation or pilot launch.
- A new application authentication/RBAC system, query-string passwords,
  client-side secrets or security through an obscure URL.
- Matching weights, dataset expansion, a second source, Source Policy,
  OpenClaw, Gateway, OAuth, sandbox, tools, skills or collection approvals.
- UI redesign, product renaming or public-copy rewrite.
- Destructive migration rollback, especially forced rollback of migration
  `0003` when comparison data exists.

## Acceptance criteria

- A non-production staging URL serves the normal dynamic Next.js runtime and
  API routes; the GitHub Pages export path is not involved.
- The staging environment has a real managed PostgreSQL connection, migrations
  `0001`–`0004` are current, and protected checks prove connectivity and
  read/write behavior without exposing credentials.
- `GET /api/readiness` on that exact staging origin returns HTTP 200 and
  `status=ready`, confirming dynamic runtime, pilot mode,
  `manual_curated_pilot`, no synthetic/real mixing, compatible migrations and
  matching public origin.
- Expert pages and mutation routes are behind verified trusted deployment
  access. `REDS_EXPERT_ACTOR_REF` remains operator identity and is never
  presented as HTTP authentication.
- One external flow creates and restores a buyer journey, expert request,
  expert draft/result and recomputed decision through the real HTTP/runtime
  boundaries.
- A fresh runtime instance or redeployment reads the prior journey and expert
  state from PostgreSQL; a same-instance page reload alone is insufficient.
- A different owner/session is denied the result even when the request ID is
  known, and non-confirmed evidence cannot produce confirmed canonical data.
- Staging contains only `manual_curated_pilot`; demo remains
  `synthetic_pilot`, with no fixture expert requests in pilot routes.
- DB failure, wrong mode/origin, absent expert actor and unauthorized access
  fail closed without leaking connection strings, credentials, stack traces or
  server secrets.
- The runbook includes deployment, migration, readiness, golden-flow,
  restart/persistence, rollback and diagnostic procedures and records the
  known migration `0003` rollback limitation.

## Verification

Repository-side:

- `npm run format:check`
- `npm run typecheck`
- `npm run lint`
- `npm test` without `DATABASE_URL`
- `npm test` and the persistence/migration suites with an isolated PostgreSQL
- `npm run test:pilot`
- buyer-journey, expert, expert-workbench, evidence-integrity and staging
  readiness suites
- `npm run test:pilot-performance`
- `npm audit --omit=dev --audit-level=high`
- `npm run build`
- `git diff --check`
- dynamic-build inspection and client-bundle secret scan

External:

- redacted staging environment-key inventory;
- migration status through `0004`;
- actual HTTP response from the staging `/api/readiness`;
- trusted-access denial and success evidence;
- step-by-step golden-flow result;
- foreign-owner denial and evidence-integrity result;
- new-runtime/redeploy persistence proof;
- demo/pilot isolation result.

## Known external dependencies

- A separately scoped Vercel Preview or staging environment. The baseline
  deployment visible through GitHub is labelled `Production` and is not a
  TASK-025B test target.
- Operator-authenticated Vercel access to inspect/configure Preview environment
  variables, deployment protection and deployments.
- A managed PostgreSQL provider/account, isolated staging database and secret
  pooled connection URL. Creating an account or paid resource requires a human
  decision and is not inferred from repository access.
- Vercel Authentication or another confirmed platform-native trusted access
  boundary for the staging deployment.
- An authorized operator able to apply migrations and trigger a new Preview
  runtime/redeployment without revealing secrets.
- GitHub administrative access or a human repository administrator to enable
  branch protection before a controlled pilot.

## Current external status at task creation

- Repository baseline: `6c15c027d2a52b4cb9102bcfedb5632eecb388ba`.
- Branch: `codex/task-025b-managed-staging`.
- GitHub reports a successful Vercel deployment for the baseline, but its
  environment is `Production`; it was not exercised as staging.
- No staging `DATABASE_URL`, Vercel token/project linkage or staging URL is
  available in the local environment.
- The available browser session is not authenticated to the Vercel project, so
  managed storage, Preview variables and deployment protection cannot be
  truthfully confirmed or changed from the current session.
- External readiness, golden flow and persistence proof therefore remain
  blocked until the dependencies above are supplied.

## Product wording boundary

The curator decision is reflected in the normative repository documents: the
service forms an evidence-backed real-estate decision rather than “helping to
choose”. TASK-025B does not rewrite the public site. Public copy and the final
expert product name, composition, boundaries, price/SLA and CTA remain a
separate product/content task.
