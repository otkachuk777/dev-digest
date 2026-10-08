import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  pullId: uuid('pull_id').notNull(),
  status: text('status').notNull(),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  reviewId: uuid('review_id').notNull(),
  body: text('body').notNull(),
  exportedAt: timestamp('exported_at'),
});

export const exportRuns = pgTable('export_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id').notNull(),
  target: text('target').notNull(),
  startedAt: timestamp('started_at').notNull(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  reviewId: uuid('review_id').notNull(),
  sentAt: timestamp('sent_at'),
});
