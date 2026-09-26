# Dynamic staging deployment and rollback

This runbook is for TASK-025's production-like **staging** environment. It is
not a release procedure for TASK-020 and does not authorize a real-buyer
pilot, live source collection or OpenClaw execution.

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

1. Deploy the reviewed commit as a Vercel preview/staging deployment using the
   normal Next.js preset.
2. Confirm the Vercel build exposes server functions for `/api/*` and does not
   publish an `out/` directory.
3. Request `GET https://<staging-origin>/api/readiness`.
4. Continue only when it returns HTTP 200 with:

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

Refresh each stateful page, reopen the journey using the browser-held journey
and session identifiers, and verify the server restores the state. A second
application/runtime instance must read the same journey and expert request
from PostgreSQL. The repository-level proof includes
`tests/buyer-journey/journey-restoration.test.ts`,
`tests/expert/curated-persistence.test.ts`, and the TASK-025A real-runtime
golden-flow regressions; the external staging pass remains required as
deployment evidence.

On every pilot shortlist, require `dataset_type=manual_curated_pilot` and no
entry with `origin=synthetic`. In demo mode require
`dataset_type=synthetic_pilot` and no manually curated real entry. Stop if a
response contains both.

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
