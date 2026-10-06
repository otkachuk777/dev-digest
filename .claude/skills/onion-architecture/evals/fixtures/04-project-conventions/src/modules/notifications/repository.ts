import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { notifications } from '../../db/schema.js';

export class NotificationsRepository {
  constructor(private readonly db: Db) {}

  async markSent(workspaceId: string, id: string, at: Date) {
    await this.db
      .update(notifications)
      .set({ sentAt: at })
      .where(and(eq(notifications.workspaceId, workspaceId), eq(notifications.id, id)));
  }

  async findPending(workspaceId: string, reviewId: string) {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, workspaceId),
          eq(notifications.reviewId, reviewId),
          isNull(notifications.sentAt),
        ),
      )
      .limit(1);
    return rows[0];
  }
}
