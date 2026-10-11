import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalService } from './service.js';

/**
 * eval module — cases.
 *   POST   /findings/:id/eval-case   → turn a decided finding into a case (201 / 200 when it exists)
 *   GET    /agents/:id/eval-cases    → the agent's cases
 *   POST   /agents/:id/eval-cases    → hand-made case (body validated in the service → 400 + field)
 *   PUT    /eval-cases/:id           → edit a case
 *   DELETE /eval-cases/:id           → delete a case (past results keep the name)
 *   POST   /agents/:id/eval-runs     → start a suite run (202)
 *   POST   /eval-cases/:id/run       → run one case now (writes last_result only)
 *   GET    /agents/:id/eval-runs     → run history (?range=7d|30d|90d|all)
 *   GET    /eval-runs/:id            → run detail
 *   POST   /eval-runs/:id/promote    → apply the run's config to the agent
 *   POST   /eval/run-all             → start every ready agent (202)
 *   GET    /eval/dashboard           → agents, latest runs, recall trend
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new EvalService(container);
  const params = { schema: { params: IdParams } };

  app.post('/findings/:id/eval-case', params, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const result = await service.createFromFinding(workspaceId, req.params.id);
    return reply.code(result.created ? 201 : 200).send(result);
  });

  app.get('/agents/:id/eval-cases', params, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listCases(workspaceId, req.params.id);
  });

  app.post('/agents/:id/eval-cases', params, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    return reply.code(201).send(await service.createCase(workspaceId, req.params.id, req.body));
  });

  app.put('/eval-cases/:id', params, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.updateCase(workspaceId, req.params.id, req.body);
  });

  app.delete('/eval-cases/:id', params, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    await service.deleteCase(workspaceId, req.params.id);
    return reply.code(204).send();
  });

  app.post('/agents/:id/eval-runs', params, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    return reply.code(202).send(await service.startRun(workspaceId, req.params.id, req.log));
  });

  app.post('/eval-cases/:id/run', params, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.runOneCase(workspaceId, req.params.id);
  });

  // `range` is validated in the service so an unknown value gets the `invalid_range` code.
  app.get('/agents/:id/eval-runs', { schema: { params: IdParams, querystring: z.object({ range: z.string().optional() }) } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId, req.params.id, req.query.range);
  });

  app.get('/eval-runs/:id', params, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getRun(workspaceId, req.params.id);
  });

  app.post('/eval-runs/:id/promote', params, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.promote(workspaceId, req.params.id);
  });

  app.post('/eval/run-all', async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    return reply.code(202).send(await service.runAll(workspaceId, req.log));
  });

  app.get('/eval/dashboard', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.dashboard(workspaceId);
  });
}
