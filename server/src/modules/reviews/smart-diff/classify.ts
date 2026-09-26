import type { SmartDiffRole } from '@devdigest/shared';
import { ROLE_RULES } from './constants.js';

/** Pure classification: no fastify, drizzle, db or container imports. */
export function classifyFile(path: string): SmartDiffRole {
  for (const rule of ROLE_RULES) {
    if (rule.patterns.some((p) => p.test(path))) return rule.role;
  }
  return 'core';
}
