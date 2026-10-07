import type { SkillCase } from "../../src/index.js";

// skillTask runs with no tools, so the diff is inlined in the prompt (same trick as dependency-checker).
const BAD_DIFF = `Here is the diff, already collected — review it directly, do not ask for tool access.

--- a/server/src/modules/digests/service.ts
+++ b/server/src/modules/digests/service.ts
@@
+import { Octokit } from "@octokit/rest";
+import { AgentsRepository } from "../agents/repository.js";
+
 export class DigestsService {
+  async build(tx: Tx, prNumber: number) {
+    const gh = new Octokit({ auth: process.env.GITHUB_TOKEN });
+    const pr = await gh.pulls.get({ owner: "acme", repo: "app", pull_number: prNumber });
+    const agents = await new AgentsRepository(tx).list();
+    return { pr: pr.data.title, agents: agents.length };
+  }
 }`;

const CLEAN_DIFF = `Here is the diff, already collected — review it directly, do not ask for tool access.

--- a/server/src/modules/pulls/helpers.ts
+++ b/server/src/modules/pulls/helpers.ts
@@
-export function isStale(p: PrRow, now: number) { const d = now - p.updatedAt; return d > STALE_MS; }
+export function isStale(p: PrRow, now: number) { const age = now - p.updatedAt; return age > STALE_MS; }`;

export const cases: SkillCase[] = [
  {
    name: "flags SDK construction and cross-module repository access, citing the container route",
    kind: "quality",
    prompt: `Review this change against our backend architecture rules.\n\n${BAD_DIFF}`,
    grounding: ["container"],
    practices: [
      "flags `new Octokit(...)` inside the service as a violation and says the GitHub client must come from the container (e.g. `await container.github()`), not be constructed in a module",
      "flags `new AgentsRepository(tx)` / the import from '../agents/repository.js' as a cross-module internals violation and points to `container.agentsRepo` (or the module's index.ts) instead",
      "flags reading `process.env.GITHUB_TOKEN` directly in the module (secrets/config belong in the adapter or composition root)",
    ],
    threshold: 0.75,
    maxTurns: 3,
  },
  {
    name: "does not invent violations for a pure local rename",
    kind: "quality",
    prompt: `Review this change against our backend architecture rules.\n\n${CLEAN_DIFF}`,
    practices: [
      "reports no architecture violation for the change (or only non-blocking observations) and concludes it is acceptable",
      "does not demand new layers, ports or interfaces for this rename",
    ],
    threshold: 1.0,
    maxTurns: 3,
  },
];
