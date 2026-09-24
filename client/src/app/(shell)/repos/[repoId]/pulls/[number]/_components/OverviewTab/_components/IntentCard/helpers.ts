/** Short sha for display (matches the Live Log's `head abc1234` convention). */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
