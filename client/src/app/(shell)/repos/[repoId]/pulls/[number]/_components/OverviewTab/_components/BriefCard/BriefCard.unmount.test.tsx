import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ api: { get: vi.fn(), post: (...a: unknown[]) => post(...a) } }));

import { useGenerateBrief } from "@/lib/api/brief";

describe("useGenerateBrief — error handler outlives the component", () => {
  it("F2: fires exactly once when the request fails after unmount", async () => {
    let fail!: (e: Error) => void;
    post.mockReturnValue(new Promise((_, rej) => (fail = rej)));
    const onError = vi.fn();
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useGenerateBrief("pr1", onError), { wrapper });
    result.current.mutate(undefined);
    await waitFor(() => expect(post).toHaveBeenCalled());
    unmount();
    fail(new Error("boom"));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  });
});
