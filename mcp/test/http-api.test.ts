import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpDevDigestApi } from '../src/http-api.js';
import { DevDigestError } from '../src/errors.js';

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HttpDevDigestApi', () => {
  it('parses a 2xx JSON body', async () => {
    stubFetch(() => new Response(JSON.stringify([{ id: '1' }]), { status: 200 }));
    const api = new HttpDevDigestApi('http://localhost:3001');
    await expect(api.listAgents()).resolves.toEqual([{ id: '1' }]);
  });

  it('encodeURIComponent-encodes path ids', async () => {
    const fn = stubFetch(() => new Response('[]', { status: 200 }));
    const api = new HttpDevDigestApi('http://localhost:3001');
    await api.listPulls('repo id/with slash');
    const [url] = fn.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3001/repos/repo%20id%2Fwith%20slash/pulls');
  });

  it('maps the error envelope to a DevDigestError (not_found)', async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: { code: 'not_found', message: 'Repo not found' } }), {
          status: 404,
        }),
    );
    const api = new HttpDevDigestApi('http://localhost:3001');
    await expect(api.listRepos()).rejects.toMatchObject({
      kind: 'not_found',
      message: 'Repo not found',
    });
  });

  it('maps 429 to rate_limited without needing a body', async () => {
    stubFetch(() => new Response('', { status: 429 }));
    const api = new HttpDevDigestApi('http://localhost:3001');
    await expect(api.listRepos()).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('maps 422 to invalid and 500 to server', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: { message: 'bad body' } }), { status: 422 }));
    const api = new HttpDevDigestApi('http://localhost:3001');
    await expect(api.listRepos()).rejects.toMatchObject({ kind: 'invalid' });

    stubFetch(() => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }));
    await expect(api.listRepos()).rejects.toMatchObject({ kind: 'server' });
  });

  it('maps a network failure to unreachable', async () => {
    stubFetch(() => Promise.reject(new Error('ECONNREFUSED')));
    const api = new HttpDevDigestApi('http://localhost:3001');
    const err = await api.listRepos().catch((e) => e);
    expect(err).toBeInstanceOf(DevDigestError);
    expect((err as DevDigestError).kind).toBe('unreachable');
    expect((err as DevDigestError).message).toContain('cd server && pnpm dev');
  });

  it('sends a JSON body for startReview', async () => {
    const fn = stubFetch(() => new Response(JSON.stringify({ pr_id: 'p1', runs: [], reviews: [] }), { status: 200 }));
    const api = new HttpDevDigestApi('http://localhost:3001');
    await api.startReview('p1', 'a1');
    const [, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ agentId: 'a1' }));
  });
});
