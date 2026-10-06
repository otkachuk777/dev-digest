import { z } from 'zod';
import type { Container } from '../../platform/container.js';

const NotifyPayload = z.object({ workspaceId: z.string().uuid(), reviewId: z.string().uuid(), to: z.string().email() });

export type Logger = {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
};

export class NotificationsService {
  constructor(private readonly container: Container, private readonly log: Logger) {}

  async handleNotifyJob(payload: unknown) {
    const { workspaceId, reviewId, to } = NotifyPayload.parse(payload);
    const pending = await this.container.notificationsRepo.findPending(workspaceId, reviewId);
    if (!pending) {
      this.log.warn({ reviewId }, 'nothing to send');
      return;
    }
    const mailer = await this.container.mailer();
    await mailer.send(to, 'Review finished', `Review ${reviewId} is ready`);
    await this.container.notificationsRepo.markSent(workspaceId, pending.id, new Date());
  }
}
