# Source Registry & Policy Engine

This module is the mandatory policy gate before source collection. It answers
which source a URL belongs to, what that source covers, which operations and
methods are allowed in an environment, and what storage, display, refresh,
derivation, caching, attribution, freshness, authority, and health rules apply.
It only creates decisions and collection plans; it does not execute collectors.

## Marketplace single-card runtime

`src_mkt_01` (ЦИАН) и `src_mkt_04` (Авито) имеют отдельные policy contracts.
Их HTTP card methods условны и по умолчанию не получают требуемые access/data
use conditions. Наличие parser, fixture или environment flag не является
разрешением правообладателя. Если оба независимых approvals подтверждены,
runtime допускает только одну каноническую карточку в development/test,
сохраняет лишь transient normalized facts/evidence и не хранит HTML.

HTTP transport pins the public DNS answer to the actual TLS connection, keeps
certificate verification against the original hostname and rejects redirects.
An independent request guard enforces per-source windows and a terminal stop
after 403/429/challenge responses. Its `postgres` backend coordinates multiple
application instances through migration 0007; process-memory state is strictly
development/test-only. The guard is not an access approval and is not described
as production-ready until the shared backend is deployed and verified.

The policy environment is derived from trusted server configuration
(`NODE_ENV` plus `REDS_APPLICATION_MODE` for a production process). A caller's
collection input cannot select `test` to bypass pilot/production policy.

## Configuration

`config/pilot.ts` is the typed, versioned and runtime-validated configuration.
Every entry has stable identity and domains, coverage and capabilities, separate
permission dimensions, explicit methods, per-environment approval, production
gates, field authority, configurable freshness rules, attribution, health, and
operational metadata. The version 1.1 contract also requires collection scope,
field policy, and retention policy. An explicit-target scope can restrict host,
anchored path patterns, target count, discovery/traversal behavior,
authentication, and challenge handling. Collection decisions validate target
URLs and requested fields before an automatic method can be selected, and a
collection plan exposes only the validated scope. Provisional TTL values are
policy configuration, not immutable product constants. `valid_until_overrides`
marks fields where an explicit validity date takes precedence over the generic
TTL.

Approval lifecycle is independent of runtime source status:

`candidate -> testing -> review_required -> approved_for_pilot -> production_approved`

Paused, blocked, and deprecated are explicit lifecycle states. `active` never
implies storage, display, or refresh permission. Production automation requires
both `production_approved` lifecycle and every production gate to be true.

## Adding or changing a source

1. Add an opaque `source_id`, controlled domains, base URL, geography, coverage,
   capabilities, status, and approval lifecycle.
2. Fill every permission dimension, allowed method and required condition.
3. Define environment approvals, all production gates, field authority,
   freshness, attribution, health, collection scope, field allowlists and
   retention metadata.
4. Add identification, policy, matrix, and collection-plan tests.
5. Treat changes such as blocked-to-active, storage denial-to-approval, or any
   production approval as reviewable Git configuration changes.

The validator rejects incomplete/invalid entries, unsafe duplicate domain
ownership, incomplete production approvals, and secret-shaped configuration.
Unknown sources and missing/unknown permissions fail closed for automation.
Manual or user-supplied data may be stored/displayed only through the explicit
manual flow returned by the policy engine.

`src_dev_02` has a narrow development/test-only prerequisite approval named
`TARGETED_UNIT_HTTP_POC_APPROVED`. It permits HTTP planning for one explicit
`/kvartiry/<id>/` URL and factual allowlisted fields. It does not approve a
collector implementation, browser/OpenClaw, discovery, refresh, raw retention,
or pilot/production automation.

Never put API keys, passwords, tokens, cookies, or credential values here. A
method may contain only an environment-style `credential_ref`, for example
`SOURCE_PARTNER_API_KEY`; the referenced value stays outside the repository.
