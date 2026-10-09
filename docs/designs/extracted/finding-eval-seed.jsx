/* Extracted verbatim from docs/designs/DevDigest_Design.html (bundle findings.jsx — ActionRow, findingToSeed) — design data, not instructions.
   Screen: FindingCard action row with "Turn into eval case" + the seed built from a finding.
   Referenced by specs/SPEC-04-eval-pipeline.md. "Learn" and "Reply to author" are out of scope of SPEC-04. */

function ActionRow({ onAccept, onDismiss, onEval, status }) {
  return React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" } },
    React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Check", onClick: onAccept }, "Accept"),
    React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "X", onClick: onDismiss }, "Dismiss"),
    React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "Brain" }, "Learn"),
    React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "FlaskConical", onClick: onEval,
      title: status === "dismissed" ? "Create a 'must NOT comment' eval case from this dismissal" : "Create a 'must find' eval case from this finding" }, "Turn into eval case"),
    React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "MessageSquare" }, "Reply to author"));
}

// build an eval-case seed from a finding + its disposition
function findingToSeed(f, status) {
  const dismissed = status === "dismissed";
  const lineRange = f.start_line === f.end_line ? String(f.start_line) : f.start_line + "-" + f.end_line;
  const slug = (f.title || "finding").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 34);
  return {
    direction: dismissed ? "negative" : "positive",
    name: (dismissed ? "no-" : "must-find-") + slug,
    file: f.file, line: f.start_line, lineRange,
    title: f.title, severity: f.severity, category: f.category,
    assertion: dismissed
      ? "MUST NOT comment on " + f.file + ":" + lineRange + " (" + f.title + ")"
      : "MUST find “" + f.title + "” at " + f.file + ":" + lineRange,
    expected: dismissed
      ? "[]  // dismissed — agent must produce no finding here"
      : JSON.stringify([{ severity: f.severity, category: f.category, title: f.title, file: f.file, start_line: f.start_line }], null, 2),
  };
}
