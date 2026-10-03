import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';
import { ConfigError } from '../src/platform/errors.js';
import { MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';

/**
 * AC-35 / NFR-4 / EC-10 / EC-11: `Container.llmNoRetry` sends exactly ONE provider request.
 * A localhost HTTP stub counts requests; OPENAI_BASE_URL / ANTHROPIC_BASE_URL point the SDKs at it,
 * and OpenRouter (fixed baseURL) is observed through a stubbed global fetch.
 */

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const Schema = z.object({ ok: z.boolean() });
const req = (model: string) => ({
  model,
  schema: Schema,
  schemaName: 'T',
  messages: [{ role: 'user' as const, content: 'hi' }],
  maxRetries: 0,
  temperature: 0,
});

let server: Server;
let base: string;
let hits = 0;
let mode: 'rate_limit' | 'server_error' | 'hang' = 'rate_limit';
const sockets = new Set<import('node:net').Socket>();

beforeAll(async () => {
  server = createServer((r, res) => {
    hits++;
    r.resume();
    if (mode === 'hang') return; // never answer
    const status = mode === 'rate_limit' ? 429 : 500;
    res.writeHead(status, { 'content-type': 'application/json', 'retry-after': '0' });
    res.end(JSON.stringify({ error: { message: 'stub', type: 'stub' } }));
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const s of sockets) s.destroy();
  await new Promise((ok) => server.close(ok));
});

const savedEnv = { o: process.env.OPENAI_BASE_URL, a: process.env.ANTHROPIC_BASE_URL };
beforeEach(() => {
  hits = 0;
  mode = 'rate_limit';
  process.env.OPENAI_BASE_URL = `${base}/v1`;
  process.env.ANTHROPIC_BASE_URL = base;
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of [['OPENAI_BASE_URL', savedEnv.o], ['ANTHROPIC_BASE_URL', savedEnv.a]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const mk = (overrides: ConstructorParameters<typeof Container>[2] = {}) =>
  new Container(config, {} as never, {
    secrets: new MockSecretsProvider({ OPENAI_API_KEY: 'k', ANTHROPIC_API_KEY: 'k', OPENROUTER_API_KEY: 'k' }),
    ...overrides,
  });

describe('Container.llmNoRetry — one request per generation', () => {
  it.each([
    ['openai', 'gpt-4.1'],
    ['anthropic', 'claude-sonnet-4-5'],
  ] as const)('%s: a 429 is not retried (EC-11)', async (id, model) => {
    const llm = await mk().llmNoRetry(id, 10_000);
    await expect(llm.completeStructured(req(model))).rejects.toBeTruthy();
    expect(hits).toBe(1);
  });

  it.each([
    ['openai', 'gpt-4.1'],
    ['anthropic', 'claude-sonnet-4-5'],
  ] as const)('%s: a 5xx is not retried', async (id, model) => {
    mode = 'server_error';
    const llm = await mk().llmNoRetry(id, 10_000);
    await expect(llm.completeStructured(req(model))).rejects.toBeTruthy();
    expect(hits).toBe(1);
  });

  it('openrouter: SDK retries are 0 and the SDK timeout is timeoutMs (fixed baseURL, so the client config is inspected)', async () => {
    const llm = await mk().llmNoRetry('openrouter', 123_456);
    const sdk = (llm as unknown as { client: { maxRetries: number; timeout: number } }).client;
    expect(sdk.maxRetries).toBe(0);
    expect(sdk.timeout).toBe(123_456);
  });

  it('the SDK timeout equals timeoutMs: a hanging server fails fast with a single request', async () => {
    mode = 'hang';
    const llm = await mk().llmNoRetry('openai', 150);
    const t0 = Date.now();
    await expect(llm.completeStructured({ ...req('gpt-4.1'), timeoutMs: undefined })).rejects.toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(hits).toBe(1);
  });

  it('is not cached: every call builds a fresh provider, and the shared llm() is untouched', async () => {
    const c = mk();
    const a = await c.llmNoRetry('openai', 1000);
    const b = await c.llmNoRetry('openai', 1000);
    expect(a).not.toBe(b);
    expect(await c.llm('openai')).not.toBe(a);
  });

  it('an injected overrides.llm provider wins', async () => {
    const mock = new MockLLMProvider('openrouter');
    expect(await mk({ llm: { openrouter: mock } }).llmNoRetry('openrouter', 1000)).toBe(mock);
  });

  it.each(['openai', 'anthropic', 'openrouter'] as const)('EC-10: %s without a key -> ConfigError naming the key, no request', async (id) => {
    const c = mk({ secrets: new MockSecretsProvider({}) });
    const err = await c.llmNoRetry(id, 1000).catch((e) => e);
    expect(err).toBeInstanceOf(ConfigError);
    expect(String(err.message)).toContain('_API_KEY');
    expect(hits).toBe(0);
  });
});
