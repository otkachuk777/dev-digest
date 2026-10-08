import type { Severity } from '@devdigest/shared/contracts/finding.js';

const WEIGHT: Record<Severity, number> = { critical: 10, major: 4, minor: 1 };

export function score(items: Array<{ severity: Severity }>): number {
  return items.reduce((sum, item) => sum + WEIGHT[item.severity], 0);
}

export function rollup(items: Array<{ severity: Severity }>): Severity | 'none' {
  if (items.some((i) => i.severity === 'critical')) return 'critical';
  if (items.some((i) => i.severity === 'major')) return 'major';
  return items.length > 0 ? 'minor' : 'none';
}
