import type { Container } from '../../platform/container.js';

interface ExportPayload {
  reviewId: string;
  target: string;
}

export class ExportsService {
  constructor(private readonly container: Container) {}

  async enqueue(reviewId: string, target: string) {
    const payload = { reviewId, target } satisfies ExportPayload;
    await this.container.jobs.enqueue('export.run', payload);
  }

  async handleExportJob(payload: unknown) {
    const { reviewId, target } = payload as ExportPayload;
    const run = await this.container.exportsRepo.start(reviewId, target);
    const bodies = await this.container.exportsRepo.pendingBodies(reviewId);
    await this.container.exportsRepo.stampFindings(reviewId, new Date());
    return { runId: run.id, count: bodies.length };
  }
}
