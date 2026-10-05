import { describe, it, expect } from 'vitest';
import { SUMMARY_MAX, TITLE_MAX, EXPLANATION_MAX, REASON_MAX } from '../src/modules/brief/constants.js';
import { PrBrief, type BlastRadius } from '@devdigest/shared';
import { buildBriefPrompt, type BriefFacts, type BriefHunk, type BriefModelOutput } from '@devdigest/reviewer-core';
import { blastSnapshot, groundBrief, orderFiles, selectFindings, specDocPaths } from '../src/modules/brief/helpers.js';

const hunk = (start: number, length: number): BriefHunk => ({ start, length, header: '' });
const out = (over: Partial<BriefModelOutput> = {}): BriefModelOutput => ({ summary: 's', risks: [], review_focus: [], ...over });
const risk = (over: Partial<BriefModelOutput['risks'][number]> = {}): BriefModelOutput['risks'][number] => ({
  kind: 'other', title: 't', explanation: 'e', severity: 'low', file_refs: ['src/config.ts'], ...over,
});
const scope = (prFiles: Record<string, BriefHunk[]>, callers: Record<string, number[]> = {}) => ({
  prFiles: new Map(Object.entries(prFiles)),
  blastCallers: new Map(Object.entries(callers).map(([f, ls]) => [f, new Set(ls)])),
});

describe('groundBrief — focus items (AC-38, AC-39, AC-58, EC-11)', () => {
  it('EC-11: keeps 2 of 4 items and counts 2 dropped', () => {
    const g = groundBrief(
      out({
        review_focus: [
          { file: 'src/config.ts', line: 12, reason: 'a' },
          { file: 'src/config.ts', line: 40, reason: 'b' },
          { file: 'src/api/public/health.ts', line: 11, reason: 'c' },
          { file: 'src/db/orders.ts', line: 3, reason: 'd' },
        ],
      }),
      scope({ 'src/config.ts': [hunk(10, 5)] }, { 'src/api/public/health.ts': [11] }),
    );
    expect(g.review_focus.map((f) => `${f.file}:${f.line}`)).toEqual(['src/config.ts:12', 'src/api/public/health.ts:11']);
    expect(g.dropped).toBe(2);
  });

  it('AC-39: hunk range is inclusive on both ends; a PR file with no hunks has no valid line', () => {
    const g = groundBrief(
      out({
        review_focus: [
          { file: 'a.ts', line: 10, reason: 'x' },
          { file: 'a.ts', line: 14, reason: 'x' },
          { file: 'a.ts', line: 15, reason: 'x' },
          { file: 'b.ts', line: 1, reason: 'x' },
        ],
      }),
      scope({ 'a.ts': [hunk(10, 5)], 'b.ts': [] }),
    );
    expect(g.review_focus.map((f) => f.line)).toEqual([10, 14]);
    expect(g.dropped).toBe(2);
  });

  it('AC-41: unsafe paths are dropped even when listed', () => {
    const g = groundBrief(
      out({ review_focus: [{ file: '../x.ts', line: 1, reason: 'x' }, { file: '/etc/passwd', line: 1, reason: 'x' }] }),
      scope({ '../x.ts': [hunk(1, 3)], '/etc/passwd': [hunk(1, 3)] }),
    );
    expect(g.review_focus).toEqual([]);
    expect(g.dropped).toBe(2);
  });

  it('AC-56: reason cut at 200; an empty reason drops the item', () => {
    const g = groundBrief(
      out({ review_focus: [{ file: 'a.ts', line: 1, reason: 'r'.repeat(300) }, { file: 'a.ts', line: 2, reason: '  ' }] }),
      scope({ 'a.ts': [hunk(1, 5)] }),
    );
    expect(g.review_focus).toHaveLength(1);
    expect(g.review_focus[0]!.reason).toHaveLength(200);
    expect(g.dropped).toBe(1);
  });
});

describe('groundBrief — risk refs (AC-40, AC-41, EC-13)', () => {
  const sc = scope({ 'src/middleware/ratelimit.ts': [hunk(1, 50)], 'package.json': [hunk(30, 10)] });

  it('EC-13: keeps path:a-b and path:line; drops reversed range and absolute path; an emptied risk goes too', () => {
    const g = groundBrief(
      out({
        risks: [
          risk({ file_refs: ['src/middleware/ratelimit.ts:12-18', 'src/middleware/ratelimit.ts:18-12'] }),
          risk({ file_refs: ['package.json:34'] }),
          risk({ file_refs: ['/etc/passwd'] }),
          risk({ file_refs: ['src/middleware/ratelimit.ts:18-12'] }),
        ],
      }),
      sc,
    );
    expect(g.risks.map((r) => r.file_refs)).toEqual([['src/middleware/ratelimit.ts:12-18'], ['package.json:34']]);
    expect(g.dropped).toBe(2);
  });

  it('AC-40: unknown path, line 0 and junk suffix are dropped; a bare known path is kept', () => {
    const g = groundBrief(
      out({ risks: [risk({ file_refs: ['nope.ts', 'package.json:0', 'package.json:x', 'package.json'] })] }),
      sc,
    );
    expect(g.risks[0]!.file_refs).toEqual(['package.json']);
  });

  it('AC-40: a blast-only caller file is a valid ref path', () => {
    const g = groundBrief(out({ risks: [risk({ file_refs: ['src/api/health.ts:11'] })] }), scope({}, { 'src/api/health.ts': [11] }));
    expect(g.risks).toHaveLength(1);
  });

  it('AC-57: unknown kind becomes other, known kinds survive', () => {
    const g = groundBrief(out({ risks: [risk({ kind: 'foo', file_refs: ['package.json'] }), risk({ kind: 'security', file_refs: ['package.json'] })] }), sc);
    expect(g.risks.map((r) => r.kind)).toEqual(['other', 'security']);
    expect(g.dropped).toBe(0);
  });

  it('AC-56: title, explanation and summary are cut', () => {
    const g = groundBrief(
      out({ summary: 's'.repeat(900), risks: [risk({ title: 't'.repeat(200), explanation: 'e'.repeat(900), file_refs: ['package.json'] })] }),
      sc,
    );
    expect(g.summary).toHaveLength(600);
    expect(g.risks[0]!.title).toHaveLength(120);
    expect(g.risks[0]!.explanation).toHaveLength(600);
  });
});

describe('groundBrief — caps (AC-42, AC-58)', () => {
  it('7 risks and 9 items become 6 and 8, adding 2 to dropped', () => {
    const g = groundBrief(
      out({
        risks: Array.from({ length: 7 }, () => risk({ file_refs: ['a.ts'] })),
        review_focus: Array.from({ length: 9 }, (_, i) => ({ file: 'a.ts', line: i + 1, reason: 'r' })),
      }),
      scope({ 'a.ts': [hunk(1, 20)] }),
    );
    expect(g.risks).toHaveLength(6);
    expect(g.review_focus).toHaveLength(8);
    expect(g.dropped).toBe(2);
  });
});

describe('orderFiles (EC-12)', () => {
  const f = (path: string, additions: number, deletions: number, role: string) => ({ path, additions, deletions, role });
  it('orders by role, then size descending, then path', () => {
    const files = [
      f('package-lock.json', 92, 24, 'boilerplate'),
      f('docs/rate-limit.md', 20, 0, 'docs'),
      f('src/middleware/ratelimit.test.ts', 40, 0, 'tests'),
      f('package.json', 3, 1, 'wiring'),
      f('src/api/public/index.ts', 12, 2, 'wiring'),
      f('src/api/users.ts', 7, 2, 'core'),
      f('src/config.ts', 4, 0, 'core'),
      f('src/api/public/webhooks.ts', 31, 6, 'core'),
      f('src/middleware/ratelimit.ts', 84, 0, 'core'),
    ];
    expect(orderFiles(files).map((x) => x.path)).toEqual([
      'src/middleware/ratelimit.ts',
      'src/api/public/webhooks.ts',
      'src/api/users.ts',
      'src/config.ts',
      'src/api/public/index.ts',
      'package.json',
      'src/middleware/ratelimit.test.ts',
      'docs/rate-limit.md',
      'package-lock.json',
    ]);
  });
  it('ties on size break by path ascending and the input is not mutated', () => {
    const input = [f('b.ts', 1, 1, 'core'), f('a.ts', 2, 0, 'core')];
    expect(orderFiles(input).map((x) => x.path)).toEqual(['a.ts', 'b.ts']);
    expect(input[0]!.path).toBe('b.ts');
  });
});

describe('specDocPaths (AC-28)', () => {
  it('keeps .md files under specs/docs/insights directories only', () => {
    expect(
      specDocPaths(['docs/rate-limit.md', 'specs/SPEC-01.md', 'a/insights/x.md', 'README.md', 'docs/img.png', 'src/docs.md', 'docs/x.MD']),
    ).toEqual(['docs/rate-limit.md', 'specs/SPEC-01.md', 'a/insights/x.md', 'docs/x.MD']);
  });
});

describe('selectFindings (OQ-2)', () => {
  const row = (severity: string, file: string, startLine: number) => ({ severity, file, startLine });
  it('sorts by severity, file, line and keeps at most 30', () => {
    const rows = [row('SUGGESTION', 'a', 1), row('CRITICAL', 'b', 9), row('CRITICAL', 'b', 2), row('WARNING', 'a', 5), row('CRITICAL', 'a', 7)];
    expect(selectFindings(rows).map((r) => `${r.severity}/${r.file}/${r.startLine}`)).toEqual([
      'CRITICAL/a/7', 'CRITICAL/b/2', 'CRITICAL/b/9', 'WARNING/a/5', 'SUGGESTION/a/1',
    ]);
    expect(selectFindings(Array.from({ length: 50 }, (_, i) => row('WARNING', 'f', i)))).toHaveLength(30);
  });
});

describe('blastSnapshot (AC-37)', () => {
  const blast: BlastRadius = {
    changed_symbols: [
      { name: 'a', file: 'kept.ts', kind: 'function' },
      { name: 'b', file: 'gone.ts', kind: 'function' },
    ],
    downstream: [{ symbol: 'a', callers: [{ name: 'c', file: 'x.ts', line: 3 }], endpoints_affected: ['GET /x'], crons_affected: [] }],
    summary: '2 symbols changed · 1 callers',
  };
  const sent = (callers: { file: string; line: number; name: string }[]): BriefFacts => ({
    title: 't', description: null, intent: null, issue: null, specDocPaths: [],
    files: [{ path: 'kept.ts', additions: 1, deletions: 0, role: 'core', hunks: [], symbols: [], findings: [] }],
    blast: { callers, endpoints: ['GET /x'], crons: [] },
  });

  it('keeps downstream when the callers were sent, drops symbols of removed files, keeps the summary', () => {
    const s = blastSnapshot(blast, sent([{ file: 'x.ts', line: 3, name: 'c' }]));
    expect(s.changed_symbols.map((c) => c.file)).toEqual(['kept.ts']);
    expect(s.downstream).toEqual(blast.downstream);
    expect(s.summary).toBe(blast.summary);
  });
  it('empties downstream when the caller list was removed', () => {
    const s = blastSnapshot(blast, sent([]));
    expect(s.downstream).toEqual([]);
    expect(s.summary).toBe(blast.summary);
  });
});

describe('worst case stays within 64 KB (NFR-5, AC-37)', () => {
  const tok = { count: (s: string) => Math.ceil(s.length / 4), truncate: (s: string, n: number) => s.slice(0, n * 4) };
  const pad = (n: number, c = 'x') => c.repeat(n);

  it('100 files, 200 symbols x 20 callers, max-length strings -> brief <= 65,536 bytes and snapshot of sent facts only', () => {
    const symbols = Array.from({ length: 200 }, (_, i) => ({ name: `sym${i}`, file: `src/dir${i % 100}/${pad(80)}${i % 100}.ts`, kind: 'function' }));
    const downstream = symbols.map((s, i) => ({
      symbol: s.name,
      callers: Array.from({ length: 20 }, (_, j) => ({ name: `caller${i}_${j}`, file: `src/callers/${pad(60)}${i}_${j}.ts`, line: j + 1 })),
      endpoints_affected: ['GET /a', 'POST /b', 'PUT /c'],
      crons_affected: ['0 * * * *'],
    }));
    const blast: BlastRadius = { changed_symbols: symbols, downstream, summary: '200 symbols changed · 4000 callers' };
    const files = Array.from({ length: 100 }, (_, i) => ({
      path: `src/dir${i}/${pad(80)}${i}.ts`,
      additions: 500, deletions: 500, role: 'core',
      hunks: Array.from({ length: 5 }, (_, h) => ({ start: h * 100 + 1, length: 50, header: pad(160) })),
      symbols: [`sym${i}`, `sym${i + 100}`],
      findings: Array.from({ length: 3 }, (_, k) => ({ severity: 'WARNING', title: pad(100), line: k + 1 })),
    }));
    const callers = downstream.flatMap((d) => d.callers);
    const facts: BriefFacts = {
      title: pad(300),
      description: pad(40_000, 'word '),
      intent: { summary: pad(600), in_scope: Array.from({ length: 10 }, () => pad(200)), out_of_scope: Array.from({ length: 10 }, () => pad(200)) },
      files,
      blast: { callers, endpoints: ['GET /a', 'POST /b', 'PUT /c'], crons: ['0 * * * *'] },
      issue: { title: pad(200), body: pad(10_000) },
      specDocPaths: ['docs/a.md'],
    };

    const prompt = buildBriefPrompt(facts, tok);
    expect(prompt.truncated).toBe(true);
    const sentPaths = new Set(prompt.sent.files.map((f) => f.path));
    const snap = blastSnapshot(blast, prompt.sent);
    expect(snap.changed_symbols.every((c) => sentPaths.has(c.file))).toBe(true);
    expect(snap.downstream.length === 0 || prompt.sent.blast!.callers.length > 0).toBe(true);

    const brief: PrBrief = {
      summary: pad(600), intent: prompt.sent.intent, blast: snap,
      risks: { risks: Array.from({ length: 6 }, () => ({ kind: 'other' as const, title: pad(120), explanation: pad(600), severity: 'high' as const, file_refs: [`${pad(150)}:1-999999`] })) },
      review_focus: Array.from({ length: 8 }, () => ({ file: pad(150), line: 999_999, reason: pad(200) })),
      head_sha: pad(40), generated_at: new Date().toISOString(), provider: 'openrouter', model: pad(100),
      llm_calls: 1, tokens_in: 8000, tokens_out: 2000, cost_usd: 0.123456, duration_ms: 60_000,
      missing: ['intent', 'blast', 'description', 'issue'], truncated: true, files_truncated: true, dropped_items: 99,
    };
    expect(PrBrief.safeParse(brief).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(brief))).toBeLessThanOrEqual(65_536);
  });
});

describe('groundBrief — string caps never split a surrogate pair (22P02 guard)', () => {
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  it('emoji straddling every cap leaves valid, round-trippable strings', () => {
    const cut = (max: number) => 'a'.repeat(max - 1) + '😀tail';
    const g = groundBrief(
      out({
        summary: cut(SUMMARY_MAX),
        risks: [risk({ title: cut(TITLE_MAX), explanation: cut(EXPLANATION_MAX) })],
        review_focus: [{ file: 'src/config.ts', line: 12, reason: cut(REASON_MAX) }],
      }),
      scope({ 'src/config.ts': [hunk(10, 5)] }),
    );
    const strings = [g.summary, g.risks[0]!.title, g.risks[0]!.explanation, g.review_focus[0]!.reason];
    expect(strings.map((x) => lone.test(x))).toEqual([false, false, false, false]);
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });
});
