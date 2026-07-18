---
name: execute-plan
description: >-
  Executes a wave-labeled plan by launching one Task subagent per todo,
  sequentially, to keep context windows small. After implementation,
  runs a code-review pass in Plan mode using code-review.mdc, then
  executes review-fix todos for the most urgent issues. Use when the
  user asks to execute a plan, dispatch plan todos, run waves, or
  finish a plan with code review.
---

# Execute Plan

Orchestrate a Neighbr plan end-to-end: implement wave by wave with one fresh subagent per todo, then review and fix the highest-priority issues.

Follow `.cursor/rules/planning.mdc` for plan shape (`[WAVE-N] [LANE:] [DEPS:]`), lanes, and deps. Follow `.cursor/rules/task-completion.mdc` for verification gates.

## When to use

- User says execute / dispatch / run this plan (or points at a plan with wave-labeled todos)
- User asks to finish implementation and then code-review

## Hard rules

1. **One Task subagent per todo** — never implement a plan todo in the parent agent’s context.
2. **Sequential execution** — run todos one at a time. Wait for the current subagent to finish before starting the next. Fan out parallel Task calls for implementation todos when the plan wave says “Issue in parallel”. Waves still define **order and deps**;
3. **Wave barriers** — do not start `WAVE-N+1` until every todo in `WAVE-N` has succeeded (or the user explicitly skips/aborts).
4. **Lane ownership** — each subagent prompt must restrict writes to that todo’s `LANE` paths from `planning.mdc`. lanes should always reference their relevant cursor rule document. (e.g. mobile -> mobile-expo.mdc, types -> shared-types.mdc, etc...)
5. **Parent stays thin** — parent only parses the plan, dispatches, records results, runs wave gates, and advances. No feature coding in the parent.

## Phase 1 — Parse the plan

1. Locate the active plan (user message, attached plan, or latest plan in the conversation).
2. Extract every todo with labels:
   - `WAVE-N`
   - `LANE: <lane>`
   - `DEPS: none | WAVE-x …`
   - title + any verification commands listed for that todo
3. Group by wave ascending (`WAVE-1`, `WAVE-2`, …).
4. If labels are missing or waves conflict with deps, stop and ask the user to fix the plan — do not invent a new schedule.

## Phase 2 — Execute waves sequentially

For each wave in order:

### 2a. Preflight

- Confirm all `DEPS` waves are complete.
- List the wave’s todos in plan order.
- Announce: wave id, todo count, and that execution is sequential (one subagent at a time).

### 2b. Dispatch each todo (one subagent, wait, next)

For each todo in the wave, in order:

1. Launch **exactly one** `Task` subagent with a self-contained prompt that includes:
   - Todo title and acceptance criteria from the plan
   - Exclusive write paths for `LANE`
   - In-scope / out-of-scope from plan Context
   - Verification commands for this todo (from the plan and `task-completion.mdc`)
   - Instruction to return: summary of changes, files touched, verification results, blockers
2. Wait until that subagent finishes.
3. If it **fails** or leaves verification red:
   - Stop the wave
   - Report the failure with the todo label and subagent output
   - Do not start later todos or later waves unless the user directs a retry/skip
4. If it **succeeds**, mark the todo done and proceed to the next todo in the same wave.

### 2c. Wave complete

- Optionally re-run wave-level verification if the plan specifies it.
- Only then open the next wave.

### Subagent prompt template

```text
You are executing a single plan todo. Do not work on other todos.

Todo: [WAVE-N] [LANE: <lane>] [DEPS: …] <title>

Write only under this lane’s paths (see planning.mdc). Do not edit other lanes.

Context (from plan):
- Goal: …
- In-scope: …
- Out-of-scope: …

Do:
1. Implement only this todo.
2. Run verification: <commands from plan / task-completion.mdc>
3. Fix failures you introduced until verification passes (or report a blocker).

Return:
- Status: success | blocked | failed
- Files changed
- Verification output (pass/fail)
- Notes / blockers
```

Prefer `subagent_type` that matches the work (`explore` only for research; default/general for implementation). Keep `run_in_background` false so the parent waits.

## Phase 3 — Implementation complete checklist

Before leaving implementation:

- [ ] Every plan todo is success (or explicitly skipped by user)
- [ ] Applicable `task-completion.mdc` gates for touched lanes passed inside their subagents
- [ ] No secrets committed; no drive-by refactors outside lanes

## Phase 4 — Code review (required)

After implementation succeeds, **always** run a code-review pass:

1. **Switch to Plan mode** (`SwitchMode` → `plan`) with a short explanation that implementation is done and review planning is next.
2. **Apply** `.cursor/rules/code-review.mdc` as the review contract (same standard as `/code-review`).
3. In Plan mode, produce a **review plan** (not a full prose dump alone):
   - Analyze the diff produced by this plan’s execution (branch / uncommitted changes from the plan).
   - Follow the code-review rule’s required sections enough to identify real issues.
   - Emit a **dispatch board of review-fix todos**, prioritized:
     - P0 / blocking (must fix): correctness, security, data loss, broken gates
     - P1: high-risk reliability / contract breaks
     - Skip or defer nits unless the user asked for a full cleanup
   - Label review todos with waves/lanes when fixes span trees, e.g.
     `[WAVE-R1] [LANE: mobile] [DEPS: none] Fix …`
4. Get user confirmation on the review plan only if the review is large or destructive; otherwise proceed to Phase 5 for **P0 (and clear P1)** items.

## Phase 5 — Execute review-fix todos

Reuse Phase 2 rules on the review plan:

- One Task subagent per review todo
- Sequential execution
- Wave barriers if the review plan has multiple waves
- Stop on failure; report; ask how to proceed

After review todos complete, give a short closeout:

- Implementation waves: done
- Review: issues fixed vs deferred
- Remaining risk / suggested follow-ups

## Anti-patterns

- Implementing todos in the parent chat
- Parallel Task fan-out for this skill (sequential only)
- Starting the next wave while the current wave has open failures
- Skipping Phase 4 after a “green” implementation
- Turning code-review into endless polish — fix urgent issues first
- Subagents that rewrite outside their `LANE`

## Rollback

If a wave fails mid-way: leave later waves untouched, report which todo failed, and use the plan’s Rollback section (or ask the user) before retrying or reverting.
