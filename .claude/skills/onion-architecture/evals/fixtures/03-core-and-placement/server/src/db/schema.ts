import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  reviewId: uuid('review_id').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  file: text('file').notNull(),
  line: integer('line').notNull(),
  dismissedAt: timestamp('dismissed_at'),
});
