import { describe, expect, it } from "vitest";
import type { Onboarding } from "@devdigest/shared";
import { githubBlobUrl, tourToMarkdown } from "./tour";

describe("githubBlobUrl (AC-55, EC-14)", () => {
  it("builds the blob URL at the commit", () => {
    expect(githubBlobUrl("acme/shop", "c0ffee", "src/a.ts")).toBe("https://github.com/acme/shop/blob/c0ffee/src/a.ts");
  });

  it("EC-14: encodes every path segment but keeps the slashes", () => {
    expect(githubBlobUrl("acme/shop", "c0ffee", "src/my dir/é file.ts")).toBe(
      "https://github.com/acme/shop/blob/c0ffee/src/my%20dir/%C3%A9%20file.ts",
    );
  });

  it("encodes characters that would end the path", () => {
    const url = githubBlobUrl("acme/shop", "c0ffee", "a#b/c?d.ts");
    expect(url).toBe("https://github.com/acme/shop/blob/c0ffee/a%23b/c%3Fd.ts");
    expect(url).not.toContain("#");
    expect(url).not.toContain("?");
  });
});

const tour = (over: Partial<Onboarding> = {}): Onboarding => ({
  repo_full_name: "acme/shop",
  commit_sha: "c0ffee",
  generated_at: "2026-10-01T10:00:00.000Z",
  status: "full",
  skeleton_reason: null,
  notes: [],
  files_total: 10,
  files_indexed: 8,
  provider: "openrouter",
  model: "m",
  llm_calls: 1,
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: 0.1,
  duration_ms: 1,
  dropped_items: 0,
  architecture: { body: "OVERVIEW BODY", diagram: "flowchart TD\nA-->B" },
  critical_paths: [{ path: "src/core.ts", reason: "Imported by 12 indexed files" }],
  how_to_run: [
    { command: "pnpm install", comment: null, cwd: null },
    { command: "pnpm run dev", comment: "dev server", cwd: "server" },
    { command: "pnpm run build", comment: null, cwd: null },
  ],
  reading_path: [
    { path: "src/index.ts", reason: "Start here", rank: 0.4, hotness: 0 },
    { path: "src/util.ts", reason: "Helpers", rank: 0.2, hotness: 0 },
  ],
  first_tasks: [{ title: "Add tests", scope_path: "src/tasks/a.ts", complexity: "Medium" }],
  ...over,
});
const text = {
  heading: "Onboarding for acme/shop",
  headerLine: "HEADER-LINE",
  bannerLines: ["BANNER-ONE", "BANNER-TWO"],
  sectionTitles: ["Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks"],
};

describe("tourToMarkdown (AC-53, EC-5)", () => {
  const gen = () => {
    const md = tourToMarkdown(tour(), text);
    return { md, lines: md.split("\n") };
  };

  it("starts with the repo heading, then the header line and the banner lines", () => {
    const { md, lines } = gen();
    expect(lines[0]).toBe("# Onboarding for acme/shop");
    expect(md.indexOf("HEADER-LINE")).toBeGreaterThan(0);
    expect(md.indexOf("BANNER-ONE")).toBeGreaterThan(md.indexOf("HEADER-LINE"));
    expect(md.indexOf("BANNER-TWO")).toBeGreaterThan(md.indexOf("BANNER-ONE"));
  });

  it("has one ## heading per section, in tour order, before the content", () => {
    const { md, lines } = gen();
    const at = text.sectionTitles.map((t) => lines.indexOf(`## ${t}`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(lines.findIndex((l) => l.includes("BANNER-TWO"))).toBeLessThan(at[0]!);
  });

  it("overview body is followed by the diagram in a mermaid fence", () => {
    const { md, lines } = gen();
    expect(md).toContain("OVERVIEW BODY");
    expect(md).toContain("```mermaid\nflowchart TD\nA-->B\n```");
    expect(md.indexOf("```mermaid")).toBeGreaterThan(md.indexOf("OVERVIEW BODY"));
  });

  it("no diagram -> no mermaid fence", () => {
    expect(tourToMarkdown(tour({ architecture: { body: "B", diagram: null } }), text)).not.toContain("```mermaid");
  });

  it("critical paths are bullets, the reading path a numbered list, tasks bullets with scope and complexity", () => {
    const { md, lines } = gen();
    expect(lines).toContain("- `src/core.ts` — Imported by 12 indexed files");
    expect(lines).toContain("1. `src/index.ts` — Start here");
    expect(lines).toContain("2. `src/util.ts` — Helpers");
    expect(lines).toContain("- Add tests — `src/tasks/a.ts` (Medium)");
  });

  it("EC-5: commands are grouped into one sh fence per working directory", () => {
    const { md, lines } = gen();
    const fences = [...md.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    expect(fences).toHaveLength(2);
    expect(fences[0]).toBe("pnpm install\npnpm run build");
    expect(fences[1]).toBe("pnpm run dev");
    expect(md.lastIndexOf("server/", md.indexOf("pnpm run dev"))).toBeGreaterThan(-1);
  });
});
