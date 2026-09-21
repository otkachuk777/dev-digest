---
name: semver-discipline
description: Use when a diff changes a public API and you need to decide whether the change was released with the right version bump. Map the change to major / minor / patch and flag a bump that is missing or too small.
---

# Semver discipline for API changes

Versioning is the promise that clients can upgrade safely. Classify the diff and
check that the version marker moved accordingly:

| Change | Bump |
|---|---|
| Any breaking change to a public contract (see `breaking-change`, `response-schema`) | **MAJOR** |
| Backwards-compatible addition: new route, new optional field or param, new enum value clients need not handle | **MINOR** |
| No contract change: bug fix, internal refactor, doc fix | **PATCH** |

Where to look for the marker: the package `version`, a `/v1` → `/v2` path prefix,
an `Accept-Version` / media-type header, and the CHANGELOG or release notes.

Flag:
- a breaking change with only a minor/patch bump, or no bump and no new API version;
- a MAJOR bump with no note of what broke and how to migrate;
- a pre-1.0 version used as an excuse — a 0.x public API still has clients.

Do not demand a bump for changes that are internal-only.

## Bad → Good

Bad — removes a field and ships it as a patch:

```diff
- "version": "2.4.1"
+ "version": "2.4.2"
```
```diff
  // CHANGELOG
+ ## 2.4.2 — fix payments list
+ - payments no longer return `amount`
```

Good — the same change is a major, or is kept compatible:

```diff
- "version": "2.4.1"
+ "version": "3.0.0"
```
```diff
+ ## 3.0.0
+ - BREAKING: payments no longer return `amount`; use `amount_decimal`. Migration: …
```

## Severity

- **CRITICAL** — a breaking change to a public API released with no major bump and
  no new API version.
- **WARNING** — the bump is right but the release notes give no migration path.
