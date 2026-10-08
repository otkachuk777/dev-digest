import { and, eq } from 'drizzle-orm';
import type { EvalCaseInput } from '@devdigest/shared';
import type { Db } from './client.js';
import * as t from './schema.js';
import { parseUnifiedDiff } from '../adapters/git/diff-parser.js';
import { validateCaseInput } from '../modules/eval/helpers.js';

/**
 * Eval fixtures for the built-in Security Reviewer: 5 defects it must report and
 * 3 safe changes it must leave alone — the starting point for tuning its prompt.
 */

/** One-hunk diff: line 1 is context, `added` becomes new-side lines 2..n+1. */
function diffOf(path: string, ctx: string, added: string[]): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,1 +1,${added.length + 1} @@`,
    ` ${ctx}`,
    ...added.map((l) => `+${l}`),
  ].join('\n');
}

const find = (name: string, path: string, ctx: string, added: string[], range: [number, number], title: string, category: string, pr: [string, string]): EvalCaseInput => ({
  name,
  expectation_type: 'must_find',
  expected: [{ file: path, start_line: range[0], end_line: range[1], category, title }],
  input_diff: diffOf(path, ctx, added),
  input_meta: { title: pr[0], body: pr[1] },
});

const safe = (name: string, path: string, ctx: string, added: string[], range: [number, number], pr: [string, string]): EvalCaseInput => ({
  name,
  expectation_type: 'must_not_flag',
  expected: [{ file: path, start_line: range[0], end_line: range[1] }],
  input_diff: diffOf(path, ctx, added),
  input_meta: { title: pr[0], body: pr[1] },
});

export const EVAL_SEED_CASES: EvalCaseInput[] = [
  find('sql-injection-string-concat', 'src/orders/repository.ts', "import { sql } from '../db';", [
    'export async function findOrders(customerId: string, status: string) {',
    '  const query = `SELECT * FROM orders WHERE customer_id = \'${customerId}\' AND status = \'${status}\'`;',
    '  return sql.unsafe(query);',
    '}',
  ], [3, 4], 'SQL injection via string interpolation', 'security', ['Add order lookup by status', 'Adds a helper that lists a customer\'s orders filtered by status. `status` comes from the query string.']),
  find('hardcoded-api-key', 'src/billing/client.ts', "import Stripe from 'stripe';", [
    "const STRIPE_SECRET_KEY = 'sk_live_EXAMPLE_KEY_DO_NOT_USE_0000';",
    'export const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: \'2024-06-20\' });',
  ], [2, 2], 'Hard-coded live Stripe secret key', 'security', ['Wire up Stripe client', 'Creates the shared Stripe client used by the billing module.']),
  find('ssrf-user-supplied-url', 'src/webhooks/preview.ts', "import type { Request, Response } from 'express';", [
    'export async function previewUrl(req: Request, res: Response) {',
    '  const target = String(req.query.url);',
    '  const upstream = await fetch(target);',
    '  res.send(await upstream.text());',
    '}',
  ], [4, 4], 'SSRF: server fetches an arbitrary user-supplied URL', 'security', ['Add link preview endpoint', 'GET /preview?url=... fetches the page server-side so the UI can show a snippet.']),
  find('command-injection-exec', 'src/tools/convert.ts', "import { exec } from 'node:child_process';", [
    'export function convertImage(req: { body: { filename: string } }, done: (err: Error | null) => void) {',
    '  exec(`convert uploads/${req.body.filename} -resize 200x200 thumbs/${req.body.filename}`, (err) => done(err));',
    '}',
  ], [3, 3], 'Command injection through unsanitised filename in exec()', 'security', ['Generate thumbnails', 'Shells out to ImageMagick for thumbnails of uploaded files.']),
  find('xss-dangerously-set-inner-html', 'src/ui/Comment.tsx', "import React from 'react';", [
    'export function Comment({ html }: { html: string }) {',
    '  return <div className="comment" dangerouslySetInnerHTML={{ __html: html }} />;',
    '}',
  ], [3, 3], 'Stored XSS: user comment rendered as raw HTML', 'security', ['Render rich-text comments', 'Comments are stored as the HTML the user typed and rendered as-is.']),
  safe('parameterized-query-is-safe', 'src/orders/repository.ts', "import { sql } from '../db';", [
    'export async function findOrders(customerId: string, status: string) {',
    '  return sql`SELECT * FROM orders WHERE customer_id = ${customerId} AND status = ${status}`;',
    '}',
  ], [2, 4], ['Add order lookup by status', 'Uses the tagged-template driver, so values are sent as bound parameters.']),
  safe('secret-read-from-env-is-safe', 'src/billing/client.ts', "import Stripe from 'stripe';", [
    'const key = process.env.STRIPE_SECRET_KEY;',
    "if (!key) throw new Error('STRIPE_SECRET_KEY is not set');",
    "export const stripe = new Stripe(key, { apiVersion: '2024-06-20' });",
  ], [2, 4], ['Wire up Stripe client', 'The key is loaded from the environment and never committed.']),
  safe('fake-token-in-test-is-safe', 'test/auth.test.ts', "import { describe, it, expect } from 'vitest';", [
    "const FAKE_TOKEN = 'test-token-not-a-real-secret';",
    "describe('auth header', () => {",
    "  it('adds a bearer token', () => {",
    "    expect(`Bearer ${FAKE_TOKEN}`).toBe('Bearer test-token-not-a-real-secret');",
    '  });',
    '});',
  ], [2, 7], ['Test the auth header', 'Test-only placeholder value; no real credential is involved.']),
];

/** Idempotent by (agent, name): existing cases are never touched, so edits survive a re-seed. */
export async function seedEvalCases(db: Db, workspaceId: string, agentId: string): Promise<void> {
  for (const c of EVAL_SEED_CASES) {
    // Same validator as user input (AC-27): a broken fixture fails the seed loudly.
    const err = validateCaseInput(c, parseUnifiedDiff(c.input_diff), Buffer.byteLength(c.input_diff, 'utf8'));
    if (err) throw new Error(`eval seed case ${c.name}: ${err.field} ${err.message}`);
    const [existing] = await db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.agentId, agentId), eq(t.evalCases.name, c.name)));
    if (existing) continue;
    await db.insert(t.evalCases).values({
      workspaceId,
      agentId,
      name: c.name,
      expectationType: c.expectation_type ?? 'must_find',
      expected: c.expected,
      inputDiff: c.input_diff,
      inputMeta: c.input_meta,
    });
  }
}
