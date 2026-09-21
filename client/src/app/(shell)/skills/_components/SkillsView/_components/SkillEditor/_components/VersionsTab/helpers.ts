export interface DiffLine {
  type: "same" | "add" | "del";
  text: string;
}

/** Above this many table cells the exact diff is skipped (see `lineDiff`). */
const MAX_CELLS = 4_000_000;

/**
 * Line diff from `from` to `to` via longest-common-subsequence.
 *
 * ponytail: O(n·m) table — skill bodies are a few hundred lines. Past MAX_CELLS
 * it falls back to "remove everything, add everything" rather than freezing the
 * tab; swap in a Myers diff if bodies ever get that large.
 */
export function lineDiff(from: string, to: string): DiffLine[] {
  const a = from.split("\n");
  const b = to.split("\n");
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((text) => ({ type: "del" as const, text })), ...b.map((text) => ({ type: "add" as const, text }))];
  }

  // lcs[i][j] = LCS length of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ type: "del", text: a[i++]! });
    } else {
      out.push({ type: "add", text: b[j++]! });
    }
  }
  while (i < a.length) out.push({ type: "del", text: a[i++]! });
  while (j < b.length) out.push({ type: "add", text: b[j++]! });
  return out;
}
