# Plan: planner + implementer agents

## Context
Need two project subagents in `.claude/agents/` (branch `L03-lab`): `planner` (read-only, structured Development Plan aware of modules, skills, INSIGHTS.md, arch constraints and of the skills the implementer will use) and `implementer` (executes plan in client/server, picks project skills, runs existing tests, self-verifies only its own changes; arch/security review is done by separate agents). Based on researcher findings (code.claude.com sub-agents / skills / best-practices docs) and repo research.

## Skill-change resilience (design rule)
Agent files contain **no skill names, no skill rules, no `skills:` preload**. Skills are resolved at run time:
1. Mapping source of truth: `.claude/skills/pr-self-review/references/skill-map.md` (glob → skills). Already guarded: `scripts/gate.test.sh` fails if a mapped skill dir is missing (catches rename/delete).
2. Discovery fallback: agent lists `.claude/skills/*/SKILL.md`, reads frontmatter `description`; a skill whose description matches the touched files but is absent from the map is used AND reported as "unmapped skill" (catches added skills).
3. Content always live: planner `Read`s current `SKILL.md`; implementer invokes via `Skill` tool (reads current file) — no stale copy inside agent files.
4. Plan ↔ implementation drift: plan records skill names + key rule per step (not full text). Implementer reloads the skill; if the current rule contradicts the plan it stops that step and reports under "Deviations from plan" instead of silently following either.
5. Role exclusions by category, not name: skip workflow/process skills (PR gating, diagrams, session insights). A best-practice skill whose description also mentions "reviewing" (security, react-best-practices) is still applied as coding guidance.

## Project skills = best practices in both agents
Both agents apply implementation skills; selection identical (skill-map.md + description fallback) so plan and code follow the same rules.
- Implementation skills (both): frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library, onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design, zod, security (as *secure-coding guidance*, not audit), typescript-expert (deliberately unmapped in skill-map.md: "too generic, noisy" — glob `*.ts` would load its 431 lines for every file; its description has no "Use when" trigger, so description fallback is unreliable → planner names it explicitly in a step only for type-level work: generics/conditional types, tsconfig/path aliases, TS migrations, perf of types; implementer invokes it when the plan names it).
- Excluded from both as best-practice sources: pr-self-review (pre-PR review gate), mermaid-diagram; engineering-insights handled separately (below).
- planner: `Read` SKILL.md + only the sub-files it links that are relevant to the step (skills use progressive disclosure: next-best-practices/*.md, fastify rules/, security checklists.md, …). Per step writes "Skills: <name> — <rule> (`<skill>/<file>` section)". Designs the approach per those rules (e.g. onion ring placement, RSC boundary, repository-only DB access), not just lists names.
- implementer: invokes the same skills via `Skill` before editing files of that glob, reads the linked sub-files it needs; Steps table column "Skills applied — rule followed". Skill rule vs plan conflict → Deviations (see resilience rule 4).
- Neither does review/audit: security & architecture review stay with separate agents; implementer's only arch check is deterministic `pnpm arch`.

## engineering-insights split
Skill has Part A (read INSIGHTS.md first, name 1–3 relevant entries) and Part C (append lessons at wrap-up).
- planner: does **Part A only**. Reads live `.claude/skills/engineering-insights/SKILL.md` Part A (not preloaded, no Skill tool). Resolves modules from the task, NOT `detect-module.sh` (script reads git working tree — at planning time nothing changed, it falls back to root/last commit; skill itself says "trust the prompt"). Reads root + each touched module's INSIGHTS.md, cites entries in "Insights applied" with a short "how it changes the plan"; entry contradicting the task → Risks & open questions. Never writes INSIGHTS.md.
- implementer: **Part A too**, independently of the plan (fresh context; planner's citation is a filter, may miss implementation-level entries). Before first edit: `Read` live SKILL.md Part A, read root + INSIGHTS.md of every module in the plan's Steps, name 1–3 relevant entries in its report; entry planner missed → apply it, note under "Deviations from plan"; entry contradicting a step → stop that step, report. Reads via `Read`, NOT `Skill` invoke (invocation also loads Part C and implementer has Write). Never writes INSIGHTS.md. At the end runs `detect-module.sh` (now the working tree has its changes) to label each item in "Insight candidates" with its target INSIGHTS.md file.
- Part C stays with the main session (`/engineering-insights` at wrap-up, per root CLAUDE.md), which uses the implementer's candidates.

## Files
- `.claude/agents/planner.md` — model opus, `permissionMode: plan`, tools `Read, Grep, Glob, Bash` (read-only by prompt), disallowed `Write, Edit, NotebookEdit, Agent, WebSearch, WebFetch`. Output: Development Plan (Context, Scope, Insights applied, Constraints, Skills for implementer table, Steps with Files/Skills/Change/Verify/Done-when, Test plan, Risks, Not verified). Asks clarifying questions if task vague.
- `.claude/agents/implementer.md` — model sonnet, tools `Read, Grep, Glob, Edit, Write, Bash, Skill`, disallowed `Agent, NotebookEdit, WebSearch, WebFetch`. Runs `pnpm typecheck`/`pnpm test`/`pnpm arch` in touched modules; `pnpm arch` = deterministic guard (fix own violations, never regenerate dependency-cruiser baseline); `pnpm e2e:hermetic` only when the plan's Test plan explicitly requires it; no git add/commit/push. Output: Implementation report (Status, Insights read, Steps table, Verification evidence table, Deviations, Not done, Insight candidates, Handoff for reviewers).

## Verification
- Frontmatter parses: agents appear in a new session's agent list.
- Dry run planner on a small real task → plan contains skills table resolved from skill-map.md.
- Simulate skill change: rename check — `bash .claude/skills/pr-self-review/scripts/gate.test.sh` still green on current tree.
- Commit both files on `L03-lab`.
