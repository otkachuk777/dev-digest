---
name: response-schema
description: Use when a diff changes the shape of an HTTP response — field names, types, nullability, required-ness, envelope, or error format. Flag every change that makes a client's existing parsing wrong.
---

# Response schema changes

Clients parse responses by shape. Compare each touched response BEFORE and AFTER,
field by field, including the empty case and the error case:

- a field removed or renamed;
- a field's type changed (`string`→`number`, scalar→object, array→scalar);
- nullability changed (`string | null` → `string`, or the reverse);
- an optional field that is now always present is fine, but a REQUIRED field that
  can now be absent is breaking;
- the envelope changed (bare array → `{ items: [...] }`, or the reverse);
- an enum lost a value a client may switch on, or gained one a strict client may not handle;
- status code changed for the same outcome (200→201, 404→400);
- the error body changed (`{ error: { code, message } }` → something else);
- default sort, page size or pagination shape changed.

Adding a new OPTIONAL field is safe. Say so instead of flagging it.

## Bad → Good

Bad — wraps the array; `response.map(...)` in every client now throws:

```ts
// before: [{ id, amount }]
return reply.send(payments);
// after: { items: [{ id, amount }], page_size: 20 }
return reply.send({ items: payments, page_size });
```

Good — keep the old shape on the old route and put the new envelope on a versioned
route (or behind an explicit opt-in param):

```ts
app.get('/payments', () => payments);                       // unchanged
app.get('/v2/payments', () => ({ items: payments, page_size }));
```

Bad — `amount: z.number()` becomes `amount: z.string()` "for precision". Good —
add `amount_decimal: z.string()` next to it and deprecate `amount`.

## Severity

- **CRITICAL** — an existing client's parsing breaks on a public route. Name the
  client expression that fails (`response.map`, `resp.status`, …).
- **WARNING** — the schema is described in docs / OpenAPI / shared types that this
  diff did not update.
- **SUGGESTION** — additive, safe changes worth a doc line.
