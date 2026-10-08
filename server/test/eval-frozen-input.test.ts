import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { MAX_DIFF_BYTES } from '../src/modules/eval/constants.js';
import {
  caseNameFor, fileDiffFragment, rangeHasNewLine, rangeStart, validateCaseInput,
} from '../src/modules/eval/helpers.js';

const patch = '@@ -1,2 +10,3 @@\n a\n+b\n c';
const diff: UnifiedDiff = parseUnifiedDiff(fileDiffFragment('src/a.ts', patch));
const base = {
  name: 'case-1',
  expected: [{ file: 'src/a.ts', start_line: 10, end_line: 12 }],
  input_diff: 'x',
  input_meta: { title: 't', body: 'b' },
};
const check = (over: Record<string, unknown>, d: UnifiedDiff | null = diff, bytes = 10) =>
  validateCaseInput({ ...base, ...over } as never, d, bytes);

describe('eval frozen input', () => {
  it('AC-6: fileDiffFragment writes the git headers and parses back', () => {
    expect(fileDiffFragment('src/a.ts', patch)).toBe(`diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n${patch}`);
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]!.path).toBe('src/a.ts');
  });

  it('AC-7: slug, prefixes, 34-char cut and -2/-3 suffixes', () => {
    expect(caseNameFor('accepted', '  SQL Injection in login!! ', [])).toBe('must-find-sql-injection-in-login');
    expect(caseNameFor('dismissed', 'Unused var', [])).toBe('no-unused-var');
    const long = 'a'.repeat(50);
    expect(caseNameFor('accepted', long, [])).toBe(`must-find-${'a'.repeat(34)}`);
    expect(caseNameFor('dismissed', 'Unused var', ['no-unused-var'])).toBe('no-unused-var-2');
    expect(caseNameFor('dismissed', 'Unused var', ['no-unused-var', 'no-unused-var-2'])).toBe('no-unused-var-3');
  });

  it('AC-10 / EC-3: rangeHasNewLine is inclusive and file-scoped', () => {
    expect(rangeHasNewLine(diff, 'src/a.ts', 12, 20)).toBe(true);
    expect(rangeHasNewLine(diff, 'src/a.ts', 1, 10)).toBe(true);
    expect(rangeHasNewLine(diff, 'src/a.ts', 13, 20)).toBe(false);
    expect(rangeHasNewLine(diff, 'src/b.ts', 10, 12)).toBe(false);
  });

  it('AC-27: a valid input passes', () => {
    expect(check({})).toBeNull();
  });

  it('AC-27: every rule names its field', () => {
    expect(check({ name: '' })?.field).toBe('name');
    expect(check({ name: 'x'.repeat(81) })?.field).toBe('name');
    expect(check({}, null)?.field).toBe('input_diff');
    expect(check({}, { raw: '', files: [] })?.field).toBe('input_diff');
    expect(check({}, { raw: '', files: [{ path: 'src/a.ts', additions: 0, deletions: 0, hunks: [] }] })?.field).toBe('input_diff');
    expect(check({ expected: [] })?.field).toBe('expected');
    expect(check({ expected: Array(21).fill(base.expected[0]) })?.field).toBe('expected');
    expect(check({ expected: [{ file: 'nope.ts', start_line: 10, end_line: 10 }] })?.field).toBe('expected[0].file');
    expect(check({ expected: [{ file: 'src/a.ts', start_line: 0, end_line: 10 }] })?.field).toBe('expected[0].start_line');
    expect(check({ expected: [{ file: 'src/a.ts', start_line: 12, end_line: 11 }] })?.field).toBe('expected[0].end_line');
    expect(check({ expected: [base.expected[0], { file: 'src/a.ts', start_line: 90, end_line: 91 }] })?.field).toBe('expected[1].end_line');
    expect(check({ input_meta: { title: 'x'.repeat(301), body: '' } })?.field).toBe('input_meta.title');
    expect(check({ input_meta: { title: '', body: 'x'.repeat(10001) } })?.field).toBe('input_meta.body');
    expect(check({ input_meta: { title: 'x'.repeat(300), body: 'x'.repeat(10000) } })).toBeNull();
  });

  it('AC-14 / NFR-4: 200 KB is the inclusive limit, in bytes', () => {
    expect(check({}, diff, MAX_DIFF_BYTES)).toBeNull();
    expect(check({}, diff, MAX_DIFF_BYTES + 1)?.field).toBe('input_diff');
  });

  it('rangeStart: null for all, otherwise now minus N days', () => {
    const now = new Date('2026-10-08T00:00:00Z');
    expect(rangeStart('all', now)).toBeNull();
    expect(rangeStart('7d', now)?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(rangeStart('90d', now)?.toISOString()).toBe('2026-07-10T00:00:00.000Z');
  });
});
