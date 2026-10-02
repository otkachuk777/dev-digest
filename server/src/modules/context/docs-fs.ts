/**
 * Filesystem access for Project Context docs: discovery walk + contained read.
 * Never use GitClient.readFile here (no containment check).
 */
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { ContextDocRoot } from '../../platform/config.js';
import { EXCLUDED_DIRS, MAX_FILE_SIZE } from '../repo-intel/index.js';
import { checkRequestedPath, isDocPath } from './helpers.js';

export interface DocFile {
  path: string;
  abs: string;
  size: number;
  mtimeMs: number;
}

const SKIPPED_DIRS = new Set<string>([...EXCLUDED_DIRS, '.git']);

/** Lists doc files of a clone (posix relative paths, sorted). Symlinks are never followed. */
export async function walkDocs(root: string, roots: ContextDocRoot[]): Promise<DocFile[]> {
  const out: DocFile[] = [];
  await walkDir(root, root, roots, out);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function walkDir(root: string, dir: string, roots: ContextDocRoot[], out: DocFile[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    return; // missing/unreadable directory — list what we can
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) await walkDir(root, full, roots, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const path = relative(root, full).split(sep).join('/');
    if (!isDocPath(path, roots)) continue;
    try {
      const st = await lstat(full);
      if (st.size > MAX_FILE_SIZE) continue;
      out.push({ path, abs: full, size: st.size, mtimeMs: st.mtimeMs });
    } catch {
      continue;
    }
  }
}

/** Reads `relPath` under `root`; throws on traversal, symlinks (any component), oversize or I/O error. */
export async function readDocSafely(root: string, relPath: string): Promise<string> {
  if (checkRequestedPath(relPath) !== 'ok') throw new Error('invalid path');
  const realRoot = await realpath(root);
  let cur = realRoot;
  for (const seg of relPath.split('/')) {
    cur = join(cur, seg);
    if ((await lstat(cur)).isSymbolicLink()) throw new Error('symlink not allowed');
  }
  const realFile = await realpath(cur);
  if (!realFile.startsWith(realRoot + sep)) throw new Error('path escapes the clone');
  const st = await lstat(realFile);
  if (!st.isFile() || st.size > MAX_FILE_SIZE) throw new Error('not a readable doc');
  return readFile(realFile, 'utf8');
}
