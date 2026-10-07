# analysis.json — what the model writes

`render.mjs` turns `facts.json` (measured) + `analysis.json` (judged) into the report. Keep
judgment here and numbers in facts: never type a size, version or count yourself — cite it from
`facts.json`, so the report stays checkable.

```json
{
  "summary": ["3–5 takeaways, ordered by priority, each actionable and with a number from facts"],
  "priorities": [
    {
      "level": "P0 | P1 | P2 | Info",
      "title": "short imperative: 'Replace mermaid with lazy import'",
      "module": "client",
      "why": "facts only: '172 MB with transitives = 28% of client; imported by 1 file'",
      "action": "concrete step a developer can start on",
      "effort": "S | M | L"
    }
  ],
  "advice": [{ "topic": "Version drift", "text": "…", "packages": ["zod"] }],
  "notes": ["anything the facts could not show, e.g. 'client bundle size not measured'"]
}
```

Rules: ≤ 12 priorities (a 40-item list gets ignored); every priority has a measurable `why`;
every `action` names a package or file. Rubric: `priority-rubric.md`. Advice ideas: `advice-playbook.md`.
