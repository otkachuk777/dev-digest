import { describeSkill, runSkillCases } from "../../src/index.js";
import { cases } from "./impl.cases.js";

describeSkill("impl", () => runSkillCases("impl", cases));
