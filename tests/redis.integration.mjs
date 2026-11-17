// Deliberately separate from npm test: requires an actual, operator-selected Redis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from 'redis';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSearchCache } from '../src/search-cache.mjs';

test('real Redis: cross-client hits, server TTL expiry and fresh bypass', async t => {
  const url = process.env.PRISM_TEST_REDIS_URL;
  assert.ok(url, 'Set PRISM_TEST_REDIS_URL to an isolated Redis before running this integration test');
  const keys = new Set(), caches = [];
  const options = { url, disableOfflineQueue: true, socket: { connectTimeout: 1000, reconnectStrategy: false }, commandOptions: { timeout: 1000 } };
  const raw = createClient(options); raw.on('error', () => {});
  t.after(async () => { caches.forEach(c => c.close()); if (raw.isReady && keys.size) await raw.del([...keys]); raw.destroy(); });
  await raw.connect();
  const env = { REDIS_URL: url, REDIS_SEARCH_TTL_SECONDS: '1', REDIS_CACHE_TIMEOUT_MS: '1000', PRISM_DATA_DIR: 'work/redis-test-' + randomUUID() };
  const make = () => {
    const cache = createSearchCache(env, { makeClient(settings) {
      const client = createClient(settings), originalSet = client.set.bind(client);
      client.set = (key, ...args) => { keys.add(key); return originalSet(key, ...args); };
      return client;
    } }); caches.push(cache); return cache;
  };
  const one = make(), two = make(), spec = { provider: 'fixture', query: 'isolated Redis validation', options: { max_results: 4 } };
  let calls = 0;
  const loader = async () => { calls++; return [{ url: 'https://example.org/cache-fixture', title: 'Controlled public-source fixture', content: 'observation ' + calls }]; };
  const first = await one.search(spec, loader), second = await two.search(spec, loader);
  assert.equal(calls, 1); assert.equal(second[0].retrieval.cache.hit, true);
  assert.equal(second[0].retrievedAt, first[0].retrievedAt);
  const key = [...keys][0], ttl = await raw.pTTL(key); assert.ok(ttl > 0 && ttl <= 1000);
  await delay(1100); assert.equal(await raw.get(key), null);
  assert.equal((await two.search(spec, loader))[0].content, 'observation 2');
  assert.equal((await one.search(spec, loader, { fresh: true }))[0].content, 'observation 3');
  assert.equal((await two.search(spec, loader))[0].content, 'observation 3');
  assert.equal(calls, 3);
  const comparison = [];
  for (const enabled of [false, true]) {
    const cache = enabled ? one : createSearchCache({});
    let externalLoads = 0;
    const started = performance.now();
    for (const query of ['alpha', 'beta', 'gamma', 'alpha', 'beta', 'gamma', 'alpha', 'beta', 'gamma']) {
      await cache.search({ provider: 'controlled-benchmark', query }, async () => {
        externalLoads++; await delay(20);
        return [{ url: 'https://example.org/' + query, content: 'Controlled fixture ' + query }];
      });
    }
    comparison.push({ cache: enabled, requests: 9, externalLoads, elapsedMs: Math.round(performance.now() - started) });
    if (!enabled) cache.close();
  }
  assert.equal(comparison[0].externalLoads, 9); assert.equal(comparison[1].externalLoads, 3);
  t.diagnostic(JSON.stringify({ source: 'controlled fixture, not a live-search quality benchmark', externalLoads: calls,
    repeatedQueryComparison: comparison, firstClient: one.info(), secondClient: two.info() }));
});

test('real node-redis client: unreachable server falls back within a bounded interval', async t => {
  const portProbe = createServer(); await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
  const cache = createSearchCache({ REDIS_URL: `redis://127.0.0.1:${port}`, REDIS_CACHE_TIMEOUT_MS: '100' });
  t.after(() => cache.close());
  const started = performance.now(), result = await cache.search({ provider: 'fixture', query: 'fallback' }, async () => ['original result']);
  assert.deepEqual(result, ['original result']); assert.equal(cache.info().status, 'degraded');
  assert.ok(performance.now() - started < 2000);
});

test('standalone callers exit after a cached search without an idle Redis socket keeping Node alive', async () => {
  assert.ok(process.env.PRISM_TEST_REDIS_URL, 'Set PRISM_TEST_REDIS_URL to an isolated Redis');
  const moduleURL = new URL('../src/search-cache.mjs', import.meta.url).href;
  const code = `import {createSearchCache} from ${JSON.stringify(moduleURL)};
    const cache = createSearchCache({REDIS_URL:process.env.PRISM_TEST_REDIS_URL,
      REDIS_SEARCH_TTL_SECONDS:'1',PRISM_DATA_DIR:'work/cache-child-'+process.pid});
    await cache.search({provider:'fixture',query:'CLI lifecycle'},async()=>[{url:'https://example.org/cli'}]);
    if(cache.info().status!=='ready')throw new Error('Redis integration is not connected');
    console.log('cache CLI completed');`;
  const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', code], { timeout: 5000, windowsHide: true });
  assert.match(result.stdout, /cache CLI completed/);
});
