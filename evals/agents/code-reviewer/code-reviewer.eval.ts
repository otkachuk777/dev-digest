import { describeAgent, runAgentCases } from "../../src/index.js";
import { cases } from "./code-reviewer.cases.js";

describeAgent("code-reviewer", () => runAgentCases("code-reviewer", cases));
