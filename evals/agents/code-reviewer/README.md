# code-reviewer eval — summary

Two content-only cases (`code-reviewer.cases.ts`, fixtures inlined, no tools):

1. `budget-offbyone.diff` — `>=` vs `>` on a 20-file limit. Expects the bug, a concrete
   failure scenario (exactly 20 files wrongly rejected) and a severity/blocking verdict.
2. `benign-rename.diff` — local variable rename. Expects no invented finding.

## Results (n=2 per series, labels in `results/repeat-*.json`)

| Series | Rule state | Result |
|---|---|---|
| cr-baseline | intact | all practices 100% |
| cr-broken | `Scenario or nothing` removed from `.claude/agents/code-reviewer.md` | all practices 100% (Δ 0) |
| cr-restored | rule back | all practices 100% |

## Conclusion: the break experiment is not informative here

Removing the rule changed nothing. The output template already has a `Failure scenario`
column, so the model supplies a scenario regardless — this expectation passes without the rule.

A third case (a suspicion that cannot be proven → should go to `Unknown`, not `Findings`) was
tried to discriminate the rule. It failed even with the rule intact: the agent filed a
hypothetical "if `listByRepo` returns another order" scenario as a Major/blocking finding.
So the behaviour is not reliably produced by the rule and the case was dropped.

## Gotchas

- The agent keeps Read/Grep/Bash, so without "do NOT use tools / files are not on disk" in
  the prompt it wandered the repo hunting for the diffed file and ran out of turns.
- A practice like "points at the budget.ts line" made the judge flaky (50%); keep practices
  binary and quote-verifiable.
- For a discriminating rule experiment use `skills/onion-architecture` instead.
