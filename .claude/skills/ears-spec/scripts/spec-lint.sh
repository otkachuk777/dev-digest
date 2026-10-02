#!/usr/bin/env bash
# Deterministic checks for a SPEC-NN-<slug>.md written by spec-creator. Read-only.
# Usage: spec-lint.sh <path/to/SPEC-NN-slug.md>   → prints "ERROR <line>: <msg>" per problem; exit 1 if any.
#   - file name / Spec ID / Status / Supersedes header; Spec ID unique across the repo's specs/ folders
#   - the 9 template sections, exact headings, in order (### subsections are free)
#   - every AC-N: one EARS form ("The … shall", WHEN/WHILE/WHERE …, the … shall, IF …, THEN the … shall),
#     ends with [verify: unit|it|e2e|manual], unique id; every NFR-N ends with [verify: …] too
#   - '### Traceability' under the AC section lists every US-N and every AC-N
#   - vague words (fast, properly, …) in AC/NFR lines that carry no number
#   - every US/AC/EC/NFR/OQ reference points to a defined id; every EC references an AC or is itself EARS
#   - every ```mermaid block starts with a known diagram type
set -uo pipefail
[ $# -eq 1 ] && [ -f "$1" ] || { echo "usage: spec-lint.sh <SPEC-NN-slug.md>" >&2; exit 2; }
ROOT=$(cd "$(dirname "$1")" && git rev-parse --show-toplevel 2>/dev/null || true)
exec python3 - "$1" "$ROOT" <<'PY'
import re, sys, pathlib

path, root = pathlib.Path(sys.argv[1]), sys.argv[2]
lines = path.read_text(encoding="utf-8").splitlines()
errors = []
def err(n, msg): errors.append(f"ERROR {n}: {msg}")

SECTIONS = ["Problem and user", "Goals / Non-goals", "User stories", "Acceptance criteria (EARS)",
            "Edge cases", "Non-functional requirements", "Inputs and provenance", "Untrusted inputs", "Open questions"]
EARS = re.compile(r"^(The [^,]+? shall |WHEN [^,]+, the [^,]+? shall |WHILE [^,]+, the [^,]+? shall "
                  r"|WHERE [^,]+, the [^,]+? shall |IF [^,]+, THEN the [^,]+? shall )")
VERIFY = re.compile(r"\[verify: (unit|it|e2e|manual)(, (unit|it|e2e|manual))*\]\s*$")
VAGUE = re.compile(r"\b(fast|quickly|slow|properly|correctly|user[- ]friendly|reasonable|appropriate|intuitive"
                   r"|seamless(ly)?|efficient(ly)?|robust|nice|easy|easily|as needed|etc\.?)\b", re.I)
DEF = re.compile(r"^\s*(?:[-*]\s*)?(?:\*\*|###\s*)?((?:US|AC|EC|NFR|OQ)-\d+)\b\**\s*[:.]")
REF = re.compile(r"\b((?:US|AC|EC|NFR|OQ)-\d+)\b")
MERMAID = ("flowchart", "graph", "sequenceDiagram", "stateDiagram-v2", "stateDiagram", "classDiagram", "erDiagram")

# ---- header -----------------------------------------------------------------
m = re.fullmatch(r"SPEC-(\d{2,})-[a-z0-9]+(-[a-z0-9]+)*\.md", path.name)
if not m: err(0, f"file name '{path.name}' is not SPEC-NN-<kebab-slug>.md")
num = m.group(1) if m else None
head = lines[:7]
if not head or not head[0].startswith("# Spec: ") or len(head[0]) <= 8: err(1, "first line must be '# Spec: <feature name>'")
sid = next((l for l in head if l.startswith("Spec ID:")), None)
if not sid or not re.fullmatch(r"Spec ID: SPEC-\d{2,}", sid.strip()): err(2, "missing 'Spec ID: SPEC-NN' in the header")
elif num and sid.strip() != f"Spec ID: SPEC-{num}": err(2, f"'{sid.strip()}' does not match file name SPEC-{num}")
if not any(re.fullmatch(r"Status: (draft|approved|implemented)", l.strip()) for l in head):
    err(3, "missing 'Status: draft | approved | implemented'")
if not any(l.startswith("Supersedes:") for l in head): err(4, "missing 'Supersedes:' line (use 'none')")

if root and num:
    rootp = pathlib.Path(root)
    def foreign(other):  # node_modules, .claude/worktrees or any nested git checkout (has its own .git)
        parts = other.relative_to(rootp).parts
        return ("node_modules" in parts or parts[:2] == (".claude", "worktrees")
                or any((rootp.joinpath(*parts[:k]) / ".git").exists() for k in range(1, len(parts) - 1)))
    for other in rootp.glob("**/specs/SPEC-*.md"):
        if other.resolve() == path.resolve() or foreign(other): continue
        if other.name.startswith(f"SPEC-{num}-") or f"Spec ID: SPEC-{num}\n" in other.read_text(encoding="utf-8") + "\n":
            err(2, f"SPEC-{num} is already used by {other.relative_to(root)}")

# ---- sections -----------------------------------------------------------------
found = [(i + 1, l[3:].strip()) for i, l in enumerate(lines) if l.startswith("## ")]
if [h for _, h in found] != SECTIONS:
    err(found[0][0] if found else 0, f"'## ' sections must be exactly, in order: {' | '.join(SECTIONS)}; found: {' | '.join(h for _, h in found) or 'none'}")
bounds = {h: (n, found[k + 1][0] if k + 1 < len(found) else len(lines) + 1) for k, (n, h) in enumerate(found)}
def section(name):
    a, b = bounds.get(name, (0, 0))
    return [(i, lines[i - 1]) for i in range(a + 1, b)]
def text(line):  # strip bullet / bold id prefix / backticks
    return re.sub(r"^\s*(?:[-*]\s*)?(?:\*\*)?(?:(?:AC|EC|NFR)-\d+)(?:\*\*)?\s*[:.]\s*(?:\*\*)?", "", line).strip()

# ---- code blocks (skipped by the line checks below) ----------------------------
fence, in_code, code_lines = None, False, set()
for i, l in enumerate(lines, 1):
    if l.lstrip().startswith("```"):
        if not in_code:
            in_code, fence = True, l.strip()[3:].strip()
            if fence == "mermaid":
                first = next((x.strip() for x in lines[i:] if x.strip()), "")
                if not first.startswith(MERMAID): err(i, f"mermaid block must start with one of {', '.join(MERMAID)}")
        else:
            in_code = False
        code_lines.add(i); continue
    if in_code: code_lines.add(i)

# ---- ids ----------------------------------------------------------------------
defined = {}
for i, l in enumerate(lines, 1):
    if i in code_lines: continue
    d = DEF.match(l)
    if d:
        if d.group(1) in defined: err(i, f"{d.group(1)} is defined twice (first at line {defined[d.group(1)]})")
        defined.setdefault(d.group(1), i)
for i, l in enumerate(lines, 1):
    for r in set(REF.findall(l)):
        if r not in defined: err(i, f"{r} is referenced but never defined")

# ---- acceptance criteria -------------------------------------------------------
acs = [(i, l) for i, l in section("Acceptance criteria (EARS)") if i not in code_lines and DEF.match(l) and DEF.match(l).group(1).startswith("AC-")]
if bounds.get("Acceptance criteria (EARS)") and not acs: err(bounds["Acceptance criteria (EARS)"][0], "no AC-N defined")
for i, l in acs:
    t = text(l)
    if not EARS.match(t): err(i, "AC is not in an EARS form (The … shall / WHEN|WHILE|WHERE …, the … shall / IF …, THEN the … shall)")
    elif len(re.findall(r"\bshall\b", t)) != 1: err(i, "AC must contain exactly one 'shall' (split it into several ACs)")
    if not VERIFY.search(l): err(i, "AC must end with [verify: unit|it|e2e|manual]")

nfrs = [(i, l) for i, l in section("Non-functional requirements") if i not in code_lines and DEF.match(l) and DEF.match(l).group(1).startswith("NFR-")]
for i, l in nfrs:
    if not VERIFY.search(l): err(i, "NFR must end with [verify: unit|it|e2e|manual]")

# ---- traceability ----------------------------------------------------------------
ac_sec = section("Acceptance criteria (EARS)")
tr = next((k for k, (i, l) in enumerate(ac_sec) if l.strip() == "### Traceability"), None)
if bounds.get("Acceptance criteria (EARS)"):
    if tr is None:
        err(bounds["Acceptance criteria (EARS)"][0], "missing '### Traceability' table at the end of Acceptance criteria")
    else:
        rows = [l for i, l in ac_sec[tr + 1:] if l.strip().startswith("|")]
        listed = set(REF.findall(" ".join(rows)))
        for rid, line in sorted(defined.items(), key=lambda x: x[1]):
            if rid.startswith(("US-", "AC-")) and rid not in listed:
                err(line, f"{rid} is missing from the Traceability table")

# ---- vague words ---------------------------------------------------------------
for name in ("Acceptance criteria (EARS)", "Non-functional requirements"):
    for i, l in section(name):
        if i in code_lines or re.search(r"\d", text(l)): continue
        v = VAGUE.search(text(l))
        if v: err(i, f"vague word '{v.group(0)}' without a measurable value")

# ---- edge cases ----------------------------------------------------------------
for i, l in section("Edge cases"):
    d = DEF.match(l)
    if i in code_lines or not d or not d.group(1).startswith("EC-"): continue
    if not re.search(r"\bAC-\d+\b", l) and not re.search(r"\bshall\b", l):
        err(i, f"{d.group(1)} must reference an AC-N or state its own EARS requirement")

# ---- open questions / untrusted inputs ------------------------------------------
if bounds.get("Open questions") and not any(l.strip() for i, l in section("Open questions") if i not in code_lines):
    err(bounds["Open questions"][0], "Open questions is empty — write 'None' if there are none")
prov = " ".join(l for _, l in section("Inputs and provenance")).lower()
unt = [l.strip() for _, l in section("Untrusted inputs") if l.strip()]
if "untrusted" in prov and (not unt or unt == ["None"]):
    err(bounds.get("Untrusted inputs", (0,))[0], "provenance lists untrusted inputs but 'Untrusted inputs' has no handling statements")

print("\n".join(errors) if errors else f"OK {path}")
sys.exit(1 if errors else 0)
PY
