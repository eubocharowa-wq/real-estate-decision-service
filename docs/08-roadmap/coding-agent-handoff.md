# Coding-Agent Handoff

## Status

`ready_for_implementation`

## Repository

**Real Estate Decision Service**

---

# 1. Start Here

Before changing anything, read in this order:

1. `/PROJECT.md`
2. `/AGENTS.md`
3. `/tasks/TASK-001.md`
4. related documentation referenced by TASK-001

Do not begin another task automatically.

---

# 2. Current Repository State

The repository currently contains the product, domain, data, matching, source-policy, expert-service, UX and implementation-task specifications.

Application code has not yet been implemented.

The implementation sequence is already defined as:

```text
TASK-001
→ TASK-002
→ ...
→ TASK-020
```

Only the current task may be implemented at a time.

---

# 3. First Assignment

Implement:

```text
TASK-001 — Repository Scaffold
```

Follow its acceptance criteria exactly.

Do not add product functionality from later tasks.

---

# 4. Mandatory Product Invariants

Preserve at all times:

```text
UserRequest first
Property != Offer
Financing != Property characteristic
unknown != false
claimed != confirmed
stale != current
removed != sold
Match Score != Data Confidence
Data Confidence != Data Completeness
no Frankenstein PurchaseScenario
no source operation without Source Policy
LLM does not set Match Score
AI is not a factual source
no commercial bias in matching
pilot geography is not core architecture
```

---

# 5. Source-of-Truth Priority

If instructions conflict, use:

```text
1. Current TASK
2. PROJECT.md
3. Related docs
4. AGENTS.md
5. Existing code
```

If a genuine specification conflict remains, stop and report:

```text
SPEC CONFLICT
```

Do not invent a resolution.

---

# 6. Implementation Discipline

For each TASK:

1. read the current TASK and referenced docs;
2. implement only its scope;
3. add/update required tests;
4. run typecheck/lint/tests/build where applicable;
5. report what changed;
6. report any blockers or spec conflicts;
7. stop after the current TASK.

Do not continue to the next TASK without a separate instruction.

---

# 7. First Handoff Boundary

The first coding-agent run ends after:

```text
TASK-001 implemented
+
acceptance checks completed
+
implementation report returned
```

The curator reviews that result before TASK-002 begins.

---

# 8. Repository Audit

The pre-handoff documentation audit is recorded in:

```text
/docs/08-roadmap/repository-consistency-audit.md
```

Its result is:

```text
PASS / READY FOR HANDOFF
```

---

# 9. Final Instruction

> Build the repository scaffold required by TASK-001. Do not reinterpret the product, do not implement later domain logic, and do not continue automatically.
