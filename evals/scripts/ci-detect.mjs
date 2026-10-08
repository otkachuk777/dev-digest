/**
 * CI change detector for the harness evals.
 *
 * Reads a newline-separated list of changed files (repo-relative) from $CHANGED_FILES and maps
 * them onto the eval suites that should run for this PR:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *   any CLAUDE.md / INSIGHTS.md, .claude/**, docs/agent-prompts/**, engine change → workflow tier
 *
 * EVAL_ALL=1 (manual workflow_dispatch) ignores the diff and lists every artifact with real evals.
 *
 * A changed artifact with NO written evals (or only `pnpm eval:scaffold` TODO stubs) is NOT a failure: it is reported on the `skipped_*`
 * outputs so the job can print a visible "SKIP <name> (no evals)" line instead of going red.
 *
 * Emits GitHub Actions step outputs (skills, agents, run_workflow, skipped_skills, skipped_agents)
 * to $GITHUB_OUTPUT. Pure filesystem + string work — no deps.
 */

import { existsSync, readdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(EVALS_DIR, "..");

const ALL = process.env.EVAL_ALL === "1";

/** Every artifact folder under evals/<tier>/, written as if each had changed. */
const allFiles = (tier) =>
  existsSync(join(EVALS_DIR, tier)) ? readdirSync(join(EVALS_DIR, tier)).map((n) => `evals/${tier}/${n}/`) : [];

const changed = ALL
  ? [...allFiles("skills"), ...allFiles("agents"), "CLAUDE.md"]
  : (process.env.CHANGED_FILES ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

// A case counts only when its prompt is not a scaffold stub (`prompt: "TODO …"`) — those are
// test.skip'ed by runQualityCases, so a stub-only folder would spin up a job that runs nothing.
// Lookahead swallows the whitespace itself — `prompt:\s*(?!…)` would backtrack past it and match.
const REAL_PROMPT = /^\s*prompt:(?!\s*["'`]TODO)/m;

/** Does evals/<tier>/<name>/ have a *.eval.ts and at least one non-TODO case? Cases are read
 *  from the *.cases.js each eval.ts imports (an A/B variant may reuse a sibling's cases). */
function hasEvals(tier, name) {
  const dir = join(EVALS_DIR, tier, name);
  if (!existsSync(dir)) return false;
  const evalFiles = readdirSync(dir).filter((f) => f.endsWith(".eval.ts"));
  return evalFiles.some((f) =>
    [...readFileSync(join(dir, f), "utf8").matchAll(/from\s+["'](.+\.cases)\.js["']/g)].some((m) => {
      const casesFile = join(dir, `${m[1]}.ts`);
      return existsSync(casesFile) && REAL_PROMPT.test(readFileSync(casesFile, "utf8"));
    }),
  );
}

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    // Names flow into CI job names and shell steps — a PR could add a folder named `$(…)`.
    if (m && /^[a-z0-9][a-z0-9-]*$/.test(m[1])) names.add(m[1]);
  }
  return [...names].sort();
}

const skillNames = touched(
  /^\.claude\/skills\/([^/]+)\//,
  /^evals\/skills\/([^/]+)\//,
);
const agentNames = touched(
  /^\.claude\/agents\/([^/]+)\.md$/,
  /^evals\/agents\/([^/]+)\//,
);

const skills = skillNames.filter((n) => hasEvals("skills", n));
const skippedSkills = skillNames.filter((n) => !hasEvals("skills", n));
const agents = agentNames.filter((n) => hasEvals("agents", n));
const skippedAgents = agentNames.filter((n) => !hasEvals("agents", n));

// The workflow tier measures the LIVE harness, so anything that changes it re-triggers it:
// any CLAUDE.md / INSIGHTS.md (routing reads module ones too), agents and skills (dispatch and
// activation cases), agent prompts, the workflow cases, or the engine itself.
const runWorkflow = changed.some(
  (f) =>
    /(^|\/)(CLAUDE|INSIGHTS)\.md$/.test(f) ||
    /^\.claude\//.test(f) ||
    /^docs\/agent-prompts\//.test(f) ||
    /^evals\/workflow\//.test(f) ||
    /^evals\/src\//.test(f) ||
    f === ".github/workflows/eval-workflow.yml",
);

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));

write("skills", JSON.stringify(skills));
write("agents", JSON.stringify(agents));
write("run_workflow", String(runWorkflow));
write("skipped_skills", skippedSkills.join(" "));
write("skipped_agents", skippedAgents.join(" "));

// Human-readable summary in the step log.
console.error("── eval change detection ──");
console.error(`changed files : ${changed.length}`);
console.error(`skills → run  : ${skills.join(", ") || "(none)"}`);
console.error(`agents → run  : ${agents.join(", ") || "(none)"}`);
console.error(`workflow tier : ${runWorkflow ? "run" : "skip"}`);
for (const n of skippedSkills) console.error(`SKIP skill ${n} (no evals / only TODO stubs)`);
for (const n of skippedAgents) console.error(`SKIP agent ${n} (no evals / only TODO stubs)`);
