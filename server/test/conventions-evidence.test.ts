import { describe, it, expect } from 'vitest';
import { verifyEvidence } from '../src/modules/conventions/evidence.js';

const file = [
  'import x from "x";',
  '',
  'export async function load(id) {',
  '  const u = await db.find(id);',
  '  return u;',
  '}',
].join('\n');

describe('verifyEvidence', () => {
  it("relocates real line numbers from the file, ignoring the model's claim", () => {
    const r = verifyEvidence(file, { snippet: 'const u = await db.find(id);\nreturn u;', startLine: 99 });
    expect(r).toEqual({ startLine: 4, endLine: 5, snippet: '  const u = await db.find(id);\n  return u;' });
  });

  it('rejects a snippet that is not in the file', () => {
    expect(verifyEvidence(file, { snippet: 'fetch(url).then(r => r.json())', startLine: 4 })).toBeNull();
  });

  it('rejects trivially short snippets', () => {
    expect(verifyEvidence(file, { snippet: '}', startLine: 6 })).toBeNull();
  });

  it('prefers the occurrence nearest the claimed line', () => {
    const dup = ['const a = compute(1);', 'x', 'y', 'const a = compute(1);'].join('\n');
    expect(verifyEvidence(dup, { snippet: 'const a = compute(1);', startLine: 4 })?.startLine).toBe(4);
  });

  it('handles CRLF files and returns the snippet without carriage returns', () => {
    const crlf = ['const a = 1', 'const context = useContext(Ctx)', 'if (!context) {', '  throw new Error("x")', '}'].join('\r\n');
    const r = verifyEvidence(crlf, { snippet: 'const context = useContext(Ctx)\nif (!context) {', startLine: 2 });
    expect(r).toEqual({ startLine: 2, endLine: 3, snippet: 'const context = useContext(Ctx)\nif (!context) {' });
    expect(r?.snippet).not.toContain('\r');
  });
});
