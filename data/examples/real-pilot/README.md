# Real curated pilot dataset

One JSON file per real object, in `candidates/`. Files are produced by the
data-entry tool, never by hand and never by a collector:

```
npm run pilot:candidate -- add <input.json>   # build and store one object
npm run pilot:candidate -- check              # re-validate everything stored
npm run pilot:candidate -- unknowns           # what a declaration never states
```

`input-template.json` is the form an operator fills in from one published
ЕИСЖС object card. Copy it, replace every `ТРЕБУЕТСЯ:` marker with what the
card actually says, and set `collected_at` to the moment you checked it — not
to the moment you edit the file. The template does not validate as-is on
purpose: the markers are not a URL, a date or a number, so the tool refuses it
until real values are in.

Nothing here is fetched. The tool performs no network access; ЕИСЖС object
cards are addressed by query parameters, which the collection scope refuses,
and no adapter is approved for this source.

## What the source does and does not give

A 214-ФЗ project declaration describes the object, not the transaction. Area,
floor count, address and cadastral number are filed facts and are recorded as
`confirmed`. A commissioning quarter is a commitment about the future and is
recorded as `claimed`, with `timeline.handover_date` left unknown — a quarter
is not a date and is never expanded into one.

Price, availability, financing, travel times, finishing and balcony are not
published there at all. They are listed in `explicit_unknown_fields` so they
stay unknown rather than silently absent.

## Empty is a valid state

With no files here the pilot dataset is simply not configured, and matching
reports `dataset_type: "empty_pilot"`. Objects appear only when someone enters
them.
