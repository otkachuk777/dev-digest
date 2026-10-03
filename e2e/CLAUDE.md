# e2e — conventions

Setup/run → see [README.md](README.md), не дублюй тут.

Custom runner (`run.ts`, not Playwright/Cypress) driving Vercel agent-browser over CDP — deterministic, no LLM in the loop. Package manager: **npm** (`package-lock.json`) — never pnpm here (root `INSIGHTS.md`). Run/Test: `npm test` (= `tsx run.ts`, needs a running app — see README). Hermetic run: `npm run e2e:hermetic` (`../scripts/e2e.sh`, boots its own isolated stack, direct `tsx`, not `pnpm start`/watch). Typecheck: `npm run typecheck`. Lint: not configured.

## Read when

- adding/changing a flow test → `flows/` holds the `.flow.json` files themselves
- writing/checking the prose description behind a flow → `flows-docs/`
- writing/reading a feature spec for e2e → `specs/SPEC-NN-<slug>.md` (see root `specs/README.md`, written by the `spec-creator` agent)
- changing runner internals → `docs/README.md`
- **before any work → `INSIGHTS.md` (read first, always)**

## Naming

One flow per file, `flows/NN-kebab-name.flow.json` (`NN` = zero-padded run order); its prose spec belongs under `flows-docs/` by the same basename. Shared step helpers live in `lib/`.

## Do not touch

- `package-lock.json` — never hand-edit; regenerate via `npm install` after a `package.json` change.
