import { describe, it, expect } from 'vitest';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';

describe('TiktokenTokenizer.truncate', () => {
  const tok = new TiktokenTokenizer();
  const inputs: Record<string, string> = {
    ascii: 'The quick brown fox jumps over the lazy dog. '.repeat(200),
    emoji: '😀🎉🚀 party time '.repeat(300),
    cyrillic: 'Привіт, світе! Це тест обрізання. '.repeat(300),
    big: 'lorem ipsum dolor sit amet consectetur '.repeat(10_000),
  };

  for (const [name, text] of Object.entries(inputs)) {
    for (const n of [1, 7, 100, 1000]) {
      it(`${name}: count(truncate(x, ${n})) <= ${n}`, () => {
        const cut = tok.truncate(text, n);
        expect(tok.count(cut)).toBeLessThanOrEqual(n);
        expect(cut).not.toContain('�');
        expect(text.startsWith(cut)).toBe(true);
      });
    }
  }

  it('50k-token input stays within budget', () => {
    const text = 'alpha beta gamma delta '.repeat(15_000);
    expect(tok.count(text)).toBeGreaterThan(50_000);
    expect(tok.count(tok.truncate(text, 8000))).toBeLessThanOrEqual(8000);
  });

  it('returns short text unchanged', () => {
    expect(tok.truncate('short', 1000)).toBe('short');
  });

  it('max <= 0 gives empty string', () => {
    expect(tok.truncate('anything', 0)).toBe('');
    expect(tok.truncate('anything', -3)).toBe('');
  });

  it('special-token text is counted as ordinary text and does not break the encoder', () => {
    const t = new TiktokenTokenizer();
    const text = 'before <|endoftext|> after';
    expect(t.count(text)).toBeGreaterThan(0);
    expect(t.count(t.truncate(text, 3))).toBeLessThanOrEqual(3);
    // real encoder still in use: heuristic would give ceil(43/4)=11 for this
    const plain = 'alpha beta gamma delta '.repeat(10);
    expect(t.count(plain)).not.toBe(Math.ceil(plain.length / 4));
  });
});
