import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withResearchMcp, createMcpResearchAdapter } from '../src/mcp-research.mjs';
import { createSkillRegistry, selectSkills } from '../src/skills.mjs';
import { createSpecialist } from '../src/agents/specialist.mjs';
import { providers } from '../src/research-providers.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

test('SDK client discovers real MCP tools, calls cached search, and retains source timestamps', async () => {
  let loads = 0;
  const seen = '2026-11-01T00:00:00.000Z';
  const io = createMcpResearchAdapter({ search: async query => { loads++; return [{ url: 'https://example.org/a', title: query, retrievedAt: seen, cache: { observedAt: seen } }]; } });
  const rows = await io.search('笔记本');
  assert.equal(loads, 1); assert.equal(rows[0].retrievedAt, seen); assert.equal(rows[0].cache.observedAt, seen);
  assert.equal(io.mcpTrace()[0].name, 'search_public_sources');
  await withResearchMcp({ search: async () => [] }, async (client, tools) => {
    assert.deepEqual(tools.map(t => t.name), ['search_public_sources']);
    assert.equal(tools[0].inputSchema.properties.query.type, 'string');
    assert(!tools.some(t => /model|confirm|purchase/.test(t.name)));
    const bad = await client.callTool({ name: 'search_public_sources', arguments: { query: '' } });
    assert.equal(bad.isError, true);
  });
});

test('MCP read rejects credential URLs before executing and preserves public tool failures', async () => {
  let reads = 0;
  const io = createMcpResearchAdapter({ fetchSource: async () => { reads++; throw new Error('public page timeout'); } });
  await assert.rejects(() => io.fetchSource('https://user:pass@example.org'), /MCP|HTTP|地址|validation/i);
  assert.equal(reads, 0);
  await assert.rejects(() => io.fetchSource('https://example.org'), /public page timeout/);
  assert.equal(reads, 1);
});

test('MCP catalog handoff retains geographic and price-range arguments', async () => {
  let received;
  const io = createMcpResearchAdapter({ searchCatalog: async request => { received = request; return { text: 'observed catalog', observedLinks: [] }; } });
  const request = { platform: 'suning', keywords: '笔记本', priceRange: { minimum: 0, maximum: 7000 }, sort: 'price-ascending' };
  assert.equal((await io.searchCatalog(request)).text, 'observed catalog');
  assert.deepEqual(received, request);
});

test('production providers default to MCP and direct transport is an explicit fallback', () => {
  const cache = { close() {}, search() {} };
  assert.equal(providers({}, { searchCache: cache }).toolTransport, 'mcp-in-memory');
  assert.equal(providers({ PRISM_TOOL_TRANSPORT: 'direct' }, { searchCache: cache }).toolTransport, 'direct');
});

test('skills activate by role and task without broadcasting other skill bodies', async () => {
  assert.deepEqual(selectSkills('researcher', { question: '杭州租房' }).map(s => s.name), ['rental-research']);
  assert.deepEqual(selectSkills('researcher', { question: '选购笔记本' }).map(s => s.name), ['offer-research']);
  assert.equal(selectSkills('researcher', { question: '比较学习计划' }).length, 0);
  let prompt;
  const role = createSpecialist('reviewer', { check: async (_, io) => io.model([{ role: 'system', content: 'review' }]) }, {
    model: async messages => { prompt = messages[0].content; return {}; },
  });
  const result = await role.invoke({ phase: 'check', task: { question: '杭州租房' } });
  assert(prompt.includes('<skill name="evidence-review">'));
  assert(!prompt.includes('<skill name="rental-research">'));
  assert.equal(result.usage.skills[0].name, 'evidence-review');
  assert.equal(result.usage.skills[0].sha256.length, 64);
});

test('skill loader rejects traversal, unknown names and changed files in a discovered catalog', async t => {
  const root = await mkdtemp(join(tmpdir(), 'prism-skills-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'test-skill'));
  const path = join(root, 'test-skill', 'SKILL.md');
  await writeFile(path, '---\nname: test-skill\ndescription: Test only\n---\nInitial instructions.\n');
  const registry = createSkillRegistry(root);
  assert(!Object.hasOwn(registry.catalog()[0], 'body'));
  assert.throws(() => registry.load('../outside'), /未在受信目录/);
  await writeFile(path, '---\nname: test-skill\ndescription: Test only\n---\nChanged instructions.\n');
  assert.throws(() => registry.load('test-skill'), /已变化/);
});

test('external stdio SDK client discovers research tools and rejects an invalid call without network access', async () => {
  const client = new Client({ name: 'prism-external-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/mcp-server.mjs', import.meta.url))], stderr: 'pipe' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert(listed.tools.some(tool => tool.name === 'search_public_sources'));
    assert(listed.tools.some(tool => tool.name === 'read_public_source'));
    const result = await client.callTool({ name: 'search_public_sources', arguments: { query: '' } });
    assert.equal(result.isError, true);
  } finally { await client.close(); }
});
