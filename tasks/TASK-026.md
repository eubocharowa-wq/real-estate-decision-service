# TASK-026 — Browser-level Golden Journey

## Goal

Prove the accepted TASK-025B staging flow in a real browser against the
deployed, protected dynamic application rather than localhost or an
application-level test harness.

## Scope

- Add a minimal Playwright test boundary for the deployed staging origin.
- Keep the target origin explicit through `BASE_URL`; localhost is
  not an accepted TASK-026 target.
- Use Vercel's platform-native automation bypass header when protected staging
  requires non-interactive browser access. The bypass secret is supplied only
  through the environment and is never stored in the repository.
- Exercise representative 360, 768 and 1280 pixel viewports.
- Cover request entry, confirmation, shortlist, property detail, comparison,
  expert-request creation and the user-URL entry path.
- Prove browser reload/recovery from the persisted buyer-journey identifiers.
- Cover recoverable/not-found presentation, primary-navigation link health and
  a basic accessibility smoke scan.
- Capture and assert the shortlist HTTP evidence that the staging dataset is
  `manual_curated_pilot`, contains only `manual_curated` entries and does not
  mix synthetic candidates.
- Retain Playwright screenshots and traces only when a test fails.

## Out of scope

- Production traffic, Production environment/configuration and disabling or
  weakening Vercel Deployment Protection.
- Query-string authentication, committed cookies/tokens/storage state or a new
  application authentication mechanism.
- Matching, domain, evidence, persistence or UI behavior changes made only to
  satisfy the browser suite.
- Expert workbench completion, source collection, live browser collection,
  TASK-027 and TASK-020.

## Acceptance criteria

- `npm run test:browser` targets an explicit deployed HTTPS origin and refuses
  localhost/loopback targets.
- Protected staging authentication uses only Vercel's documented automation
  mechanism, with the credential supplied at runtime.
- Chromium scenarios exercise widths 360, 768 and 1280.
- The buyer journey reaches confirmation, shortlist, property detail and a
  2–4 item comparison through visible browser interactions.
- The suite creates a contextual expert request and exercises the user-URL
  preview/confirmation path without live scraping.
- Reloading a stateful page restores the same server-backed journey rather
  than presenting a missing-state guard.
- Missing journey/property routes show the intended recoverable/not-found
  state without an unhandled error or application 404.
- Primary public navigation links return a non-error application page.
- Basic accessibility smoke checks report no serious or critical violations
  on the principal journey screens.
- Browser-observed API evidence proves `manual_curated_pilot`, no synthetic
  origins and no synthetic/real mixing.
- Failure output is local-only and includes a screenshot and trace; no secret
  value is committed or printed by the test.

## Verification

- `npm run test:browser` with `BASE_URL` and the protected staging
  automation credential supplied in the process environment.
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run format:check`
- `git diff --check`

## Known external dependencies

- The accepted TASK-025B stable Preview origin must remain `READY`, in pilot
  mode, connected to its managed staging PostgreSQL and protected by Vercel.
- Non-interactive Playwright execution requires a project-scoped Vercel
  Automation Bypass secret or an equivalent platform-native authenticated
  browser state supplied outside Git. Vercel CLI authentication by itself is
  sufficient for `vercel curl`, but does not automatically authenticate a
  separate Playwright browser process.
- The staging dataset must remain `manual_curated_pilot`; the test must stop on
  a demo/synthetic or mixed response instead of relabelling it.
