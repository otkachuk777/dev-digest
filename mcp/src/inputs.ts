import { z } from 'zod';

/**
 * DOMAIN — the tool input contracts, defined once. `server.ts` registers these
 * shapes with the MCP SDK (parse at the boundary); `usecases.ts` takes the
 * inferred types, so a schema change fails to compile where it is consumed.
 * Flat primitives only (principle 2: flat arguments).
 */

const repo = z.string().describe('GitHub repo "owner/name"');
const pr = z.number().int().positive().describe('PR number');
const agent = z.string().describe('Agent name from list_agents');
const runId = z.string().uuid().describe('From run_agent_on_pr; omit for newest');
const limit = (min: number, max: number, def: number) =>
  z.number().int().min(min).max(max).default(def).describe('Max items');

export const RunAgentOnPrInput = { repo, pr, agent };
export const GetFindingsInput = { repo, pr, run_id: runId.optional(), limit: limit(1, 50, 20) };
export const GetConventionsInput = { repo, limit: limit(1, 100, 30) };
export const GetBlastRadiusInput = { repo, pr };

// z.input: `limit` stays optional for direct callers; the use case applies the default.
export type RunAgentOnPrInput = z.input<z.ZodObject<typeof RunAgentOnPrInput>>;
export type GetFindingsInput = z.input<z.ZodObject<typeof GetFindingsInput>>;
export type GetConventionsInput = z.input<z.ZodObject<typeof GetConventionsInput>>;
export type GetBlastRadiusInput = z.input<z.ZodObject<typeof GetBlastRadiusInput>>;
