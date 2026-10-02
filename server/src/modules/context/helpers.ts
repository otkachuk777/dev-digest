/**
 * Pure rules of the Project Context feature — no I/O, no db/adapters.
 */
import type { ContextDocRoot } from '../../platform/config.js';
import { UNSAFE_PATH_CHARS } from './constants.js';

/** First *directory* segment (never the file name) that is a configured root, else null. */
export function docTypeFor(path: string, roots: ContextDocRoot[]): ContextDocRoot | null {
  const dirs = path.split('/').slice(0, -1);
  return (dirs.find((s) => (roots as string[]).includes(s)) as ContextDocRoot | undefined) ?? null;
}

/** Exact lowercase `.md`, no prompt-unsafe characters, under a configured root. */
export function isDocPath(path: string, roots: ContextDocRoot[]): boolean {
  return path.endsWith('.md') && !UNSAFE_PATH_CHARS.test(path) && docTypeFor(path, roots) !== null;
}

/** Shape check of a client-supplied path (traversal / absolute / backslash / NUL). */
export function checkRequestedPath(path: string): 'ok' | 'invalid' {
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return 'invalid';
  if (/^[A-Za-z]:/.test(path)) return 'invalid';
  if (path.split('/').includes('..')) return 'invalid';
  return 'ok';
}

export interface MergedAttachment {
  path: string;
  origin: 'agent' | 'skill';
  originName: string;
  skillId?: string;
}

/** Agent's own paths first, then each skill's in order; the first occurrence of a path wins. */
export function mergeAttachments(
  agent: { name: string; paths: string[] },
  skills: { id: string; name: string; paths: string[] }[],
): MergedAttachment[] {
  const seen = new Set<string>();
  const out: MergedAttachment[] = [];
  const add = (path: string, rest: Omit<MergedAttachment, 'path'>) => {
    if (seen.has(path)) return;
    seen.add(path);
    out.push({ path, ...rest });
  };
  for (const p of agent.paths) add(p, { origin: 'agent', originName: agent.name });
  for (const s of skills) {
    for (const p of s.paths) add(p, { origin: 'skill', originName: s.name, skillId: s.id });
  }
  return out;
}

export interface BudgetEntry {
  path: string;
  keepTokens: number;
  status: 'read' | 'truncated';
}

/**
 * Cumulative budget: docs that fit are read whole; the one that crosses keeps the
 * remainder; every later doc keeps 0 (heading + marker only).
 */
export function planBudget(docs: { path: string; tokens: number }[], budget: number): BudgetEntry[] {
  let used = 0;
  return docs.map(({ path, tokens }) => {
    if (used < budget && used + tokens <= budget) {
      used += tokens;
      return { path, keepTokens: tokens, status: 'read' };
    }
    const keepTokens = Math.max(0, budget - used);
    used = budget;
    return { path, keepTokens, status: 'truncated' };
  });
}
