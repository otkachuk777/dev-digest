# API Contract Reviewer — with vs without skills

Agent: **API Contract Reviewer (Skills Lab)**, created in the UI (`openrouter · deepseek/deepseek-v4-flash`).
Prompt: `docs/agent-prompts/api-contract-skills-lab.md` — role, stack, severity and verdict rules only;
**no list of contract checks**. Skills (`docs/api-contract-skills/`): `breaking-change`,
`response-schema`, `semver-discipline` (created in the UI) and `deprecation-policy` (**imported** from a
`.md` file, `source: imported_file`). Linked to the agent in this order.

Trace check: run without skills → no skills block in the prompt assembly (1 259 tokens in); run with
skills → skills block of ~2 100 tokens, log line `skills: 4 skill(s), ~2096 token(s) attached`
(4 732 tokens in).

## PR #484 — "Scope the payments list to a customer" (`limit`→`page_size`, new required params, array→object)

**No skills:** `request_changes`, 5 CRITICAL + 1 WARNING — the agent found every breaking change.
This PR is too blatant to separate the two modes with a capable model: the base model already knows
what a renamed query param and a wrapped response do. (Recorded, not hidden.)

## PR #485 — "Tidy up the payments API responses" (new fixture)

Three contract changes presented as cleanup, with no renamed field and no new required param:
`POST /payments` 200 → **201**, 404 error code `not_found` → `payment_not_found`, list default sort
**asc → desc**.

| Run | Skills | Verdict / score | Findings |
|---|---|---|---|
| A1 | none | request_changes / 65 | CRITICAL: 404 code. **201 and sort order called "intentional and low-risk", not reported.** |
| A2 | none | request_changes / 41 | CRITICAL: 201. WARNING: 404 code (downgraded), WARNING: sort order |
| B1 | 4 (v1) | request_changes / 30 | CRITICAL: 201, CRITICAL: 404 code — summary also claims a bare-array→object change that the diff does not contain |
| B2 | 4 (v1) | request_changes / 0 | 3 CRITICAL — the invented envelope change again |
| B3 | 4 (v2) | request_changes / 18 | CRITICAL: 201, CRITICAL: 404 code, WARNING: sort order; summary: "no deprecation window, no version bump, no migration path" |

## What this shows

- **Consistency and severity.** Without skills the agent's result depended on the run: A1 waved the
  201 change through, A2 flagged it but demoted the error code to WARNING. With skills, both wire
  changes were CRITICAL in every run (B1–B3) and the sort change was reported — the skill's rule
  "a breaking change to a public route is CRITICAL" replaced the model's per-run judgement.
- **Policy findings only skills can ask for.** B3 (and B1/B2) call out the missing version bump,
  deprecation window and migration path — that comes from `semver-discipline` /
  `deprecation-policy`, not from the base prompt.
- **This is not "missed vs caught".** With `deepseek-v4-flash` the base agent catches most breaking
  changes on its own — the same result `server/INSIGHTS.md` recorded for Test Quality. The skills
  make it stricter and steadier, not the only thing standing between the PR and a miss.

## A bug the experiment found in my own skills (fixed)

B1/B2 reported a bare-array → object change that is not in #485's diff. The skill examples used the
same domain as the fixture (`payments`, `page_size`, `{ items }`), so the model pattern-matched the
*example* as if it were the diff. The examples now use a neutral domain (`invoices`, `per_page`,
`{ data, cursor }`); the skills were updated in place (v2, exercising the versions feature) and B3
no longer shows the false report. One run per configuration after the fix is thin evidence — treat
B3 as "not reproduced in one run", not as proven.

## Reproduce

Skills → the four skills above; Agents → API Contract Reviewer (Skills Lab) → Skills tab (unlink all
for run A, link all four for run B); Pull Requests → `acme/payments-api` → #485 → Review → open the
run trace and compare *Prompt assembly → Skills*.
