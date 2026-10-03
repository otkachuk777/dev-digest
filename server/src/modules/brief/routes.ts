import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefService } from './service.js';

/**
 * PR Brief module.
 *   GET  /pulls/:id/brief  → PrBrief | null   (stored only; no LLM, no GitHub)
 *   POST /pulls/:id/brief  → PrBrief          (blocking, one model call)
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // ONE instance per app: it owns the in-memory per-PR generation lock.
  const service = new BriefService(app.container);

  app.get('/pulls/:id/brief', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams },
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          // Runs in onRequest, before the handler: resolve the context ourselves, fire-and-forget (AC-53).
          onExceeded: (req: FastifyRequest) => {
            const { id } = req.params as { id: string };
            void getContext(app.container, req)
              .then((c) => service.logRateLimited(c.workspaceId, id, req.log))
              .catch((err: unknown) => req.log.warn({ err: (err as Error).message }, 'pr brief 429 log failed'));
          },
        },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generate(workspaceId, req.params.id, req.log);
    },
  );
}
