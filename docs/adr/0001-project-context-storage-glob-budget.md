# 0001. Project Context: attachment storage, glob matching, token counting

## Status

Accepted

## Context

SPEC-01 lets agents and skills attach repo markdown docs that are injected into review prompts under an 8000-token budget. Three choices had real alternatives. Plan: `docs/cc-plans/2026-10-01+spec-01-project-context-folder.md` (Decisions B1-B3). Behaviour: [server/docs/project-context.md](../../server/docs/project-context.md).

## Decision

We will:

1. **Glob (B1).** Accept `CONTEXT_DOCS_GLOB` only in the shape `**/{a,b}/**/*.md` over the closed roots `specs|docs|insights`, parsed by one regex at boot, and match by path segment with no dependency (`server/src/platform/config.ts`, `server/src/modules/context/helpers.ts`). Rejected: `path.matchesGlob` (fails on `.devdigest/specs/`, warns on Node 22.16) and picomatch (an extra dependency for flexibility the closed `type` enum cannot use).
2. **Storage (B2).** Two tables, one row per (owner, repo) holding an ordered `jsonb` path array, PK (owner, repo), cascade FKs. A write is one upsert, so concurrent writes are last-write-wins with no transaction. Rejected: a row per attached path (replacing an ordered set needs delete+insert in a transaction, the non-atomic pattern `AgentsRepository.setSkills` has).
3. **Token counting (B3).** Count with the existing tokenizer, cached in a process-wide map keyed `absPath|mtimeMs|size` and pruned to the current walk on each listing. Add `Tokenizer.truncate` to the tokenizer adapter.

## Consequences

- Other glob shapes or new roots need a code change (regex, `ContextDocRoot`, `ContextDocType`), not only an env edit.
- Per-path metadata (per-doc settings) would need a schema change. Paths are not foreign keys, so a path can outlive its file and shows as `not_found`.
- The cache is per process, not per container. The first listing of a very large repo after a start is cold and blocks the event loop on synchronous `encode`; the warm-listing latency target applies only afterwards.
