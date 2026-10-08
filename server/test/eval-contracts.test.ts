import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { EvalRunDetail, EvalCaseInput, EvalRunRecord } from '../src/vendor/shared/index.js';

const run = {
  id: 'r1',
  agent_id: 'a1',
  agent_version: 3,
  status: 'done',
  error: null,
  started_at: '2026-10-08T00:00:00.000Z',
  finished_at: '2026-10-08T00:01:00.000Z',
  cases_done: 2,
  total: 2,
  passed: 1,
  errored: 1,
  recall: 0.5,
  precision: null,
  citation_accuracy: 1,
  cost_usd: 0.02,
  duration_ms: 60000,
};

const detail = {
  ...run,
  config: {
    provider: 'openrouter',
    model: 'm',
    system_prompt: 'p',
    strategy: 'auto',
    skills: [{ skill_id: 's1', name: 'sec', version: 2, body: 'b' }],
  },
  results: [
    {
      case_id: 'c1',
      case_name: 'sqli',
      expectation_type: 'must_find',
      status: 'pass',
      expected_count: 1,
      matched_count: 1,
      findings: [{ file: 'a.ts', start_line: 1, end_line: 2, severity: 'critical', category: 'security', title: 't' }],
      dropped_count: 0,
      error: null,
      duration_ms: 10,
      cost_usd: null,
      ran_at: '2026-10-08T00:00:30.000Z',
    },
    {
      case_id: 'c2',
      case_name: 'gone',
      expectation_type: 'must_not_flag',
      status: 'error',
      expected_count: 1,
      matched_count: 0,
      findings: [],
      dropped_count: 0,
      error: 'timeout',
      duration_ms: 120000,
      cost_usd: 0,
      ran_at: '2026-10-08T00:00:50.000Z',
    },
  ],
};

describe('eval contracts', () => {
  it('NFR-10: both eval.ts copies are byte-identical', () => {
    const p = (m: string) => resolve(__dirname, `../../${m}/src/vendor/shared/contracts/eval.ts`);
    expect(readFileSync(p('server'), 'utf8')).toBe(readFileSync(p('client'), 'utf8'));
  });

  it('parses an EvalRunDetail fixture', () => {
    expect(() => EvalRunDetail.parse(detail)).not.toThrow();
  });

  it('rejects an unknown expectation_type', () => {
    const bad = structuredClone(detail);
    (bad.results[0] as { expectation_type: string }).expectation_type = 'other';
    expect(EvalRunDetail.safeParse(bad).success).toBe(false);
    expect(
      EvalCaseInput.safeParse({
        name: 'n',
        expectation_type: 'other',
        expected: [{ file: 'a', start_line: 1, end_line: 1 }],
        input_diff: '',
        input_meta: { title: '', body: '' },
      }).success,
    ).toBe(false);
  });

  it('rejects recall out of range', () => {
    expect(EvalRunRecord.safeParse({ ...run, recall: 1.5 }).success).toBe(false);
  });
});
