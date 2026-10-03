import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

/**
 * Onboarding Tour module.
 *   GET  /repos/:id/onboarding           → OnboardingState
 *   POST /repos/:id/onboarding/generate  → OnboardingGenerateResult (blocking, ≤125 s)
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // ONE instance per app: it owns the in-memory per-repo generation lock.
  const service = new OnboardingService(app.container, app.log);

  app.get('/repos/:id/onboarding', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getState(workspaceId, req.params.id);
  });

  app.post('/repos/:id/onboarding/generate', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.generate(workspaceId, req.params.id);
  });
}
