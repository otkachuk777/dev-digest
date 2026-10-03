import { describe, it, expect } from 'vitest';
import {
  docTypeFor,
  isDocPath,
  checkRequestedPath,
  mergeAttachments,
  planBudget,
} from '../src/modules/context/helpers.js';

const ROOTS = ['specs', 'docs', 'insights'] as const;

describe('docTypeFor', () => {
  it('uses the first directory segment that is a root (EC-9)', () => {
    expect(docTypeFor('docs/specs/x.md', [...ROOTS])).toBe('docs');
    expect(docTypeFor('a/specs/docs/x.md', [...ROOTS])).toBe('specs');
    expect(docTypeFor('.devdigest/specs/a.md', [...ROOTS])).toBe('specs');
  });
  it('ignores the file name segment', () => {
    expect(docTypeFor('docs.md', [...ROOTS])).toBeNull();
    expect(docTypeFor('src/docs', [...ROOTS])).toBeNull();
  });
  it('respects a restricted root set', () => {
    expect(docTypeFor('docs/a.md', ['specs'])).toBeNull();
  });
});

describe('isDocPath', () => {
  it('accepts exact lowercase .md under a root', () => {
    expect(isDocPath('docs/a.md', [...ROOTS])).toBe(true);
  });
  it('rejects other extensions/cases (EC-16)', () => {
    expect(isDocPath('docs/README.MD', [...ROOTS])).toBe(false);
    expect(isDocPath('docs/x.Md', [...ROOTS])).toBe(false);
    expect(isDocPath('docs/x.mdx', [...ROOTS])).toBe(false);
    expect(isDocPath('docs/x.txt', [...ROOTS])).toBe(false);
  });
  it('rejects paths outside any root', () => {
    expect(isDocPath('src/a.md', [...ROOTS])).toBe(false);
  });
  it('rejects control chars, quotes, backticks, angle brackets (AC-2)', () => {
    for (const bad of ['\n', '\r', '\0', '"', '`', '<', '>', '\x7f']) {
      expect(isDocPath(`docs/a${bad}b.md`, [...ROOTS])).toBe(false);
    }
  });
});

describe('checkRequestedPath', () => {
  it('flags unsafe inputs (AC-12)', () => {
    for (const p of ['/etc/passwd', '\\x', 'C:\\x.md', 'c:/x.md', '../x.md', 'docs/../../x.md', 'docs/..', 'a\\b.md', 'a\0b.md']) {
      expect(checkRequestedPath(p)).toBe('invalid');
    }
  });
  it('accepts relative posix paths', () => {
    expect(checkRequestedPath('docs/a.md')).toBe('ok');
    expect(checkRequestedPath('docs/a..b.md')).toBe('ok');
  });
});

describe('mergeAttachments', () => {
  it('agent first, then skills in order, first occurrence wins (EC-4)', () => {
    const merged = mergeAttachments(
      { name: 'Agent', paths: ['a.md', 'b.md'] },
      [
        { id: 's1', name: 'S1', paths: ['b.md', 'c.md'] },
        { id: 's2', name: 'S2', paths: ['c.md', 'd.md', 'a.md'] },
      ],
    );
    expect(merged).toEqual([
      { path: 'a.md', origin: 'agent', originName: 'Agent' },
      { path: 'b.md', origin: 'agent', originName: 'Agent' },
      { path: 'c.md', origin: 'skill', originName: 'S1', skillId: 's1' },
      { path: 'd.md', origin: 'skill', originName: 'S2', skillId: 's2' },
    ]);
  });
  it('dedupes within the same owner', () => {
    expect(mergeAttachments({ name: 'A', paths: ['a.md', 'a.md'] }, [])).toHaveLength(1);
  });
});

describe('planBudget', () => {
  it('everything within budget is read', () => {
    expect(planBudget([{ path: 'a', tokens: 5 }, { path: 'b', tokens: 5 }], 10)).toEqual([
      { path: 'a', keepTokens: 5, status: 'read' },
      { path: 'b', keepTokens: 5, status: 'read' },
    ]);
  });
  it('exact boundary stays read', () => {
    expect(planBudget([{ path: 'a', tokens: 8000 }], 8000)[0]?.status).toBe('read');
  });
  it('crossing doc keeps the remainder; later docs keep 0', () => {
    expect(
      planBudget([{ path: 'a', tokens: 6 }, { path: 'b', tokens: 6 }, { path: 'c', tokens: 1 }], 10),
    ).toEqual([
      { path: 'a', keepTokens: 6, status: 'read' },
      { path: 'b', keepTokens: 4, status: 'truncated' },
      { path: 'c', keepTokens: 0, status: 'truncated' },
    ]);
  });
  it('single doc over budget keeps the budget (EC-13)', () => {
    expect(planBudget([{ path: 'a', tokens: 9000 }], 8000)).toEqual([
      { path: 'a', keepTokens: 8000, status: 'truncated' },
    ]);
  });
  it('doc after budget exactly used is heading-only truncated', () => {
    expect(planBudget([{ path: 'a', tokens: 10 }, { path: 'b', tokens: 3 }], 10)).toEqual([
      { path: 'a', keepTokens: 10, status: 'read' },
      { path: 'b', keepTokens: 0, status: 'truncated' },
    ]);
  });
  it('AC-32: zero-token doc after the budget is exhausted is truncated', () => {
    expect(planBudget([{ path: 'a', tokens: 10 }, { path: 'b', tokens: 0 }], 10)[1]).toEqual({
      path: 'b',
      keepTokens: 0,
      status: 'truncated',
    });
  });
});
