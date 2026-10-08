import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { MAX_PAGE_SIZE } from './constants.js';
import { PullsService } from './service.js';

const Query = z.object({
  workspaceId: z.string().uuid(),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const routes: FastifyPluginAsync = async (app) => {
  const service = new PullsService(app.container);

  app.get('/repos/:repoId/pulls', async (req) => {
    const { repoId } = z.object({ repoId: z.string().uuid() }).parse(req.params);
    const { workspaceId, limit, offset } = Query.parse(req.query);
    return service.page(workspaceId, repoId, limit, offset);
  });
};

export default routes;
