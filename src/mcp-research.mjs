import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { safeUrl } from './evidence.mjs';

const publicUrl = z.string().max(4000).refine(value => Boolean(safeUrl(value)), '需要公开 HTTP(S) 地址');
const options = z.object({ fresh: z.boolean().optional(), purpose:z.enum(['research','offers']).optional(), maxResults:z.number().int().min(4).max(12).optional() }).strict();
export const researchTools = Object.freeze({
  search: 'search_public_sources', fetchSource: 'read_public_source', searchCatalog: 'search_public_catalog',
  readMerchantOffer: 'read_merchant_offer', enrichImages: 'read_source_images',
});

export function createResearchMcpServer(provider) {
  const server = new McpServer({ name: 'prism-research', version: '1.0.0' });
  const specs = [
    ['search', '检索公开资料，返回发现的来源及采集时间；摘要不是已核实事实。',
      { query: z.string().trim().min(1).max(500), options: options.optional() }, ({ query, options }) => [query, options || {}]],
    ['fetchSource', '读取公开来源原文及原页配图，沿用已有 URL 与页面安全检查。',
      { url: publicUrl }, ({ url }) => [url]],
    ['searchCatalog', '检索已支持平台的公开目录，不生成候选、价格或地理位置。',
      { request: z.object({ platform: z.enum(['suning', 'fang-rentals','dfrobot','waveshare']), keywords: z.string().max(40).optional(), location: z.string().max(100).optional() }).passthrough() }, ({ request }) => [request]],
    ['readMerchantOffer', '核对实际商家详情和标价口径，不能下单或改变账户状态。',
      { url: publicUrl }, ({ url }) => [url]],
    ['enrichImages', '读取给定来源实际图片，不生成图片或补用其他对象的配图。',
      { urls: z.array(publicUrl).max(6) }, ({ urls }) => [urls]],
  ];
  for (const [capability, description, inputSchema, args] of specs) {
    if (typeof provider[capability] !== 'function') continue;
    server.registerTool(researchTools[capability], {
      description, inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    }, async input => {
      try {
        const result = { value: await provider[capability](...args(input)) ?? null };
        const encoded = JSON.stringify(result);
        if (Buffer.byteLength(encoded) > 4_000_000) throw new Error('MCP 工具结果超过大小限制');
        return { content: [{ type: 'text', text: encoded }], structuredContent: result };
      } catch (error) {
        return { content: [{ type: 'text', text: String(error.message || '工具执行失败').slice(0, 800) }], isError: true };
      }
    });
  }
  return server;
}

// The actual MCP handshake/list/call runs over SDK memory transports. No extra
// network listener or process is required; a separate stdio entry is also provided.
export async function withResearchMcp(provider, operation) {
  const server = createResearchMcpServer(provider), client = new Client({ name: 'prism-agent', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const listing = await client.listTools();
    return await operation(client, listing.tools);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

export function createMcpResearchAdapter(provider) {
  const toolCalls = [];
  const adapter = { ...provider, toolTransport: 'mcp-in-memory' };
  const call = (capability, args) => withResearchMcp(provider, async (client, tools) => {
    const name = researchTools[capability];
    if (!tools.some(tool => tool.name === name)) throw new Error('MCP 服务未提供所需工具');
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 90000 });
    if (result.isError) throw new Error(result.content?.find(item => item.type === 'text')?.text || 'MCP 工具执行失败');
    const value = result.structuredContent;
    if (!value || !Object.hasOwn(value, 'value')) throw new Error('MCP 工具返回结构不匹配');
    toolCalls.push({ name, transport: 'mcp-in-memory' });
    if (toolCalls.length > 128) toolCalls.shift();
    return value.value;
  });
  if (provider.search) adapter.search = (query, options = {}) => call('search', { query, options });
  if (provider.fetchSource) adapter.fetchSource = url => call('fetchSource', { url });
  if (provider.searchCatalog) adapter.searchCatalog = request => call('searchCatalog', { request });
  if (provider.readMerchantOffer) adapter.readMerchantOffer = url => call('readMerchantOffer', { url });
  if (provider.enrichImages) adapter.enrichImages = urls => call('enrichImages', { urls: urls.slice(0, 6) });
  adapter.searchCandidateSources = adapter.search;
  adapter.mcpTrace = () => structuredClone(toolCalls);
  return adapter;
}
