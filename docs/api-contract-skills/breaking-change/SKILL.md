---
name: breaking-change
description: Use when a diff changes or removes anything a client of a public HTTP route can send or rely on. Compare the route's contract before and after the diff and report every change an existing client would not survive.
---

# Breaking change to a public contract

A contract is everything an existing client can send and rely on: method, path,
path/query/header/body fields, accepted values, status codes, and the shape of
the response. A change is **breaking** if a client that worked yesterday fails,
or silently gets a different result, without changing a line of its own code.

For each route the diff touches, write the contract BEFORE and AFTER, then flag
every change in this list and name the client behaviour that breaks:

**Request side**
- a new REQUIRED field, param or header;
- an optional field made required;
- a field, query key or path segment renamed or removed;
- a narrowed type or enum (fewer accepted values than before);
- a tighter rule that rejects input the old route accepted (min/max, regex, range);
- a changed default that alters what an omitted param means.

**Route identity**
- a changed method or path, a deleted or moved route;
- authentication or authorization newly required.

**Response side** — see `response-schema`.

Changing a handler's *signature* is not the finding by itself: trace it to the
wire and say what the client sends or expects that now fails. If a shared schema
changes, list every route that uses it.

## Bad → Good

Bad — renames a query param in place; every client sending `limit` now gets the
default page size, with no error:

```ts
// before
const Query = z.object({ limit: z.coerce.number().default(20) });
// after
const Query = z.object({ page_size: z.coerce.number().max(50).default(20) });
```

Good — accept both while clients migrate, prefer the new name, reject nothing:

```ts
const Query = z.object({
  page_size: z.coerce.number().max(100).optional(),
  limit: z.coerce.number().max(100).optional(), // deprecated alias of page_size
}).transform((q) => ({ page_size: q.page_size ?? q.limit ?? 20 }));
```

Bad — makes a new field mandatory: `customer_id: z.string().uuid()` on an existing
`GET /payments`. Good — keep it `.optional()`; enforce it in a new route or a new
API version.

## Severity

- **CRITICAL** — breaks a public route (used outside this repo, or by a client not
  updated in this diff). The finding must name the broken caller or input.
- **SUGGESTION** at most — an internal route whose every caller is updated in the
  same diff. Say which case it is and why.
