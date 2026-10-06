export interface Tokenizer {
  count(text: string): number;
}

export function fitToBudget(chunks: string[], budget: number, tokenizer: Tokenizer): string[] {
  const kept: string[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const size = tokenizer.count(chunk);
    if (used + size > budget) break;
    kept.push(chunk);
    used += size;
  }
  return kept;
}
