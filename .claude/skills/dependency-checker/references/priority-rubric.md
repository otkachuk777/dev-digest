# Priority rubric

Score each candidate on three axes, then map to a level. The point is a stable order — two runs
on the same facts should rank the same way.

| Axis | 0 | 1 | 2 |
|---|---|---|---|
| Risk | cosmetic | outdated major / drift between modules | vulnerability (moderate+), arch violation, cycle |
| Weight | < 2% of module closure | 2–10% | > 10% of module closure, or > 20 MB |
| Cheapness | needs migration (L) | small change (M) | one-liner: remove, bump, align (S) |

`score = 2·Risk + Weight + Cheapness`

- **P0** — critical/high vulnerability with a fix available, or any `prod` vuln reachable at runtime; or an internal import that bypasses a package's public entry (relative/deep path into another package). Ignore the score.
- **P1** — score ≥ 5
- **P2** — score 3–4
- **Info** — score ≤ 2, or a heavy package that is `lazyOnly` (disk cost only)

Adjustments: a `dev`-only package never outranks the same finding in `prod`; a vulnerability with
`fix: none` is P2 with a mitigation note, not P0 (nothing actionable). Unused *candidates* are
heuristics — phrase the action as "verify and remove", never "remove".
