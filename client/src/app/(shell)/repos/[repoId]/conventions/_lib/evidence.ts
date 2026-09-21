/** `src/api/users.ts:23-31`, or `:23` when the evidence is a single line. Shared by the card and the skill draft. */
export function formatEvidenceRange(path: string, start: number, end: number): string {
  return end > start ? `${path}:${start}-${end}` : `${path}:${start}`;
}
