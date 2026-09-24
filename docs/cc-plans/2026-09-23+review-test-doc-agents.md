# Plan: test-writer, architecture-reviewer, plan-verifier, doc-writer agents

## Context
Extend the agent set in `.claude/agents/` (branch `L03-lab`) with four agents, and update `README.md`. Prepared by the `planner` agent from 4 parallel `researcher` reports. Conventions from existing agents:
- Frontmatter has `name`, a "Use when/after" `description`, `model`, `tools` and `disallowedTools`.
- Agent files contain no skill names and no `skills:` preload. Skills are resolved via `skill-map.md`, with a fallback over `description`.
- Each agent runs engineering-insights Part A (reads INSIGHTS.md) and never writes to INSIGHTS.md.
- Clarifying questions come back as the agent's output. No git writes.
- Every claim has evidence. The output ends with a "Not found / Not verified" section.

Archive to: `docs/cc-plans/2026-09-23+review-test-doc-agents.md`.

## Insights applied
- Root INSIGHTS: `git add -A` while a subagent runs swallows its work into the commit. Rule: test-writer and implementer never run at the same time.
- Root INSIGHTS: reviewer-core and e2e use npm. New agents pick the package manager from the lockfile.
- `client/INSIGHTS.md:46` (`user-event` is not installed): test-writer never adds dependencies; it reports a missing dev dependency instead.
- `server/INSIGHTS.md:94`: a dependency-cruiser `exclude` can give a false green. Any diff to `.dependency-cruiser.cjs` is an architecture finding.
- `server/INSIGHTS.md:116`: `vendor/shared` copies already drift. Report drift only for touched files; earlier drift goes to "Pre-existing".

## User decisions
- Write scope is enforced by a **frontmatter `hooks:` PreToolUse** on `Write|Edit` (CC sub-agents docs: frontmatter hooks run only while that agent is active).
- Models: architecture-reviewer **opus**, plan-verifier **opus**, test-writer and doc-writer **sonnet**.
- test-writer mutation probe: allowed, with a hash guard.
- doc-writer may also edit root and module `README.md`, and it introduces `docs/adr/` (Nygard).

## Enforcement scripts (new, `.claude/agents/scripts/`)
- `path-guard.sh <tests|docs>`
  - Reads the hook JSON from stdin (`jq`, installed) and takes `tool_input.file_path`, normalized relative to the repo root.
  - Allowed path: `exit 0`. Anything else: a message on stderr and `exit 2`, which blocks the call.
  - Style follows the existing `.claude/skills/pr-self-review/scripts/gate.sh` hook.
  - `tests`: allows `*.test.ts(x)`, `*.it.test.ts`, `*/test/helpers/**`, `*/test/fixtures/**`.
  - `docs`:
    - allows `docs/**`, `*/docs/**`, `README.md` and `*/README.md`;
    - denies `docs/cc-plans/**`, `docs/agent-prompts/**`, `docs/reports/**`, `docs/designs/**`, `*/specs/**`, `e2e/specs-docs/**`, `CLAUDE.md` and `INSIGHTS.md` (deny wins over allow).
- `path-guard.test.sh`: runs the guard on allowed and denied JSON samples for both profiles and asserts the exit codes. This is the one check for a security-boundary script.
- `mutation-probe.sh <file> <line> <replacement> -- <test cmd>`, the only way test-writer changes production code:
  1. Refuses if the file has uncommitted changes.
  2. Records `git hash-object`, applies the one-line change, runs the test and expects red.
  3. Restores the file with `git checkout -- <file>`, checks the hash is unchanged, runs the test and expects green.
  4. Prints a verdict line.
  - It works through Bash, not Edit, so the path guard does not block it.
- Known limit: Bash can still write files. The hook covers Edit/Write only; Bash writes stay prompt-level. Stated in README Permissions.
- Frontmatter for test-writer and doc-writer:
  ```yaml
  hooks:
    PreToolUse:
      - matcher: "Write|Edit"
        hooks:
          - type: command
            command: ".claude/agents/scripts/path-guard.sh docs"   # or: tests
  ```

## Agents

### 1. test-writer (`sonnet`, Read/Grep/Glob/Edit/Write/Bash/Skill; deny Agent, NotebookEdit, Web*)
- Writes only test files (`*.test.ts(x)`, `*.it.test.ts`) and test helpers. It never edits production code, configs, `package.json` or lockfiles.
- It never weakens an assertion. If the code contradicts the spec, the test stays red and is listed under "Suspected bugs".
- Modes: `test-first` (red before implementation), `backfill` (tests for existing code), `per-plan`.
- Boundary with implementer: each test file has one owner per plan. The main session assigns ownership.
- Method:
  - Reads `TESTING.md` and neighbouring tests. Follows where tests actually live: client tests are co-located; server tests are in `server/test/`.
  - Reuses `startPg` and `dockerAvailable` (`server/test/helpers/pg.ts`), `buildApp` (`server/src/app.ts:41`) and `server/src/adapters/mocks.ts`.
  - Resolves skills via skill-map, with the fallback. `server/test/**` has no map row, so its skills are reported as unmapped.
- Proof that each test can fail:
  - `test-first`: the recorded red run.
  - `backfill`: a mutation probe, run only through `scripts/mutation-probe.sh` (never Edit on production files). The path guard `tests` blocks any Edit/Write outside tests.
- Verification in touched modules only. Skipped `.it` tests are reported as skipped, not passed.
- Output:
  - Status and mode
  - Insights and skills used
  - Tests written: file / behaviour / kind / source
  - Fail-proof table
  - Verification table
  - Suspected bugs
  - Not covered / Not verified
  - Handoff

### 2. architecture-reviewer (`opus`, Read/Grep/Glob/Bash; deny Write, Edit, NotebookEdit, Agent, Skill, Web*)
- No `permissionMode: plan`: docs say plan mode is read-only exploration, and the reviewer must run `pnpm arch`. Bash is read-only by prompt.
- Scope: `pr-self-review/scripts/changed-files.sh --all`, a list of files, or the implementer's Handoff.
- 1) Deterministic checks first:
  - `pnpm arch` in server (also covers reviewer-core) and in client.
  - The known-violations baseline did not grow compared with the merge-base.
  - Any `.dependency-cruiser.cjs` diff is a finding.
  - `vendor/shared` drift for touched files only, using the `guards.sh:31-42` logic.
  - Contracts use PascalCase names and snake_case wire fields.
- 2) Then judgement, only on changed lines and new import edges. It `Read`s the mapped skills about placement, dependency direction and boundaries. No security, performance or style.
- Severity: `pr-self-review/references/severity.md` (critical/major/minor, "when in doubt, downgrade"). Findings are marked blocking/non-blocking; minor = "Nit:". A critical needs `file:line` plus a scenario.
- Output:
  - Verdict
  - Scope
  - Deterministic checks table
  - Findings table: severity / blocking / file:line / rule / source / evidence / why / suggested direction
  - Pre-existing
  - Unknown (insufficient evidence)
  - Out of scope for security
  - Not verified
- Does not check the change against the plan; that is plan-verifier's job.

### 3. plan-verifier (`opus`, same tools as architecture-reviewer)
- Input: a plan (required) + optionally the task, `specs/`, the implementation report, and the diff base (default merge-base main).
- Method:
  1. Extract items R1..Rn from Steps (Files/Change/Done when), Test plan, Constraints, Out of scope and Context. Each item links back to its source line.
  2. Choose a verification method per item (inspection / test / analysis / demonstration) and collect evidence.
  3. Run all Verify and Test-plan commands itself; the implementer's report is not trusted.
  4. Grade the outcome, not the path.
  5. Out-of-scope check: changed files minus the plan's Files.
- Statuses: Met / Partially met / Not met / Not verifiable. This is a practitioner convention, not a standard. Anything unproven is Not verifiable, never Met. No generic advice.
- Output:
  - Summary
  - Traceability table: ID / item (source) / method / status / evidence
  - Verify commands table
  - Out-of-scope changes
  - Reported vs actual deviations
  - Not verifiable / Not verified

### 4. doc-writer (`sonnet`, Read/Grep/Glob/Edit/Write/Bash/Skill; deny Agent, NotebookEdit, Web*)
- Where it writes:
  - `docs/architecture.md`: cross-module content.
  - `<module>/docs/README.md`: module internals or an end-to-end feature, following the pattern at `client/docs/README.md:90`.
  - A new `docs/<topic>.md` or `<module>/docs/<topic>.md` only for a large topic, linked from the parent doc.
- Where it never writes:
  - `docs/cc-plans/`, `docs/agent-prompts/`, `docs/reports/`, `docs/designs/`
  - `*/specs/`, `e2e/specs-docs/`
  - `CLAUDE.md`, `INSIGHTS.md`
  - code
  - Enforced by `path-guard.sh docs`.
- Also allowed:
  - root and module `README.md` (API-map diagrams, links to new docs);
  - `docs/adr/NNNN-kebab-title.md` in Nygard format (Title / Status / Context / Decision / Consequences), only for a decision with trade-offs. Each ADR links to its source `docs/cc-plans/` plan, so the plan stays the full record and the ADR is the short decision log. doc-writer creates `docs/adr/README.md` (index) with the first ADR. Numbers are never reused; a superseded ADR is marked, not deleted.
- Documents only what the code shows; every claim needs `file:line`. Plan items with no match in the code go to "Plan items not found in code".
- Diátaxis: explanation + reference by default.
- The diagram skill is found by description (unmapped). Diagrams: ```mermaid blocks at C4 Container/Component level; every node maps to a real file.
- Updates existing sections instead of duplicating, and links rather than copies. Google dev style.
- Output:
  - Files and sections written
  - Diagrams
  - Claims → evidence table
  - Plan items not found in code
  - Suggested README links
  - Not verified (always "Mermaid not validated": `mmdc` is not installed)

### 5. README.md
Add 4 rows to each table: Catalog, Permissions, Inputs/outputs.
- Workflow: researcher → planner → [test-writer test-first] → implementer → [test-writer backfill] → architecture-reviewer ‖ plan-verifier ‖ (security review, future) → fixes → doc-writer → commit + `/engineering-insights`. Rule: test-writer and implementer never run in parallel.
- Skills section: reviewers `Read` skills and do not invoke them; backend tests are unmapped; doc-writer is the only user of the diagram skill.
- Sources section: new rows (below), marking secondary sources.

## Sources (rule → agent)
| Source | Rule | Agent |
|---|---|---|
| [CC best practices](https://code.claude.com/docs/en/best-practices) — adversarial review | fresh context, diff vs plan, every requirement, nothing out of scope, "gaps not style", reviewer over-reports | plan-verifier, architecture-reviewer |
| same — verify / tests | runnable check, evidence; one Claude writes tests, another writes code | test-writer, plan-verifier |
| [CC sub-agents](https://code.claude.com/docs/en/sub-agents) | tools/disallowedTools; plan mode = read-only; frontmatter `hooks` (PreToolUse); `permissions.deny` is session-wide | all |
| [Anthropic: Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | "Unknown" way out; per-dimension rubric; grade outcome, not path | plan-verifier, architecture-reviewer |
| [CC /goal](https://code.claude.com/docs/en/goal) | single-condition evaluator ≠ per-item traceability | plan-verifier (boundary) |
| [INCOSE requirements mgmt](https://www.incose.org/docs/default-source/Working-Groups/infrastructure-wg-documents/003-requirements-management-pamphlet.pdf); ReqView RTM (secondary) | each requirement has a verification method and traceable evidence | plan-verifier |
| [Testing Library priority](https://testing-library.com/docs/queries/about/#priority); [Kent C. Dodds](https://kentcdodds.com/blog/testing-implementation-details) | test behaviour, query priority, no implementation details | test-writer |
| [Vitest mocking](https://vitest.dev/guide/mocking.html) | vi.mock hoisting, internal calls not mocked, restore mocks | test-writer |
| [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/) | `inject()` against the built app | test-writer |
| [Stryker](https://stryker-mutator.io/docs/) | a test must fail on broken code | test-writer |
| [How Anthropic teams use CC](https://claude.com/blog/how-anthropic-teams-use-claude-code) | generator / validator split | test-writer |
| [Uncle Bob Dependency Rule](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html); [Palermo Onion](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) | dependencies point inward | architecture-reviewer |
| Building Evolutionary Architectures ch.2 (fitness functions); [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | deterministic check first; rule severities | architecture-reviewer |
| [Google eng-practices comments](https://google.github.io/eng-practices/review/reviewer/comments.html); Conventional Comments (secondary) | "Nit:" labels, blocking / non-blocking | architecture-reviewer |
| [Diátaxis](https://diataxis.fr/); [Write the Docs docs-as-code](https://www.writethedocs.org/guide/docs-as-code/) | doc type; docs in the repo, reviewed as code | doc-writer |
| [GitHub Mermaid](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams); [C4](https://c4model.com/) | ```mermaid blocks; Container/Component level | doc-writer |
| [Google dev style](https://developers.google.com/style); [CC memory](https://code.claude.com/docs/en/memory) | style; CLAUDE.md is instructions, not docs | doc-writer |

## Verification
- Every `.claude/agents/*.md` starts with `---`, and `name` equals the filename.
- `grep` finds no project skill names in the 4 new files.
- `bash .claude/skills/pr-self-review/scripts/gate.test.sh` is green.
- `bash .claude/agents/scripts/path-guard.test.sh` is green: each profile allows its allowed paths and denies the rest.
- `mutation-probe.sh` on a real server helper plus its test: the verdict is "red then green", `git status` is clean afterwards, and a file with uncommitted changes is refused.
- In a new session: doc-writer tries to write `server/src/x.ts` and the hook blocks it.
- In a new session, all 7 agents are visible. Dry runs:
  - plan-verifier on `docs/cc-plans/2026-09-22+planner-implementer-agents.md`
  - architecture-reviewer on the branch
  - test-writer backfill on a small helper; `git status` shows only test files
- One commit on `L03-lab` together with this plan.

## Risks
- implementer.md and `reviewer-core/CLAUDE.md` say `pnpm` for reviewer-core, while INSIGHTS and TESTING.md say npm. Separate fix, out of scope.
- `planner.md` uses `permissionMode: plan`, which the docs call read-only exploration. Its read-only `git log` may be blocked. Worth checking in a dry run.
