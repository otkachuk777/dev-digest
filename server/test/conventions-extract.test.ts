import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { extractConventions } from '../src/modules/conventions/extract.js';

const files: Record<string, string> = {
  'src/a.ts': 'export async function a() {\n  const r = await fetchUser(1);\n  return r;\n}',
};
const cand = (over = {}) => ({
  category: 'style',
  rule: 'Use async/await',
  confidence: 0.9,
  evidence: {
    path: 'src/a.ts',
    start_line: 1,
    end_line: 3,
    snippet: 'const r = await fetchUser(1);\nreturn r;',
  },
  ...over,
});
const run = (candidates: unknown[]) =>
  extractConventions(
    {
      llm: new MockLLMProvider('openai', { structured: { candidates } }),
      model: 'm',
      readFile: async (p) => files[p] ?? null,
    },
    ['src/a.ts'],
  );

describe('extractConventions', () => {
  it('keeps a candidate whose evidence is in a sampled file and fixes its line range', async () => {
    const r = await run([cand()]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toMatchObject({ path: 'src/a.ts', startLine: 2, endLine: 3 });
    expect(r.sampleCount).toBe(1);
  });

  it('drops: path outside the sample, fake snippet, low confidence, duplicate rule', async () => {
    const r = await run([
      cand({ evidence: { ...cand().evidence, path: 'src/other.ts' } }),
      cand({ rule: 'Other rule', evidence: { ...cand().evidence, snippet: 'promise.then(x => x)' } }),
      cand({ rule: 'Weak rule', confidence: 0.2 }),
      cand(),
      cand(),
    ]);
    expect(r.candidates).toHaveLength(1);
    expect(r.dropped).toBe(4);
  });

  it('sends line-numbered, untrusted-wrapped file content and never a path it did not read', async () => {
    const llm = new MockLLMProvider('openai', { structured: { candidates: [] } });
    await extractConventions({ llm, model: 'm', readFile: async (p) => files[p] ?? null }, ['src/a.ts', 'src/gone.ts']);
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { role: string; content: string }[];
    };
    const user = req.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    expect(user).toContain('<untrusted source="file:src/a.ts">');
    expect(user).toContain('   2|   const r = await fetchUser(1);');
    expect(user).not.toContain('gone.ts');
  });

  it('fails fast with a clear error when the model never answers', async () => {
    const hang = { ...new MockLLMProvider('openai'), completeStructured: () => new Promise<never>(() => {}) };
    await expect(
      extractConventions(
        { llm: hang as never, model: 'm', readFile: async (p) => files[p] ?? null, timeoutMs: 20 },
        ['src/a.ts'],
      ),
    ).rejects.toThrow(/did not answer within/);
  });
});
