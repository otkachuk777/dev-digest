"use client";

import { useRouter, useSearchParams } from "next/navigation";

export interface DiffTarget {
  file: string;
  line: number | null;
}

/** Untrusted URL input → target. `line` only when a positive integer; no `file` → no target. */
export function parseDiffTarget(search: { get(key: string): string | null }): DiffTarget | null {
  const file = search.get("file");
  if (!file) return null;
  const raw = search.get("line");
  const line = raw && /^\d+$/.test(raw) && Number(raw) >= 1 ? Number(raw) : null;
  return { file, line };
}

/**
 * URL-param state for the PR detail page: the active tab (`?tab=`), the
 * open trace drawer's run id (`?trace=`) and the Files-changed target
 * (`?file=` / `?line=`). All live in the URL (not useState) so they survive
 * reload/back-forward and are shareable.
 */
export function usePrDetailParams(repoId: string, number: string) {
  const search = useSearchParams();
  const router = useRouter();

  const tab = search.get("tab") ?? "overview";
  const traceRunId = search.get("trace");
  const diffTarget = parseDiffTarget(search);

  const go = (sp: URLSearchParams) =>
    router.replace(`/repos/${repoId}/pulls/${number}${sp.toString() ? `?${sp.toString()}` : ""}`);

  const setParam = (key: string, val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    go(sp);
  };
  // A plain tab switch drops the diff target so it can't resurface later.
  const setTab = (t: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", t);
    sp.delete("file");
    sp.delete("line");
    go(sp);
  };
  // `replace`, not `push`: matches every other tab change on this page.
  const openInDiff = (file: string, line?: number | null) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", "diff");
    sp.set("file", file);
    if (line != null) sp.set("line", String(line));
    else sp.delete("line");
    go(sp);
  };

  return { tab, traceRunId, diffTarget, setTab, setParam, openInDiff };
}
