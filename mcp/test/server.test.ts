import { beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type {
  Agent,
  Repo,
  PrMeta,
  ActiveRun,
  RunSummary,
  ReviewRunResponse,
  ReviewRecord,
  ConventionScan,
  PrDetail,
  BlastRadius,
} from '@devdigest/shared';
import type { DevDigestApi } from '../src/port.js';
import { createServer } from '../src/server.js';

class FakeApi implements DevDigestApi {
  agents: Agent[] = [];
  repos: Repo[] = [];
  async listAgents() {
    return this.agents;
  }
  async listRepos() {
    return this.repos;
  }
  async listPulls(): Promise<PrMeta[]> {
    return [];
  }
  async activeRuns(): Promise<ActiveRun[]> {
    return [];
  }
  async startReview(): Promise<ReviewRunResponse> {
    return { pr_id: 'p', runs: [], reviews: [] };
  }
  async runs(): Promise<RunSummary[]> {
    return [];
  }
  async reviews(): Promise<ReviewRecord[]> {
    return [];
  }
  async conventions(): Promise<ConventionScan> {
    return { items: [], sample_count: 0, scanned_at: null };
  }
  async pullDetail(): Promise<PrDetail> {
    return {
      id: 'p',
      number: 1,
      title: 't',
      author: 'a',
      branch: 'b',
      base: 'main',
      head_sha: 'sha',
      additions: 0,
      deletions: 0,
      files_count: 0,
      status: 'open',
      body: null,
      files: [],
      commits: [],
      linked_issue: null,
    };
  }
  async blast(): Promise<BlastRadius> {
    return { changed_symbols: [], downstream: [], summary: 'no changes' };
  }
}

async function connect(api: DevDigestApi) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(api);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  const first = content[0];
  return first?.type === 'text' ? (first.text ?? '') : '';
}

describe('MCP server', () => {
  let api: FakeApi;

  beforeEach(() => {
    api = new FakeApi();
  });

  it('registers exactly the 6 tools with their annotations', async () => {
    const { client } = await connect(api);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['get_blast_radius', 'get_conventions', 'get_findings', 'get_pr_findings', 'list_agents', 'run_agent_on_pr'].sort(),
    );
    const listAgents = tools.find((t) => t.name === 'list_agents')!;
    expect(listAgents.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'get_pr_findings')!.annotations?.readOnlyHint).toBe(true);
    const runAgent = tools.find((t) => t.name === 'run_agent_on_pr')!;
    expect(runAgent.annotations?.readOnlyHint).toBe(false);
    expect(runAgent.annotations?.openWorldHint).toBe(true);
  });

  it('list_agents returns isError with a hint when none are configured', async () => {
    const { client } = await connect(api);
    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Agents page');
  });

  it('list_agents returns shaped agents as text JSON', async () => {
    api.agents = [
      {
        id: 'a1',
        name: 'Reviewer',
        description: 'd',
        provider: 'openai',
        model: 'gpt-5',
        system_prompt: 'x',
        enabled: true,
        version: 1,
        strategy: 'single-pass',
        ci_fail_on: 'critical',
        repo_intel: true,
        skill_count: 0,
      },
    ];
    const { client } = await connect(api);
    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(text(result));
    expect(parsed.agents).toHaveLength(1);
    expect(parsed.agents[0].name).toBe('Reviewer');
    expect(parsed.agents[0].model).toBe('gpt-5');
  });

  it('run_agent_on_pr maps a not_found error (unknown repo) to isError text', async () => {
    const { client } = await connect(api);
    const result = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'owner/missing', pr: 1, agent: 'x' },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('not found');
  });

  it('get_blast_radius maps a not_found error (unknown repo) to isError text', async () => {
    const { client } = await connect(api);
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'owner/missing', pr: 1 },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('not found');
  });

  it('rejects run_agent_on_pr input that fails the zod schema (pr must be positive)', async () => {
    const { client } = await connect(api);
    const result = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'owner/name', pr: -1, agent: 'x' },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('greater than 0');
  });
});
