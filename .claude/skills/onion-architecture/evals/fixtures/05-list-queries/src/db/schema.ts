import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  reviewId: uuid('review_id').notNull(),
  title: text('title').notNull(),
  severity: text('severity').notNull(),
  createdAt: timestamp('created_at').notNull(),
});

export const pulls = pgTable('pulls', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  repoId: uuid('repo_id').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  state: text('state').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});
