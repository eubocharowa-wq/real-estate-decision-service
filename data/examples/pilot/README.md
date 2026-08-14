# Synthetic Pilot Dataset

This directory contains the deterministic, scenario-driven benchmark introduced by TASK-005. It exists to exercise domain logic without live network access, scraping, or claims about a current real-estate market.

## Dataset identity

- Type: `synthetic_pilot`
- Version: `1.0.0`
- Geography: fictional `Пилотск`, `Тестовая область`
- Providers, prices, financing rules, people, addresses and URLs: synthetic/test-only

The dataset is not a catalogue, product default, production seed, or representation of current market supply.

## Structure

Entity files are separated so that schema validation, diffs and reuse remain explicit:

- `properties.json` and `offers.json` preserve Property/Offer separation;
- financing programs, offers, promotions, eligibility and purchase scenarios are separate files;
- `sources.json`, `field-evidence.json` and `source-conflicts.json` preserve provenance and unresolved conflicts;
- `ground-truth/` records duplicate clusters, false-positive traps, comparison trade-offs, confidence cases, financing compatibility and test-only fixture notes;
- `user-requests/` contains five schema-valid matching inputs;
- `benchmark-manifest.json` connects purpose-built cases to their entities and requests.

## Validation

```text
npm run fixtures:generate
npm run fixtures:check
npm run fixtures:validate
npm test
```

`fixtures:generate` is deterministic: it uses fixed IDs, timestamps and scenario definitions. `fixtures:check` fails when committed JSON differs from generator output. `fixtures:validate` parses every file with its formal schema and checks referential and semantic integrity.

## Adding a fixture

1. Add a concrete test purpose to `scripts/generate-pilot-fixtures.ts`.
2. Use existing TASK-002 domain schemas; do not add test-only fields to production entities.
3. Add internal tags only to `ground-truth/fixture-notes.json` through the generator.
4. Update `benchmark-manifest.json` through the generator when the case is a benchmark invariant.
5. Regenerate and run all validation commands.

## Prohibited practices

- no real scraped HTML or copied commercial listings;
- no live network dependency;
- no secrets or personal data;
- no random records without a documented scenario;
- no Property/Offer merging;
- no inferred defaults for unknown values;
- no mixing price, promotion or financing terms from different Offers;
- no manually assigned future Match Score or universal winner.
