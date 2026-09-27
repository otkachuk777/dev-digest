import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { DevDigestError } from './errors.js';
import {
  GetBlastRadiusInput,
  GetConventionsInput,
  GetFindingsInput,
  RunAgentOnPrInput,
} from './inputs.js';
import * as usecases from './usecases.js';
import type { DevDigestApi } from './port.js';

/**
 * PRESENTATION — the only ring allowed to import the MCP SDK. Parses zod
 * input once at the boundary, calls a use case, and maps the result to
 * `{content:[text]}` / `isError` (principle 3: concise structured response;
 * principle 4: errors lead forward, never thrown to the transport).
 */

const INSTRUCTIONS =
  'DevDigest reviews GitHub PRs with configured agents. Flow: list_agents → run_agent_on_pr(repo "owner/name", pr number, agent name) → if still running, get_findings(repo, pr, run_id). get_conventions returns a repo\'s accepted house rules.';

function textResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Maps a `DevDigestError` to the tool-facing text (never a raw stack —
 *  details go to stderr only, via the caller's own `console.error`). */
function toErrorText(err: DevDigestError): string {
  switch (err.kind) {
    case 'unreachable':
    case 'not_found':
    case 'rate_limited':
    case 'invalid':
      return err.message;
    case 'server':
      return err.message.includes('check the server log')
        ? err.message
        : `${err.message} — check the server log`;
  }
}

export interface CreateServerOpts {
  pollMs?: number;
  waitMs?: number;
}

export function createServer(api: DevDigestApi, opts: CreateServerOpts = {}): McpServer {
  const server = new McpServer(
    { name: 'devdigest', version: '0.0.1' },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    'list_agents',
    {
      description:
        'List configured DevDigest reviewer agents. Call first to get a valid agent name for run_agent_on_pr.',
      annotations: { readOnlyHint: true },
    },
    async (extra) => {
      try {
        return textResult(await usecases.listAgents(api, extra.signal));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    'run_agent_on_pr',
    {
      description:
        'Review a GitHub PR with one agent: starts the run, waits up to 120 s, returns verdict and findings. If still running, returns run_id — then call get_findings.',
      inputSchema: RunAgentOnPrInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      try {
        return textResult(
          await usecases.runAgentOnPr(api, args, {
            pollMs: opts.pollMs,
            waitMs: opts.waitMs,
            signal: extra.signal,
          }),
        );
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    'get_findings',
    {
      description: "Get the verdict and findings of a review run on a PR (newest run if run_id is omitted).",
      inputSchema: GetFindingsInput,
      annotations: { readOnlyHint: true },
    },
    async (args, extra) => {
      try {
        return textResult(await usecases.getFindings(api, args, extra.signal));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    'get_conventions',
    {
      description: "Get a repo's accepted coding conventions (house rules) with file:line evidence.",
      inputSchema: GetConventionsInput,
      annotations: { readOnlyHint: true },
    },
    async (args, extra) => {
      try {
        return textResult(await usecases.getConventions(api, args, extra.signal));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    'get_blast_radius',
    {
      description: 'PR impact map. Not implemented yet.',
      inputSchema: GetBlastRadiusInput,
      annotations: { readOnlyHint: true },
    },
    async () => errorResult('get_blast_radius is not implemented yet.'),
  );

  return server;
}

function handleError(err: unknown): CallToolResult {
  if (err instanceof DevDigestError) {
    return errorResult(toErrorText(err));
  }
  // Anything unexpected: keep the tool response generic, log the real error
  // to stderr only (never stdout — that channel is the MCP JSON-RPC stream).
  console.error('devdigest-mcp: unexpected error', err);
  return errorResult('Unexpected error — check the server log');
}
