# Workflow retros

One row per `/workflow-retro` run ([skill](../../.claude/skills/workflow-retro/SKILL.md)). Processed = input + cache read + cache write + output summed over API calls. Compare rows of the same kind to see whether an applied proposal moved its metric.

| date | run | sessions | agents | processed main | processed sub | orchestrator % | cache hit (sub, weighted) | review rounds | plan-verifier runs | interventions | errors | report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01 | spec-01 (spec+plan only) | 1 | 5 | 4.14M | 12.08M | 26% | 93% | 0 | 0 | 6 | 14 | [report](2026-10-01+spec-01.md) |
| 2026-10-02 | spec-01 (impl) | 2 | 30 | 43.09M | 44.95M | 49% | 94% | 2 | 2 | 10 | 54 | [report](2026-10-02+spec-01.md) |
| 2026-10-03 | spec-02 (spec→verify, one session) | 3 | 28 | 48.90M | 36.64M | 57% | 91% | 2 | 1 | 10 | 18 | [report](2026-10-03+spec-02.md) |
| 2026-10-03 | spec-03 (spec→PR, one session) | 2 | 19 | 32.85M | 35.24M | 48% | 92% | 2 | 2 | 8 | 9 | [report](2026-10-03+spec-03.md) |
| 2026-10-09 | spec-04 (spec→PR→demo, one session) | 6 | 30 | 95.90M | 39.09M | 71% | 92% | 2 | 2 | 16 | 25 | [report](2026-10-09+spec-04.md) |
