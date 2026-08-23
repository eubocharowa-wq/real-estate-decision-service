# Real Buyer Pilot — technical checklist

Status date: 2026-08-24. Contract: `pilot-hardening-policy-v1`.

This is an engineering readiness document, not a market-coverage claim. The
pilot still helps a buyer compare evidence-backed options; it is not a listings
portal.

## What works

- the TASK-018 controlled buyer journey from request to updated decision;
- deterministic matching and separate Data Confidence / Completeness;
- explicit candidate provenance (`synthetic`, `manual_curated`,
  `approved_live_source`, `user_supplied`, `expert_supplied`);
- reusable pilot candidate validation, source readiness and coverage summary;
- vendor-neutral journey telemetry, sensitive-comment-separated feedback,
  structured errors and safe journey diagnostics;
- cohort-safe labels (`internal_test`, `friendly_pilot`, `real_buyer_pilot`)
  and a developer feedback/outcome report with funnel and decision-clarity
  proxies;
- an offline OpenClaw capability boundary gated by source policy, pilot
  readiness, feature flag, kill switch and a validated Collection Plan;
- a machine-readable fail-closed `PilotReleaseGate`;
- reproducible 75-candidate matching/DataQuality benchmark.

## Application modes

| Mode | Dataset origins | Live integrations |
| --- | --- | --- |
| `demo` | synthetic, manual curated, user/expert supplied | prohibited; fixture and manual flows only |
| `pilot` | manual curated, approved live, user/expert supplied | only per Source Policy + readiness + flags |
| `production` | approved live, user/expert supplied | only production-approved source operations; no fixtures |

`synthetic_pilot` is explicitly labelled and may not be presented as live
market data. Mixed Buyer Journey bundles use `mixed_explicit`, while each entry
keeps its own origin.

## Fixture-backed and manual boundaries

- Matching data, automatic user-URL adapter, refresh execution and all
  OpenClaw CI cases are fixture-backed and offline.
- Manual import and expert verification remain explicit manual flows.
- There is no production database, distributed queue, source scheduler or
  production persistence in this task.

## Source and OpenClaw status

Current real-source registry review produces no pilot-ready source. Entries
remain `REVIEW_REQUIRED`, `PERMISSION_REQUIRED`, `PARTNER_API_ONLY`, testing or
otherwise blocked. `src_dev_02` (ВНЕШСТРОЙ) remains a one-URL, HTTP-only,
development/test PoC. Its pilot/production and targeted refresh permissions are
denied; OpenClaw/browser are not approved.

Therefore no first live OpenClaw use case is selected. Live execution is
disabled and the diagnostic blocker is
`NO_PILOT_APPROVED_BROWSER_BENEFICIAL_SOURCE`. This is a release warning plus
the absence of a real pilot dataset is a hard blocker. A feature flag can never
override Source Policy or `evaluateSourcePilotReadiness(...)`.

OpenClaw is blocked from:

- discovering or adding sources, crawling catalogues or expanding targets;
- bypassing access, auth, CAPTCHA, challenge or URL security policy;
- promoting claimed facts to confirmed;
- writing canonical Property/Offer directly or resolving conflicts silently;
- setting Match Score, changing weights, choosing a winner or asserting bank
  approval.

Its output, if a source is approved later, remains staged extracted facts plus
evidence references and must continue through normalization, evidence,
deduplication, canonical conflict handling, DataQuality and matching.

## Coverage behavior

`CoverageSummary` reports geography, property types, active/unavailable/
blocked/stale sources, object count, gaps and confidence. Empty results are
split into:

- `no_eligible_in_available_data` — “По подключённым источникам подходящих
  вариантов пока не найдено.”;
- `insufficient_data_coverage` — coverage is too weak for a market-wide claim.

The product must not state that no market options exist when only connected
sources were evaluated.

## Release checklist

The release gate is `ready=false` if any hard check fails:

- build or core regression suite;
- secret scan;
- candidate provenance / synthetic labelling;
- hard-criterion behavior;
- Match Score / Confidence separation;
- expert evidence boundary;
- safe URL fetch boundary;
- OpenClaw policy/readiness boundary;
- configuration of a validated real pilot dataset.

Warnings include low coverage, manual-only sources, undefined expert SLA, low
comparison sample, fixture-backed refresh and live OpenClaw disabled pending
approval. Current expected blockers include `REAL_PILOT_DATASET_NOT_CONFIGURED`.

Commands:

```text
npm run test:pilot
npm run test:pilot-performance
```

Standard tests do not execute live network or OpenClaw/browser smoke.
The existing CI runs the offline pilot and performance commands explicitly.

## Outcome review

`buildPilotOutcomeMetrics(...)` calculates confirmation, edit, shortlist,
property-detail, comparison, expert-request and journey-completion rates by
unique journey. `buildPilotFeedbackReviewReport(...)` adds stage/answer counts,
common safe error codes, request edits, unknown fields and source gaps. It never
exports optional feedback comments. Clicks are context, not the success target;
the primary proxies are whether users found the shortlist relevant, understood
trade-offs, understood what needs verification and felt clearer about the next
decision.

## Measured local baseline

On the 2026-08-24 local offline run, 75 matching + DataQuality evaluations took
128.528 ms total. Matching p50/p95 were 0.722/1.512 ms; DataQuality p50/p95 were
0.736/1.314 ms. The instrumented golden journey recorded parser 21.297 ms,
matching 50.509 ms, confidence 21.914 ms total across 27 candidates, shortlist
192.107 ms total across two builds (max 102.141 ms), comparison 8.942 ms and
expert context 25.630 ms. These are reproducible fixture baselines, not
production SLAs; the test only uses a 5-second local/CI runaway guard and adds
no cache or distributed service.

## Pilot QA scenarios

The versioned scenario registry covers: clear apartment; no results under hard
constraints; apartment vs house; claimed financing; conflicting price; stale
availability; restricted user URL/manual fallback; expert evidence updating a
decision; and OpenClaw denied with executor not called.

## Known limitations

- no current pilot-approved live dataset or browser-beneficial source;
- coverage is synthetic/manual until a source passes human approval and the
  readiness gate;
- refresh and OpenClaw execution are fixture-backed only;
- expert SLA and production persistence are undefined;
- the performance benchmark is a reproducible local measurement, not a
  production SLA;
- feedback does not tune matching, parsing or source policy automatically.

See [privacy inventory](privacy-inventory.md) and
[rollback procedure](rollback.md).
