/**
 * tokenizer adapter — token counter for the repo-map budget search (T3).
 *
 * The repo-map renderer (pipeline/repo-map.ts) binary-searches the largest set
 * of symbols that fits a token budget; that loop calls `count()` ≤ ~13 times.
 *
 * Default impl: js-tiktoken `cl100k_base` (pure-JS, no natives). The encoder is
 * lazy-initialised (loading the BPE ranks is the heavy part) and any failure
 * falls back to the `ceil(chars / 4)` heuristic — the renderer must never throw.
 *
 * Scope: in-process, ONLY under modules/repo-intel. Swappable in tests via a
 * mock counter (ContainerOverrides.tokenizer).
 */
import { getEncoding, type Tiktoken } from 'js-tiktoken';

export interface Tokenizer {
  count(text: string): number;
  /** Longest prefix of `text` within `maxTokens` tokens. */
  truncate(text: string, maxTokens: number): string;
}

/** Heuristic fallback used before/instead of a real encoder. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class TiktokenTokenizer implements Tokenizer {
  // encode(text, [], []): special-token text (e.g. `<|endoftext|>` in untrusted docs) is ordinary text, never throws.
  private enc?: Tiktoken;
  private broken = false;

  count(text: string): number {
    if (this.broken) return approxTokens(text);
    try {
      this.enc ??= getEncoding('cl100k_base');
      return this.enc.encode(text, [], []).length;
    } catch {
      // BPE load failed once — don't retry per call; stick to the heuristic.
      this.broken = true;
      return approxTokens(text);
    }
  }

  /** Longest prefix of `text` that fits `maxTokens` (never splits a multibyte char). */
  truncate(text: string, maxTokens: number): string {
    if (maxTokens <= 0) return '';
    if (!this.broken) {
      try {
        this.enc ??= getEncoding('cl100k_base');
        const ids = this.enc.encode(text, [], []);
        if (ids.length <= maxTokens) return text;
        // A cut inside a multibyte sequence decodes to trailing U+FFFD — drop it.
        let cut = this.enc.decode(ids.slice(0, maxTokens)).replace(/�+$/, '');
        while (cut.length > 0 && this.count(cut) > maxTokens) cut = cut.slice(0, -1);
        return cut;
      } catch {
        this.broken = true;
      }
    }
    return text.slice(0, maxTokens * 4);
  }
}
