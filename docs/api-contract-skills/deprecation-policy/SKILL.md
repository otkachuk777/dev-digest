---
name: deprecation-policy
description: Use when a diff removes, renames or replaces something clients may still use. Require the old thing to be kept and marked deprecated, with a named replacement and a removal date, instead of disappearing silently.
---

# Deprecation policy

Removal is the last step of a deprecation, never the first. When the diff removes
or replaces a route, field, param or enum value, check that:

1. **The old one still works** for a stated window — both shapes are accepted or returned.
2. **It is marked deprecated** where a machine and a human can see it: a
   `Deprecation` / `Sunset` response header, `deprecated: true` in the OpenAPI or
   schema, a doc line.
3. **The replacement is named** — where to go, with an example.
4. **There is a removal date or version**, and the release notes mention it.

If the diff removes without any of this, the finding is the missing deprecation
step — suggest the smallest safe path: add the new shape, keep and mark the old,
remove it in a later major.

## Bad → Good

Bad — the field is renamed on the spot:

```ts
// before
return { id, total };
// after
return { id, total_cents };
```

Good — both are returned, the old one is flagged, and the header tells clients:

```ts
reply.header('Deprecation', 'true').header('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT');
return { id, total_cents, total: total_cents /* deprecated: use total_cents */ };
```

Bad — deleting `GET /invoices/list` in a minor release. Good — keep it answering
with `301`/`Link: </invoices>; rel="successor-version"` until the sunset date.

## Severity

- **CRITICAL** — a public route or field is removed with no deprecation window at all.
- **WARNING** — deprecated but not signalled (no header / schema flag / docs), or no
  replacement or sunset date is given.
- **SUGGESTION** — the deprecation is fine; it would help to add a migration example.
