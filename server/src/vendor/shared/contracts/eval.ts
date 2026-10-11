import { z } from 'zod';
import { Provider, ReviewStrategy } from './knowledge.js';

/**
 * SPEC-04 — Eval pipeline contracts (cases, results, suite runs, dashboard).
 * Byte-identical in `server/` and `client/` (`vendor/shared`); a test pins that.
 */

export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;

/** The end >= start rule is checked by the server validator so it can name the field. */
export const EvalExpectationItem = z.object({
  file: z.string().min(1).max(500),
  start_line: z.number().int().min(1),
  end_line: z.number().int().min(1),
  severity: z.string().optional(),
  category: z.string().optional(),
  title: z.string().optional(),
});
export type EvalExpectationItem = z.infer<typeof EvalExpectationItem>;

export const EvalPrMeta = z.object({
  title: z.string().max(300),
  body: z.string().max(10000),
});
export type EvalPrMeta = z.infer<typeof EvalPrMeta>;

export const EvalCaseResultStatus = z.enum(['pass', 'fail', 'error']);
export type EvalCaseResultStatus = z.infer<typeof EvalCaseResultStatus>;

export const EvalResultFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  severity: z.string(),
  category: z.string(),
  title: z.string(),
});
export type EvalResultFinding = z.infer<typeof EvalResultFinding>;

export const EvalCaseResult = z.object({
  case_id: z.string(),
  case_name: z.string(),
  expectation_type: EvalExpectationType,
  status: EvalCaseResultStatus,
  expected_count: z.number().int().min(0),
  matched_count: z.number().int().min(0),
  findings: z.array(EvalResultFinding),
  dropped_count: z.number().int().min(0),
  error: z.string().nullable(),
  duration_ms: z.number().int().min(0),
  cost_usd: z.number().min(0).nullable(),
  ran_at: z.string(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

export const EvalCase = z.object({
  id: z.string(),
  agent_id: z.string(),
  name: z.string().min(1).max(80),
  expectation_type: EvalExpectationType,
  expected: z.array(EvalExpectationItem).min(1).max(20),
  input_diff: z.string(),
  input_meta: EvalPrMeta,
  source_finding_id: z.string().nullable(),
  source_decision: z.enum(['accepted', 'dismissed']).nullable(),
  last_result: EvalCaseResult.nullable(),
  created_at: z.string(),
});
export type EvalCase = z.infer<typeof EvalCase>;

/** `expectation_type` is ignored on update. */
export const EvalCaseInput = z.object({
  name: z.string().min(1).max(80),
  expectation_type: EvalExpectationType.optional(),
  expected: z.array(EvalExpectationItem).min(1).max(20),
  input_diff: z.string(),
  input_meta: EvalPrMeta,
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

export const EvalRunStatus = z.enum(['running', 'done', 'failed']);
export type EvalRunStatus = z.infer<typeof EvalRunStatus>;

const Ratio = z.number().min(0).max(1).nullable();

export const EvalRunRecord = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_version: z.number().int().min(1),
  status: EvalRunStatus,
  error: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_done: z.number().int().min(0),
  total: z.number().int().min(0),
  passed: z.number().int().min(0),
  errored: z.number().int().min(0),
  recall: Ratio,
  precision: Ratio,
  citation_accuracy: Ratio,
  cost_usd: z.number().min(0).nullable(),
  duration_ms: z.number().int().min(0).nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

export const EvalSkillSnapshot = z.object({
  skill_id: z.string(),
  name: z.string(),
  version: z.number().int(),
  body: z.string(),
});
export type EvalSkillSnapshot = z.infer<typeof EvalSkillSnapshot>;

export const EvalRunConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  strategy: ReviewStrategy,
  skills: z.array(EvalSkillSnapshot),
});
export type EvalRunConfig = z.infer<typeof EvalRunConfig>;

export const EvalRunDetail = EvalRunRecord.extend({
  config: EvalRunConfig,
  results: z.array(EvalCaseResult),
});
export type EvalRunDetail = z.infer<typeof EvalRunDetail>;

export const EvalRange = z.enum(['7d', '30d', '90d', 'all']);
export type EvalRange = z.infer<typeof EvalRange>;

/** `POST /findings/:id/eval-case` — 201 when created, 200 when it already existed. */
export const EvalCaseFromFindingResult = z.object({
  case: EvalCase,
  created: z.boolean(),
});
export type EvalCaseFromFindingResult = z.infer<typeof EvalCaseFromFindingResult>;

export const EvalSkipReason = z.enum(['disabled', 'no_eval_cases', 'eval_run_in_progress', 'no_api_key', 'provider_error']);
export type EvalSkipReason = z.infer<typeof EvalSkipReason>;

export const EvalRunAllResult = z.object({
  started: z.array(EvalRunRecord),
  skipped: z.array(z.object({ agent_id: z.string(), agent_name: z.string(), reason: EvalSkipReason })),
});
export type EvalRunAllResult = z.infer<typeof EvalRunAllResult>;

export const EvalDashboardAgent = z.object({
  agent_id: z.string(),
  name: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  case_count: z.number().int().min(0),
  latest: EvalRunRecord.nullable(),
  /** A suite run of this agent is in flight (`latest` only ever holds finished runs). */
  running: z.boolean(),
  recall_trend: z.array(z.number()).max(10),
});
export type EvalDashboardAgent = z.infer<typeof EvalDashboardAgent>;

export const EvalDashboard = z.object({
  agents: z.array(EvalDashboardAgent),
  recent_runs: z.array(EvalRunRecord.extend({ agent_name: z.string() })).max(6),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;
