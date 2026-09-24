# Skill map: changed file → review skills

Globs are relative to repo root. A file can match several rows; a skill with no matching files is not run.
`.claude/skills/<skill>/SKILL.md` must exist for every skill named here (checked by `scripts/gate.test.sh`).

| Glob | Skills |
|---|---|
| `client/src/**/*.{ts,tsx}` | `frontend-ui-architecture`, `react-best-practices` |
| `client/src/app/**`, `client/next.config.*` | `next-best-practices` |
| `client/**/*.test.{ts,tsx}` | `react-testing-library` |
| `server/src/**`, `reviewer-core/src/**` | `onion-architecture` |
| `server/src/**/routes.ts`, `server/src/app.ts`, `server/src/server.ts`, `server/src/platform/**` | `fastify-best-practices` |
| `server/src/db/**`, `server/src/**/repository*` | `drizzle-orm-patterns` |
| `server/src/db/schema/**`, `server/src/db/migrations/*.sql` | `postgresql-table-design` |
| `*/src/vendor/shared/contracts/**` | `zod` |
| any `*.{ts,tsx,js,cjs,mjs}` that is not a test | `security` |

Deliberately unmapped: `mermaid-diagram`, `engineering-insights` (not review skills), `typescript-expert` (too generic, noisy).

## Review groups (one agent per group, not per skill)

Every agent reloads ~70k tokens of base context before reading a single line, so the cost is set by the agent count, not by the work. Skills are therefore reviewed in three groups; each group agent reads all its skills and returns findings tagged with the `skill` that produced them.

| Group | Skills (only those the file list actually triggers) | Model |
|---|---|---|
| `client` | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library` | sonnet |
| `server` | `onion-architecture`, `fastify-best-practices`, `security` | sonnet |
| `data` | `drizzle-orm-patterns`, `postgresql-table-design`, `zod` | sonnet |

`security` also covers non-test client files; they go into the `server` group's file list under that skill only. A group whose skills matched no files is not launched. Split a group by files (same skills) only when its diff exceeds ~1500 lines.

## Skip list (never sent to LLM review; see `scripts/changed-files.sh`)

`*.snap`, lock files, `server/.dependency-cruiser-known-violations.json`, `server/src/db/migrations/meta/*`. Lock files and the journal are covered by `scripts/guards.sh`.

## Coverage

Changed files that match no row and are not skip-listed (e.g. `*.md`, `*.json`, workflows) are reported as "not reviewed by any skill". Add a row when that list shows something that deserves review.
