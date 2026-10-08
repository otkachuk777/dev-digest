import type { EvalCase } from "@devdigest/shared";

/** Plain-text splitting of a unified diff into per-file sections (no parser: the server is the authority). */
function sections(text: string): { file: string | null; lines: string[] }[] {
  const out: { file: string | null; lines: string[] }[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const cur = out[out.length - 1];
    const startsFile = l.startsWith("diff --git ") || (l.startsWith("--- ") && lines[i + 1]?.startsWith("+++ ") && cur?.file != null);
    if (!cur || startsFile) out.push({ file: null, lines: [] });
    const sec = out[out.length - 1]!;
    sec.lines.push(l);
    if (l.startsWith("+++ ") && sec.file == null) {
      const p = l.slice(4).trim();
      if (p !== "/dev/null") sec.file = p.replace(/^b\//, "");
    }
  }
  return out.filter((x) => x.file != null);
}

/** File paths of the diff, in order (AC-24). */
export const filesInDiff = (text: string): string[] => sections(text).map((x) => x.file!);

/** One file's part of the diff (AC-24). */
export const fileSection = (text: string, path: string): string =>
  sections(text).find((x) => x.file === path)?.lines.join("\n") ?? "";

/** New-side start line of the file's first hunk; 1 when there is none. */
export function firstNewLine(text: string, path: string): number {
  const m = /^@@ -\d+(?:,\d+)? \+(\d+)/m.exec(fileSection(text, path));
  return m ? Number(m[1]) : 1;
}

export function isJsonArray(text: string): boolean {
  try {
    return Array.isArray(JSON.parse(text));
  } catch {
    return false;
  }
}

/** AC-26: append an item for the diff's first file at its first new-side line. */
export function appendSkeleton(json: string, diff: string): string {
  let arr: unknown[] = [];
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v)) arr = v;
  } catch {
    /* start a fresh array */
  }
  const file = filesInDiff(diff)[0] ?? "";
  const line = file ? firstNewLine(diff, file) : 1;
  return JSON.stringify([...arr, { file, start_line: line, end_line: line }], null, 2);
}

export type FieldGroup = "name" | "diff" | "meta" | "expected" | "other";

/** Which editor a server/zod field path belongs to. Item-level paths (`expected.0.start_line`) belong to Expected. */
export function fieldGroup(field: string | undefined): FieldGroup {
  if (!field) return "other";
  if (field.startsWith("expected")) return "expected";
  if (field.startsWith("input_diff")) return "diff";
  if (field.startsWith("input_meta")) return "meta";
  if (field.startsWith("name")) return "name";
  return "other";
}

/** AC-23 banner parts for a case created from a finding. */
export function seededBanner(c: EvalCase): { positive: boolean; title: string; file: string; lines: string } | null {
  if (!c.source_decision) return null;
  const it = c.expected[0];
  return {
    positive: c.expectation_type === "must_find",
    title: it?.title ?? "",
    file: it?.file ?? "",
    lines: it ? `${it.start_line}-${it.end_line}` : "",
  };
}

export type LineKind = "add" | "del" | "hunk" | "ctx";

/** Kind of one diff line (added / removed / hunk header / context); `+++` and `---` file headers are context. */
export function lineKind(l: string): LineKind {
  if (l.startsWith("@@")) return "hunk";
  if (l.startsWith("+") && !l.startsWith("+++")) return "add";
  if (l.startsWith("-") && !l.startsWith("---")) return "del";
  return "ctx";
}
