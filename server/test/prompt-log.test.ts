import { describe, it, expect } from 'vitest';
import type { PromptSection } from '@devdigest/reviewer-core';
import { buildPromptLogRecord, promptSummaryLine } from '../src/modules/reviews/prompt-log.js';
import { loadConfig } from '../src/platform/config.js';

const SECRET = 'sk-or-v1-THISISASECRETKEY0123456789';
const DIFF = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -1,2 +1,3 @@',
  '   port: 3000,',
  `+  stripeKey: "${SECRET}",`,
  'diff --git a/src/api.ts b/src/api.ts',
  '--- a/src/api.ts',
  '+++ b/src/api.ts',
  '@@ -5,1 +5,2 @@',
  '@@ -9,1 +10,2 @@',
  '+  return privateBusinessRule();',
].join('\n');
const SPEC = 'CONFIDENTIAL spec: pricing tiers are 12/49/199';

const sections: PromptSection[] = [
  { name: 'system', source: 'agent', text: 'You review code.' },
  { name: 'guard', source: 'engine', text: 'SECURITY — …' },
  { name: 'pr-description', source: 'pr', text: `token is ${SECRET}` },
  { name: 'skills', source: 'skill', text: 'skill A\n\nskill B', parts: ['skill A', 'skill B'] },
  { name: 'specs', source: 'project-context', text: SPEC, parts: [SPEC] },
  { name: 'diff', source: 'git', text: DIFF },
];

// Deterministic stand-in for the tiktoken port: ~4 chars per token.
const countTokens = (t: string) => Math.ceil(t.length / 4);

const base = {
  call: 'review' as const,
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  correlationId: 'batch-123',
  sections,
  countTokens,
};

describe('buildPromptLogRecord', () => {
  it('describes every section by name, source and size — and carries no content', () => {
    const rec = buildPromptLogRecord({ ...base, verbose: false });
    const json = JSON.stringify(rec);

    expect(rec).toMatchObject({
      event: 'prompt.assembled',
      call: 'review',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      correlation_id: 'batch-123',
    });
    expect(rec.sections.map((s) => [s.name, s.source])).toEqual([
      ['system', 'agent'],
      ['guard', 'engine'],
      ['pr-description', 'pr'],
      ['skills', 'skill'],
      ['specs', 'project-context'],
      ['diff', 'git'],
    ]);
    expect(rec.sections.find((s) => s.name === 'diff')).toMatchObject({ chars: DIFF.length, tokens: countTokens(DIFF) });
    expect(rec.total_chars).toBe(sections.reduce((n, s) => n + s.text.length, 0));

    for (const leaked of [SECRET, 'stripeKey', 'privateBusinessRule', 'CONFIDENTIAL', 'pricing', 'You review code', 'skill A']) {
      expect(json).not.toContain(leaked);
    }
    // Non-verbose: no hashes, no per-item or per-file breakdown.
    expect(json).not.toContain('sha256');
    expect(rec.diff_files).toBeUndefined();
    expect(rec.sections.some((s) => s.items)).toBe(false);
  });

  it('verbose adds hashes and per-item / per-file sizes, still without content', () => {
    const rec = buildPromptLogRecord({ ...base, chunk: 'src/api.ts', verbose: true });
    const json = JSON.stringify(rec);

    expect(rec.chunk).toBe('src/api.ts');
    for (const s of rec.sections) expect(s.sha256).toMatch(/^[0-9a-f]{12}$/);
    expect(rec.sections.find((s) => s.name === 'skills')?.items).toEqual([
      { index: 0, chars: 7, tokens: 2 },
      { index: 1, chars: 7, tokens: 2 },
    ]);
    expect(rec.diff_files?.map((f) => [f.path, f.hunks])).toEqual([
      ['src/config.ts', 1],
      ['src/api.ts', 2],
    ]);

    for (const leaked of [SECRET, 'stripeKey', 'privateBusinessRule', 'CONFIDENTIAL', 'skill A']) {
      expect(json).not.toContain(leaked);
    }
  });

  it('summary line names sections, total and model', () => {
    const line = promptSummaryLine(buildPromptLogRecord({ ...base, verbose: false }));
    expect(line).toMatch(/^review prompt: ~\d+ tok — system ~\d+, guard ~\d+, .*diff ~\d+ \(openrouter\/deepseek\/deepseek-v4-flash\)$/);
    expect(line).not.toContain(SECRET);
  });
});

describe('PROMPT_LOG_VERBOSE', () => {
  const cfg = (env: Record<string, string>) => loadConfig(env as NodeJS.ProcessEnv).promptLogVerbose;

  it('is off by default and on only when explicitly true outside production', () => {
    expect(cfg({})).toBe(false);
    expect(cfg({ PROMPT_LOG_VERBOSE: 'true', NODE_ENV: 'development' })).toBe(true);
    expect(cfg({ PROMPT_LOG_VERBOSE: 'true', NODE_ENV: 'test' })).toBe(true);
    expect(cfg({ PROMPT_LOG_VERBOSE: '1', NODE_ENV: 'development' })).toBe(false);
  });

  it('is forced off in production even when set', () => {
    expect(cfg({ PROMPT_LOG_VERBOSE: 'true', NODE_ENV: 'production' })).toBe(false);
  });
});
