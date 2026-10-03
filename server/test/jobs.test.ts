import { describe, it, expect } from 'vitest';
import { JobRunner } from '../src/platform/jobs.js';
import type { Db } from '../src/db/client.js';

/**
 * A job that outlives the runner's timeout must end `failed` on its row and
 * must NOT surface as an unhandledRejection: every real caller enqueues
 * fire-and-forget and never touches `done` (a timed-out repo-intel index
 * once crashed the server this way).
 */
function fakeDb() {
  const row: Record<string, unknown> = {};
  const db = {
    insert: () => ({ values: () => ({ returning: async () => [{ id: 'job-1' }] }) }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          Object.assign(row, v);
        },
      }),
    }),
  };
  return { db: db as unknown as Db, row };
}

describe('JobRunner', () => {
  it('a timed-out job is marked failed without an unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { db, row } = fakeDb();
      const jobs = new JobRunner(db, { timeoutMs: 20, retries: 0 });
      jobs.register('slow', () => new Promise(() => {})); // never settles

      await jobs.enqueue('ws', 'slow', {}); // `done` deliberately ignored
      await jobs.onIdle();
      await new Promise((r) => setTimeout(r, 20)); // let unhandledRejection fire

      expect(row.status).toBe('failed');
      expect(row.error).toBe('Operation timed out after 20ms');
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('`done` still rejects for a caller that awaits it', async () => {
    const { db } = fakeDb();
    const jobs = new JobRunner(db, { timeoutMs: 0, retries: 0 });
    jobs.register('boom', async () => {
      throw new Error('boom');
    });

    const job = await jobs.enqueue('ws', 'boom', {});
    await expect(job.done).rejects.toThrow('boom');
  });
});
