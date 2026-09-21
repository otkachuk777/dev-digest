# Conventions Extractor — quality report

Repo scanned: [`burnjohn/quick-blog`](https://github.com/burnjohn/quick-blog) (JS/React + Express).
Model: `deepseek/deepseek-v4-flash` via OpenRouter (feature model `conventions`, changeable in
Settings → Models). Input: config files that exist + the top 12 files from
`repoIntel.getConventionSamples()` (12 sampled, 5000 chars per file).

## Funnel

| Stage | Count |
|---|---|
| Candidates returned by the model (probe run) | 13 |
| Dropped by the code-side evidence check | 1 (`snippet-not-found`) |
| Shown in the UI | 12 (11 after one Reject) |
| Judged genuinely useful (below) | 6 |

Latency: 34 s (script), 57 s (API call) and roughly 2 minutes once through the UI — DeepSeek's
response time varies, so the model call is capped at 120 s. Cost per scan was not measured (the
scan input is ~12 files × up to 5000 chars; a 4.7k-token review on the same model cost $0.0004).
Every kept candidate links to the exact lines on
GitHub, pinned to the scanned commit (`.../blob/<sha>/<path>#L<a>-L<b>`) — the link was opened and
returns 200.

## What the evidence check caught

The dropped candidate was *"Use named exports for all utility and helper functions"* citing
`client/src/utils/formatters.js`: the quoted snippet does not exist in that file. Without the check
it would have been shown with a clickable link to code that does not say that. The check also
**re-derives the line numbers from the file** — the model's own numbers are only used to choose
between duplicate matches.

## Manual review of the 11 shown candidates

| # | Rule (shortened) | Verdict |
|---|---|---|
| 1 | Handle 401 by clearing the token and redirecting to login | **valid** — clear, enforceable |
| 2 | Custom context hook that throws outside its provider | **valid** |
| 3 | Re-export modules from an `index.js` entry point | **valid** |
| 4 | Use default parameter values for optional arguments | trivial — language basics |
| 5 | Barrel export for UI components | weak — duplicate of #3 |
| 6 | Error message fallback chain (`data.message` → `error.message` → constant) | **valid** |
| 7 | Tailwind classes combined through a `classNames` helper | **valid** |
| 8 | Group related constants in one exported object | weak — one example |
| 9 | Prefix exported constants with `MESSAGES_` / `API_ENDPOINTS_` | **wrong** — the cited snippet (`SUCCESS_BLOG_CREATED`) shows no such prefix |
| 10 | Single quotes, no semicolons | **valid** — but a formatter should enforce it |
| 11 | camelCase utility names | trivial |

**6 valid, 3 weak/duplicate, 2 trivial** of 11 in this view (≈ 55 % clearly useful, ≈ 80 % if weak
ones count). The one *wrong* candidate (#9) has real evidence in the right file — the evidence check
proves the code exists, not that the rule matches it. That is the gap a human Accept/Reject still has to close.

## Bugs the review turned up (fixed)

- Files with CRLF line endings leaked a trailing `\r` into stored snippets → `verifyEvidence` now
  splits on `\r?\n` (test added).
- The provider's own timeout applies per HTTP attempt and it retries, so a slow model could hold the
  request for minutes → the whole model call is now capped (120 s) with a clear 502.
- Card order jumped after Accept when confidences tied → order is now `confidence desc, id`.

## Model choice

Free OpenRouter models were tried first (`nemotron-3-ultra-550b`, `nemotron-3.5-lightning`,
`nemotron-3-super-120b`, `nemotron-3-nano-omni`, `gemma-4-*`, `glm-5.2`, `north-mini-code`) on the
real 12-file input. None completed a scan reliably: *Service temporarily overloaded*, `429`, `400`,
or no answer within 170 s; `nemotron-3-ultra` answered once after 164 s with 8 candidates, all
rejected by the evidence check. The feature default is therefore `deepseek/deepseek-v4-flash`.

## Ideas to improve findings

- **Second pass for confirmation:** ask the model to check each rule against 2–3 *other* files and
  drop rules with one occurrence (would remove #5, #8 and likely #9).
- **Two-step dialogue** (choose files → extract) so the sample is picked by what the repo is, not only
  by import rank; `MockLLMProvider` already has hooks for it.
- **Repo-intel signals:** conventions cluster by directory and by symbol kind; feeding the model
  per-layer samples (api / components / utils) would add coverage beyond the 12 most-imported files.
- **Drop formatter-enforceable rules** (#10, #11) by reading `.prettierrc` / ESLint config first.
