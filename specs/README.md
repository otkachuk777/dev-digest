# specs — cross-module feature specs

This folder holds **only** specs for features that touch two or more modules (`client`, `server`, `reviewer-core`, `e2e`, `mcp`). A feature inside one module is specified in that module's own `<module>/specs/`.

Specs are written by the [`spec-creator`](../.claude/agents/spec-creator.md) agent (Spec Driven Development) and read by `implementation-planner` and `plan-verifier`, which trace plan steps and checks to the spec's `AC-N`.

## Naming and numbering

- File: `SPEC-NN-<kebab-slug>.md` — here or in `<module>/specs/`.
- `NN` is numbered **repo-wide** across every `specs/` folder (next = max `Spec ID` + 1, zero-padded to 2 digits). The number in the file name equals `Spec ID`.
- The older `client|server|reviewer-core/specs/README.md` files are legacy specs in a different format. They are kept as-is.

## Lifecycle

`Status: draft → approved → implemented`. `approved` is set only after the user's explicit approval in chat; `implementation-planner` does not plan from a `draft`. `implemented` is set by the main session after `plan-verifier` reports every `AC-N` and `NFR-N` as Met; items that are Not verifiable (e.g. `[verify: manual]`) need the user's confirmation first. A spec that replaces an earlier decision names it in `Supersedes: SPEC-XX (<path>)`, and the earlier spec gets `Superseded by: SPEC-YY (<path>)` so readers of either find the other. The earlier spec stays in place as the record.

## Format

The format is defined in one place, the [`ears-spec`](../.claude/skills/ears-spec/SKILL.md) skill. `spec-creator` writes specs to it, and `implementation-planner`, `test-writer` and `plan-verifier` read specs through it. It defines:

- the template: 9 sections, with `### Traceability` closing *Acceptance criteria*;
- EARS acceptance criteria;
- `US/AC/EC/NFR/OQ` ids and `[verify: unit | it | e2e | manual]` tags on every AC and NFR;
- module-level Mermaid diagrams and contract field tables.

A spec never includes implementation details.

Check a spec's structure with:

```bash
.claude/skills/ears-spec/scripts/spec-lint.sh <path/to/SPEC-NN-slug.md>
```
