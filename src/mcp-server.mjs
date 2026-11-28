// External MCP entry: node --env-file-if-exists=.env src/mcp-server.mjs
// stdout belongs to the SDK's JSON-RPC transport; never log application text there.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { providers } from './research-providers.mjs';
import { createResearchMcpServer } from './mcp-research.mjs';

const provider = providers({ ...process.env, PRISM_TOOL_TRANSPORT: 'direct' });
const server = createResearchMcpServer(provider);
const previousClose = server.server.onclose;
server.server.onclose = () => { previousClose?.(); provider.close(); };
try {
  await server.connect(new StdioServerTransport());
} catch (error) {
  process.stderr.write('MCP server failed: ' + error.message + '\n');
  provider.close();
  process.exitCode = 1;
}
process.once('SIGTERM', async () => { await server.close(); provider.close(); });
