---
name: ears-spec
description: Use when writing, reading, planning from, testing against or verifying a feature spec (SPEC-NN-<slug>.md in <module>/specs/ or specs/) — the Spec Driven Development template, EARS acceptance criteria, US/AC/EC/NFR/OQ ids, [verify:] tags, the Traceability table, workflow/communication diagrams and contract tables. Also use to lint a spec with scripts/spec-lint.sh. Single source of the spec format for spec-creator, implementation-planner, test-writer and plan-verifier.
---

# EARS spec format (DevDigest SDD)

A spec says **what** the system must do and which interfaces modules agree on — never **how** it is built. It is the contract between the user, `spec-creator` (writes it), `implementation-planner` (plans from it), `test-writer` (tests from it) and `plan-verifier` (verifies against it).

Where specs live, numbering and lifecycle: [`specs/README.md`](../../../specs/README.md).

## Template

English. Exactly these parts, in this order, with these headings (`###` subsections are free):

```markdown
# Spec: <feature name>
Spec ID: SPEC-NN
Status: draft | approved | implemented
Supersedes: <SPEC-XX (path) — what it replaces> | none
Superseded by: SPEC-YY (path)            ← only once a newer spec replaces this one

## Problem and user
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
### Traceability
## Edge cases
## Non-functional requirements
## Inputs and provenance
## Untrusted inputs
## Open questions
```

## Ids and line formats

Every requirement is one bullet that starts with its bold id. Ids are unique in the spec and never renumbered once the spec is `approved` (a removed id is struck through, not reused).

| Section | Line format |
|---|---|
| User stories | `- **US-N:** As a <role>, I want <capability>, so that <outcome>.` |
| Acceptance criteria | `- **AC-N:** <one EARS sentence>. [verify: …]` |
| Edge cases | `- **EC-N:** <trigger> → <expected behavior>` — references an `AC-N` or is itself an EARS sentence |
| Non-functional requirements | `- **NFR-N:** <measurable requirement, EARS form preferred>. [verify: …]` |
| Open questions | `- **OQ-N:** <question> — owner: user — blocking: yes/no — from Q<n>` or `None` |

`[verify: unit | it | e2e | manual]` — the test layer that proves the requirement (several allowed: `[verify: unit, e2e]`):
- `unit` — pure logic / component test (client co-located, server & reviewer-core `test/`);
- `it` — server integration with Postgres (`*.it.test.ts`);
- `e2e` — user flow in `e2e/flows/`;
- `manual` — cannot be automated reasonably (visual quality, third-party UI); say how it is checked.

## Section rules

- **Problem and user** — who (role in DevDigest), the pain today, why now. Cross-module spec: list the modules. Use the domain terms of `docs/architecture.md` (run, review, finding, agent, verdict, blast radius…) — no synonyms.
- **Goals / Non-goals** — bullets; Non-goals explicit (what a reader might expect but is out).
- **User stories** — end with `### Workflow` (Mermaid) when the feature has a multi-step flow or a lifecycle.
- **Acceptance criteria (EARS)** — one EARS pattern per AC, exactly one `shall`; observable outcome (UI state, response, stored value, message) with concrete values. Group under `US-N` where useful. End the section with `### Traceability`.
- **Edge cases** — empty/error/limits/concurrency/permission outcomes of the design analysis.
- **Non-functional requirements** — measurable: latency/timeouts (p95, seconds), size limits, pagination, LLM cost (tokens/$ per run), accessibility (WCAG 2.2 AA, keyboard path, focus, ARIA), i18n (all copy in the message namespace), observability (what is logged). Every NFR has `[verify: …]`.
- **Inputs and provenance** — table `| Input | Source (user / GitHub API / LLM / DB / FS / config / env) | Via (module + existing contract/endpoint/tool) | Trust (trusted / untrusted) |`, then `### Communication` and `### Contracts` when modules talk (below).
- **Untrusted inputs** — every `untrusted` row: the risk (XSS, injection, prompt injection, oversize, path traversal, SSRF) and the required handling as a testable statement, referencing an `AC-N`/`NFR-N`.
- **Open questions** — every unresolved point; `None` if empty. A `blocking: yes` question stops planning.

## EARS

Triggers in capitals; `shall` marks a mandatory requirement. The subject is the system or a named module (`the client`, `the server`).

| Pattern | Form | Example |
|---|---|---|
| Ubiquitous | The system shall … | The system shall log every authentication attempt. |
| Event-driven | WHEN <trigger>, the system shall … | WHEN the user submits the login form, the system shall validate the credentials. |
| State-driven | WHILE <state>, the system shall … | WHILE synchronisation is in progress, the system shall show progress. |
| Unwanted behavior | IF <unwanted condition>, THEN the system shall … | IF validation fails three times within 60 seconds, THEN the system shall temporarily lock the account. |
| Optional feature | WHERE <feature is enabled>, the system shall … | WHERE MFA is enabled, the system shall require a TOTP code after the password. |

Vague → testable:
- "Should work fine on large repositories" → WHEN the repository exceeds the indexing threshold, the system shall build the overview from deterministic facts only, without reading every file in full.
- "Should not crash if the model is unavailable" → IF the structured model call fails, THEN the system shall show the deterministic overview with the degradation reason.
- "Should suggest where to start reading" → The system shall order the reading path by file rank in the import graph.

Banned without a number: fast, quickly, slow, properly, correctly, user-friendly, reasonable, appropriate, intuitive, seamless, efficient, robust, easy, as needed, etc.

## Traceability

`### Traceability` closes the Acceptance criteria section. One row per user story; every `US-N` and every `AC-N` appears at least once:

```markdown
| US | AC | EC | NFR | Verify |
|---|---|---|---|---|
| US-1 | AC-1, AC-2 | EC-1 | NFR-1 | e2e, unit |
```

Consumers: `implementation-planner` plans only from an `approved` spec and maps every AC to a plan step's "Done when" or the Test plan; `test-writer` writes `[verify: unit | it]` tests test-first, before the behavior, and `[verify: e2e]` flows after it, naming each after the AC it pins (`AC-3: escapes formula cells`); `plan-verifier` gives every AC its own Met / Not met line using the `[verify:]` layer as the method.

## Diagrams and contracts

Only when they carry information the text does not; a one-screen, one-module feature usually needs none. Mermaid syntax: `.claude/skills/mermaid-diagram/SKILL.md`.

- **Workflow** (under *User stories*): `flowchart` for a user flow with branches, `stateDiagram-v2` for a lifecycle. Nodes are user actions and visible states, not functions. Label each branch/error edge with its `AC-N`/`EC-N`.
- **Communication** (under *Inputs and provenance*): `sequenceDiagram`, participants at module/service level — `User`, `client`, `server`, `reviewer-core`, `mcp`, `DB`, `GitHub API`, `LLM`. Messages name the endpoint / MCP tool / event and sync vs async; include the failure path (`alt`/`opt`) the user can observe. Paths must respect the module boundaries in `docs/architecture.md`, `mcp/CLAUDE.md` and `.claude/skills/onion-architecture/SKILL.md` (e.g. reviewer-core does no HTTP/DB/GitHub I/O of its own — the server calls it; mcp reaches data only through the server's HTTP API).
- **Contracts** (under *Inputs and provenance*): one block per new or changed interface — header `METHOD /path` | MCP tool | event, direction, `new | changed (existing: <contract name>)`, then:

  | Field (wire, snake_case) | Type | Required | Meaning / constraints |
  |---|---|---|---|
  | `findings_counts` | object<severity, int ≥ 0> | yes | per-severity count from each agent's latest run |

  Then error responses (status / error code → when → what the user sees). No Zod/TypeScript code, no JSON examples. Unchanged contracts are only named. A `changed` interface states breaking / non-breaking and what existing consumers see (`docs/api-contract-skills/`).

**Never in a spec:** file names, classes, functions, libraries, DB table layouts, schema code, ring placement.

## Lint

```bash
.claude/skills/ears-spec/scripts/spec-lint.sh <path/to/SPEC-NN-slug.md>
```

Read-only; prints `OK <path>` or `ERROR <line>: <msg>` lines (exit 1). Checks: header and `Spec ID` (unique repo-wide), the sections in order, `### Traceability` covering every US/AC, one EARS form + one `shall` + `[verify:]` per AC, `[verify:]` per NFR, vague words without a number, undefined/duplicate ids, EC → AC links, mermaid diagram types, non-empty Open questions / Untrusted inputs. Self-check: `scripts/spec-lint.test.sh`.

What the lint cannot judge (read the spec): whether ACs are observable and complete, whether the diagrams match the ACs, whether implementation details slipped in, whether every design gap became an AC, EC or OQ.
