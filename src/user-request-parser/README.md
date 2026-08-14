# UserRequest parser

TASK-003 defines a versioned parser boundary and a deterministic Russian rule-based
adapter. The pipeline is:

```text
validated input
→ explicit rule-based extraction
→ UserRequest runtime validation and normalization
→ deterministic contradiction detection
→ deterministic clarification selection (maximum three)
→ structured confirmation view
```

The adapter does not access search, listings, eligibility rules, or external facts.
It preserves ambiguous phrases as fuzzy criteria or unknowns and retains source text.

A production LLM adapter is intentionally not part of TASK-003. If introduced later,
it must implement `UserRequestParser`, use schema-constrained output, and feed the same
validation and deterministic post-extraction layers.
