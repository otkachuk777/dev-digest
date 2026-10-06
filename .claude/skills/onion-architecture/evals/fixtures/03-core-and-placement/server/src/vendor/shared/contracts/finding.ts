import { z } from 'zod';

export const Severity = z.enum(['critical', 'major', 'minor']);
export type Severity = z.infer<typeof Severity>;

export const Finding = z.object({
  id: z.string().uuid(),
  review_id: z.string().uuid(),
  severity: Severity,
  title: z.string(),
  file: z.string(),
  line: z.number().int(),
  dismissed_at: z.string().datetime().nullable(),
});
export type Finding = z.infer<typeof Finding>;
