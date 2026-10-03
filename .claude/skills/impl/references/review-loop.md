# Review loop (Phase 3 of /impl)

Goal: zero blocking findings in at most 3 rounds, without re-reviewing code that already passed and without fix/re-flag ping-pong.

## Round n

### 1. Review

| Round | Who | Model | Scope | Mode |
|---|---|---|---|---|
| 1 | architecture-reviewer ∥ security-reviewer ∥ code-reviewer — one message | sonnet · **opus** · sonnet | whole change: `$(git merge-base origin/main HEAD)..HEAD` | normal; pass the SPEC to security-reviewer (Untrusted inputs) |
| ≥ 2 | only reviewers with `open` findings; **plus** security-reviewer when the delta touches a trust boundary (`server/src/**/routes.ts`, `server/src/platform/**`, adapters, prompt assembly in `reviewer-core/src/prompt.ts`, `mcp/src/**`) | sonnet (all) | delta `<review-(n-1) commit>..HEAD` | **re-review**: prior findings list + delta |

Opus only where a miss is most expensive: tracing new source → sink paths in round 1. Checking whether a known finding is closed is a narrow task — sonnet.

Prompt for a re-review (architecture-reviewer / security-reviewer / code-reviewer):

```
Re-review mode. Delta: <from>..<to>. Prior findings:
- A3 | major | server/src/modules/x/service.ts:40 | no DB outside repository (onion-architecture §Step 3)
- S1 | ...
For each prior finding: resolved | open | regressed, with evidence. New findings only inside the delta.
```

code-reviewer gets the same re-review prompt (prior list = `C<n> | severity | file:line | problem`).

### 2. Triage (main session)

Number findings by reviewer: `A<n>` architecture, `S<n>` security, `C<n>` code-reviewer. Dedupe by `file:line + rule` (keep the higher severity, list both ids). Then one class per finding:

| Class | When | Action |
|---|---|---|
| `fix` | critical or major, blocking | fix this round |
| `fix-along` | minor / Nit in a file that already has a `fix` this round | fix in the same chunk — the file is open anyway |
| `defer` | any other minor / Nit | `Follow-ups` (PR body); never a round of its own |
| `dispute` | a critical whose scenario depends on prior state ("existing rows", "used to be validated") | check the premise yourself first (root `INSIGHTS.md`: grep every branch, `git cat-file -e <rev>:<path>`); refuted → downgrade and record why |
| `replan` | the fix changes a Test seam, a contract, or more than one module, or contradicts the plan | implementation-planner **fix plan addendum**, written to `~/.claude/plans/<plan-name>-addendum.md` (the planner cannot write `docs/`): a ready-to-append section between `=== APPEND BELOW ===` / `=== END APPEND ===` plus exact coverage-table row replacements → short user approval → the main session appends it to the archived plan, applies the replacements, deletes the draft and commits `SDD(SPEC-NN): fix plan addendum` → its steps become the fix chunks (spec amendment first via spec-creator when an AC changes) |

`Unknown` / non-blocking major with no clear fix → `defer` with the reviewer's "what would confirm it".

### 3. Fix

Group `fix` + `fix-along` by file into fix chunks (one module each). Per chunk an implementer in **fix mode** — `SendMessage` to the implementer that wrote the code if its context is still small, otherwise a fresh one:

```
Fix mode. Plan: <path>. Red tests: <red_sha, test-first only> (never edit test-writer's tests).
- A3 | server/src/modules/x/service.ts:40 | no DB outside repository | direction: move query to repository.ts
- C2 | ...
Fix only these. Report per id: fixed + evidence | can't — why.
```

Replan chunks run like normal plan chunks. After the chunks: commit `SDD(SPEC-NN): review-<n>`.

### 4. Review log

Append to the archived plan (committed with the round):

```markdown
## Review log
| Round | Id | Reviewer | Severity | Class | Status | Commit |
|---|---|---|---|---|---|---|
| 1 | A3 | architecture | major | fix | resolved (r2) | abc1234 |
| 1 | C5 | code-reviewer | minor | defer | follow-up | — |
```

## Exit and escalation

- **Exit:** no `open` / `regressed` blocking finding after a round's review → Phase 4 (Final).
- **Escalate to the user** (show the Review log and the open ids, ask how to proceed) when:
  - round 3 is done and blocking findings remain;
  - a finding oscillates — `resolved` in one round, `open`/`regressed` again later;
  - the implementer returns `can't` for the same id twice;
  - a reviewer and the implementer disagree twice on the same id (the reviewer re-flags what the implementer says is intended).
- Never lower a severity or close a finding just to leave the loop; only the user's decision or a refuted premise (`dispute`) does that, and the Review log records why.
