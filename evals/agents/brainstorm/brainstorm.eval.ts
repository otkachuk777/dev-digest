import { describeAgent, runAgentCases } from "../../src/index.js";
import { cases } from "./brainstorm.cases.js";

describeAgent("brainstorm", () => runAgentCases("brainstorm", cases));
