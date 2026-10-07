---
name: dependency-checker
description: Audit all dependencies of this monorepo (client, server, reviewer-core, e2e, mcp, evals) and produce a structured report — Scope, dependency graph (external npm packages and internal cross-package links), size of every package in node_modules including transitives, Findings & Priorities (P0/P1/P2/Info) covering vulnerabilities, outdated majors, unused candidates and version drift, and a closing Summary. Use whenever the user asks to check, audit, review or visualise dependencies, "що важить node_modules", "чому важкий client", dependency report/graph/schema, bundle or package bloat, outdated or vulnerable packages, "залежності", "перевір залежності", or before adding or upgrading a heavy package — even if they don't say "dependency-checker".
compatibility: Requires node ≥ 20 for the scripts. Reads installed node_modules; audit/outdated need network (fall back to --offline). Without tools, works from data the user supplies.
---

# Dependency Checker

A dependency audit is only useful if developers can act on it. So the work is split: a script
**measures** (sizes, versions, audit, graph — deterministic, no guessing) and you **judge**
(rank, explain, advise). The report always has the same five sections in the same order, so
people know where to look. Never state a number the data does not contain — a wrong size in a
report destroys trust in the rest of it.

## Report contract

Always produce these five sections, with these names, in this order:

1. **Scope** — which packages were analysed (client, server, reviewer-core, e2e, mcp, evals, or the
   subset given), how each was measured, and **Limitations** (anything skipped or heuristic).
   This repo is **not** a workspace/pnpm-workspaces monorepo: packages share code through tsconfig
   path aliases (`@devdigest/shared`, `@devdigest/reviewer-core`), so never describe them as
   `workspace:*` links.
2. **Dependency graph** — a fenced ```` ```mermaid ```` block whose first line is `flowchart LR` (the `flowchart` keyword, not the older `graph`). Keep **internal**
   dependencies (path-alias and relative imports between packages, module-to-module imports) clearly
   apart from **external** npm dependencies; draw them as separate diagrams or labelled subgraphs.
3. **Sizes** — a table per package: dependency, installed size, size with transitives, share of the
   package. Real figures only (`du`, facts) — never "it's big".
4. **Findings & Priorities** — findings grouped under explicit tiers **P0, P1, P2, Info**, never an
   unranked bullet list. Each finding names a concrete package, dependency or file, says why (with the
   number or advisory), and gives the action. Evidence tables (vulnerabilities, outdated, unused,
   version drift) and Recommendations follow the tiers.
5. **Summary** — last. 3–5 takeaways ordered by priority, each actionable.

### Tiers

- **P0** — critical/high vulnerability reachable in production with a fix available, or an internal
  dependency that breaks a package boundary (see below). Fix now.
- **P1** — high-weight or cheap wins: large share of a package, major version drift between packages,
  architecture violations. Next sprint.
- **P2** — planned work: major upgrades, unused candidates to verify, dev-only vulnerabilities.
- **Info** — worth knowing, no action now (disk-only weight of an already-lazy package, small drift).

Scoring detail: `references/priority-rubric.md`.

### What to look for

- **Internal vs external.** A package importing another by **relative path** or by a deep path
  (e.g. `server/src/services/review-service.ts` importing `reviewer-core/src/pipeline.js`) bypasses that
  package's public entry point — flag it as **P0**, since it breaks the boundary the alias exists to
  protect. Importing through the alias to `index.ts` is fine.
- **Version drift.** The same package at different versions in different packages (e.g. `zod` 3.23.8 vs
  3.22.4) is called out by name with every version and where it is declared.
- **Unused dependency.** Declared in `package.json` but never imported (e.g. `moment` with no import under
  `src/`). It is a **candidate** found by text search, not proof; phrase the action as "verify, then
  remove". Never claim it was removed.
- **Heavy packages.** Check lazy-loading before advising it (see Judgment rules).

## Workflow

1. **Collect facts** (when you have a shell and the repo)
   ```bash
   node .claude/skills/dependency-checker/scripts/collect.mjs            # add --offline if no network
   ```
   Writes `.claude/.dependency-checker/facts.json` (git-ignored). Modules are auto-discovered (every
   top-level dir with a `package.json`). A package without `node_modules` is `skipped` — tell the user
   to install it instead of guessing sizes. ~5 s offline; audit/outdated add network time.

   **No tools, or data supplied inline?** Don't ask for access. Treat the data you were given as the
   collected facts and write the same five-section report from it. If something needed is missing, say
   so under Limitations instead of inventing it.

2. **Read the facts, not the repo.** In `facts.json`: `duplicates`, each package's `packages` (sorted by
   `withTransitiveKB`), `audit.advisories` (`inProd`), `outdated`, `unusedCandidate`, `lazyOnly`,
   `internal.crossPackage`, `internal.violations`/`circular`. Read the touched module's `INSIGHTS.md`
   only if you recommend changing that module (repo session protocol).

3. **Write `analysis.json`** following `references/analysis-schema.md`, using
   `references/priority-rubric.md` and `references/advice-playbook.md`. Save it next to the facts:
   `.claude/.dependency-checker/analysis.json`.

4. **Render**
   ```bash
   DATE=$(date +%F)
   node .claude/skills/dependency-checker/scripts/render.mjs \
     --facts .claude/.dependency-checker/facts.json \
     --analysis .claude/.dependency-checker/analysis.json \
     --md docs/dependency-reports/$DATE.md \
     --html .claude/.dependency-checker/report.html
   ```
   The Markdown report is committed (`docs/dependency-reports/`); the HTML is the interactive twin.

5. **Publish the HTML** as a private Artifact (load `artifact-design` first, per the Artifact tool
   contract; publish `report.html` as-is — it is already themed and self-contained).

6. **Answer in chat briefly:** the Summary (3–5 lines), the P0/P1 list, the path to the `.md` and the
   artifact link. The full report lives in the files — don't paste it.

## Judgment rules

- **Honesty about gaps.** Anything `skipped`/`error` goes into Limitations and must temper the Summary:
  "0 vulnerabilities" is wrong when audit didn't run — say "audit not run".
- **Size means disk size in `node_modules`**, not shipped bundle size. Never claim a package "adds X MB
  to the bundle". `withTransitiveKB` double-counts shared transitives — compare packages by it, but quote
  `sizes.declaredClosureKB` for package totals.
- **Check lazy-load before advising it.** Each package row has `staticImportFiles`, `dynamicImportFiles`
  and `lazyOnly`. `lazyOnly: true` means it is already behind `import()`, so "move to dynamic import" is
  wrong advice: the disk size is real but it does not reach the initial bundle. Say that instead (Info
  tier). Only suggest lazy-loading when `staticImportFiles > 0`.
- **Unused is a heuristic** (text search, no depcheck). Phrase actions as "verify, then remove".
- **Proposals, not actions.** This skill reports; it does not upgrade, remove or edit anything.
  Recommendations are for the user to confirm.
- **Evidence in every finding.** `why` quotes facts (size, %, version, file count, advisory). A finding
  without a number or a named advisory is opinion — drop it or move it to Recommendations.
- **Few, ranked.** ≤ 12 findings. A long list is ignored.
- **Repo rules still apply:** never hand-edit lockfiles; don't regenerate the dependency-cruiser baseline
  to hide a violation; `vendor/shared` copies are duplicated by hand — flag drift, don't fix it here.

## Scripts

| Script | Role |
|---|---|
| `scripts/collect.mjs` | Measures. Flags: `--root`, `--out`, `--offline`, `--top N` (diagram size). Uses an fs walk for sizes, `pnpm`/`npm audit\|outdated`, and each module's own `depcruise`. Installs nothing. |
| `scripts/render.mjs` | Lays out Markdown + HTML (`--standalone` for a full page) from `facts.json` + `analysis.json`. |
