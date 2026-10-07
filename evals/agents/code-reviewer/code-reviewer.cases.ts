import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);
const NO_TOOLS = "Review this diff for correctness bugs. The diff below is the complete change and the files do not exist on disk: do NOT use tools, read INSIGHTS or run git; review the text only.";

// The diff is inlined: agentTask here judges the agent's content, not its git access.
export const cases: AgentCase[] = [
  {
    name: "finds the off-by-one on the file budget with a concrete failure scenario",
    kind: "quality",
    prompt: `Review this diff for correctness bugs. The diff below is the complete change and the files do not exist on disk: do NOT use tools, read INSIGHTS or run git; review the text only.\n\n${fx("budget-offbyone.diff")}`,
    practices: [
      "reports the `>=` comparison in selectFiles as a bug (it should be `>`)",
      "gives a concrete failure scenario for that finding: exactly 20 files are passed in and the result is wrongly `rejected: true`",
      "assigns the finding a severity (critical/major/minor) and says whether it is blocking",
      "does not report architecture, security or naming issues as findings (they belong under 'Out of scope' or are omitted)",
    ],
    threshold: 0.75,
    maxTurns: 8,
  },
  {
    name: "reports no finding for a pure local-variable rename",
    kind: "quality",
    prompt: `Review this diff for correctness bugs. The diff below is the complete change and the files do not exist on disk: do NOT use tools, read INSIGHTS or run git; review the text only.\n\n${fx("benign-rename.diff")}`,
    practices: [
      "reports no correctness finding for the rename (verdict is pass, or only 'Unknown'/'Not verified' items)",
      "does not invent a bug, edge case or nit for the rename",
    ],
    threshold: 1.0,
    maxTurns: 8,
  },
];
