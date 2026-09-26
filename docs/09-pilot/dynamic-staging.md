# Dynamic staging deployment and rollback

This runbook is for TASK-025's production-like **staging** environment. It is
not a release procedure for TASK-020 and does not authorize a real-buyer
pilot, live source collection or OpenClaw execution.

TASK-025B requires a separate Vercel Preview or dedicated staging environment.
Do not use the production deployment, production database, production domain or
DNS as a test surface. A green production build status is not staging evidence.

## What is being deployed

Vercel must build the checked-in Next.js application with:

```text
install: npm ci
build:   npm run build
output:  Next.js default (do not set a static output directory)
```

The checked-in `next.config.ts` has no `output: "export"`. The only code that
creates an export configuration is
`scripts/prepare-github-pages-preview.mjs`; it refuses to run unless
`GITHUB_PAGES_STATIC_PREVIEW=1`, and only the GitHub Pages workflow sets that
value. Do not set `GITHUB_PAGES_STATIC_PREVIEW` in Vercel.

## Required staging environment

Configure these in Vercel's Preview/Staging environment, not in a tracked
file:

| Variable | Staging requirement |
| --- | --- |
| `DATABASE_URL` | Secret pooled PostgreSQL URL for the staging database. |
| `DATABASE_POOL_MAX` | Small per-instance ceiling appropriate for the provider pooler. Start with the documented value and lower it if the provider's connection budget requires it. |
| `DATABASE_CONNECTION_TIMEOUT_MS` | Bounded connection timeout. |
| `DATABASE_IDLE_TIMEOUT_MS` | Bounded idle timeout. |
| `REDS_APPLICATION_MODE` | Exactly `pilot`, set deliberately. Missing means `demo`; it is never promoted automatically. |
| `REDS_PILOT_COHORT` | `internal_test` for TASK-025. |
| `NEXT_PUBLIC_SITE_URL` | Exact HTTPS origin of this staging deployment, without a path or trailing slash. |
| `REDS_EXPERT_ACTOR_REF` | Server-only internal expert identity for the controlled single-operator workbench. Missing means fail closed. |
| `REDS_EXPERT_SPECIALIST_TYPE` | The actor's allowed specialist type from the checked-in expert contract. Missing/invalid means fail closed. |

Keep every collection/refresh/OpenClaw feature and kill switch at its existing
policy-controlled safe value. TASK-025 does not change source approvals.

The two expert actor settings select a server-side staging operator and keep
specialist routing fail-closed. They are not user authentication and do not
make the workbench suitable for an unrestricted public deployment; a trusted
access layer remains an external staging/production requirement. Never expose
either setting through `NEXT_PUBLIC_*` or client responses.

`DATABASE_URL` and any provider credentials are full secrets. They must exist
only in Vercel secret storage and the protected migration environment. Never
prefix them with `NEXT_PUBLIC_`, print them, pass them as command arguments, or
include them in screenshots/support bundles. `NEXT_PUBLIC_SITE_URL` is public
by design; it is the only staging addressing value intended for the client
bundle.

## Trusted staging access

`REDS_EXPERT_ACTOR_REF` and `REDS_EXPERT_SPECIALIST_TYPE` select the internal
operator identity used by the application permission policy. They do **not**
authenticate the HTTP caller. Before any external expert-flow verification,
enable and verify platform-native access protection for the staging
deployment.

The preferred boundary is Vercel Authentication with Standard Protection on
the Preview/staging environment. It must require an authorized Vercel user for
the deployment, including `/expert/requests`, request workbench pages and
`/api/expert-workbench/*`. Whole-deployment protection is acceptable for this
controlled staging environment; do not weaken it merely to make an automated
request pass.

Do not substitute any of the following:

- a query-string password;
- a secret embedded in client JavaScript or a `NEXT_PUBLIC_*` variable;
- an unlisted/obscure URL;
- `REDS_EXPERT_ACTOR_REF` by itself;
- an application bypass route or public mutation endpoint.

Record the protection mode, scope and an unauthorized denial result in the
external evidence bundle. If platform-native protection cannot be inspected or
configured with the operator's authorized Vercel access, expert-flow staging
verification remains blocked. Do not invent an application authentication
system inside TASK-025B.

## Database preparation

1. Create an isolated staging PostgreSQL database in the operator-approved
   provider/region and use its pooled application connection string.
2. Take a provider snapshot/backup before changing a reused database.
3. From a protected one-off job using the exact commit to deploy, run:

   ```text
   npm ci
   npm run db:status
   npm run db:migrate
   npm run db:status
   ```

4. All checked-in migrations must show as applied. The application health
   request is intentionally read-only: it reports a missing/incompatible
   schema but never applies or repairs migrations.

Migrations are transactional and ordered. They are not run automatically in
the Vercel build: build retries and parallel previews are the wrong ownership
boundary for schema mutation.

## Deploy and verify

1. Push only the reviewed `codex/task-025b-managed-staging` branch when a remote
   branch is required for deployment. Deploy it as a Vercel Preview/staging
   deployment using the normal Next.js preset; do not promote it to
   Production.
2. Confirm the Vercel build exposes server functions for `/api/*` and does not
   publish an `out/` directory.
3. Confirm Vercel Authentication/Deployment Protection is active and that an
   unauthenticated request is denied before using the authorized staging
   browser session.
4. Request `GET https://<staging-origin>/api/readiness` through the authorized
   session.
5. Continue only when it returns HTTP 200 with:

   ```json
   {
     "status": "ready",
     "checks": {
       "application": {
         "runtime": "nextjs_dynamic_nodejs",
         "mode": "pilot",
         "mode_ready": true
       },
       "dataset": {
         "expected_type": "manual_curated_pilot",
         "configured": true,
         "synthetic_and_real_mixed": false
       },
       "database": {
         "configured": true,
         "configuration_valid": true,
         "reachable": true,
         "schema_compatible": true
       },
       "public_origin": {
         "configured": true,
         "matches_request_origin": true
       }
     }
   }
   ```

The endpoint is cache-disabled and deliberately omits connection strings,
host names, database names and raw errors. HTTP 503 means **not ready**; use
protected Vercel/provider logs and `npm run db:status` for details.

Then exercise the staging golden flow:

```text
home → /selection → request → confirmation → shortlist
→ property detail → comparison → expert request
→ expert workbench/result → decision recompute
```

TASK-025A connects workbench/result routes to the persisted journey request and
the existing evidence/recompute pipeline. Owner result access is checked
against the browser-held session identity; knowing a request ID is not enough.
The internal expert route fails closed without its server-side actor settings.
Do not expose an unauthenticated result-submission shortcut to make a smoke
test pass. The deployment must also place the internal workbench behind a
trusted access layer before recording external golden-flow evidence.

Record each golden-flow step separately:

1. open the public landing inside the protected staging deployment;
2. create and confirm the buyer request;
3. require `manual_curated_pilot` on the shortlist;
4. open a Property and create a comparison when the scenario requires it;
5. create the persisted expert request as the buyer owner/session;
6. open the protected expert queue, claim the request and start work;
7. save a draft and complete with valid confirmed evidence;
8. reopen the result as the original owner and observe affected-only decision
   recompute;
9. try the same result with a different owner/session and require denial;
10. submit a non-confirmed evidence case and require that it cannot create a
    confirmed canonical overlay.

Do not include raw evidence, user data, credentials or secret environment
values in the retained verification notes.

Refresh each stateful page, reopen the journey using the browser-held journey
and session identifiers, and verify the server restores the state. A second
application/runtime instance must read the same journey and expert request
from PostgreSQL. The repository-level proof includes
`tests/buyer-journey/journey-restoration.test.ts`,
`tests/expert/curated-persistence.test.ts`, and the TASK-025A real-runtime
golden-flow regressions; the external staging pass remains required as
deployment evidence.

For the required cross-runtime proof, create the journey and expert state,
then trigger a new Preview deployment or otherwise force a demonstrably new
server runtime. Reopen the same journey and read the same request, draft/result
and decision update. Retain the two immutable deployment/runtime identifiers
and the redacted record identifiers. A reload served by the same process is not
sufficient evidence.

On every pilot shortlist, require `dataset_type=manual_curated_pilot` and no
entry with `origin=synthetic`. In demo mode require
`dataset_type=synthetic_pilot` and no manually curated real entry. Stop if a
response contains both.

## Failure diagnostics

Verify the following fail-closed cases without returning protected details to
the client:

| Condition | Required external result |
| --- | --- |
| Database unavailable | `/api/readiness` is HTTP 503 and does not expose a connection string, host, database name or raw error. |
| Wrong or missing `REDS_APPLICATION_MODE` | Readiness reports `not_ready`; pilot verification stops. |
| Wrong `NEXT_PUBLIC_SITE_URL` | Readiness reports an origin mismatch and HTTP 503. |
| Missing/invalid expert actor settings | Expert mutation returns a controlled denial and no workbench action is applied. |
| Unauthenticated staging request | Platform-native protection denies it before the application route runs. |
| Foreign owner/session | Result access is denied even when the request ID is known. |

Use protected Vercel/provider logs and `npm run db:status` for operator
diagnostics. Public responses must not contain `DATABASE_URL`, credentials,
stack traces or server-secret values.

## Client-bundle secret check

Build with harmless sentinel strings for every server-only setting, then scan
`.next/static` and browser-delivered JavaScript for those sentinels. The only
intentionally public staging value is `NEXT_PUBLIC_SITE_URL`. Never use a real
credential as a scan sentinel.

## Rollback

Application rollback and database rollback are separate decisions.

1. Stop staging traffic and retain the failing deployment URL/logs.
2. Use Vercel's immutable deployment history to promote the previously
   verified application deployment.
3. Keep the database in place if the previous application is compatible with
   the current schema; additive applied migrations do not need to be removed
   merely because application code was rolled back.
4. Run `npm run db:status` with protected credentials and recheck the previous
   deployment's `/api/readiness`.
5. Run `npm run db:rollback` only after a human reviews the matching `.down.sql`,
   confirms the previous application requires it, confirms no newer rows rely
   on the schema, and a recoverable backup exists. Never put automatic
   migration rollback in Vercel.
6. If pilot dataset/mode integrity is uncertain, unset
   `REDS_APPLICATION_MODE` (which safely resolves to labelled demo mode) or
   take the staging deployment offline; do not relabel synthetic data.

In particular, `0003_matching_bundle_dataset_type.down.sql` removes curated
pilot matching bundles that the older constraint cannot represent. A bundle
referenced by comparison rows makes that down migration fail transactionally;
deleting those decision records is not an acceptable automatic rollback.
Prefer application rollback with the additive schema retained. The local
TASK-025 populated-database check confirmed the failure leaves migration 0003
applied and the schema unchanged.

Migration `0004_expert_terminal_status.down.sql` narrows the status constraint
back to the legacy set. It therefore fails transactionally when a persisted
`unable_to_complete` request exists. Retain the additive constraint or archive
through a separately reviewed data migration; never delete an expert outcome
merely to force this down migration through.

## Evidence to retain

- commit SHA and immutable Vercel deployment URL;
- redacted environment-key inventory (names and scope, never values);
- migration status versions;
- readiness JSON;
- golden-flow test timestamp and journey/request identifiers;
- confirmation that refresh/re-instantiation restored state;
- rollback target deployment.

These artifacts prove staging readiness only. They do not make the service a
launched production service and do not satisfy TASK-020/TASK-027 release gates.

## TASK-025B external verification record

Keep repository-side and external evidence separate. At the TASK-025B baseline
assessment:

- the repository baseline is
  `6c15c027d2a52b4cb9102bcfedb5632eecb388ba`;
- GitHub reports the existing Vercel deployment as `Production`, so it is not a
  permitted TASK-025B test target and was not exercised;
- no managed staging `DATABASE_URL`, Preview/staging URL or authenticated
  Vercel project session is available to the current execution environment;
- managed PostgreSQL migrations, external `/api/readiness`, trusted access,
  golden flow and cross-runtime persistence therefore remain **not externally
  verified**.

The operator must provision or select an isolated managed PostgreSQL database,
authenticate to the Vercel project, configure branch-scoped Preview variables,
enable Vercel Authentication, deploy the feature branch and then execute the
checklist above. Never replace a missing external dependency with a fabricated
URL or local database result.

## Branch protection before controlled pilot

TASK-025B does not claim branch protection unless GitHub reports it enabled.
Before a controlled pilot, configure `main` to:

- require a pull request before merge;
- require successful `CI / verify` and `CI / database` checks;
- block force pushes;
- block branch deletion;
- require the branch to be up to date where practical for the repository's
  merge workflow.

If the current GitHub integration cannot administer rulesets/branch
protection, record that as an operator action instead of bypassing permissions.

## Deferred product follow-up

TASK-025B does not rewrite product positioning. A separate task must replace
weak “мы помогаем” / “помощь в выборе” language and decide the final expert
product name, composition, boundaries, price/SLA and CTA. The working principle
is that the service performs the work and forms an evidence-backed decision;
it does not merely “help choose”.
