import { describe, it, expect } from 'vitest';
import { EvalCaseInput } from '@devdigest/shared';
import { EVAL_SEED_CASES } from '../src/db/seed-evals.js';
import { validateCaseInput } from '../src/modules/eval/helpers.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

describe('eval seed cases', () => {
  it('has 8 cases: >=5 must_find, >=3 must_not_flag, unique names', () => {
    expect(EVAL_SEED_CASES).toHaveLength(8);
    expect(EVAL_SEED_CASES.filter((c) => c.expectation_type === 'must_find').length).toBeGreaterThanOrEqual(5);
    expect(EVAL_SEED_CASES.filter((c) => c.expectation_type === 'must_not_flag').length).toBeGreaterThanOrEqual(3);
    expect(new Set(EVAL_SEED_CASES.map((c) => c.name)).size).toBe(8);
  });

  it.each(EVAL_SEED_CASES.map((c) => [c.name, c] as const))('%s passes the user-input validator', (_n, c) => {
    expect(EvalCaseInput.safeParse(c).success).toBe(true);
    const diff = parseUnifiedDiff(c.input_diff);
    expect(validateCaseInput(c, diff, Buffer.byteLength(c.input_diff, 'utf8'))).toBeNull();
  });
});
