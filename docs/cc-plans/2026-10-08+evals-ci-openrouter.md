# CI for harness evals on OpenRouter (skills / agents / workflow)

## Context
PRs that change a skill, an agent or a CLAUDE.md must re-run the matching evals in GitHub Actions.
Runs go through OpenRouter on cheap models, and the model can be switched via job parameters (no UI).
Most of the plumbing already exists in `evals/`:
- `scripts/ci-detect.mjs` maps changed files to skills, agents and the workflow tier.
- `src/runtime/env.ts` and `dispatch.ts` hold the `EVAL_BACKEND=openrouter` backend.
- The LiteLLM proxy is set up in `proxy/` and wrapped by `pnpm proxy:up/wait/down`.
- `pnpm eval:benchmark` runs a candidate vs baseline comparison.

What is missing: the workflow files themselves, real skip logic for TODO stubs, and detection of module `CLAUDE.md` files.
`origin/full-functionality` has 3 eval workflows on Gemini, which serve as the reference for the structure.

## Decisions (user)
- Nothing blocks the merge: every model job is `continue-on-error: true`, so results are a report only.
- 3 files: `eval-skills.yml`, `eval-agents.yml`, `eval-workflow.yml`.
- Triggers: `pull_request` (path filter) and `workflow_dispatch`.
- Baseline: a `benchmark` input on manual runs (default off, meaning plain pass/fail).
- Default models:
  - skills and agents run on `deepseek/deepseek-v4-flash`;
  - workflow runs on `anthropic/claude-haiku-5.5`;
  - the judge is `anthropic/claude-haiku-5.5`.
- Work goes directly on `L06-lab`.

## Changes

### 1. `evals/scripts/ci-detect.mjs`
- `hasEvals(tier, name)`: also require at least one REAL case. Read `<name>.cases.ts` and match `/prompt:\s*(?!["'`]TODO)/`. Stub-only folders then go to `skipped_*`.
- Rename the log line to `SKIP <name> (no evals / only TODO stubs)`.
- `runWorkflow` also fires on:
  - any `**/CLAUDE.md` (regex `(^|\/)CLAUDE\.md$`), not only the root one;
  - `**/INSIGHTS.md`, `docs/agent-prompts/**`, `.claude/skills/**` (activation cases depend on skills);
  - `.github/workflows/eval-workflow.yml`.
- Add a `run_all` override, used by workflow_dispatch: env `EVAL_ALL=1` lists every skill and agent that has real evals.
- One tiny self-check, `scripts/ci-detect.test.mjs`. It feeds a fake `CHANGED_FILES` and asserts outputs:
  - a stub-only skill lands in `skipped`;
  - `client/CLAUDE.md` turns on `run_workflow`;
  - `onion-architecture` lands in `skills`.

  Run it in the `quality` job with `node`.

### 2. Three workflow files under `.github/workflows/`
They share one skeleton, adapted from `origin/full-functionality:.github/workflows/eval-agents.yml`.

```yaml
on:
  pull_request:
    paths: [<tier paths>, '.github/workflows/eval-<tier>.yml']
  workflow_dispatch:
    inputs:
      model:       { default: '' }         # empty → tier default
      judge_model: { default: '' }
      benchmark:   { type: boolean, default: false }   # skills/agents only
permissions: { contents: read }
concurrency: { group: eval-<tier>-${{ github.event.pull_request.number || github.ref }}, cancel-in-progress: true }
env:
  EVAL_BACKEND: openrouter
  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
  EVAL_MODEL: ${{ inputs.model || vars.EVAL_<TIER>_MODEL || '<tier default>' }}
  EVAL_JUDGE_MODEL: ${{ inputs.judge_model || vars.EVAL_JUDGE_MODEL || 'anthropic/claude-haiku-5.5' }}
  EVAL_MAX_TURNS: 6
```

Jobs:
- **`detect`**:
  - `git diff --name-only base...head` piped into `node evals/scripts/ci-detect.mjs` (`EVAL_ALL=1` on dispatch);
  - a secret-presence check that sets `has_key`;
  - a `SKIP …` echo for each skipped artifact, written to the log and to `$GITHUB_STEP_SUMMARY`.
- **`quality`**: pnpm and node 22 with the evals lockfile cache, then `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm eval:quality`, and `node scripts/ci-detect.test.mjs`. Cheap and model-free.
- **Tier job**:
  - Condition: `if: has_key == 'true' && <list non-empty | run_workflow>`. Without a key it prints `SKIP (no OPENROUTER_API_KEY)`.
  - Settings: `continue-on-error: true`, `timeout-minutes` around 30 (workflow around 60).
  - Matrix: one entry per skill or agent, with `max-parallel: 1` (the README notes the rate-limit flakiness), `fail-fast: false`.

Per tier:

| tier | model default | proxy | run step |
|---|---|---|---|
| skills | `deepseek/deepseek-v4-flash` | no; the content tier goes direct to `https://openrouter.ai/api/v1` | `pnpm vitest run skills/<x>`, or `pnpm eval:benchmark skills/<x> -n 1` when `inputs.benchmark` |
| agents | `deepseek/deepseek-v4-flash` | yes: `pnpm proxy:up` and `proxy:wait`, plus `OPENROUTER_BASE_URL=http://localhost:4000`; `docker compose … down` in `if: always()` | `pnpm vitest run agents/<x>`, or benchmark the same way |
| workflow | `anthropic/claude-haiku-5.5` | yes (same as agents; the wildcard route handles anthropic/* too) | `pnpm eval:workflow` |

Paths per tier:
- skills: `.claude/skills/**`, `evals/skills/**`, `evals/src/**`
- agents: `.claude/agents/**`, `evals/agents/**`, `evals/src/**`
- workflow: `**/CLAUDE.md`, `**/INSIGHTS.md`, `.claude/**`, `docs/agent-prompts/**`, `evals/workflow/**`, `evals/src/**`

Also: on failure, `docker compose logs --tail 100`, and upload `evals/results/` as an artifact with `if: always()` (cheap and useful for debugging; the user said no UI is needed, so this is optional and can be cut).

### 3. `evals/README.md`
Replace the "Wiring it into GitHub Actions" snippet with a short section covering:
- the 3 files;
- the `OPENROUTER_API_KEY` secret;
- how to switch the model (dispatch inputs, or repo variables `EVAL_SKILLS_MODEL`/`EVAL_AGENTS_MODEL`/`EVAL_WORKFLOW_MODEL`/`EVAL_JUDGE_MODEL`);
- the skip semantics.

## Reuse
- `evals/scripts/ci-detect.mjs`, `scripts/litellm-proxy.sh` (`proxy:up` reads `$OPENROUTER_API_KEY`), `src/records/benchmark.ts`, `src/runtime/env.ts`/`dispatch.ts`. No changes to the runtime.
- The structure of the reference workflows in `origin/full-functionality`.

## Risks
- Haiku 5.5 and DeepSeek v4 flash have not been measured on these cases. Because nothing blocks, a fail is only a signal. First real data comes from a manual dispatch run.
- The haiku slug goes through the LiteLLM wildcard `openrouter/*`, which is expected to work for `anthropic/*`. Verify on the first run.
- Fork PRs do not get secrets, so they print SKIP. Fine, since this is our own fork.

## Verification
1. Locally: `node evals/scripts/ci-detect.test.mjs`, then `CHANGED_FILES=$'client/CLAUDE.md\n.claude/skills/zod/SKILL.md\n.claude/skills/onion-architecture/SKILL.md' node evals/scripts/ci-detect.mjs`. Expect `zod` in SKIP, `onion-architecture` in skills, workflow = run.
2. `pnpm --dir evals typecheck`, and `actionlint` on the 3 files if it is installed (otherwise a YAML parse).
3. Local smoke on the chosen models (spends tokens, so only with your OK): `EVAL_BACKEND=openrouter EVAL_MODEL=deepseek/deepseek-v4-flash pnpm vitest run skills/onion-architecture`.
4. After the push: add the `OPENROUTER_API_KEY` secret (you do it in repo settings), then run `gh workflow run eval-skills.yml` and check the logs (`SKIP` lines, the model in the env).

## Deviations during implementation
- Default model for all tiers switched to `anthropic/claude-haiku-5.5`. On `deepseek/deepseek-v4-flash` the skill smoke test went 0/2 in about 8 min: some OpenRouter providers took up to about 6 min per call and answered the system prompt instead of the task. On Haiku the same test passed 2/2 in 24s.
- `anthropic/*` models go to OpenRouter's Anthropic endpoint directly. The LiteLLM proxy only starts when the model under test is not `anthropic/*`.
- Proxy fix: the unpinned `litellm:main-stable` image now refuses to boot without a master key. `LITELLM_MASTER_KEY` is now the same as `OPENROUTER_API_KEY`, which every client already sends as the bearer. The port is bound to `127.0.0.1`.
- Security: `OPENROUTER_API_KEY` is scoped per step and never set on `pnpm install`. `pnpm/action-setup` is pinned to a SHA. Artifact names are validated in `ci-detect.mjs` before they reach shell steps.
