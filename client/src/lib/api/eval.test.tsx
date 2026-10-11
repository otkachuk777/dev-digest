import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../messages/en/eval.json";
import { notify } from "@/lib/toast";

const m = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn(), get: vi.fn() }));
vi.mock("./client", async (orig) => ({ ...(await orig<typeof import("./client")>()), api: { ...m } }));

import { usePromoteRun, useCreateEvalCase, useUpdateEvalCase, useEvalRuns, useEvalDashboard, evalKeys } from "./eval";

function setup<T>(hook: () => T) {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}><QueryClientProvider client={qc}>{children}</QueryClientProvider></NextIntlClientProvider>;
  return { qc, ...renderHook(hook, { wrapper }) };
}

describe("eval case mutations", () => {
  it("create/update raise no global toast on 400/409 (inline error shown instead)", async () => {
    m.post.mockRejectedValue(new Error("x"));
    m.put.mockRejectedValue(new Error("x"));
    const c = setup(() => useCreateEvalCase("ag1"));
    await act(async () => { await c.result.current.mutateAsync({} as never).catch(() => {}); });
    expect(c.qc.getMutationCache().getAll()[0]!.meta).toMatchObject({ silentError: true });
    const u = setup(() => useUpdateEvalCase());
    await act(async () => { await u.result.current.mutateAsync({ id: "c", input: {} as never }).catch(() => {}); });
    expect(u.qc.getMutationCache().getAll()[0]!.meta).toMatchObject({ silentError: true });
  });
});

describe("usePromoteRun", () => {
  it("AC-69: toasts 'Promoted v{B} as v{new}' from the hook", async () => {
    const spy = vi.spyOn(notify, "success").mockImplementation(() => {});
    m.post.mockResolvedValue({ version: 5 });
    const p = setup(() => usePromoteRun());
    await act(async () => { await p.result.current.mutateAsync({ runId: "r2", version: 4 }); });
    expect(m.post).toHaveBeenCalledWith("/eval-runs/r2/promote", undefined, expect.anything());
    expect(spy).toHaveBeenCalledWith("Promoted v4 as v5");
  });
});

describe("run completion refresh", () => {
  afterEach(() => vi.useRealTimers());

  it("F1: a polled run flipping running -> done invalidates the cases query", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    m.get.mockResolvedValueOnce([{ status: "running" }]).mockResolvedValue([{ status: "done" }]);
    const h = setup(() => useEvalRuns("ag1", "30d"));
    h.qc.setQueryData(evalKeys.cases("ag1"), []);
    await vi.waitFor(() => expect(h.result.current.data).toEqual([{ status: "running" }]));
    expect(h.qc.getQueryState(evalKeys.cases("ag1"))!.isInvalidated).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    await vi.waitFor(() => expect(h.qc.getQueryState(evalKeys.cases("ag1"))!.isInvalidated).toBe(true));
  });

  it("F1: the dashboard polls every 2 s while an agent row is running", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const dash = (running: boolean) => ({ agents: [{ running, latest: null }], recent_runs: [] });
    m.get.mockReset();
    m.get.mockResolvedValueOnce(dash(true)).mockResolvedValue(dash(false));
    const h = setup(() => useEvalDashboard());
    await vi.waitFor(() => expect(m.get).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    await vi.waitFor(() => expect(m.get.mock.calls.length).toBeGreaterThanOrEqual(2));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    const settled = m.get.mock.calls.length; // flip -> one invalidation refetch, then it stops polling
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(m.get).toHaveBeenCalledTimes(settled);
    void h;
  });
});
