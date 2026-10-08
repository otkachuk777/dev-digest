import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { FindingsService } from './service.js';

const Query = z.object({
  workspaceId: z.string().uuid(),
  limit: z.coerce.number().int().positive(),
});

const routes: FastifyPluginAsync = async (app) => {
  const service = new FindingsService(app.container);

  app.get('/findings/recent', async (req) => {
    const { workspaceId, limit } = Query.parse(req.query);
    return service.recent(workspaceId, limit);
  });
};

export default routes;
