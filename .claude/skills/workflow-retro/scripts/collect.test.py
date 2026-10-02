#!/usr/bin/env python3
"""Self-check for collect.py on a synthetic projects dir. Run: python3 collect.test.py"""
import json, os, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import collect  # noqa: E402

CWD = "/repo"


def ts(sec):
    return f"2026-10-01T10:{sec // 60:02d}:{sec % 60:02d}.000Z"


def usage(i=10, cr=100, cc=50, o=5):
    return {"input_tokens": i, "cache_read_input_tokens": cr, "cache_creation_input_tokens": cc, "output_tokens": o}


def asst(sec, mid, blocks, u=None, model="claude-sonnet-5", side=False):
    return {"type": "assistant", "timestamp": ts(sec), "cwd": CWD, "isSidechain": side,
            "message": {"id": mid, "model": model, "role": "assistant", "content": blocks, "usage": u or usage()}}


def tool(tid, name, inp):
    return {"type": "tool_use", "id": tid, "name": name, "input": inp}


def result(sec, tid, text="ok", err=False, side=False):
    return {"type": "user", "timestamp": ts(sec), "cwd": CWD, "isSidechain": side,
            "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": tid, "content": text, "is_error": err}]}}


def human(sec, text, side=False):
    return {"type": "user", "timestamp": ts(sec), "cwd": CWD, "isSidechain": side, "message": {"role": "user", "content": text}}


def write(path, lines):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        for l in lines:
            f.write(json.dumps(l) + "\n")


def meta(path, **kw):
    with open(path, "w") as f:
        json.dump(kw, f)


def build(root):
    p1 = os.path.join(root, "-repo-dev-digest")
    p2 = os.path.join(root, "-repo-dev-digest--claude-worktrees-x")
    # S1: spec phase. Main message m1 is split over two lines with the same id (usage counted once).
    write(f"{p1}/s1.jsonl", [
        human(0, "Write SPEC-07 for the thing"),
        asst(1, "m1", [{"type": "text", "text": "ok"}]),
        asst(1, "m1", [tool("t1", "Agent", {"subagent_type": "spec-creator", "prompt": "Spec SPEC-07, read docs/a.md"})]),
        result(100, "t1", "done"),
        human(110, "also cover the empty state"),
        human(111, "<task-notification>agent finished</task-notification>"),
    ])
    sub = f"{p1}/s1/subagents"
    write(f"{sub}/agent-a1.jsonl", [
        human(2, "Spec SPEC-07, read docs/a.md", side=True),
        asst(3, "x1", [tool("r1", "Read", {"file_path": "/repo/docs/a.md"}), tool("r2", "Read", {"file_path": "/repo/docs/b.md"})], usage(10, 1000, 0, 5), side=True),
        result(4, "r1", side=True), result(4, "r2", side=True),
        asst(5, "x2", [tool("r3", "Read", {"file_path": "/repo/docs/b.md"})], usage(10, 2000, 100, 5), side=True),
        result(6, "r3", side=True),
        asst(7, "x3", [tool("b1", "Bash", {"command": "pnpm test"})], side=True),
        result(8, "b1", "Exit code 1\nFAIL", err=True, side=True),
        asst(9, "x4", [tool("b2", "Bash", {"command": "pnpm test"})], side=True),
        result(10, "b2", side=True),
        asst(10, "x7", [tool("b4", "Bash", {"command": "sed -n 1,40p docs/c.md && sed -n 41,80p /repo/docs/c.md | head -5"})], side=True),
        result(10, "b4", side=True),
        asst(11, "x5", [tool("t2", "Agent", {"subagent_type": "researcher", "prompt": "find b"})], side=True),
        result(50, "t2", side=True),
        asst(90, "x6", [{"type": "text", "text": "FINAL REPORT"}], side=True),
    ])
    meta(f"{sub}/agent-a1.meta.json", agentType="spec-creator", description="spec", spawnDepth=1)
    write(f"{sub}/agent-a2.jsonl", [
        human(12, "find b", side=True),
        asst(13, "y1", [tool("r4", "Read", {"file_path": "/repo/docs/b.md"})], model="claude-haiku", side=True),
        result(14, "r4", side=True),
        asst(15, "y2", [tool("b3", "Bash", {"command": "git branch x"})], model="claude-haiku", side=True),
        result(16, "b3", "PreToolUse:Bash hook error: blocked by readonly-bash-guard", err=True, side=True),
        asst(49, "y3", [{"type": "text", "text": "b is in docs"}], model="claude-haiku", side=True),
    ])
    meta(f"{sub}/agent-a2.meta.json", agentType="researcher", description="r", spawnDepth=2, parentAgentId="a1")

    # S2: impl phase in a worktree slug; two implementers (rework) and two serial reviewers.
    write(f"{p2}/s2.jsonl", [
        human(200, "/impl SPEC-07"),
        asst(201, "n1", [tool("c1", "Bash", {"command": 'git commit -m "SDD(SPEC-07): review-1"'})]),
        result(202, "c1"),
    ])
    sub2 = f"{p2}/s2/subagents"
    for aid, typ, start, end in [("b1", "implementer", 210, 300), ("b2", "implementer", 310, 400),
                                 ("b3", "architecture-reviewer", 410, 450), ("b4", "security-reviewer", 460, 500)]:
        write(f"{sub2}/agent-{aid}.jsonl", [human(start, f"go {aid}", side=True),
                                            asst(end, f"{aid}-m", [{"type": "text", "text": "done"}], side=True)])
        meta(f"{sub2}/agent-{aid}.meta.json", agentType=typ, description=aid, spawnDepth=1)

    # S3: unrelated session, no subagents dir.
    write(f"{p1}/s3.jsonl", [human(600, 'check docs "$ROOT/specs/SPEC-07-x.md" deny'),
                             asst(601, "z1", [tool("g1", "Agent", {"subagent_type": "general-purpose", "prompt": "diff: specs/SPEC-07-x.md"})])])


def main():
    with tempfile.TemporaryDirectory() as root:
        build(root)

        # session selection
        sel = collect.select_sessions(root, "SPEC-07", "*dev-digest*")
        assert [s["id"] for s in sel] == ["s1", "s2"], [s["id"] for s in sel]
        assert [s["id"] for s in collect.select_sessions(root, "s3", "*dev-digest*")] == ["s3"]

        d = collect.build_digest(root, "SPEC-07", "*dev-digest*")
        s1, s2 = d["sessions"]

        # main-session usage deduped by message.id (m1 appears twice)
        assert s1["usage"]["input"] == 10 and s1["usage"]["output"] == 5, s1["usage"]
        assert s1["phase"] == "spec" and s2["phase"] == "impl", (s1["phase"], s2["phase"])

        # human interventions: second real prompt counts, task-notification does not
        assert [h["text"] for h in s1["interventions"]] == ["also cover the empty state"], s1["interventions"]

        agents = {a["id"]: a for a in d["agents"]}
        assert len(agents) == 6, list(agents)
        a1, a2 = agents["a1"], agents["a2"]
        assert a2["parent"] == "a1" and a2["depth"] == 2
        assert a1["usage"]["cache_read"] == 1000 + 2000 + 5 * 100  # x1, x2, then x3..x7 at the default 100
        assert a1["peak_context"] == 10 + 2000 + 100
        assert a1["model"] == "claude-sonnet-5" and a2["model"] == "claude-haiku"
        assert a1["tools"]["Read"] == 3 and a1["tools"]["Bash"] == 3
        assert a1["final_report"].startswith("FINAL REPORT")
        assert a1["duration_s"] == 88

        # errors and retries
        assert a1["errors"] == {"exit-code": 1}, a1["errors"]
        assert a2["errors"] == {"hook-denied": 1}, a2["errors"]
        assert a1["retried_after_failure"] == ["pnpm test"]

        # duplication
        dup = d["duplication"]
        assert dup["cross_agent_reads"]["docs/b.md"] == ["a1", "a2"], dup
        assert dup["repeat_reads"] == {"a1": {"docs/b.md": 2, "docs/c.md": 2}}, dup["repeat_reads"]
        assert dup["prompt_named_reads"] == {"a1": ["docs/a.md"]}, dup["prompt_named_reads"]

        # rework + parallelism
        assert d["rework"]["repeated_types"] == {"s2": {"implementer": 2}}, d["rework"]
        assert d["rework"]["review_rounds"] == 1
        serial = d["parallelism"]["serial_readonly"]
        assert ["b3", "b4"] in serial, serial

        # cache hit ratio for a1
        u = a1["usage"]
        assert abs(a1["cache_hit"] - u["cache_read"] / (u["input"] + u["cache_read"] + u["cache_creation"])) < 1e-9

        sub = [a["usage"] for a in d["agents"]]
        cr = sum(x["cache_read"] for x in sub)
        assert abs(d["totals"]["subagent_cache_hit"] - cr / sum(x["input"] + x["cache_read"] + x["cache_creation"] for x in sub)) < 1e-9

        md = collect.render_md(d)
        assert "spec-creator" in md and "docs/b.md" in md

    # missing projects / sessions must not crash
    with tempfile.TemporaryDirectory() as empty:
        assert collect.build_digest(empty, "SPEC-99", "*dev-digest*")["sessions"] == []

    print("collect.test.py: all passed")


if __name__ == "__main__":
    main()
