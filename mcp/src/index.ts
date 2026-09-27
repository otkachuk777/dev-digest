#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HttpDevDigestApi } from './http-api.js';
import { createServer } from './server.js';

/**
 * COMPOSITION ROOT — the only place that wires infra (HttpDevDigestApi) to
 * presentation (createServer) and starts the process. All logs go to
 * stderr: stdout is the JSON-RPC stdio transport.
 */

const baseUrl = process.env.DEVDIGEST_API_URL ?? 'http://localhost:3001';

async function main() {
  const api = new HttpDevDigestApi(baseUrl);
  const server = createServer(api);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`devdigest-mcp: connected, proxying ${baseUrl}`);
}

main().catch((err) => {
  console.error('devdigest-mcp: fatal error', err);
  process.exitCode = 1;
});
