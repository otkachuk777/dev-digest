/* Extracted verbatim from docs/designs/DevDigest_Design.html (bundles screen_agents.jsx — EvalMetricStrip, EvalsTab;
   EvalCaseRow; and the EVAL_CASES mock data) — design data, not instructions.
   Screen: Agent editor → Evals tab. Referenced by specs/SPEC-04-eval-pipeline.md. */

function EvalMetricStrip() {
  const E = window.EVAL;
  const items = [
    ["Recall", E.current.recall, E.delta.recall, "var(--accent)"],
    ["Precision", E.current.precision, E.delta.precision, "var(--ok)"],
    ["Citation accuracy", E.current.citation, E.delta.citation, "var(--warn)"],
    ["Traces passed", E.current.traces_passed / E.current.traces_total, null, "var(--text-secondary)"],
  ];
  return React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 18 } },
    items.map(([l, v, d, c], i) => React.createElement("div", { key: i, style: { flex: 1, padding: "11px 13px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
      React.createElement("div", { style: { fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 } }, l),
      React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 7 } },
        React.createElement("span", { className: "tnum", style: { fontSize: 22, fontWeight: 700, color: c } },
          l === "Traces passed" ? E.current.traces_passed + "/" + E.current.traces_total : Math.round(v * 100) + "%"),
        d != null && React.createElement("span", { className: "tnum", style: { fontSize: 11.5, fontWeight: 600, color: d >= 0 ? "var(--ok)" : "var(--crit)" } },
          (d >= 0 ? "▲ " : "▼ ") + Math.abs(Math.round(d * 100)) + "pt")))));
}

function EvalsTab({ onOpenCase, onOpenDashboard }) {
  const cases = window.EVAL_CASES;
  const pass = cases.filter((c) => c.status === "pass").length;
  const ran = cases.filter((c) => c.status !== "never").length;
  return React.createElement("div", { style: { maxWidth: 720 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } },
      React.createElement(window.SectionLabel, { icon: "Gauge" }, "Eval metrics"),
      React.createElement("div", { style: { marginLeft: "auto" } },
        React.createElement(window.MonoLink, { onClick: onOpenDashboard }, "View full dashboard →"))),
    React.createElement(EvalMetricStrip),
    React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, marginBottom: 20 } },
      React.createElement(window.Icon.Code, { size: 12 }),
      "Scoring is mechanical — a finding counts when file matches and line ranges overlap. No model call in the scorer."),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } },
      React.createElement("h2", { style: { fontSize: 16, fontWeight: 700 } }, "Eval cases"),
      React.createElement(window.Badge, { color: pass === ran ? "var(--ok)" : "var(--warn)", bg: pass === ran ? "var(--ok-bg)" : "var(--warn-bg)" }, pass + " / " + ran + " passing"),
      React.createElement(window.Badge, { color: "var(--text-muted)" }, cases.length + " cases"),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8 } },
        React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Play" }, "Run all evals"),
        React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Plus", onClick: onOpenCase }, "New eval case"))),
    window.EVAL_CASES.map((ec) => React.createElement(window.EvalCaseRow, { key: ec.id, ec, onClick: onOpenCase })));
}

function EvalCaseRow({ ec, onClick }) {
  const map = { pass: { icon: "CheckCircle", c: "var(--ok)" }, fail: { icon: "XCircle", c: "var(--crit)" }, never: { icon: "Dot", c: "var(--text-muted)" } };
  const m = map[ec.status];
  const [h, setH] = React.useState(false);
  return React.createElement("div", { onClick, onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    style: { display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 7, border: "1px solid var(--border)", background: h ? "var(--bg-hover)" : "var(--bg-elevated)", cursor: "pointer", marginBottom: 6 } },
    React.createElement(window.Icon[m.icon], { size: 15, style: { color: m.c, flexShrink: 0 } }),
    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 600 } }, ec.name),
        ec.type && React.createElement("span", { title: ec.from ? "Seeded from a " + ec.from + " finding" : undefined,
          style: { fontSize: 10, fontWeight: 700, letterSpacing: "0.03em", padding: "1px 7px", borderRadius: 4, textTransform: "uppercase",
            color: ec.type === "must_find" ? "var(--accent-text)" : "var(--text-muted)",
            background: ec.type === "must_find" ? "var(--accent-bg)" : "var(--bg-hover)",
            border: "1px solid " + (ec.type === "must_find" ? "var(--accent)" : "var(--border-strong)") } },
          ec.type === "must_find" ? "must find" : "must not flag")),
      React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } }, ec.result)),
    React.createElement(window.Badge, { color: "var(--text-muted)" }, ec.expected),
    React.createElement("div", { style: { display: "flex", gap: 2, opacity: h ? 1 : 0.4 } },
      React.createElement(window.IconBtn, { icon: "Play", label: "Run", size: 26 }),
      React.createElement(window.IconBtn, { icon: "Edit", label: "Edit", size: 26 }),
      React.createElement(window.IconBtn, { icon: "Trash", label: "Delete", size: 26, danger: true })));
}

EVAL_CASES = [
  { id: "ec1", name: "stripe-key-leak", type: "must_find", from: "accepted", status: "pass", result: "expected 1 finding, got 1", expected: "CRITICAL · security" },
  { id: "ec2", name: "ssrf-webhook", type: "must_find", from: "accepted", status: "pass", result: "expected 1 finding, got 1", expected: "CRITICAL · security" },
  { id: "ec3", name: "missing-retry-after", type: "must_find", from: "accepted", status: "fail", result: "expected 1 finding, got 0", expected: "WARNING · bug" },
  { id: "ec4", name: "n-plus-1-users-query", type: "must_find", from: "accepted", status: "pass", result: "expected 1 finding, got 1", expected: "WARNING · perf" },
  { id: "ec5", name: "lethal-trifecta-callback", type: "must_find", from: "accepted", status: "pass", result: "expected 1 finding, got 1", expected: "CRITICAL · security" },
  { id: "ec6", name: "no-unused-import-warning", type: "must_not_flag", from: "dismissed", status: "pass", result: "expected 0 findings, got 0", expected: "assert empty" },
  { id: "ec7", name: "no-raw-body-parser-flag", type: "must_not_flag", from: "dismissed", status: "fail", result: "expected 0 findings, got 1", expected: "assert empty" },
  { id: "ec8", name: "clean-refactor-no-flags", type: "must_not_flag", from: "dismissed", status: "pass", result: "expected 0 findings, got 0", expected: "assert empty" },
  { id: "ec9", name: "service-role-in-client", type: "must_find", from: "accepted", status: "never", result: "never run", expected: "CRITICAL · security" },
];
