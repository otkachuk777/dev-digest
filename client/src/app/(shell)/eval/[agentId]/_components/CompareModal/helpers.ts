import type { Agent, EvalCaseResult, EvalRunConfig } from "@devdigest/shared";

export type DiffOp = { op: "same" | "add" | "del"; text: string };

/** LCS lengths of `a[0..i]` against every prefix of `b`, in two rolling rows (O(m) memory). */
function lcsRow(a: string[], b: string[]): number[] {
  let prev = new Array<number>(b.length + 1).fill(0);
  let cur = new Array<number>(b.length + 1).fill(0);
  for (const x of a) {
    for (let j = 1; j <= b.length; j++) cur[j] = x === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    [prev, cur] = [cur, prev];
  }
  return prev;
}

/** Hirschberg: the alignment of `a` and `b` using only the two-row LCS above, never an N×M matrix. */
function align(a: string[], b: string[], out: DiffOp[]): void {
  if (a.length === 0) return void b.forEach((text) => out.push({ op: "add", text }));
  if (b.length === 0) return void a.forEach((text) => out.push({ op: "del", text }));
  if (a.length === 1) {
    const k = b.indexOf(a[0]!);
    if (k < 0) out.push({ op: "del", text: a[0]! });
    b.forEach((text, j) => out.push({ op: j === k ? "same" : "add", text }));
    return;
  }
  const mid = a.length >> 1;
  const left = lcsRow(a.slice(0, mid), b);
  const right = lcsRow(a.slice(mid).reverse(), [...b].reverse());
  let best = 0, bestK = 0;
  for (let k = 0; k <= b.length; k++) {
    const v = left[k]! + right[b.length - k]!;
    if (v > best) { best = v; bestK = k; }
  }
  align(a.slice(0, mid), b.slice(0, bestK), out);
  align(a.slice(mid), b.slice(bestK), out);
}

/** Word diff over `split(/(\s+)/)` tokens. Identical input short-circuits; the common prefix and suffix
 *  are stripped before the LCS so a one-word edit in a 3000-token prompt costs almost nothing. */
export function wordDiff(a: string, b: string): DiffOp[] {
  if (a === b) return a ? [{ op: "same", text: a }] : [];
  const x = a.split(/(\s+)/).filter(Boolean), y = b.split(/(\s+)/).filter(Boolean);
  let p = 0;
  while (p < x.length && p < y.length && x[p] === y[p]) p++;
  let q = 0;
  while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++;
  const out: DiffOp[] = x.slice(0, p).map((text) => ({ op: "same", text }));
  align(x.slice(p, x.length - q), y.slice(p, y.length - q), out);
  x.slice(x.length - q).forEach((text) => out.push({ op: "same", text }));
  return out;
}

export type ConfigChange =
  | { kind: "model" | "provider" | "strategy"; from: string; to: string }
  | { kind: "skillAdded" | "skillRemoved"; name: string }
  | { kind: "skillChanged"; name: string; from: number; to: number };

/** AC-66: one descriptor per difference between the two snapshots; the caller renders the copy. */
export function configDiffLines(a: EvalRunConfig, b: EvalRunConfig): ConfigChange[] {
  const lines: ConfigChange[] = [];
  if (a.model !== b.model) lines.push({ kind: "model", from: a.model, to: b.model });
  if (a.provider !== b.provider) lines.push({ kind: "provider", from: a.provider, to: b.provider });
  if (a.strategy !== b.strategy) lines.push({ kind: "strategy", from: a.strategy, to: b.strategy });
  const before = new Map(a.skills.map((s) => [s.skill_id, s]));
  const after = new Map(b.skills.map((s) => [s.skill_id, s]));
  for (const s of b.skills) {
    const old = before.get(s.skill_id);
    if (!old) lines.push({ kind: "skillAdded", name: s.name });
    else if (old.version !== s.version || old.body !== s.body) lines.push({ kind: "skillChanged", name: s.name, from: old.version, to: s.version });
  }
  for (const s of a.skills) if (!after.has(s.skill_id)) lines.push({ kind: "skillRemoved", name: s.name });
  return lines;
}

const caseKey = (r: EvalCaseResult) => r.case_id ?? r.case_name;

/** AC-67: how the two runs' case sets overlap. */
export function caseSetNote(a: EvalCaseResult[], b: EvalCaseResult[]): { common: number; onlyA: number; onlyB: number } {
  const ka = new Set(a.map(caseKey)), kb = new Set(b.map(caseKey));
  const common = [...ka].filter((k) => kb.has(k)).length;
  return { common, onlyA: ka.size - common, onlyB: kb.size - common };
}

/** AC-68: the snapshot already equals the agent's live config. */
export function isCurrent(c: EvalRunConfig, agent: Pick<Agent, "provider" | "model" | "system_prompt" | "strategy">): boolean {
  return c.provider === agent.provider && c.model === agent.model && c.system_prompt === agent.system_prompt && c.strategy === (agent.strategy ?? "single-pass");
}

/** Older run first (by started_at), whatever order the user clicked. */
export function orderRuns<T extends { started_at: string }>(x: T, y: T): [T, T] {
  return x.started_at <= y.started_at ? [x, y] : [y, x];
}
