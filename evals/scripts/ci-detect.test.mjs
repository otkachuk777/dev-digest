// Self-check for ci-detect.mjs: feed fake CHANGED_FILES, assert the step outputs.
//   node evals/scripts/ci-detect.test.mjs
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const script = join(dirname(fileURLToPath(import.meta.url)), "ci-detect.mjs");

function detect(env) {
  const { GITHUB_OUTPUT, ...rest } = process.env; // force key=value on stdout
  const out = execFileSync("node", [script], { env: { ...rest, ...env }, stdio: ["ignore", "pipe", "ignore"] });
  return Object.fromEntries(out.toString().trim().split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2)));
}

// zod = only TODO stubs → skipped; onion-architecture has real cases → runs; module CLAUDE.md → workflow.
let o = detect({
  CHANGED_FILES: ["client/CLAUDE.md", ".claude/skills/zod/SKILL.md", ".claude/skills/onion-architecture/SKILL.md"].join("\n"),
});
assert.deepEqual(JSON.parse(o.skills), ["onion-architecture"]);
assert.equal(o.skipped_skills, "zod");
assert.equal(o.run_workflow, "true");

// Agent with real cases runs; stub-only agent skipped; unrelated file → no workflow.
o = detect({ CHANGED_FILES: ".claude/agents/code-reviewer.md\n.claude/agents/brainstorm.md" });
assert.deepEqual(JSON.parse(o.agents), ["code-reviewer"]);
assert.equal(o.skipped_agents, "brainstorm");
o = detect({ CHANGED_FILES: "server/src/app.ts" });
assert.equal(o.run_workflow, "false");
assert.equal(o.skills, "[]");

// EVAL_ALL lists every artifact with real evals, never a stub.
o = detect({ EVAL_ALL: "1", CHANGED_FILES: "" });
assert.ok(JSON.parse(o.skills).includes("onion-architecture"));
assert.ok(!JSON.parse(o.skills).includes("zod"));
// architecture-reviewer-lite has no own cases file — it imports the strict variant's.
assert.ok(JSON.parse(o.agents).includes("architecture-reviewer-lite"));
assert.equal(o.run_workflow, "true");

console.log("ci-detect: ok");
