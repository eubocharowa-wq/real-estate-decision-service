# TASK-MKT-005A — Эксперт и прямая связь

## Scope and authorization

Bounded static slice of MKT-05 in the [unified plan v4.3](https://github.com/eubocharowa-wq/real-estate-decision-service/blob/ac01a668e375d9f28fdfe3d4cadf578809cdee72/docs/08-roadmap/osnovanie-unified-business-marketing-delivery-v4-2026-11-12.md), sections 5.4, 19–21.
Owner instruction on 2026-11-13: recheck the plan and return to implementation
of the website and social promotion. This slice is the static parallel track
described in that plan; it does not advance the technical TASK sequence.

Base: PR #32, `3eddfd3c79b66350ba5b40e798d1d381dd3661a2`.
TASK-028 stays ACTIVE / NOT COMPLETED; TASK-029 has not started.

## Acceptance criteria

- `/about` identifies Елена Бочарова and the current brand, with the owner's
  stated 15 years in real estate and higher legal education. No invented
  credentials, career dates, verified diploma, cases or guarantees.
- Home includes a compact expert block while preserving the digital product.
- A visible contact link in desktop/mobile navigation and footer reaches
  `/about#contacts` without a request, journey, account or form submission.
- Telephone, direct expert Telegram, VK community `231315767`, and the primary
  Telegram channel use shared, confirmed public configuration. Personal
  contact and community links have distinct labels.
- No new email, office address, opening hours or portrait is invented.
- Existing legal contact text remains outside this slice: the email spellings
  in old materials conflict, and legal/operator documents need separate review.
- No API, database, intake guard, source policy, release gate or indexing
  change. About stays noindex and outside the sitemap; Pages stays no-submit.
- Two separate reviewable social drafts use the same expert facts and direct
  contact. They are not sent, scheduled or described as published.
- Check navigation, anchor, profile facts, absence of forms and static export;
  run format, typecheck, lint, tests, build, link check and visual review.

## Deliberate limits / dependencies

This is not all of MKT-05: dedicated `/contacts`, approved portrait, complete
public visual refresh, expert service/pricing pages, legal/operator packet,
production domain, analytics and verified publisher remain separate work.
No infrastructure is provisioned and no production data is touched.

## Verification checkpoint — 2026-11-13

- Focused public UI / intake privacy: 57 passed.
- Full suite: 1086 passed, 44 skipped (database-dependent tests need PostgreSQL).
- Format, typecheck, lint, normal Next build and diff check: passed.
- Disposable Pages export: 21 HTML pages, every internal link resolves.
- Preview review at 1363 CSS px: home expert block, direct contact transition,
  profile, community targets and absence of a main form checked. Two visual
  defects found and corrected: orphan header CTA and contact kicker overlap.
- A real narrow-viewport browser review remains pending. The browser could not
  reach the local server and did not expose an available responsive viewport
  control. Desktop screenshots are not mobile proof. Keep the PR Draft until
  responsive review and the remaining MKT-05 work are resolved.
- Social content remains two unsent drafts. No publisher capability was added.
