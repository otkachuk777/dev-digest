# 10-pr-brief

**Spec:** SPEC-03 (AC-1, AC-6, AC-13, AC-21, AC-22, AC-48, EC-8) — `specs/SPEC-03-pr-brief.md`.

**User journey:** Open PR #483 with a stored brief, jump from a review-focus item to the diff, reload, return to Overview; open PR #484 with no brief and try to generate.

**Fixture:** the seed stores a brief for `acme/payments-api` #483 only (no model key needed); #484 has none.

**What it tests:**
- AC-13 / AC-6: cached summary and "Review focus — read these first" without a Generate click.
- AC-21 / AC-22: focus button "Open src/services/refund.ts:10 in Files changed" -> `tab=diff` + `file=` in the URL.
- EC-8: `reload` on that URL keeps the Files changed tab with line 10 code visible (card expanded).
- AC-1: #484 shows "No brief yet" / "Generate brief".
- AC-48: keyless Generate toasts "No API key for openrouter".

**Notes:**
- Keyless by construction (see flow 08); use the hermetic runner.
- Reload is used instead of re-`open` because the repo id is not known to the flow.
- Not covered: line highlight (unit-tested, AC-23), AI-generated brief (paid call).
- The focus heading is CSS-uppercased (`textTransform`), so `wait --text` matches `REVIEW FOCUS — READ THESE FIRST`.
