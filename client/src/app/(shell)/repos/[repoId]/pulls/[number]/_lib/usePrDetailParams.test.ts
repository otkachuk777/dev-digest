import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const replace = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(query),
}));

import { usePrDetailParams, parseDiffTarget } from "./usePrDetailParams";

beforeEach(() => {
  replace.mockClear();
  query = "";
});

describe("usePrDetailParams", () => {
  it("AC-21: openInDiff sets tab=diff, file and line in one replace", () => {
    const { result } = renderHook(() => usePrDetailParams("r1", "7"));
    result.current.openInDiff("src/a.ts", 12);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/repos/r1/pulls/7?tab=diff&file=src%2Fa.ts&line=12");
  });

  it("AC-25: openInDiff without a line deletes a previous line param", () => {
    query = "tab=diff&file=x.ts&line=3";
    const { result } = renderHook(() => usePrDetailParams("r1", "7"));
    result.current.openInDiff("src/a.ts", null);
    expect(replace).toHaveBeenCalledWith("/repos/r1/pulls/7?tab=diff&file=src%2Fa.ts");
  });

  it("setTab drops the diff target", () => {
    query = "tab=diff&file=x.ts&line=3";
    const { result } = renderHook(() => usePrDetailParams("r1", "7"));
    result.current.setTab("findings");
    expect(replace).toHaveBeenCalledWith("/repos/r1/pulls/7?tab=findings");
  });
});

describe("parseDiffTarget", () => {
  const q = (s: string) => new URLSearchParams(s);
  it("reads file and a positive integer line", () => {
    expect(parseDiffTarget(q("file=src%2Fa.ts&line=12"))).toEqual({ file: "src/a.ts", line: 12 });
  });
  it("no file → no target", () => {
    expect(parseDiffTarget(q("line=12"))).toBeNull();
  });
  it("bad lines become null instead of crashing", () => {
    for (const bad of ["abc", "0", "-3", "1.5", "12abc", ""]) {
      expect(parseDiffTarget(q(`file=a.ts&line=${bad}`))).toEqual({ file: "a.ts", line: null });
    }
  });
});
