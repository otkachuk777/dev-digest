import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { DevDigestApi } from '../src/port.js';
import { createServer } from '../src/server.js';

/** Never called in this test — only tools/list + instructions are measured. */
const unusedApi = {} as DevDigestApi;

/**
 * Token-cost guard (plan: "5 tools with 1-2 sentence descriptions, tiny flat
 * schemas, a 3-line instructions, no outputSchema"). ~6000 chars is a loose
 * ~1.5k-token budget so chat start stays cheap.
 */
describe('tool-list token budget', () => {
  it('keeps tools/list JSON + instructions under 6000 chars', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer(unusedApi);
    const client = new Client({ name: 'budget-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const instructions = client.getInstructions() ?? '';
    const size = JSON.stringify(tools).length + instructions.length;

    expect(size).toBeLessThan(6000);
    for (const tool of tools) {
      expect(tool.outputSchema).toBeUndefined();
    }
  });
});
