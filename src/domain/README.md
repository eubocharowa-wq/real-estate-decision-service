# Domain contracts

TASK-002 uses Zod 4 as the single authoring and runtime-validation source. TypeScript contracts are inferred with `z.infer`; `npm run schemas:generate` exports the same contracts as JSON Schema Draft 2020-12 into `data/schemas/`. `npm run schemas:check` rejects stale generated schemas.

JSON payloads use `snake_case` consistently. Every top-level entity requires `schema_version: "1.0"` and has a versioned `$id` in its generated JSON Schema.

## Money

`Money.amount` is a non-negative decimal string in the currency's base unit and `Money.currency` is a three-letter uppercase currency code. For example, `{"amount":"4890000.00","currency":"RUB"}`. A decimal string avoids binary floating-point loss during JSON serialization. Arithmetic belongs to later policy/calculation modules and must use a decimal-safe implementation.

## Dates and unknown values

Date-only fields use ISO `YYYY-MM-DD`. Timestamps require an ISO-8601 timezone offset (`Z` is accepted). Business unknowns are represented explicitly with `null` and/or a semantic status; runtime schemas do not coerce them to `false`, `0`, an empty string, or an empty collection.

## Purchase scenarios

A `PurchaseScenario` is anchored to exactly one `offer_id`. The contract records the compatibility and evidence of its program, financing offer, and promotion. Cross-record compatibility requires canonical lookup and is intentionally not calculated by the schema layer.
