/* Pure tour helpers (no React). */
import type { Onboarding } from "@devdigest/shared";

/** Blob URL at the tour's commit; every path segment is encoded, the slashes are kept. */
export function githubBlobUrl(repoFullName: string, commitSha: string, path: string): string {
  return `https://github.com/${repoFullName}/blob/${commitSha}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Commands grouped by working directory, in order of first appearance. */
function runBlocks(commands: Onboarding["how_to_run"]): string[] {
  const groups = new Map<string | null, string[]>();
  for (const c of commands) groups.set(c.cwd, [...(groups.get(c.cwd) ?? []), c.command]);
  return [...groups].map(
    ([cwd, cmds]) => `${cwd ? `\`${cwd}/\`\n\n` : ""}\`\`\`sh\n${cmds.join("\n")}\n\`\`\``,
  );
}

export function tourToMarkdown(
  tour: Onboarding,
  text: {
    heading: string;
    headerLine: string;
    bannerLines: string[];
    /** 5 titles, tour order */
    sectionTitles: string[];
  },
): string {
  const [arch, critical, run, reading, tasks] = text.sectionTitles;
  const diagram = tour.architecture.diagram ? `\`\`\`mermaid\n${tour.architecture.diagram}\n\`\`\`` : "";
  const sections: [string | undefined, string[]][] = [
    [arch, [tour.architecture.body, diagram]],
    [critical, [tour.critical_paths.map((p) => `- \`${p.path}\` — ${p.reason}`).join("\n")]],
    [run, runBlocks(tour.how_to_run)],
    [reading, [tour.reading_path.map((p, i) => `${i + 1}. \`${p.path}\` — ${p.reason}`).join("\n")]],
    [tasks, [tour.first_tasks.map((k) => `- ${k.title} — \`${k.scope_path}\` (${k.complexity})`).join("\n")]],
  ];
  return [
    `# ${text.heading}`,
    text.headerLine,
    text.bannerLines.map((l) => `- ${l}`).join("\n"),
    ...sections.map(([title, parts]) => [`## ${title}`, ...parts.filter(Boolean)].join("\n\n")),
  ].join("\n\n");
}
