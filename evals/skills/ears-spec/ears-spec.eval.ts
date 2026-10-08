import { describeSkill, runSkillCases } from "../../src/index.js";
import { cases } from "./ears-spec.cases.js";

describeSkill("ears-spec", () => runSkillCases("ears-spec", cases));
