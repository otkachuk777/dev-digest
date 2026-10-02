# Workflow retros

One row per `/workflow-retro` run ([skill](../../.claude/skills/workflow-retro/SKILL.md)). Processed = input + cache read + cache write + output summed over API calls. Compare rows of the same kind to see whether an applied proposal moved its metric.

| date | run | sessions | agents | processed main | processed sub | orchestrator % | cache hit (sub, weighted) | review rounds | plan-verifier runs | interventions | errors | report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01 | spec-01 (spec+plan only) | 1 | 5 | 4.14M | 12.08M | 26% | 93% | 0 | 0 | 6 | 14 | [report](2026-10-01+spec-01.md) |
