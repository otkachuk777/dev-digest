# SPEC-02 Onboarding Generator — verification report

- Spec: `specs/SPEC-02-onboarding-generator.md` (AC-1…AC-63, EC-1…EC-22, NFR-1…NFR-10; amended 2026-10-03)
- Plan: `docs/cc-plans/2026-10-02+spec-02-onboarding-generator.md` (incl. fix plan addendum and Review log)
- Verifier: `plan-verifier` (final pass) on HEAD `accf9be`, plus the main session's final demo and e2e re-run (2026-10-03)
- Test mode: test-first (red tests from ACs before code; chunks folded into stage commits)

## Stage commits (commit column of the matrix)

| Stage | Commit | Content |
|---|---|---|
| spec | `ebfa7e1` | SPEC-02 approved |
| plan | `412cda0` | Development plan, cross-model review (Gemini 3.1 Pro) applied |
| code | `009336a` | Production code (**P**) |
| tests & review | `accf9be` | All tests, review fixes, spec amendment, fix plan addendum, Review log (**T**) |
| verification | this commit | This report + final demo evidence |

Production files touched again by review fixes carry **P+T**.

## Verify commands

| Command | Result |
|---|---|
| server `pnpm typecheck` | green |
| server `pnpm test` (Docker up) | 50 files, 504 tests passed, 0 skipped |
| server `pnpm arch` | 0 errors; 1 pre-existing warning (`skills/helpers ↔ skills/repository`), 28 known violations |
| client `pnpm typecheck` | green |
| client `pnpm test` | 53 files, 262 tests passed |
| client `pnpm arch` | no violations |
| vendor drift (`knowledge.ts`, `adapters.ts`) | identical (pre-existing drift in `eval-ci.ts`, `productionize.ts` untouched by this branch) |
| `spec-lint.sh` | OK |
| hermetic e2e `scripts/e2e.sh` (spare ports, 2026-10-03, after review fixes) | **9/9 flows passed**, incl. `09-onboarding-tour` |

## Matrix: AC / EC / NFR → step → test → commit → status

Test paths: **S** = `server/test/`, **OV** = `OnboardingView.test.tsx`, **MD** = `MermaidDiagram.test.tsx`, **TR** = `_lib/tour.test.ts` (client, under `client/src/app/(shell)/repos/[repoId]/onboarding/`), **IT** = `S/onboarding.it.test.ts`, **MOD** = `S/onboarding-model.test.ts`, **GR** = `S/onboarding-grounding.test.ts`, **PR** = `S/onboarding-prompt.test.ts`, **FA** = `S/repo-intel-facts.test.ts`, **HO** = `S/repo-intel-hotness.test.ts`, **NR** = `S/llm-no-retry.test.ts`, **RF** = `S/onboarding-review-fixes.test.ts`, **E09** = `e2e/flows/09-onboarding-tour.flow.json`.

| ID | Step | Test | Commit | Status |
|---|---|---|---|---|
| AC-1 | C1 | `client/src/vendor/ui/nav.test.ts` › SPEC-02 AC-1 | P+T | Met |
| AC-2 | C1 | `client/src/components/app-shell/helpers.test.ts` › AC-2 | P+T | Met |
| AC-3 | C1 | same › AC-3 | P+T | Met |
| AC-4 | C3 | OV › AC-4; E09 | P+T | Met |
| AC-5 | C3 | OV › AC-5 | P+T | Met |
| AC-6 | C2 | OV › AC-6 / NFR-6 | P+T | Met |
| AC-7 | C2/C3 | OV › AC-7 (2) | P+T | Met |
| AC-8 | C2 | OV › AC-8; MD › AC-8 / EC-9, render failure | P+T | Met |
| AC-9 | C3 | OV › AC-9 | P+T | Met |
| AC-10 | C4 | OV › AC-10 | P+T | Met |
| AC-11 | C3 | OV › AC-11 / AC-55 | P+T | Met |
| AC-12 | C3 | OV › AC-12 | P+T | Met |
| AC-13 | C3 | OV › AC-13 / EC-3; E09 | P+T | Met |
| AC-14 | C3 | OV › AC-14 (2) | P+T | Met |
| AC-15 | C1/C3 | OV › AC-15/16/18, AC-15/18 | P+T | Met |
| AC-16 | C3 | OV › AC-15/16/18 | P+T | Met |
| AC-17 | S6 | IT › stores and returns a tour; second generation replaces | P+T | Met |
| AC-18 | C1/C3 | OV › AC-15/16/18; E09 | P+T | Met |
| AC-19 | S6 | IT › AC-19/AC-20/EC-1 (shared service instance) | P+T | Met |
| AC-20 | S6 | IT › same | P+T | Met |
| AC-21 | C3, S6 | OV › AC-21; IT › current_commit_sha | P+T | Met |
| AC-22 | S6 | IT › AC-22 | P+T | Met |
| AC-23 | C3 | OV › AC-23; IT › clone_status no_clone | P+T | Met |
| AC-24 | S6 | IT › AC-24 (FK cascade) | P+T | Met |
| AC-25 | S1/S6 | FA › collectFacts (10); IT › AC-25/AC-42 | P+T | Met |
| AC-26 | S1 | FA › AC-26 | P+T | Met |
| AC-27 | S2 | HO › hotness formula, ≤200 commits / 90 days | P+T | Met |
| AC-28 | S3/F2 | MOD › rankFiles, selectReadingPath, T1 | P+T | Met |
| AC-29 | S2/S6 | HO › failure / slow → available:false; IT › hotness_unavailable | P+T | Met |
| AC-30 | S3/F2 | MOD › chains from entry points, T3, T4a, T4b, T5a, T5b | P+T | Met |
| AC-31 | S3 | MOD › AC-31 (3) | P+T | Met |
| AC-32 | S1/S6 | FA › AC-32; IT › AC-32/AC-34 | P+T | Met |
| AC-33 | S3 | MOD › tourNotes; IT › partial notes | P+T | Met |
| AC-34 | S1/S3 | MOD › AC-34; FA › AC-34; IT › AC-32/AC-34 | P+T | Met |
| AC-35 | S5/S6 | NR › llmNoRetry (one request, retries 0); IT › exactly one request | P+T | Met |
| AC-36 | S4/S6 | GR › skeleton lists kept; IT success | P+T | Met |
| AC-37 | S3/S4/F2 | MOD › wire shape, Imported by n, T6 (2); GR › AC-37 | P+T | Met |
| AC-38 | S3/S4 | MOD › isCandidateCommand (9); GR › candidates; IT › AC-38/AC-39; RF › C4 dedupe | P+T | Met |
| AC-39 | S4 | GR › schema, scope exists, first 5 | P+T | Met |
| AC-40 | S4 | GR › AC-40 (2) | P+T | Met |
| AC-41 | S4/S6 | PR › classifyLlmError (5); IT › it.each reasons, EC-10; RF › C2 | P+T | Met |
| AC-42 | S3 | MOD › skeletonCommands (5), buildSkeletonSections (4) | P+T | Met |
| AC-43 | S6 | IT › failures stored; AC-43 | P+T | Met |
| AC-44 | S6 | IT › AC-44 | P+T | Met |
| AC-45 | C3 | OV › AC-45 | P+T | Met |
| AC-46 | C3 | OV › AC-46 | P+T | Met |
| AC-47 | S3 | MOD › tourStatus (3) | P+T | Met |
| AC-48 | C2 | OV › status banner (AC-48, NFR-7) | P+T | Met |
| AC-49 | S6 | IT › AC-49/NFR-1 (a), (b) (200 ms opts seam; 120 000 ms by inspection) | P+T | Met |
| AC-50 | C4 | OV › AC-50 / NFR-6 | P+T | Met |
| AC-51 | C4 | OV › AC-51/AC-52 | P+T | Met |
| AC-52 | C4 | OV › AC-51/AC-52, AC-52 | P+T | Met |
| AC-53 | C4 | TR › tourToMarkdown (6) | P+T | Met |
| AC-54 | C4 | OV › AC-54 / EC-18 | P+T | Met |
| AC-55 | C4 | TR › githubBlobUrl (3); OV › AC-11 / AC-55, AC-55 | P+T | Met |
| AC-56 | S6 | IT › log line (success, skeleton, rejections) | P+T | Met |
| AC-57 | S6 | IT › success metrics | P+T | Met |
| AC-58 | S6 | **manual** — final demo below | P | **Met (manual)** |
| AC-59 | S4 | PR › untrusted blocks | P+T | Met |
| AC-60 | S1/S4 | FA › AC-60; PR › env names only | P+T | Met |
| AC-61 | S4 | GR › isSafeRepoPath (2), AC-61/EC-15, unsafe cwd | P+T | Met |
| AC-62 | C2 | MD › AC-62 | P+T | Met |
| AC-63 | F2 | MOD › T1, T2 | T | Met |
| EC-1 | S6/C3 | IT › AC-19/AC-20/EC-1; OV › EC-1 | P+T | Met |
| EC-2 | S6/C3 | IT › EC-2; OV › EC-2 | P+T | Met |
| EC-3 | S6/C3 | IT › EC-3; OV › AC-13 / EC-3 | P+T | Met |
| EC-4 | S1/S3 | FA › EC-4; MOD › EC-4, EC-4/EC-16 | P+T | Met |
| EC-5 | S1/C4 | FA › EC-5; MOD › manifest per cwd, monorepo; TR › EC-5 | P+T | Met |
| EC-6 | S1 | FA › EC-6 | P+T | Met |
| EC-7 | S4 | PR › budget, priority | P+T | Met |
| EC-8 | S4 | GR › EC-8/NFR-8, caps | P+T | Met |
| EC-9 | S4/C2 | GR › oversized diagram; MD › EC-9 | P+T | Met |
| EC-10 | S5/S6 | IT › EC-10; NR › EC-10 | P+T | Met |
| EC-11 | S6 | IT › rate_limited | P+T | Met |
| EC-12 | S2 | HO › EC-12 (2) | P+T | Met |
| EC-13 | S2 | HO › fetch/log failure | P+T | Met |
| EC-14 | C4 | TR › EC-14 | P+T | Met |
| EC-15 | S4 | GR › AC-61/EC-15 | P+T | Met |
| EC-16 | S1/S3 | FA › EC-16; MOD › EC-16; IT › partial notes | P+T | Met |
| EC-17 | S6/C3 | IT › EC-17; OV › EC-17 | P+T | Met |
| EC-18 | C4 | OV › AC-54 / EC-18 | P+T | Met |
| EC-19 | F2 | MOD › EC-19 (2) | T | Met |
| EC-20 | F2 | MOD › T9, T5b; real run on `burnjohn/quick-blog` matched exactly | T | Met |
| EC-21 | F2 | MOD › EC-21 (3) | T | Met |
| EC-22 | F2 | MOD › T2 | T | Met |
| NFR-1 | S6 | IT › AC-49/NFR-1 (a), (b) | P+T | Met (see follow-up C5) |
| NFR-2 | S1/S2/S6/F2 | IT › NFR-2 fixture scale; MOD › T10 | P+T | **Partially met** — ~5,000-file manual run not done (blocked, see below) |
| NFR-3 | S4 | PR › 12k input; IT › maxTokens ≤ 4000 | P+T | Met |
| NFR-4 | S5/S6 | NR; IT › AC-22, AC-19, EC-10 | P+T | Met |
| NFR-5 | S6 | IT › log line has no content/prompt/secret | P+T | Met |
| NFR-6 | C2/C3/C4 | OV › AC-6 / NFR-6, AC-50 / NFR-6; MD › alt text | P+T | **Partially met** — manual Tab order / contrast / screen-reader check not recorded |
| NFR-7 | 0.3/C2/C3 | OV › NFR-7 plural, banner tests | P+T | Met (D2 interpretation: sidebar label via NAV) |
| NFR-8 | 0.1/S4 | GR › 256 KB, caps; `S/contracts.test.ts` | P+T | Met |
| NFR-9 | S6 | IT › p95 ≤ 300 ms | P+T | Met |
| NFR-10 | S6 | IT › fetch spy, mocked providers | P+T | Met |

**Totals:** 95 items — 93 Met (AC-58 by manual demo), 2 Partially met (NFR-2, NFR-6), 0 Not met.

## Final demo (AC-58)

Unfamiliar open-source repo `pmndrs/zustand` added to DevDigest (clone + index: 144 files, 50 indexed, `full`, 1.6 s), then **Generate onboarding tour** from the empty state in the browser.

Server log line:

```
onboarding generation  repo: "pmndrs/zustand"  provider: "openrouter"  model: "deepseek/deepseek-v4-flash"
  llm_calls: 1  tokens_in: 7131  tokens_out: 2840  cost_usd: 0.000359  duration_ms: 30896
  status: "full"  reason: null  dropped_items: 0
```

Banner: `AI-generated · 1 LLM call · 9,971 tokens · $0.000359` — cost equals the log line. Screenshot: `docs/reports/assets/2026-10-03-spec-02-zustand-tour.jpg`.

Earlier manual runs: `burnjohn/quick-blog` — 1 call, $0.00033 (before amendment) and $0.000688 (after amendment; critical paths / reading path matched EC-20 exactly).

## Unclosed rows before merge

1. **NFR-2 (manual part)** — pre-LLM time at ~5,000 indexed files not measured. The attempt on `excalidraw/excalidraw` was blocked by a pre-existing indexer/job-runner bug (index job exceeded the JobRunner's 120 s hard timeout and the unhandled rejection crashed the server; resync does not start a first full index). Out of SPEC-02 scope; filed as a separate task.
2. **NFR-6 (manual part)** — Tab order vs visual order, 4.5:1 contrast of badges/banner in light and dark themes, screen-reader announcement of "Copied" — not recorded.
3. **Follow-ups (Review log):** C5 (`collectFacts` not bounded by the generation deadline), A3 (docblock placement in `repo-intel/service.ts`), T10 timing guard may be flaky on slow CI.
4. **Process notes:** red-commit integrity check cannot be replayed (chunks folded into stage commits; markers kept on local branch `backup/spec-02-review-markers`).

## Deviations from the plan

- Section bodies are consolidated in `OnboardingView/TourBody.tsx` (plus `TourToc`) instead of the planned `CriticalPaths/`, `HowToRun/`, `ReadingPath/`, `FirstTasks/` folders; extra files `useCopy.ts`, `bodyStyles.ts`, `constants.ts`, `StatusBanner/helpers.ts`. Behaviour and tests unaffected.
- `client/pnpm-workspace.yaml` gained `overrides: lodash-es ^4.18.1` (security finding S1; pnpm 12 ignores `pnpm.overrides` in package.json).
- UI restyled to the N5 design after the user's design-fidelity review (Review log U1).
- Spec amended 2026-10-03 (entry points boost) with user approval; fix plan addendum F1/F2.
- Observed in the zustand demo: the demo app under `examples/` is an entry point with the largest reach, so it leads the critical paths ahead of the library core (`src/vanilla.ts`). Spec-correct (AC-63 does not exclude `examples/`); candidate follow-up: treat `examples/`/`demo/` as low-priority entry points.
