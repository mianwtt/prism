import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchCache, searchCacheKey, searchRetrievedAt } from '../src/search-cache.mjs';
import { collectedSource } from '../src/general-retrieval.mjs';
import { providers } from '../src/research-providers.mjs';
import { createApp } from '../src/server.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = { REDIS_URL: 'redis://127.0.0.1:6379', REDIS_SEARCH_TTL_SECONDS: '2' };
const spec = { provider: 'tofu', query: '杭州 整租', options: { max_results: 4 } };
const rows = () => [{ title: '测试来源', url: 'https://example.org/listing', raw_content: '测试来源 月租 3000元/月', engine: 'fixture' }];
const privateRedisUrl = password => 'redis://' + ':' + password + '@127.0.0.1:6379';
function fixture(overrides = {}) {
  const data = new Map(), writes = [], clients = [];
  let time = Date.parse('2026-11-17T01:00:00Z');
  const makeClient = () => {
    const client = { isReady: false, on() {}, async connect() { this.isReady = true; },
      async get(key) { return data.get(key) ?? null; },
      async set(key, value, options) { data.set(key, value); writes.push({ key, options }); return 'OK'; },
      destroy() { this.isReady = false; }, ...overrides };
    clients.push(client); return client;
  };
  return { data, writes, clients, makeClient, now: () => time, advance: ms => { time += ms; } };
}

test('disabled and placeholder configuration needs no Redis and does not change search results', async () => {
  for (const REDIS_URL of ['', 'XXX', 'https://wrong.example.org']) {
    const cache = createSearchCache({ REDIS_URL }, { makeClient: () => { throw new Error('must not connect'); } });
    const original = rows();
    assert.equal(await cache.search(spec, async () => original), original);
    assert.equal(cache.info().enabled, false); cache.close();
  }
  assert.equal(createSearchCache({ ...env, REDIS_SEARCH_TTL_SECONDS: '-1' }).info().status, 'invalid-config');
});

test('cache hits reduce external calls and preserve acquisition time through saved source conversion', async t => {
  const f = fixture(), cache = createSearchCache(env, f); t.after(() => cache.close());
  let loads = 0;
  const load = async () => { loads++; return rows(); };
  const first = await cache.search(spec, load);
  f.advance(500);
  const second = await cache.search(spec, load), source = collectedSource(second[0], spec.query);
  assert.equal(loads, 1); assert.equal(cache.info().hits, 1);
  assert.equal(first[0].retrieval.cache.hit, false); assert.equal(second[0].retrieval.cache.hit, true);
  assert.equal(source.retrievedAt, first[0].retrievedAt);
  assert.notEqual(source.retrievedAt, second[0].retrieval.cache.servedAt);
  assert.equal(source.retrieval.cache.hit, true);
  assert.deepEqual(f.writes[0].options, { expiration: { type: 'EX', value: 2 } });
  second[0].raw_content = 'mutated';
  assert.equal((await cache.search(spec, load))[0].raw_content, rows()[0].raw_content);
});

test('expiry, malformed entries and explicit fresh search refetch rather than serving stale data', async t => {
  const f = fixture(), cache = createSearchCache(env, f); t.after(() => cache.close());
  let loads = 0; const load = async () => { loads++; return rows(); };
  await cache.search(spec, load); f.advance(2001); await cache.search(spec, load);
  assert.equal(loads, 2);
  const key = f.writes[0].key; f.data.set(key, '{broken'); await cache.search(spec, load);
  assert.equal(loads, 3);
  await cache.search(spec, load, { fresh: true }); assert.equal(loads, 4);
  assert.equal((await cache.search(spec, load))[0].retrieval.cache.hit, true);
  assert.equal(loads, 4);
});

test('keys isolate provider, exact query, options and data directory while hiding query text', async t => {
  assert.equal(searchCacheKey(spec), searchCacheKey({ ...spec, query: ' 杭州 整租 ' }));
  assert.notEqual(searchCacheKey(spec), searchCacheKey({ ...spec, provider: 'tavily' }));
  assert.notEqual(searchCacheKey(spec), searchCacheKey({ ...spec, query: '成都 整租' }));
  assert.notEqual(searchCacheKey(spec), searchCacheKey({ ...spec, options: { max_results: 8 } }));
  assert.equal(searchCacheKey({ ...spec, options: { a: 1, b: 2 } }), searchCacheKey({ ...spec, options: { b: 2, a: 1 } }));
  assert.ok(!searchCacheKey(spec).includes(spec.query));
  const f = fixture(), one = createSearchCache({ ...env, PRISM_DATA_DIR: 'one' }, f), two = createSearchCache({ ...env, PRISM_DATA_DIR: 'two' }, f);
  t.after(() => { one.close(); two.close(); });
  await one.search(spec, rows); await two.search(spec, rows);
  assert.equal(f.data.size, 2);
});

test('concurrent identical requests share one load without sharing mutable results', async t => {
  const f = fixture(), cache = createSearchCache(env, f); t.after(() => cache.close());
  let release, loads = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const load = async () => { loads++; await gate; return rows(); };
  const tasks = Array.from({ length: 6 }, () => cache.search(spec, load));
  release(); const results = await Promise.all(tasks);
  assert.equal(loads, 1); assert.equal(cache.info().coalesced, 5);
  results[0][0].title = 'changed'; assert.equal(results[1][0].title, '测试来源');
});

test('empty, failed and oversized search responses are not cached', async t => {
  const f = fixture(), cache = createSearchCache(env, f); t.after(() => cache.close());
  assert.deepEqual(await cache.search(spec, async () => []), []);
  await assert.rejects(cache.search(spec, async () => { throw new Error('search unavailable'); }), /search unavailable/);
  const large = [{ ...rows()[0], raw_content: 'x'.repeat(1_000_001) }];
  assert.equal((await cache.search(spec, async () => large))[0].raw_content.length, 1_000_001);
  assert.equal(f.data.size, 0);
  await cache.search(spec, rows); assert.equal(f.data.size, 1);
});

test('connection/read/write failures degrade safely, do not leak credentials and recover after cooldown', async t => {
  for (const method of ['connect', 'get', 'set']) {
    let broken = true;
    const f = fixture({ async [method](...args) {
      if (broken) throw new Error('secret-password must never be logged');
      if (method === 'connect') this.isReady = true;
      if (method === 'get') return null;
      return 'OK';
    } });
    const cache = createSearchCache({ ...env, REDIS_URL: privateRedisUrl('secret-password') }, f); t.after(() => cache.close());
    assert.equal((await cache.search(spec, rows))[0].title, '测试来源');
    assert.equal(cache.info().status, 'degraded'); assert.ok(cache.info().errors >= 1);
    assert.ok(!JSON.stringify(cache.info()).includes('secret-password'));
    const clients = f.clients.length; await cache.search(spec, rows); assert.equal(f.clients.length, clients);
    broken = false; f.advance(5001); await cache.search(spec, rows); assert.equal(cache.info().status, 'ready');
  }
});

test('a hanging connection is bounded and shutdown destroys a ready client', async () => {
  const f = fixture({ connect: () => new Promise(() => {}) });
  const cache = createSearchCache({ ...env, REDIS_CACHE_TIMEOUT_MS: '20' }, f);
  assert.equal((await cache.search(spec, rows))[0].title, '测试来源');
  assert.equal(cache.info().status, 'degraded'); assert.equal(f.clients[0].isReady, false); cache.close();
  const healthy = fixture(), second = createSearchCache(env, healthy);
  await second.search(spec, rows); second.close(); assert.equal(healthy.clients[0].isReady, false);
  assert.equal(second.info().status, 'closed');
});

test('a synchronous client construction failure can recover after the retry cooldown', async t => {
  const f = fixture(); let fail = true;
  const cache = createSearchCache(env, { ...f, makeClient: settings => {
    if (fail) throw new Error('invalid client configuration');
    return f.makeClient(settings);
  } }); t.after(() => cache.close());
  await cache.search(spec, rows); assert.equal(cache.info().status, 'degraded');
  fail = false; f.advance(5001); await cache.search(spec, rows);
  assert.equal(cache.info().status, 'ready'); assert.equal(f.data.size, 1);
});

test('provider caching covers search aliases while direct source reads remain uncached', async t => {
  const f = fixture(), cache = createSearchCache(env, f); t.after(() => cache.close());
  let searches = 0, reads = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/search')) { searches++; return Response.json({ results: rows() }); }
    if (url.endsWith('/extract')) { reads++; return Response.json({ results: [{ url: rows()[0].url, raw_content: 'current page ' + reads }] }); }
    throw new Error('unexpected external call');
  });
  const io = providers({ SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: 'fixture-account' }, { searchCache: cache });
  await io.search(spec.query); await io.searchCandidateSources(spec.query); assert.equal(searches, 1);
  assert.notEqual(await io.fetchSource(rows()[0].url), await io.fetchSource(rows()[0].url)); assert.equal(reads, 2);
  const otherAccount = providers({ SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: 'different-account' }, { searchCache: cache });
  await otherAccount.search(spec.query); assert.equal(searches, 2);
  assert.ok(![...f.data.keys()].join().includes('fixture-account'));
});

test('health exposes aggregate cache state without connecting or exposing its endpoint', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'prism-cache-http-'));
  const app = createApp({ directory, env: { REDIS_URL: privateRedisUrl('private-cache-pass') } });
  t.after(async () => { await app.shutdown(); await rm(directory, { recursive: true, force: true }); });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${app.address().port}/api/health`), body = await response.json();
  assert.equal(body.searchCache.status, 'idle'); assert.equal(body.searchCache.enabled, true);
  assert.ok(!JSON.stringify(body).includes('private-cache-pass'));
  assert.equal(body.searchCache.loads, 0);
  assert.equal(searchRetrievedAt({ retrievedAt: '2026-11-17T00:00:00Z' }), '2026-11-17T00:00:00Z');
});
