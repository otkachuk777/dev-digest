import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UpdateConventionInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — extract house conventions from a repo, review them,
 * and (client side) merge the accepted ones into a skill.
 *   GET    /repos/:id/conventions          → persisted candidates + scan info
 *   POST   /repos/:id/conventions/extract  → run a scan, replacing previous candidates
 *   PATCH  /conventions/:id                → accept / un-accept / edit the rule
 *   DELETE /conventions/:id                → reject (removes the candidate)
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container, app.log);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const item = await service.update(workspaceId, req.params.id, req.body);
      if (!item) throw new NotFoundError('Convention not found');
      return item;
    },
  );

  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    if (!(await service.reject(workspaceId, req.params.id))) {
      throw new NotFoundError('Convention not found');
    }
    reply.status(204);
    return reply.send();
  });
}
