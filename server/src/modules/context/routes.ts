import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ContextFileQuery, ContextQuery, SetContextAttachmentsInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ContextService } from './service.js';

/**
 * Project Context module — repo markdown docs attached to agents/skills.
 *   GET /repos/:id/context        → doc listing of the repo's clone
 *   GET /repos/:id/context/file   → one doc's content (?path=)
 *   GET|PUT /agents/:id/context   → attached + inherited docs / replace the ordered set (repo-scoped)
 *   GET|PUT /skills/:id/context   → same, without inherited
 */
export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ContextService(app.container);

  app.get('/repos/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listDocs(workspaceId, req.params.id);
  });

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: ContextFileQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getDoc(workspaceId, req.params.id, req.query.path);
    },
  );

  for (const kind of ['agents', 'skills'] as const) {
    const get = kind === 'agents' ? service.getAgentContext : service.getSkillContext;
    const set = kind === 'agents' ? service.setAgentContext : service.setSkillContext;
    app.get(
      `/${kind}/:id/context`,
      { schema: { params: IdParams, querystring: ContextQuery } },
      async (req) => {
        const { workspaceId } = await getContext(app.container, req);
        return get.call(service, workspaceId, req.params.id, req.query.repo_id);
      },
    );
    app.put(
      `/${kind}/:id/context`,
      { schema: { params: IdParams, body: SetContextAttachmentsInput } },
      async (req) => {
        const { workspaceId } = await getContext(app.container, req);
        return set.call(service, workspaceId, req.params.id, req.body);
      },
    );
  }
}
