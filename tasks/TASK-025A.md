# TASK-025A — Connect persisted expert requests to the real expert workbench and decision recompute

## Goal

Remove the fixture split and conduct one real expert request through a single
persistent application runtime:

```text
buyer journey
→ expert request
→ expert queue
→ expert workbench
→ expert completion
→ expert result
→ evidence/confidence update
→ decision recompute
```

Every step must operate on the same request and the same persistence boundary.

## Current problem

The public expert-request flow stores requests through the real
`ExpertRequestRepository`, but the web routes `/expert/requests`,
`/expert/requests/[requestId]`, and `/expert/results/[requestId]` use
`getExpertWorkbenchFixtureRuntime()`, `EXPERT_FIXTURE_ACTORS`, and a fixture
repository/dataset. They therefore cannot process the buyer's persisted
request. Fixture runtime remains valid only for tests and explicit demo
fixtures, never as the production/pilot expert-route runtime.

## Scope

- Add a production-capable expert workbench runtime composed from the same
  persistence root as the buyer/expert HTTP runtime.
- With `DATABASE_URL`, persist request, context, audit, expert work state and
  completed result across fresh application/runtime instances. Preserve the
  existing in-memory development fallback when no database is configured.
- Make the expert queue, workbench and result routes operate on real persisted
  requests while preserving owner/actor access boundaries.
- Persist structured expert drafts/results durably when PostgreSQL is selected.
- On completion, retain provenance, append audit/evidence through existing
  domain integration hooks and invoke the existing affected-only decision
  recomputation path.
- Preserve `unknown` semantics and verification ceilings: no automatic
  `claimed → confirmed`, no `unknown → false`, and no silent evidence mutation.
- Keep demo fixtures isolated from real pilot requests. Pilot uses
  `manual_curated_pilot`; demo remains synthetic.
- Add the required cross-runtime golden-flow and foreign-owner denial tests.

## Out of scope

- TASK-020, TASK-026, live buyer pilot, browser automation or real-source
  collection.
- Large product-copy rewrite or final renaming of “Экспертная проверка”.
- Authentication-system redesign, expert marketplace, billing, CRM, scheduling
  logistics, document OCR/parsing or external expert integrations.
- Matching-weight changes, source-policy changes, canonical-data shortcuts or a
  second database/source of truth.
- Fixing destructive behavior in `0003_matching_bundle_dataset_type.down.sql`
  unless it directly blocks a new migration. Existing data must not be deleted
  to make rollback tests look green.

## Acceptance criteria

- Production/pilot expert routes do not call the fixture workbench runtime or
  expose fixture actors/requests.
- `/expert/requests` lists authorized persisted requests from the shared
  repository.
- `/expert/requests/[requestId]` loads the persisted request and its saved
  context without hidden refresh or external collection.
- Expert work and the final structured `ExpertResult` survive a fresh runtime
  instance when PostgreSQL is configured.
- `/expert/results/[requestId]` presents the completed result for the same
  request and denies a different owner/session even when the request ID is
  known.
- Completion writes an audit event, applies only supported evidence updates and
  triggers the existing affected-only Match/DataQuality decision recomputation.
- A restored buyer journey reflects only supported changes to Match Score,
  Data Confidence, critical unknowns, conflicts and recommended actions.
- Demo and pilot data/request boundaries remain isolated; pilot contains no
  fixture expert requests.
- A mandatory integration regression executes creation, restart, queue,
  workbench, draft, completion, result, second restart and restored recomputed
  decision. With `DATABASE_URL`, this runs against PostgreSQL.

## Verification

- `npm run format:check`
- `npm run typecheck`
- `npm run lint`
- full `npm test` without `DATABASE_URL`
- full `npm test` with PostgreSQL
- persistence suite
- pilot suite
- buyer-journey suite
- expert suite
- expert-workbench suite
- new real expert golden-flow regression
- clean-database migrations and migration status
- safe rollback/reapply for a new migration, if one is introduced
- pilot performance suite
- production dependency audit
- production build with expert routes remaining dynamic
- `git diff --check`

## Curator decision / follow-up

Public positioning must not describe the service with weak formulations such
as “мы помогаем” or “помощь в выборе”. The service performs concrete work:
forms options, matches conditions, calculates fit, checks evidence, identifies
risks and unknowns, performs expert verification, and forms a decision output.
The final name, composition, boundaries and copy for the current “Экспертная
проверка” are deferred to a separate product/content task. TASK-025A does not
invent that final name.

## Known constraints and dependencies

- A configured PostgreSQL instance is required to prove cross-instance durable
  behavior; without `DATABASE_URL`, only the existing in-memory development
  fallback is expected.
- External Vercel staging readiness remains separate and still requires a
  managed staging database and deployment verification.
- Expert evidence for `property_financing_eligibility` is fail-closed in this
  stage. `ExpertContextPackage` does not persist an eligibility identifier or
  a relationship that proves it belongs to the contextual Property, Offer or
  PurchaseScenario. Support requires an explicit context-contract change in a
  later task; the canonical allowlist alone is not authority to create it.
- `/expert/requests`, the workbench and its mutation APIs remain suitable for
  managed staging only behind a trusted deployment access layer.
  `REDS_EXPERT_ACTOR_REF` selects a server-side operator identity; it does not
  authenticate the HTTP user.
- Rollback of migration `0003` may be blocked by existing comparison references;
  application rollback with additive compatible schema retained is preferred
  over destructive data deletion.
