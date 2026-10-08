import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const pulls = pgTable('pulls', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  state: text('state').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  pullId: uuid('pull_id').notNull(),
  verdict: text('verdict').notNull(),
  createdAt: timestamp('created_at').notNull(),
});
