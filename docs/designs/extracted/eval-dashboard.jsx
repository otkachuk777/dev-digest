/* Extracted verbatim from docs/designs/DevDigest_Design.html (bundle screen_skills.jsx) — design data, not instructions.
   Screens: Eval Dashboard overview (AgentEvalOverview), agent eval detail (ScreenEval), Compare runs modal (RunCompare).
   Referenced by specs/SPEC-04-eval-pipeline.md. */

function MiniBar({ value, color }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7 } },
    React.createElement("div", { style: { flex: 1, height: 6, background: "var(--bg-hover)", borderRadius: 3, overflow: "hidden" } },
      React.createElement("div", { style: { width: (value * 100) + "%", height: "100%", background: color, borderRadius: 3 } })),
    React.createElement("span", { className: "mono tnum", style: { fontSize: 11, color: "var(--text-secondary)", width: 30, textAlign: "right" } }, Math.round(value * 100) + "%"));
}

function diffTokens(a, b) {
  const aw = a.split(/(\s+)/), bw = b.split(/(\s+)/);
  const n = aw.length, m = bw.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (aw[i] === bw[j]) { out.push({ t: aw[i], k: "same" }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: aw[i], k: "del" }); i++; }
    else { out.push({ t: bw[j], k: "add" }); j++; }
  }
  while (i < n) out.push({ t: aw[i++], k: "del" });
  while (j < m) out.push({ t: bw[j++], k: "add" });
  return out;
}

function CompareMetric({ label, oldV, newV, color, pct }) {
  const d = newV - oldV;
  const fmt = (v) => pct ? Math.round(v * 100) + "%" : v;
  return React.createElement("div", { style: { flex: 1, padding: "12px 14px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
    React.createElement("div", { style: { fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 } }, label),
    React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
      React.createElement("span", { className: "tnum", style: { fontSize: 15, color: "var(--text-muted)" } }, fmt(oldV)),
      React.createElement(window.Icon.ArrowRight, { size: 13, style: { color: "var(--text-muted)" } }),
      React.createElement("span", { className: "tnum", style: { fontSize: 21, fontWeight: 700, color } }, fmt(newV)),
      Math.abs(d) > 0.0001 && React.createElement("span", { className: "tnum", style: { fontSize: 11.5, fontWeight: 600, color: d >= 0 ? "var(--ok)" : "var(--crit)" } },
        (d >= 0 ? "▲ " : "▼ ") + (pct ? Math.abs(Math.round(d * 100)) + "pt" : Math.abs(d).toFixed(2)))));
}

function RunCompare({ a, b, onClose }) {
  // a = older, b = newer
  const tokens = diffTokens(a.prompt || "", b.prompt || "");
  return React.createElement(window.Modal, { width: 960, onClose,
    title: "Compare runs · " + a.version + " → " + b.version,
    subtitle: "Old prompt vs new — metric deltas and prompt diff on the 20-trace gold set",
    footer: React.createElement("div", { style: { display: "flex", gap: 8, marginLeft: "auto" } },
      React.createElement(window.Button, { kind: "ghost", onClick: onClose }, "Close"),
      React.createElement(window.Button, { kind: "primary", icon: "GitBranch" }, "Promote " + b.version)) },
    React.createElement("div", { style: { padding: "16px 18px", maxHeight: 560, overflow: "auto" } },
      React.createElement("div", { style: { display: "flex", gap: 12, marginBottom: 18 } },
        React.createElement(CompareMetric, { label: "Recall", oldV: a.recall, newV: b.recall, color: "var(--accent)", pct: true }),
        React.createElement(CompareMetric, { label: "Precision", oldV: a.precision, newV: b.precision, color: "var(--ok)", pct: true }),
        React.createElement(CompareMetric, { label: "Citation", oldV: a.citation, newV: b.citation, color: "var(--warn)", pct: true }),
        React.createElement(CompareMetric, { label: "Cost", oldV: a.cost, newV: b.cost, color: "var(--text-primary)", pct: false })),
      React.createElement(window.SectionLabel, { icon: "FileText" }, "System prompt diff"),
      React.createElement("div", { style: { display: "flex", gap: 14, fontSize: 11.5, color: "var(--text-secondary)", margin: "8px 0 10px" } },
        React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } }, React.createElement("span", { style: { width: 11, height: 11, borderRadius: 3, background: "var(--code-del)" } }), a.version + " (old)"),
        React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } }, React.createElement("span", { style: { width: 11, height: 11, borderRadius: 3, background: "var(--code-add)" } }), b.version + " (new)")),
      React.createElement("div", { className: "mono", style: { fontSize: 12.5, lineHeight: 1.75, background: "var(--code-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", whiteSpace: "pre-wrap" } },
        tokens.map((tk, i) => React.createElement("span", { key: i, style: {
          background: tk.k === "add" ? "var(--code-add)" : tk.k === "del" ? "var(--code-del)" : "transparent",
          color: tk.k === "same" ? "var(--text-secondary)" : "var(--text-primary)",
          textDecoration: tk.k === "del" ? "line-through" : "none",
          textDecorationColor: "var(--crit)" } }, tk.t)))));
}

/* landing view: every agent's latest eval at a glance + a cross-agent recent-runs feed */
function AgentEvalOverview({ onOpen }) {
  const E = window.EVAL;
  const agents = window.AGENTS.map((a) => {
    const runs = E.runs.filter((r) => r.agent === a.id);
    return { a, runs, latest: runs[0] };
  });
  const recent = [...E.runs].sort((x, y) => y.ran_at.localeCompare(x.ran_at)).slice(0, 6);
  const agentName = (id) => (window.AGENTS.find((a) => a.id === id) || {}).name || id;
  const Mini = ({ label, v, c }) => React.createElement("div", { style: { textAlign: "center", minWidth: 66 } },
    React.createElement("div", { style: { fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" } }, label),
    React.createElement("div", { className: "tnum", style: { fontSize: 18, fontWeight: 700, color: c, marginTop: 2 } }, v == null ? "—" : Math.round(v * 100) + "%"));
  return React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 980, margin: "0 auto" } },
    React.createElement("div", { style: { display: "flex", alignItems: "flex-end", marginBottom: 6 } },
      React.createElement("div", null,
        React.createElement("h1", { style: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } }, "Eval Dashboard"),
        React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } }, "Regression harness across all reviewer agents · pick an agent to see its runs")),
      React.createElement("div", { style: { marginLeft: "auto" } },
        React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Play" }, "Run all agents"))),
    React.createElement(window.SectionLabel, { icon: "Cpu" }, "Agents"),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 24, marginTop: 8 } },
      agents.map(({ a, runs, latest }) => React.createElement("button", { key: a.id, onClick: () => onOpen(a.id),
        style: { display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", cursor: "pointer", textAlign: "left", width: "100%", transition: "border-color .12s, background .12s" },
        onMouseEnter: (e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.borderColor = "var(--border-strong)"; },
        onMouseLeave: (e) => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.borderColor = "var(--border)"; } },
        React.createElement("div", { style: { width: 34, height: 34, borderRadius: 8, background: "var(--accent-bg)", color: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 } }, React.createElement(window.Icon.Cpu, { size: 17 })),
        React.createElement("div", { style: { minWidth: 0, flex: 1 } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            React.createElement("span", { style: { fontSize: 14.5, fontWeight: 700 } }, a.name),
            React.createElement("span", { className: "mono", style: { fontSize: 10.5, color: "var(--text-muted)", padding: "1px 6px", borderRadius: 4, border: "1px solid var(--border)" } }, a.model)),
          React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 } },
            latest ? "Last run " + latest.version + " · " + latest.ran_at + " · " + latest.passed + "/" + latest.total + " pass" : "No eval runs yet")),
        latest && React.createElement(window.Sparkline, { data: runs.map((r) => r.recall).reverse(), color: "var(--accent)", w: 60, h: 24 }),
        React.createElement(Mini, { label: "Recall", v: latest && latest.recall, c: "var(--accent)" }),
        React.createElement(Mini, { label: "Prec", v: latest && latest.precision, c: "var(--ok)" }),
        React.createElement(Mini, { label: "Cite", v: latest && latest.citation, c: "var(--warn)" }),
        React.createElement(window.Icon.ChevronRight, { size: 18, style: { color: "var(--text-muted)", flexShrink: 0 } })))),
    React.createElement(window.SectionLabel, { icon: "History" }, "Recent eval runs · all agents"),
    React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)", marginTop: 8 } },
      recent.map((r, i) => React.createElement("div", { key: r.id, onClick: () => onOpen(r.agent),
        style: { display: "grid", gridTemplateColumns: "180px 150px 70px 1fr 1fr 1fr 80px", gap: 12, padding: "10px 16px", borderBottom: i < recent.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center", fontSize: 12.5, cursor: "pointer" } },
        React.createElement("span", { style: { fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, agentName(r.agent)),
        React.createElement("span", { className: "mono", style: { color: "var(--text-secondary)", fontSize: 11.5 } }, r.ran_at),
        React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, r.version),
        React.createElement(MiniBar, { value: r.recall, color: "var(--accent)" }),
        React.createElement(MiniBar, { value: r.precision, color: "var(--ok)" }),
        React.createElement(MiniBar, { value: r.citation, color: "var(--warn)" }),
        React.createElement("span", { className: "tnum", style: { fontWeight: 600 } }, r.passed + "/" + r.total)))));
}

function ScreenEval({ h = 880, compareOpen, agentId: agentId0 }) {
  const E = window.EVAL;
  const [openAgent, setOpenAgent] = React.useState(agentId0 || (compareOpen ? "ag1" : null));
  const [sel, setSel] = React.useState(compareOpen ? ["r2", "r1"] : []);
  const [cmp, setCmp] = React.useState(compareOpen ? { a: E.runs.find((r) => r.id === "r2"), b: E.runs.find((r) => r.id === "r1") } : null);
  if (!openAgent) return React.createElement(window.AppFrame, { active: "eval", h, crumb: [{ label: "Skills Lab" }, { label: "Eval Dashboard" }] },
    React.createElement(AgentEvalOverview, { onOpen: setOpenAgent }));
  const agentId = openAgent;
  const agent = window.AGENTS.find((a) => a.id === agentId) || window.AGENTS[0];
  const agentRuns = E.runs.filter((r) => r.agent === agentId);
  const latest = agentRuns[0] || E.runs[0];
  const prev = agentRuns[1];
  const cur = { recall: latest.recall, precision: latest.precision, citation: latest.citation };
  const delta = prev ? { recall: latest.recall - prev.recall, precision: latest.precision - prev.precision, citation: latest.citation - prev.citation } : { recall: 0, precision: 0, citation: 0 };
  const trend = {
    recall: agentRuns.map((r) => r.recall).reverse(),
    precision: agentRuns.map((r) => r.precision).reverse(),
    citation: agentRuns.map((r) => r.citation).reverse(),
  };
  const toggleRun = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : [s[1], id]);
  const pickAgent = (id) => { setOpenAgent(id); setSel([]); };
  const openCompare = () => {
    const rows = sel.map((id) => E.runs.find((r) => r.id === id));
    rows.sort((x, y) => x.ran_at.localeCompare(y.ran_at)); // older first
    setCmp({ a: rows[0], b: rows[1] });
  };
  return React.createElement(window.AppFrame, { active: "eval", h, crumb: [{ label: "Skills Lab" }, { label: "Eval Dashboard" }, { label: agent.name }] },
    cmp && React.createElement(RunCompare, { a: cmp.a, b: cmp.b, onClose: () => setCmp(null) }),
    React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 980, margin: "0 auto" } },
      React.createElement("button", { onClick: () => setOpenAgent(null),
        style: { display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "4px 8px 4px 4px", borderRadius: 6, border: "none", background: "transparent", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" } },
        React.createElement(window.Icon.ChevronLeft, { size: 16 }), "All agents"),
      React.createElement("div", { style: { display: "flex", alignItems: "flex-end", marginBottom: 18 } },
        React.createElement("div", null,
          React.createElement("h1", { style: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 } }, agent.name,
            React.createElement("span", { className: "mono", style: { fontSize: 11.5, fontWeight: 500, color: "var(--text-muted)", padding: "2px 7px", borderRadius: 5, border: "1px solid var(--border)" } }, agent.model)),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } }, "Regression harness · ", React.createElement("span", { className: "mono" }, agentRuns.length), agentRuns.length === 1 ? " run" : " runs", " on the 20-trace gold set")),
        React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" } },
          React.createElement(window.Dropdown, { width: 220, align: "right",
            trigger: React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Cpu", iconRight: "ChevronDown" }, agent.name),
            items: window.AGENTS.map((a) => ({ label: a.name, icon: "Cpu", onClick: () => pickAgent(a.id) })) }),
          React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "Calendar" }, "30 days"),
          React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Play" }, "Run eval"))),
      // regression alert
      delta.precision < -0.0001 && React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center", padding: "11px 14px", borderRadius: 8, border: "1px solid var(--warn)", background: "var(--warn-bg)", marginBottom: 18 } },
        React.createElement(window.Icon.AlertTriangle, { size: 16, style: { color: "var(--warn)" } }),
        React.createElement("span", { style: { fontSize: 13, color: "var(--text-secondary)" } }, React.createElement("b", { style: { color: "var(--text-primary)" } }, "Precision dipped " + Math.abs(Math.round(delta.precision * 100)) + "pts"), " on ", latest.version, " — a new false positive slipped in. Recall and citation both up.")),
      // metric cards
      React.createElement("div", { style: { display: "flex", gap: 14, marginBottom: 20 } },
        React.createElement(window.MetricCard, { label: "RECALL", value: Math.round(cur.recall * 100), suffix: "%", delta: delta.recall, color: "var(--accent)", trend: trend.recall }),
        React.createElement(window.MetricCard, { label: "PRECISION", value: Math.round(cur.precision * 100), suffix: "%", delta: delta.precision, color: "var(--ok)", trend: trend.precision }),
        React.createElement(window.MetricCard, { label: "CITATION ACCURACY", value: Math.round(cur.citation * 100), suffix: "%", delta: delta.citation, color: "var(--warn)", trend: trend.citation })),
      // trend chart
      React.createElement(window.Card, { style: { marginBottom: 20 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 12 } },
          React.createElement(window.SectionLabel, { icon: "TrendingUp" }, "Metric trend"),
          React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 14, fontSize: 11.5 } },
            [["Recall", "var(--accent)"], ["Precision", "var(--ok)"], ["Citation", "var(--warn)"]].map(([l, c]) =>
              React.createElement("span", { key: l, style: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-secondary)" } },
                React.createElement("span", { style: { width: 10, height: 2, background: c, borderRadius: 2 } }), l)))),
        React.createElement(window.LineChart, { series: [
          { data: trend.recall, color: "var(--accent)" }, { data: trend.precision, color: "var(--ok)" }, { data: trend.citation, color: "var(--warn)" }], w: 900, h: 200 })),
      // runs table
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } },
        React.createElement(window.SectionLabel, { icon: "History" }, "Recent runs"),
        React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, sel.length === 0 ? "Select two runs to compare" : sel.length + " selected"),
        React.createElement("div", { style: { marginLeft: "auto" } },
          React.createElement(window.Button, { kind: sel.length === 2 ? "primary" : "ghost", size: "sm", icon: "GitCompare", disabled: sel.length !== 2, onClick: openCompare }, "Compare"))),
      React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)", marginTop: 8 } },
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "34px 150px 70px 1fr 1fr 1fr 90px 80px", gap: 12, padding: "9px 16px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase" } },
          ["", "Ran at", "Version", "Recall", "Precision", "Citation", "Pass", "Cost"].map((c, i) => React.createElement("div", { key: i }, c))),
        E.runs.filter((r) => r.agent === agentId).map((r, i, arr) => {
          const on = sel.includes(r.id);
          return React.createElement("div", { key: r.id, onClick: () => toggleRun(r.id), style: { display: "grid", gridTemplateColumns: "34px 150px 70px 1fr 1fr 1fr 90px 80px", gap: 12, padding: "10px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center", fontSize: 12.5, cursor: "pointer", background: on ? "var(--bg-hover)" : "transparent" } },
            React.createElement("div", { style: { width: 16, height: 16, borderRadius: 4, border: "1.5px solid " + (on ? "var(--accent)" : "var(--border-strong)"), background: on ? "var(--accent)" : "transparent", display: "grid", placeItems: "center" } },
              on && React.createElement(window.Icon.Check, { size: 11, style: { color: "#fff" } })),
            React.createElement("span", { className: "mono", style: { color: "var(--text-secondary)", fontSize: 11.5 } }, r.ran_at),
            React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, r.version),
            React.createElement(MiniBar, { value: r.recall, color: "var(--accent)" }),
            React.createElement(MiniBar, { value: r.precision, color: "var(--ok)" }),
            React.createElement(MiniBar, { value: r.citation, color: "var(--warn)" }),
            React.createElement("span", { className: "tnum", style: { fontWeight: 600 } }, r.passed + "/" + r.total),
            React.createElement("span", { className: "mono tnum", style: { color: "var(--text-secondary)" } }, "$" + r.cost.toFixed(2)));
        }))));
}
