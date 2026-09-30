# specs — cross-module feature specs

This folder holds **only** specs for features that touch two or more modules (`client`, `server`, `reviewer-core`, `e2e`, `mcp`). A feature inside one module is specified in that module's own `<module>/specs/`.

Specs are written by the [`spec-creator`](../.claude/agents/spec-creator.md) agent (Spec Driven Development) and read by `implementation-planner` and `plan-verifier`, which trace plan steps and checks to the spec's `AC-N`.

## Naming and numbering

- File: `SPEC-NN-<kebab-slug>.md` — here or in `<module>/specs/`.
- `NN` is numbered **repo-wide** across every `specs/` folder (next = max `Spec ID` + 1, zero-padded to 2 digits). The number in the file name equals `Spec ID`.
- The older `client|server|reviewer-core/specs/README.md` files are legacy specs in a different format. They are kept as-is.

## Lifecycle

`Status: draft → approved → implemented`. A spec that replaces an earlier decision names it in `Supersedes: SPEC-XX (<path>)`. The earlier spec stays in place as the record.

## Template

```markdown
# Spec: <feature name>
Spec ID: SPEC-NN
Status: draft | approved | implemented
Supersedes: <SPEC-XX (path) — what it replaces> | none

## Problem and user
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
## Edge cases
## Non-functional requirements
## Inputs and provenance
## Untrusted inputs
## Open questions
```

Acceptance criteria use EARS (Easy Approach to Requirements Syntax). Write each AC in exactly one of these five forms. `shall` marks a mandatory requirement:

- Ubiquitous: `The system shall …`
- Event-driven: `WHEN <trigger>, the system shall …`
- State-driven: `WHILE <state>, the system shall …`
- Unwanted behavior: `IF <condition>, THEN the system shall …`
- Optional feature: `WHERE <feature is enabled>, the system shall …`

The full per-section rules and the design-analysis checklist are in the agent's prompt.
