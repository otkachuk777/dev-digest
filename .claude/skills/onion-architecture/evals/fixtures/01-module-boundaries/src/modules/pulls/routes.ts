import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { pulls } from '../../db/schema.js';
import { PullsService } from './service.js';

const Params = z.object({ repoId: z.string().uuid(), number: z.coerce.number().int() });

const routes: FastifyPluginAsync = async (app) => {
  const service = new PullsService(app.container);

  app.get('/repos/:repoId/pulls', async (req) => {
    const { repoId } = z.object({ repoId: z.string().uuid() }).parse(req.params);
    const rows = await app.container.db.select().from(pulls).where(eq(pulls.repoId, repoId));
    return rows.map((r) => ({ id: r.id, number: r.number, title: r.title, state: r.state }));
  });

  app.get('/repos/:repoId/pulls/:number', async (req, reply) => {
    const params = Params.parse(req.params);
    const pull = await service.getSummary(params.repoId, params.number);
    if (!pull) return reply.code(404).send({ error: 'not_found' });
    return pull;
  });
};

export default routes;
