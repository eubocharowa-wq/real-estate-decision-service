# ВНЕШСТРОЙ HTTP adapter PoC

## Source and policy prerequisite

- Source: `src_dev_02` — ВНЕШСТРОЙ.
- Runtime environments: `development` and `test` only.
- Operation: `scheduled_collect` for one explicit unit URL.
- Method: `http` only.
- Required condition: `TARGETED_UNIT_HTTP_POC_APPROVED`.
- Target: one `https://vneshstroi.ru/kvartiry/<numeric-id>/` URL (the
  `www.vneshstroi.ru` host is also policy-approved).
- Discovery, link traversal, pagination, sitemap, authentication, challenge
  bypass, refresh, browser, OpenClaw, pilot, and production are denied.

The broad pilot source matrix still records the source as `REVIEW_REQUIRED`.
The runtime registry contains a later, narrower development/test-only approval;
it does not approve catalog collection or pilot/production use. The matrix is a
documentation follow-up and is not treated as broad approval by this adapter.

## Pipeline and retention

The adapter is invoked only after `SourcePolicyEngine.resolveCollectionPlan`
returns the exact validated URL and requested-field scope. It returns a
versioned `RawCollectionResult`; it never writes a `Property` or `Offer`.

HTML is transient inside the HTTP collector/parser call. Redirects are denied,
credentials are omitted, HTTPS is required, and timeout, byte-size, and content
type limits are centralized. `raw_payload_reference` is always `null`; no
`SourceSnapshot` is created. Normalized candidate data and evidence metadata
remain `transient_only` and are not persisted by this task.

## Supported fields

- source unit ID, property/market type, development and unit identity;
- rooms, floor, and total area;
- listing price with exact/lower-bound semantics;
- explicit availability claim;
- explicitly labelled handover date.

Values extracted from the source default to `claimed`; extraction confidence is
recorded separately. Missing values remain unknown. Financing, promotion, and
marketing fields are outside the scoped allowlist and are not extracted.

## Fixture and live use

Offline tests use small, manually authored synthetic HTML fixtures that retain
only the expected semantic payload shape. They do not contain copied source
content. There is deliberately no live smoke command in TASK-014: CI cannot
reach the source, and no command can accidentally collect or retain live HTML.

Known limitation: the parser proves the approved source boundary and full
staging pipeline against the documented synthetic shape. A manually reviewed
fixture update and adapter version bump are required if the live unit-page
structure differs; the adapter returns `SOURCE_CHANGED` instead of guessing.
