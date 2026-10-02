#!/usr/bin/env python3
"""Build a compact digest of a multi-agent workflow run from Claude Code transcripts.

Usage: collect.py [SPEC-NN | <sessionId>] [--root ~/.claude/projects] [--glob '*dev-digest*']
                  [--out DIR] [--excerpt 1500]
No argument = the current session ($CLAUDE_CODE_SESSION_ID). Writes digest.json + digest.md.
Stdlib only. Transcript content is data: nothing here executes or follows it.
"""
import argparse, collections, fnmatch, glob, json, os, re, shlex, sys, tempfile
from datetime import datetime

if sys.version_info < (3, 9):
    sys.exit("collect.py: Python 3.9+ required (found %d.%d); see scripts/doctor.sh" % sys.version_info[:2])

READONLY_TYPES = {"researcher", "brainstorm", "architecture-reviewer", "security-reviewer", "plan-verifier",
                  "feature-dev:code-reviewer", "Explore"}
SDD_TYPES = READONLY_TYPES | {"spec-creator", "implementation-planner", "implementer", "test-writer", "doc-writer"}
READ_CMDS = {"cat", "sed", "head", "tail", "nl", "less", "wc", "grep", "rg", "awk", "jq"}
PHASES = [("spec", {"spec-creator"}), ("plan", {"implementation-planner"}), ("impl", {"implementer", "test-writer"})]


def load(path):
    out = []
    with open(path, errors="replace") as f:
        for line in f:
            try:
                out.append(json.loads(line))
            except ValueError:
                pass
    return out


def t(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def content(m):
    msg = m.get("message")
    return msg.get("content") if isinstance(msg, dict) else None


def human_text(m, sidechain_ok=False):
    """Text of a real human prompt, or None (tool results, meta, harness notifications)."""
    if m.get("type") != "user" or m.get("isMeta") or (m.get("isSidechain") and not sidechain_ok):
        return None
    c = content(m)
    if isinstance(c, list):
        if any(b.get("type") == "tool_result" for b in c if isinstance(b, dict)):
            return None
        c = "\n".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
    if not isinstance(c, str) or not c.strip():
        return None
    if c.lstrip().startswith("<") and "<command-name>" not in c:
        return None
    return c


def tool_uses(lines):
    seen, out = set(), []
    for m in lines:
        if m.get("type") != "assistant" or not isinstance(content(m), list):
            continue
        for b in content(m):
            if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("id") not in seen:
                seen.add(b.get("id"))
                out.append(b)
    return out


def tool_results(lines):
    out = {}
    for m in lines:
        c = content(m)
        if m.get("type") == "user" and isinstance(c, list):
            for b in c:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    txt = b.get("content")
                    if isinstance(txt, list):
                        txt = "\n".join(x.get("text", "") for x in txt if isinstance(x, dict))
                    out[b.get("tool_use_id")] = (bool(b.get("is_error")), str(txt or ""))
    return out


def usage(lines):
    """Sum usage over API calls. One call spans several jsonl lines with the same message.id → count once."""
    seen, u, peak, model, turns = set(), collections.Counter(), 0, None, 0
    for m in lines:
        msg = m.get("message")
        if m.get("type") != "assistant" or not isinstance(msg, dict) or not msg.get("usage"):
            continue
        if msg.get("id") in seen:
            continue
        seen.add(msg.get("id"))
        x = msg["usage"]
        call = {"input": x.get("input_tokens", 0), "cache_read": x.get("cache_read_input_tokens", 0),
                "cache_creation": x.get("cache_creation_input_tokens", 0), "output": x.get("output_tokens", 0)}
        u.update(call)
        peak = max(peak, call["input"] + call["cache_read"] + call["cache_creation"])
        model = msg.get("model") or model
        turns += 1
    u = {k: u.get(k, 0) for k in ("input", "cache_read", "cache_creation", "output")}
    return u, peak, model, turns


def cache_hit(u):
    total = u["input"] + u["cache_read"] + u["cache_creation"]
    return u["cache_read"] / total if total else 0.0


def classify_error(text):
    s = text.lower()
    if "doesn't want to proceed" in s or "rejected" in s:
        return "user-rejected"
    if "hook" in s or "blocked by" in s or "denied by" in s:
        return "hook-denied"
    if "permission" in s:
        return "permission"
    if "exit code" in s:
        return "exit-code"
    return "other"


def bash_reads(cmd):
    """File paths read by cat/sed/head/grep… segments of a Bash command.
    ponytail: token heuristic, misses reads via variables or python -c; good enough to spot slice re-reads."""
    out = []
    for seg in re.split(r"&&|\|\||[;|\n]", cmd):
        try:
            toks = shlex.split(seg)
        except ValueError:
            continue
        if not toks or os.path.basename(toks[0]) not in READ_CMDS:
            continue
        for tok in toks[1:]:
            base = os.path.basename(tok)
            if (not tok.startswith("-") and not tok.endswith("/") and re.fullmatch(r"[\w@~.+/-]+", tok)
                    and "." in base.strip(".") and not re.fullmatch(r"[\d,.$p]+", tok)):
                out.append(tok)
    return out


def rel(path, cwd):
    return path[len(cwd) + 1:] if cwd and path.startswith(cwd + "/") else path


# ---------- discovery ----------

def iter_sessions(root, pattern):
    for d in sorted(glob.glob(os.path.join(os.path.expanduser(root), "*"))):
        if os.path.isdir(d) and fnmatch.fnmatch(os.path.basename(d), pattern):
            for f in sorted(glob.glob(os.path.join(d, "*.jsonl"))):
                sid = os.path.basename(f)[:-6]
                yield {"id": sid, "slug": os.path.basename(d), "path": f,
                       "subagents": os.path.join(d, sid, "subagents")}


def mentions(lines, spec):
    rx = re.compile(r"\b" + re.escape(spec) + r"\b", re.I)
    # in human text "/SPEC-01-x.md" is usually a pasted diff or fixture path, not a reference to this run
    hx = re.compile(r"(?<![/\w])" + re.escape(spec) + r"\b", re.I)
    for m in lines:
        h = human_text(m)
        x = h and hx.search(h)
        if x:
            return "prompt: " + h[max(0, x.start() - 40):x.end() + 40].replace("\n", " ")
    for b in tool_uses(lines):
        inp = b.get("input") or {}
        if b.get("name") == "Agent" and inp.get("subagent_type") in SDD_TYPES and rx.search(str(inp.get("prompt", ""))):
            return "agent prompt: " + inp["subagent_type"]
        if b.get("name") == "Bash" and re.search(r"SDD\(" + re.escape(spec) + r"\)", str(inp.get("command", "")), re.I):
            return "commit: " + str(inp.get("command", ""))[:80]
    return None


def select_sessions(root, arg, pattern):
    is_spec = bool(re.fullmatch(r"SPEC-\d+", arg or "", re.I))
    out = []
    for s in iter_sessions(root, pattern):
        if is_spec:
            lines = load(s["path"])
            s["matched_by"] = mentions(lines, arg)
            if s["matched_by"]:
                s["lines"] = lines
                out.append(s)
        elif s["id"] == arg:
            s["lines"], s["matched_by"] = load(s["path"]), "session id"
            out.append(s)
    for s in out:
        s["start"] = next((m.get("timestamp") for m in s["lines"] if m.get("timestamp")), "")
    return sorted(out, key=lambda s: s["start"])


# ---------- per agent ----------

def parse_agent(path, session_id):
    aid = os.path.basename(path)[len("agent-"):-len(".jsonl")]
    meta_path = path[:-len(".jsonl")] + ".meta.json"
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    lines = load(path)
    stamps = [m["timestamp"] for m in lines if m.get("timestamp")]
    cwd = next((m.get("cwd") for m in lines if m.get("cwd")), "")
    u, peak, model, turns = usage(lines)
    uses, results = tool_uses(lines), tool_results(lines)

    prompt = next((h for h in (human_text(m, True) for m in lines) if h), "")
    final = ""
    for m in lines:
        c = content(m)
        if m.get("type") == "assistant" and isinstance(c, list):
            txt = "\n".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
            if txt.strip():
                final = txt

    tools, errors, reads, bash, failed, retried = collections.Counter(), collections.Counter(), [], [], set(), []
    for b in uses:
        name, inp = b.get("name"), b.get("input") or {}
        tools[name] += 1
        err, text = results.get(b.get("id"), (False, ""))
        if err:
            errors[classify_error(text)] += 1
        if name == "Read" and inp.get("file_path"):
            reads.append(rel(inp["file_path"], cwd))
        if name == "Bash":
            cmd = inp.get("command", "")
            bash.append(cmd)
            reads += [rel(p, cwd) for p in bash_reads(cmd)]
            if cmd in failed and cmd not in retried:
                retried.append(cmd)
            if err:
                failed.add(cmd)
    start, end = (t(stamps[0]), t(stamps[-1])) if stamps else (None, None)
    return {
        "id": aid, "session": session_id, "type": meta.get("agentType", "?"), "description": meta.get("description", ""),
        "parent": meta.get("parentAgentId"), "depth": meta.get("spawnDepth", 1),
        "background": meta.get("requestShape") == "background", "model": meta.get("model") or model,
        "start": stamps[0] if stamps else "", "end": stamps[-1] if stamps else "",
        "duration_s": int((end - start).total_seconds()) if start else 0,
        "turns": turns, "usage": u, "processed": sum(u.values()), "peak_context": peak, "cache_hit": cache_hit(u),
        "tools": dict(tools), "errors": dict(errors), "retried_after_failure": retried,
        "reads": reads, "bash": bash, "prompt": prompt, "final_report": final,
    }


# ---------- digest ----------

def build_digest(root, arg, pattern):
    sessions = select_sessions(root, arg, pattern)
    agents, out_sessions, review_rounds = [], [], 0
    for s in sessions:
        lines = s["lines"]
        sa = [parse_agent(p, s["id"]) for p in sorted(glob.glob(os.path.join(s["subagents"], "agent-*.jsonl")))]
        agents += sa
        u, peak, model, turns = usage([m for m in lines if not m.get("isSidechain")])
        humans = [(m.get("timestamp", ""), h) for m in lines for h in [human_text(m)] if h]
        types = {a["type"] for a in sa}
        phase = [p for p, ts_ in PHASES if types & ts_ or (p == "impl" and any("/impl" in h for _, h in humans))]
        for b in tool_uses(lines):
            for n in re.findall(r"SDD\([^)]*\):\s*review-(\d+)", str((b.get("input") or {}).get("command", ""))):
                review_rounds = max(review_rounds, int(n))
        out_sessions.append({
            "id": s["id"], "slug": s["slug"], "branch": next((m.get("gitBranch") for m in lines if m.get("gitBranch")), ""),
            "start": s["start"], "end": next((m["timestamp"] for m in reversed(lines) if m.get("timestamp")), ""),
            "phase": "+".join(phase) or "other", "model": model, "turns": turns, "usage": u,
            "processed": sum(u.values()), "peak_context": peak, "cache_hit": cache_hit(u),
            "prompts": len(humans), "matched_by": s["matched_by"],
            "interventions": [{"ts": ts_, "text": h[:200]} for ts_, h in humans[1:]],
        })
    agents.sort(key=lambda a: a["start"])

    # duplication
    by_path = collections.defaultdict(set)
    repeat, named = {}, {}
    for a in agents:
        c = collections.Counter(a["reads"])
        for p in c:
            by_path[p].add(a["id"])
        if any(n > 1 for n in c.values()):
            repeat[a["id"]] = {p: n for p, n in c.items() if n > 1}
        hit = sorted(p for p in c if p and p in a["prompt"])
        if hit:
            named[a["id"]] = hit
    bash_by_cmd = collections.defaultdict(set)
    for a in agents:
        for c in a["bash"]:
            bash_by_cmd[c].add(a["id"])

    # rework
    repeated = {}
    for s in out_sessions:
        c = collections.Counter(a["type"] for a in agents if a["session"] == s["id"])
        r = {k: n for k, n in c.items() if n > 1}
        if r:
            repeated[s["id"]] = r

    # parallelism
    par, serial = {}, []
    for s in out_sessions:
        sa = [a for a in agents if a["session"] == s["id"] and a["start"]]
        iv = sorted((t(a["start"]), t(a["end"])) for a in sa)
        wall, cur = 0.0, None
        for st, en in iv:
            if cur and st <= cur[1]:
                cur = (cur[0], max(cur[1], en))
            else:
                if cur:
                    wall += (cur[1] - cur[0]).total_seconds()
                cur = (st, en)
        if cur:
            wall += (cur[1] - cur[0]).total_seconds()
        par[s["id"]] = {"agent_wall_s": int(wall), "agent_sum_s": sum(a["duration_s"] for a in sa)}
        groups = collections.defaultdict(list)
        for a in sa:
            groups[a["parent"]].append(a)
        for g in groups.values():
            for x, y in zip(g, g[1:]):
                if x["type"] in READONLY_TYPES and y["type"] in READONLY_TYPES and y["start"] >= x["end"]:
                    serial.append([x["id"], y["id"]])

    sub_total = sum(a["processed"] for a in agents)
    main_total = sum(s["processed"] for s in out_sessions)
    return {
        "run": arg, "sessions": out_sessions, "agents": agents,
        "duplication": {
            "cross_agent_reads": {p: sorted(ids) for p, ids in sorted(by_path.items()) if len(ids) > 1},
            "repeat_reads": repeat, "prompt_named_reads": named,
            "cross_agent_bash": {c: sorted(ids) for c, ids in sorted(bash_by_cmd.items()) if len(ids) > 1},
        },
        "rework": {"repeated_types": repeated, "review_rounds": review_rounds,
                   "plan_verifier_runs": sum(a["type"] == "plan-verifier" for a in agents)},
        "parallelism": {"per_session": par, "serial_readonly": serial},
        "totals": {
            "sessions": len(out_sessions), "agents": len(agents),
            "agents_by_type": dict(collections.Counter(a["type"] for a in agents)),
            "main_processed": main_total, "subagent_processed": sub_total,
            "subagent_cache_hit": cache_hit({x: sum(a["usage"][x] for a in agents) for x in ("input", "cache_read", "cache_creation")}),
            "orchestrator_share": main_total / (main_total + sub_total) if main_total + sub_total else 0.0,
            "interventions": sum(len(s["interventions"]) for s in out_sessions),
            "errors": sum(sum(a["errors"].values()) for a in agents),
        },
    }


# ---------- markdown ----------

def k(n):
    return f"{n / 1e6:.2f}M" if n >= 1e6 else f"{n / 1e3:.1f}K" if n >= 1e3 else str(n)


def cut(s, n):
    s = (s or "").strip()
    return s if len(s) <= n else s[:n] + f"\n…[+{len(s) - n} chars]"


def render_md(d, excerpt=1500):
    T = d["totals"]
    o = [f"# Workflow digest: {d['run']}", "",
         f"Sessions {T['sessions']} · agents {T['agents']} · processed tokens main {k(T['main_processed'])} / "
         f"subagents {k(T['subagent_processed'])} (orchestrator {T['orchestrator_share']:.0%}, subagent cache hit {T['subagent_cache_hit']:.0%}) · "
         f"human interventions {T['interventions']} · tool errors {T['errors']}", "",
         "Processed = input + cache read + cache write + output, summed over API calls. Peak = largest single-call context.", "",
         "## Sessions", "", "| id | branch | phase | start | turns | processed | peak | cache hit | prompts |", "|---|---|---|---|---|---|---|---|---|"]
    for s in d["sessions"]:
        o.append(f"| {s['id'][:8]} | {s['branch']} | {s['phase']} | {s['start'][:16]} | {s['turns']} | {k(s['processed'])} | "
                 f"{k(s['peak_context'])} | {s['cache_hit']:.0%} | {s['prompts']} |")
    o += ["", "## Agents (spawn order)", "",
          "| # | id | parent | d | type | model | bg | start | dur s | turns | processed | peak | cache hit | tools | errors | retried |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for i, a in enumerate(d["agents"], 1):
        tools = ", ".join(f"{n}:{c}" for n, c in sorted(a["tools"].items(), key=lambda x: -x[1]))
        errs = ", ".join(f"{n}:{c}" for n, c in a["errors"].items())
        o.append(f"| {i} | {a['id'][:9]} | {(a['parent'] or a['session'][:8])[:9]} | {a['depth']} | {a['type']} | {a['model'] or ''} | "
                 f"{'y' if a['background'] else ''} | {a['start'][11:19]} | {a['duration_s']} | {a['turns']} | {k(a['processed'])} | "
                 f"{k(a['peak_context'])} | {a['cache_hit']:.0%} | {tools} | {errs} | {len(a['retried_after_failure'])} |")
    D = d["duplication"]
    o += ["", "## Duplication", "", "Reads = Read tool + paths in cat/sed/head/grep Bash segments.", "", "### Files read by ≥2 agents", ""]
    o += [f"- `{p}` — {', '.join(ids)}" for p, ids in D["cross_agent_reads"].items()] or ["- none"]
    o += ["", "### Same file read ≥2× by one agent", ""]
    o += [f"- {a}: " + ", ".join(f"`{p}`×{n}" for p, n in m.items()) for a, m in D["repeat_reads"].items()] or ["- none"]
    o += ["", "### Files named in the agent's own prompt and then read", "",
          "Expected when the prompt says \"read X\"; waste when the prompt already pasted X's content.", ""]
    o += [f"- {a}: " + ", ".join(f"`{p}`" for p in ps) for a, ps in D["prompt_named_reads"].items()] or ["- none"]
    o += ["", "### Same Bash command in ≥2 agents", ""]
    o += [f"- `{cut(c, 120)}` — {', '.join(ids)}" for c, ids in D["cross_agent_bash"].items()] or ["- none"]
    R, P = d["rework"], d["parallelism"]
    o += ["", "## Rework", "", f"- review rounds (from `SDD(...): review-<n>` commits): {R['review_rounds']}",
          f"- plan-verifier runs: {R['plan_verifier_runs']}"]
    o += [f"- session {s[:8]}: " + ", ".join(f"{t_}×{n}" for t_, n in m.items()) for s, m in R["repeated_types"].items()]
    o += ["", "## Parallelism", ""]
    o += [f"- session {s[:8]}: agent wall-clock {v['agent_wall_s']}s vs sum {v['agent_sum_s']}s" for s, v in P["per_session"].items()]
    o += [f"- serial read-only pair: {x} → {y}" for x, y in P["serial_readonly"]]
    o += ["", "## Human interventions", ""]
    o += [f"- {s['id'][:8]} {i['ts'][11:19]}: {cut(i['text'], 200)}" for s in d["sessions"] for i in s["interventions"]] or ["- none"]
    o += ["", "## Agent prompts and final reports", ""]
    for a in d["agents"]:
        o += [f"### {a['id'][:9]} · {a['type']} · {a['description']}", ""]
        if a["retried_after_failure"]:
            o += ["Retried after failure: " + "; ".join(f"`{cut(c, 100)}`" for c in a["retried_after_failure"]), ""]
        o += ["**Prompt**", "", "```text", cut(a["prompt"], excerpt), "```", "", "**Final report**", "", "```text",
              cut(a["final_report"], excerpt), "```", ""]
    return "\n".join(o)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("run", nargs="?", default=os.environ.get("CLAUDE_CODE_SESSION_ID"))
    ap.add_argument("--root", default="~/.claude/projects")
    ap.add_argument("--glob", default="*dev-digest*")
    ap.add_argument("--out")
    ap.add_argument("--excerpt", type=int, default=1500)
    a = ap.parse_args()
    if not a.run:
        sys.exit("collect.py: pass SPEC-NN or a session id (CLAUDE_CODE_SESSION_ID is not set)")
    d = build_digest(a.root, a.run, a.glob)
    if not d["sessions"]:
        sys.exit(f"collect.py: no session matches {a.run!r} under {a.root}/{a.glob}")
    out = a.out or os.path.join(tempfile.gettempdir(), "workflow-retro", a.run)
    os.makedirs(out, exist_ok=True)
    for a_ in d["agents"]:
        a_.pop("reads"), a_.pop("bash")
    with open(os.path.join(out, "digest.json"), "w") as f:
        json.dump(d, f, indent=1)
    md = render_md(d, a.excerpt)
    with open(os.path.join(out, "digest.md"), "w") as f:
        f.write(md)
    T = d["totals"]
    print(f"{out}/digest.md ({len(md) // 4} tokens approx)\n{out}/digest.json\n"
          f"sessions={T['sessions']} agents={T['agents']} main={k(T['main_processed'])} sub={k(T['subagent_processed'])}")


if __name__ == "__main__":
    main()
