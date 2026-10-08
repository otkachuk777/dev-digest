import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').notNull(),
  status: text('status').notNull(),
  tokens: integer('tokens'),
  finishedAt: timestamp('finished_at'),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id').notNull(),
  body: text('body').notNull(),
  dismissedAt: timestamp('dismissed_at'),
  exportedAt: timestamp('exported_at'),
  externalCommentId: text('external_comment_id'),
});

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  pullId: uuid('pull_id').notNull(),
  summary: text('summary'),
  status: text('status').notNull(),
});
