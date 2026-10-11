import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, index, uniqueIndex, check,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    expectationType: text('expectation_type', { enum: ['must_find', 'must_not_flag'] }).notNull(),
    expected: jsonb('expected').notNull(),
    inputDiff: text('input_diff').notNull(),
    inputMeta: jsonb('input_meta').notNull(),
    /** No FK on purpose (EC-5): the case outlives the finding it was made from. */
    sourceFindingId: uuid('source_finding_id'),
    sourceDecision: text('source_decision', { enum: ['accepted', 'dismissed'] }),
    /** Newest EvalCaseResult; null after an edit that changes diff, meta or expectation (AC-34). */
    lastResult: jsonb('last_result'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('eval_cases_agent_name_uq').on(t.agentId, t.name),
    // NULLs are distinct on purpose: hand-made cases have no source finding.
    uniqueIndex('eval_cases_agent_source_finding_uq').on(t.agentId, t.sourceFindingId),
    index('eval_cases_workspace_idx').on(t.workspaceId),
    check('eval_cases_expected_array', sql`jsonb_typeof(${t.expected}) = 'array'`),
  ],
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version').notNull(),
    status: text('status', { enum: ['running', 'done', 'failed'] }).notNull().default('running'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** EvalRunConfig + `source` per skill, frozen at run start. */
    config: jsonb('config').notNull(),
    casesDone: integer('cases_done').notNull().default(0),
    total: integer('total').notNull().default(0),
    passed: integer('passed').notNull().default(0),
    errored: integer('errored').notNull().default(0),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
    llmCalls: integer('llm_calls').notNull().default(0),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
  },
  (t) => [
    index('eval_runs_agent_started_idx').on(t.agentId, t.startedAt.desc()),
    index('eval_runs_workspace_status_started_idx').on(t.workspaceId, t.status, t.startedAt.desc()),
    // The in-flight guard (B1): a second `running` insert fails with 23505.
    uniqueIndex('eval_runs_one_running_per_agent').on(t.agentId).where(sql`${t.status} = 'running'`),
    check('eval_runs_config_object', sql`jsonb_typeof(${t.config}) = 'object'`),
  ],
);

export const evalCaseResults = pgTable(
  'eval_case_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => evalRuns.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').references(() => evalCases.id, { onDelete: 'set null' }),
    caseName: text('case_name').notNull(),
    /** The EvalCaseResult. */
    result: jsonb('result').notNull(),
    status: text('status', { enum: ['pass', 'fail', 'error'] }).notNull(),
  },
  (t) => [
    index('eval_case_results_run_idx').on(t.runId),
    index('eval_case_results_case_idx').on(t.caseId),
    check('eval_case_results_result_object', sql`jsonb_typeof(${t.result}) = 'object'`),
  ],
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
