# Agents

Project subagents for Claude Code. Each file here is the source of truth for its agent; this README is only a map — roles, permissions, inputs/outputs and where the rules come from.

## Catalog

| Agent | Model | Responsibility | Writes |
|-------|-------|----------------|--------|
| [spec-creator](spec-creator.md) | opus | Turns a feature idea + design sources into an SDD spec (EARS ACs); asks the user about design gaps, corner cases, module interaction and UX first | spec files only (`<module>/specs/SPEC-*.md`, `specs/SPEC-*.md`) |
| [researcher](researcher.md) | sonnet | Answers a concrete question with evidence — from this repo or from external sources | nothing |
| [brainstorm](brainstorm.md) | opus | Compares at least three options for one technical decision before planning; recommendation with evidence and confidence | nothing |
| [implementation-planner](implementation-planner.md) | opus | Turns a SPEC (or a purely technical task) into a Development Plan that follows module rules, INSIGHTS.md and project skills; reviews the requirements, asks what is unclear and single vs parallel execution; never writes specs | draft plan file only (`~/.claude/plans/*.md`) |
| [implementer](implementer.md) | sonnet | Executes an approved plan in client / server / reviewer-core and verifies its own changes | code |
| [test-writer](test-writer.md) | sonnet | Writes UI and backend tests (test-first or backfill) and proves each one can fail | tests only |
| [architecture-reviewer](architecture-reviewer.md) | opus | Checks architectural boundaries of a change: deterministic checks first, then judgement; findings with evidence | nothing |
| [security-reviewer](security-reviewer.md) | opus | Finds exploitable vulnerabilities in a change: audit + secret scan first, then source → sink → attack path per finding | nothing |
| [plan-verifier](plan-verifier.md) | sonnet | Checks finished code against every plan item and requirement; status + evidence per item | nothing |
| [doc-writer](doc-writer.md) | sonnet | Documents implemented functionality with Mermaid diagrams and ADRs, verified against code | docs only |

Out of scope for every agent: git commits, writing `INSIGHTS.md`.

## Workflow

```
task ──► spec-creator (⇄ user via main session) ──► SPEC-NN
      ──► researcher (optional, facts) ──► brainstorm (optional, options)
                                      ──► implementation-planner ──► Development Plan
                                                        │  it writes it (path-guard plans):
                                                        │  ~/.claude/plans/ → docs/cc-plans/ after approval
                                                        ▼
                              [test-writer: test-first] ──► implementer ──► [test-writer: backfill]
                                          (parallel mode: Group 0, then implementer ×N, one worktree per group)
                                                                                   │
                                   ┌───────────────────────────┬───────────────────┴──────────────┐
                                   ▼                           ▼                                  ▼
                        architecture-reviewer            plan-verifier                 security-reviewer
                                   └───────────── gaps / findings ──► implementer ◄───────────────┘
                                                        │ clean
                                                        ▼
                                  doc-writer ──► main session commits + /engineering-insights
```

- spec-creator iterates through the main session: Round 1 returns a Discovery report (gaps, corner cases, module interactions, UX, numbered questions with options) and writes nothing → main asks the user with `AskUserQuestion` → answers go back via `SendMessage` → Round 2+ writes or updates the spec. implementation-planner and plan-verifier trace to its `AC-N`.
- implementation-planner never writes or changes a spec: a new feature without a SPEC, a blocking `OQ-N` or a missing execution mode (`single` | `parallel`) comes back as questions, not a plan. In `parallel` mode the plan splits steps into groups with disjoint file ownership; the main session runs one implementer per group (`isolation: "worktree"`) and merges in the plan's order.
- Every agent asks clarifying questions (returned as its answer) instead of working on a vague task — subagents cannot use `AskUserQuestion`.
- test-writer and implementer never run in parallel on the same working tree; each test file has one owner per plan.
- The reviewers are independent and can run in parallel; none of them fixes anything.
- brainstorm compares **technical** options only; product and scope decisions stay in the main session's interactive brainstorming with the user.

## Permissions

| Agent | Allowed tools | Denied | Enforcement |
|-------|---------------|--------|-------------|
| spec-creator | Read, Grep, Glob, Bash, Write, Edit, WebFetch, Playwright (view-only subset) | Agent, NotebookEdit, Skill, WebSearch | **Hooks** `readonly-bash-guard.sh` (Bash), `path-guard.sh specs` (Write/Edit only `SPEC-NN-<slug>.md` in `<module>/specs/` or `specs/`), `browser-url-guard.sh` (Playwright tool allowlist; URLs only localhost / 127.0.0.1 / *.figma.com). WebFetch only for caller-given URLs (by prompt) |
| researcher | Read, Grep, Glob, Bash, WebSearch, WebFetch | Write, Edit, NotebookEdit, Skill | **Hook** `readonly-bash-guard.sh`; `Skill` denied → no `/deep-research` |
| brainstorm | Read, Grep, Glob, Bash, WebSearch, WebFetch | Write, Edit, NotebookEdit, Agent, Skill | **Hook** `readonly-bash-guard.sh`; no `permissionMode: plan` (no agent uses it since `adc2fa7`) |
| implementation-planner | Read, Grep, Glob, Bash, Write | Edit, NotebookEdit, Agent, WebSearch, WebFetch | **Hooks** `readonly-bash-guard.sh` (Bash) and `path-guard.sh plans` (Write only to `~/.claude/plans/<name>.md`) |
| implementer | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent, NotebookEdit, WebSearch, WebFetch | No git writes, no do-not-touch files, never regenerates the dependency-cruiser baseline (by prompt) |
| test-writer | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent, NotebookEdit, WebSearch, WebFetch | **Hook** `path-guard.sh tests`: Edit/Write only on test files; production code only via `mutation-probe.sh` |
| architecture-reviewer | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, Agent, Skill, WebSearch, WebFetch | **Hook** `readonly-bash-guard.sh`; no `permissionMode: plan` because it must run checks |
| security-reviewer | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, Agent, Skill, WebSearch, WebFetch | **Hook** `readonly-bash-guard.sh` (allows `pnpm/npm audit`, denies `audit fix`) |
| plan-verifier | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, Agent, Skill, WebSearch, WebFetch | **Hook** `readonly-bash-guard.sh` (also allows the plan's own Verify commands) |
| doc-writer | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent, NotebookEdit, WebSearch, WebFetch | **Hook** `path-guard.sh docs`: Edit/Write only in `docs/`, `<module>/docs/`, READMEs; never plans, prompts, specs, `CLAUDE.md`, `INSIGHTS.md` |

- "By prompt" = instruction, not a technical block. Hooks are declared in the agent's frontmatter and run only while that agent is active.
- Hooks cover Edit/Write (`path-guard.sh`) and now Bash (`readonly-bash-guard.sh`, pattern-matched — not a sandbox) for the read-only agents; session-wide `permissions.deny` would also block the main session and implementer, so it is not used.

### Scripts ([scripts/](scripts/))

| Script | Used by | What it does |
|--------|---------|--------------|
| `path-guard.sh <tests\|docs\|plans\|specs>` | test-writer, doc-writer, implementation-planner, spec-creator (PreToolUse hook) | Denies Edit/Write outside the profile's paths; also denies paths outside the repo (except `plans`: only `~/.claude/plans/<name>.md`) and `..` segments |
| `path-guard.test.sh` | maintainers | Self-check: allowed paths pass, protected paths are denied |
| `browser-url-guard.sh` | spec-creator (PreToolUse hook, matcher `mcp__plugin_playwright_playwright__.*`) | Denies Playwright tools outside the view-only allowlist, navigation outside localhost / 127.0.0.1 / *.figma.com, and screenshot filenames with a path |
| `browser-url-guard.test.sh` | maintainers | Self-check: allowed tools/URLs pass, others (evil hosts, `localhost@evil`, `file:`, form filling, evaluate) are denied |
| `readonly-bash-guard.sh` | researcher, brainstorm, implementation-planner, spec-creator, architecture-reviewer, security-reviewer, plan-verifier (PreToolUse hook, matcher `Bash`) | Denies write-shaped Bash commands (redirection to a file, `rm`/`mv`/`cp`/`touch`/`mkdir`/`chmod`, `sed -i`, mutating `git` subcommands, `npm/pnpm install` (also with global flags before it, e.g. `--prefix`, `-C`), `npm/pnpm audit fix`, `db:migrate`/`db:generate`; `git branch` is denied with a `git for-each-ref` hint); still allows `grep`, `cat`, `git diff/log/show/status`, `pnpm typecheck/test/arch`, `npm test`/`run typecheck`, `diff -r`, `ls`, `find` without `-delete`/`-exec rm` |
| `readonly-bash-guard.test.sh` | maintainers | Self-check: read-only commands pass, write-shaped commands are denied |
| `mutation-probe.sh <file> <line> <replacement> -- <cmd>` | test-writer | Mutates one line of a committed file, expects red, restores from git, verifies the hash, expects green. Refuses files with uncommitted changes |

## Inputs and outputs

| Agent | Input | Reads | Output |
|-------|-------|-------|--------|
| spec-creator | Feature description + design sources (text, `docs/designs/*.html`, images, Figma / localhost URLs, code); later rounds: user's answers | Root + module `CLAUDE.md` / `INSIGHTS.md`, existing `SPEC-*`, `vendor/shared/contracts`, touched code, design sources | Round 1: **Discovery report** (Understanding · Placement · Sources · Design gaps · Corner cases · Module interactions · UX improvements · Questions with options + recommendation). Round 2+: **spec file** + path, ≤10-line summary, open questions |
| researcher | A concrete question | Repo code, git history / docs, specs, issues | Report: Answer · Findings with evidence · Links / Sources · Contradictions (external) · **Not found** · Open questions |
| brainstorm | One technical decision + constraints + consumer (optionally a researcher report) | Code, `INSIGHTS.md`, external prior art | **Brainstorm**: Decision · Insights read · Context & drivers · Criteria (weights) · Considered options (≥3 incl. do-nothing; pros/cons with evidence, pre-mortem, reversibility, reuse) · Comparison matrix · Recommendation + confidence · Open questions · Not found |
| implementation-planner | SPEC path (or a purely technical task) + execution mode `single` / `parallel` | Root + module `CLAUDE.md`, the SPEC, `INSIGHTS.md`, code to change, `skill-map.md`, current `SKILL.md` (+ relevant sub-files) | **Plan file** in `~/.claude/plans/` + final message = path, ≤10-line summary, risks (the plan is never pasted into chat). Without a SPEC / mode or with blocking `OQ-N` → **questions** (Clarifying questions · Execution mode · Proposed interpretation), no file. Plan sections: Context · Requirements · Requirements review · Scope · Execution mode · Insights applied · Constraints · Skills for implementer · Steps (Covers / Files / Skills / Change / Verify / Done when) · Test plan · Risks · Not verified |
| implementer | Approved Development Plan | `INSIGHTS.md`, skills via `Skill`, code | **Implementation report**: Status · Insights read · Steps + skills applied · Verification evidence · Deviations · Not done · Insight candidates · Handoff for reviewers |
| test-writer | Mode (test-first / backfill / per-plan) + plan step, spec or code | `TESTING.md`, neighbouring tests, `INSIGHTS.md`, skills via `Skill` | **Test report**: Status · Tests written · Fail-proof (red run / probe KILLED) · Verification · Suspected bugs · Not covered · Handoff |
| architecture-reviewer | Diff scope (default: branch vs main) or implementer's handoff | `pnpm arch` output, baseline + cruiser config diff, `vendor/shared` copies, boundary skills (read, not invoked) | **Architecture review**: Verdict · Deterministic checks · Findings (severity, blocking, rule + source, evidence) · Pre-existing · Unknown · Out of scope for security · Not verified |
| security-reviewer | Diff scope (default: branch vs main), a ref range or implementer's handoff | `pnpm/npm audit`, secret regex on the diff, security skills (read, not invoked), prompt-assembly code | **Security review**: Verdict · Insights read · Deterministic checks · Findings (severity, blocking, OWASP / LLM id, source, sink, attack path, confidence) · Pre-existing · Unknown · Out of scope — for architecture review · Skills used · Not verified |
| plan-verifier | Plan (required) + requirements / specs / implementation report | Plan, code, re-run Verify commands, changed files | **Plan verification**: Summary · Traceability (Met / Partially met / Not met / Not verifiable + evidence) · Verify commands · Out-of-scope changes · Unreported deviations |
| doc-writer | Feature + plan / reports / notes | Code (claims checked against it), target docs, module `CLAUDE.md` "Read when", diagram skill | **Documentation report**: Written sections · Diagrams · Claims → evidence · Plan items not found in code · Suggested links · Not verified |

## How agents use skills

- Skills are resolved at run time the same way everywhere: [`pr-self-review/references/skill-map.md`](../skills/pr-self-review/references/skill-map.md) (file glob → skills) plus a fallback over every `SKILL.md` `description` — so plan, code, tests and review follow the same rules.
- Agent files contain no skill names, rules or `skills:` preload: adding, renaming or editing a skill needs no agent change. Renamed/removed mapped skills are caught by `pr-self-review/scripts/gate.test.sh`; unmapped skills in use are reported in the output.
- implementer and test-writer **invoke** skills (`Skill`); the reviewers only **read** them (`Skill` denied) and architecture-reviewer keeps only boundary/placement skills. Backend test paths have no map row → test-writer reports those skills as unmapped.
- The generic TypeScript skill is deliberately unmapped (too noisy per file); implementation-planner names it in a step only for type-level work. doc-writer is the only agent that uses the diagram skill.
- Workflow skills (PR gating, session insights) are not rule sources. `engineering-insights`: every agent does only Part A (read); the main session does the wrap-up.

## Sources

Official Claude Code / Anthropic (checked 2026-09-22/23):

| Source | Rule | Applied in |
|--------|------|-----------|
| [Subagents](https://code.claude.com/docs/en/sub-agents) | `description` drives delegation — say when to use the agent | all frontmatter |
| | `tools` = allowlist, `disallowedTools` = denylist; omit/deny `Agent` to stop nesting | all frontmatter |
| | `permissionMode: plan` = read-only exploration | no agent (planner, now implementation-planner, dropped it in `adc2fa7`; read-only agents use the Bash hook) |
| | Without `skills:`, a subagent discovers skills through the `Skill` tool | implementer, test-writer, doc-writer |
| | Frontmatter `hooks` run only while that agent is active | test-writer, doc-writer path guards |
| | `AskUserQuestion` unavailable; only a summary returns | clarifying questions + structured outputs |
| | Per-command Bash limits need session-wide `permissions.deny` | not applied — prompt rule (see Permissions) |
| [Best practices](https://code.claude.com/docs/en/best-practices) | Explore → Plan → Implement → Commit | implementation-planner / implementer split |
| | Give a runnable check; show evidence, not claims | Verify per plan step; evidence tables in every report |
| | One Claude writes tests, another writes code | test-writer separate from implementer |
| | Adversarial review in a fresh subagent: diff vs plan, every requirement, nothing out of scope, "gaps, not style" | plan-verifier, architecture-reviewer |
| | Reviewers over-report — flag only gaps that affect correctness or stated requirements | reviewers' "rule or it is not a finding", Unknown section |
| [Skills](https://code.claude.com/docs/en/skills) | Progressive disclosure; `description` decides use; edits apply live | skill sub-files read on demand, fallback discovery, no copied rules |
| [Memory](https://code.claude.com/docs/en/memory) | `CLAUDE.md` is instructions, not documentation | doc-writer never writes `CLAUDE.md` |
| [/goal](https://code.claude.com/docs/en/goal) | Single-condition Met / Not yet met / Impossible evaluator | plan-verifier is per-item instead |
| [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | Give the judge an "unknown" way out; per-dimension rubric; grade outcome, not path | plan-verifier statuses, reviewer Unknown section |
| [How Anthropic teams use Claude Code](https://claude.com/blog/how-anthropic-teams-use-claude-code) | Generator / validator split | test-writer, reviewers |

Testing, architecture, documentation:

| Source | Rule | Applied in |
|--------|------|-----------|
| [Testing Library — query priority](https://testing-library.com/docs/queries/about/#priority) | Test like the user: role / label / text, test ids last | test-writer |
| [Kent C. Dodds — Testing implementation details](https://kentcdodds.com/blog/testing-implementation-details) | Implementation-detail tests break on refactors and miss real bugs | test-writer |
| [Vitest — Mocking](https://vitest.dev/guide/mocking.html) | `vi.mock` is hoisted, does not intercept same-module calls; restore mocks | test-writer |
| [Fastify — Testing](https://fastify.dev/docs/latest/Guides/Testing/) | `inject()` against the built app instead of a listening server | test-writer |
| [Stryker — mutation testing](https://stryker-mutator.io/docs/) | A test that passes on a mutant does not pin that code | `mutation-probe.sh` |
| Community TDD-with-Claude guides (secondary) | Do not modify tests to make them pass | test-writer |
| [Uncle Bob — The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) · [Palermo — Onion Architecture](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) | Dependencies point inward only | architecture-reviewer |
| *Building Evolutionary Architectures*, ch. 2 · [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | Automated fitness functions first, judgement second | architecture-reviewer deterministic step |
| [Google eng-practices — review comments](https://google.github.io/eng-practices/review/reviewer/comments.html) · Conventional Comments (secondary) | Label severity ("Nit:"), blocking vs non-blocking | architecture-reviewer |
| [INCOSE — requirements management](https://www.incose.org/docs/default-source/Working-Groups/infrastructure-wg-documents/003-requirements-management-pamphlet.pdf) · ReqView RTM (secondary) | Every requirement has a verification method and traceable evidence | plan-verifier (statuses are a practitioner convention, not a standard) |
| [Diátaxis](https://diataxis.fr/) | Tutorial / how-to / reference / explanation — don't mix | doc-writer |
| [Write the Docs — docs as code](https://www.writethedocs.org/guide/docs-as-code/) | Docs in the repo, reviewed like code | doc-writer |
| [Nygard — Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) | ADR: Title / Status / Context / Decision / Consequences, numbered, never rewritten | doc-writer `docs/adr/` |
| [GitHub — Mermaid diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams) · [C4 model](https://c4model.com/) | ` ```mermaid ` renders on GitHub; container/component level | doc-writer |
| [Google developer style guide](https://developers.google.com/style) | Second person, present tense, cross-reference instead of duplicating | doc-writer |

Option comparison and security review (checked 2026-09-27):

| Source | Rule | Applied in |
|--------|------|-----------|
| [MADR 4.0](https://adr.github.io/madr/) · [MADR primer](https://www.ozimmer.ch/practices/2022/11/22/MADRTemplatePrimer.html) | Decision drivers, Considered Options, Pros and Cons per option | brainstorm output |
| [ATAM (SEI)](https://www.sei.cmu.edu/documents/629/2000_005_001_13706.pdf) | Sensitivity and trade-off points | brainstorm Step 5 |
| [Klein — pre-mortem](https://www.gary-klein.com/premortem) | "It failed — why?" before choosing | brainstorm per option |
| [Farnam Street — reversible decisions](https://fs.blog/reversible-irreversible-decisions/) | One-way vs two-way door sets how much evidence a choice needs | brainstorm criterion |
| [Anthropic — how we contain Claude](https://www.anthropic.com/engineering/how-we-contain-claude) | Ground claims in evidence against sycophancy | brainstorm hard rules |
| superpowers `brainstorming` skill (local plugin) | Interactive, human-gated; "2–3 approaches, lead with a recommendation, YAGNI" | brainstorm boundary (not duplicated) |
| [anthropics/claude-code-security-review](https://github.com/anthropics/claude-code-security-review) | Exploitability confidence threshold, false-positive exclusions (DoS, rate limits, speculative) | security-reviewer gate + exclusions |
| [OWASP Top 10:2025](https://top10.owasp.org/2025) | Web categories A01–A10 (still current in 2026) | security-reviewer, product Security Reviewer prompt |
| [OWASP GenAI LLM Top 10 2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/) · [changes vs 2025](https://aembit.io/blog/the-owasp-top-10-for-llm-applications-2026-what-changed-and-why-it-matters/) | LLM01–LLM10:2026, renumbered | security-reviewer, product Security Reviewer prompt |
| [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) · [OWASP MCP Top 10 (beta)](https://owasp.org/www-project-mcp-top-10/) | Agent / tool and MCP-layer risks | security-reviewer (agent paths, `mcp/**`) |
| [CVSS v4](https://www.first.org/cvss/v4.0/user-guide) · [OWASP Risk Rating](https://owasp.org/www-community/OWASP_Risk_Rating_Methodology) | Considered, rejected: built for catalogued CVEs, too heavy for a 3-level diff review | — |

Project sources: root / module `CLAUDE.md` (commands, naming, do-not-touch), module `INSIGHTS.md` + [engineering-insights](../skills/engineering-insights/SKILL.md) Part A, [skill-map.md](../skills/pr-self-review/references/skill-map.md), [severity.md](../skills/pr-self-review/references/severity.md), root `INSIGHTS.md` (no `git add -A` while a subagent runs). Design records: [planner + implementer](../../docs/cc-plans/2026-09-22+planner-implementer-agents.md) · [test / review / doc agents](../../docs/cc-plans/2026-09-23+review-test-doc-agents.md) · [brainstorm + security-reviewer](../../docs/cc-plans/2026-09-27+brainstorm-security-reviewer-agents.md) · [spec-creator](../../docs/cc-plans/2026-10-01+spec-creator-agent.md) · [implementation-planner](../../docs/cc-plans/2026-10-01+implementation-planner-agent.md).

## Adding an agent

One `<name>.md` per agent with frontmatter (`name`, `description` with a "Use when…" trigger, `model`, `tools` / `disallowedTools`, optional `hooks`). Add a row to Catalog, Permissions and Inputs/outputs here. New agents load in the next session.
