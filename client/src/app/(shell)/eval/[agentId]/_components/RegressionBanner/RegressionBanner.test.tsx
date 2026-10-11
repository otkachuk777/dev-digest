import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseResult, EvalRunDetail, EvalRunRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";
import { RegressionBanner } from "./RegressionBanner";

const run = (o: Partial<EvalRunRecord>): EvalRunRecord => ({
  id: "r", agent_id: "a", agent_version: 1, status: "done", error: null, started_at: "", finished_at: null,
  cases_done: 0, total: 4, passed: 3, errored: 0, recall: 0.5, precision: 0.8, citation_accuracy: 0.5, cost_usd: null, duration_ms: null, ...o,
});
const res = (name: string, status: "pass" | "fail") => ({ case_id: name, case_name: name, status }) as EvalCaseResult;
const detail = (r: EvalRunRecord, results: EvalCaseResult[]) => ({ ...r, results }) as unknown as EvalRunDetail;

function renderBanner(p: React.ComponentProps<typeof RegressionBanner>) {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <RegressionBanner {...p} />
    </NextIntlClientProvider>,
  );
}
afterEach(cleanup);

describe("RegressionBanner", () => {
  it("EC-21 / AC-79: precision -2pt, recall +3pt, a newly failing case", () => {
    const prev = run({ agent_version: 6 }), latest = run({ agent_version: 7, recall: 0.53, precision: 0.78 });
    renderBanner({ latest, prev, latestDetail: detail(latest, [res("no-raw-body-parser-flag", "fail")]), prevDetail: detail(prev, [res("no-raw-body-parser-flag", "pass")]) });
    expect(screen.getByText("Precision dropped 2pt on v7 vs v6. Recall up 3pt. Started failing: no-raw-body-parser-flag.")).toBeInTheDocument();
  });

  it("AC-79: no banner when nothing dropped by 1pt", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <RegressionBanner latest={run({ recall: 0.9 })} prev={run({})} />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("EC-20: a single done run has no banner", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <RegressionBanner latest={run({})} prev={undefined} />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
