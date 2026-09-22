import type { ConventionCandidate } from "@devdigest/shared";
import { SKILL_NAME, SLUG_WORDS, STOPWORDS } from "./constants";
import { formatEvidenceRange } from "../../_lib/evidence";

/** `Always use async/await instead of .then()` → `always-use-async-await-instead`. */
export function slugifyRule(rule: string): string {
  return rule
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .slice(0, SLUG_WORDS)
    .join("-");
}

/** A code fence longer than any backtick run inside the snippet, so it can never close early. */
function fenceFor(snippet: string): string {
  const longest = Math.max(0, ...(snippet.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * The starting text of the skill: ONE skill merged from the accepted conventions,
 * each rule followed by the code it was found in. Only what is passed in ends up
 * in the body — callers pass the accepted list, so rejected rules cannot leak in.
 */
export function conventionsToDraft(
  conventions: ConventionCandidate[],
  repoName: string,
): { name: string; description: string; body: string } {
  const sections = conventions.map((c) => {
    const fence = fenceFor(c.evidence_snippet);
    const range = formatEvidenceRange(c.evidence_path, c.evidence_start, c.evidence_end);
    return [
      `## ${slugifyRule(c.rule) || "convention"}`,
      c.rule,
      "",
      `Detected in [${range}](${c.evidence_url}):`,
      "",
      `${fence}\n${c.evidence_snippet}\n${fence}`,
    ].join("\n");
  });
  const body = [
    `# ${SKILL_NAME}`,
    "",
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");
  return {
    name: SKILL_NAME,
    description: `${conventions.length} house conventions extracted from ${repoName}`,
    body,
  };
}
