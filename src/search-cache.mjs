import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from 'redis';

const VERSION = 1;
const MAX_BYTES = 1_000_000;
const positiveInteger = (value, fallback, max) => {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= max ? number : null;
};
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const resultsValid = rows => Array.isArray(rows) && rows.length > 0 && rows.length <= 16 && rows.every(row =>
  row && typeof row === 'object' && typeof row.url === 'string' && row.url.length <= 4000);

// Keys contain a digest, never the question, query, provider credential or Redis URL.
export function searchCacheKey({ provider, query, options = {} }, scope = '') {
  const settings = Object.fromEntries(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)));
  const digest = createHash('sha256').update(JSON.stringify([VERSION, scope, provider, query.trim(), settings])).digest('hex');
  return `prism:search:v${VERSION}:${digest}`;
}

// Preserve the acquisition time when a search result becomes a saved source.
export function searchRetrievedAt(row) {
  return timestamp(row?.retrievedAt) ? row.retrievedAt : new Date().toISOString();
}

export function searchCacheMetadata(row) {
  const cache = row?.retrieval?.cache;
  return cache && typeof cache.hit === 'boolean' && timestamp(cache.observedAt) && timestamp(cache.servedAt)
    ? { cache: { hit: cache.hit, observedAt: cache.observedAt, servedAt: cache.servedAt } }
    : {};
}

export function createSearchCache(env = {}, { makeClient = createClient, now = Date.now } = {}) {
  const rawUrl = String(env.REDIS_URL || '').trim();
  const ttl = positiveInteger(env.REDIS_SEARCH_TTL_SECONDS, 300, 3600);
  const timeout = positiveInteger(env.REDIS_CACHE_TIMEOUT_MS, 300, 5000);
  const requested = Boolean(rawUrl && !/^x{3,}$/i.test(rawUrl));
  let validUrl = false;
  try { const url = new URL(rawUrl); validUrl = ['redis:', 'rediss:'].includes(url.protocol) && Boolean(url.hostname) && !url.search && !url.hash; } catch {}
  const enabled = requested && validUrl && ttl !== null && timeout !== null;
  const scope = resolve(env.PRISM_DATA_DIR || fileURLToPath(new URL('../data', import.meta.url)));
  const counters = { requests: 0, hits: 0, misses: 0, loads: 0, coalesced: 0, bypasses: 0, errors: 0, skippedWrites: 0 };
  const pending = new Map();
  let client = null, connecting = null, retryAt = 0, closed = false;

  async function bounded(operation) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Search cache timeout')), timeout); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  function unavailable() {
    counters.errors++;
    retryAt = now() + 5000;
    try { client?.destroy(); } catch {}
    client = null;
  }
  async function connection() {
    if (closed || now() < retryAt) return null;
    if (client?.isReady) return client;
    if (connecting) return connecting;
    connecting = (async () => {
      try {
        client = makeClient({ url: rawUrl, disableOfflineQueue: true,
          socket: { connectTimeout: timeout, reconnectStrategy: false }, commandOptions: { timeout } });
        // EventEmitter errors must be handled; credentials in connection errors stay private.
        client.on('error', () => {});
        await bounded(() => client.connect());
        if (closed) { client?.destroy(); client = null; return null; }
        // Idle optional cache sockets must not keep standalone research scripts alive.
        client.unref?.();
        return client;
      } catch { unavailable(); return null; }
    })().finally(() => { connecting = null; });
    return connecting;
  }
  function decorate(record, hit) {
    return structuredClone(record.results).map(row => ({ ...row, retrievedAt: record.observedAt,
      retrieval: { ...row.retrieval, cache: { hit, observedAt: record.observedAt, servedAt: new Date(now()).toISOString() } } }));
  }
  async function readThrough(key, loader, fresh) {
    const redis = await connection();
    if (redis && !fresh) {
      try {
        const bytes = await bounded(() => redis.get(key));
        if (typeof bytes === 'string' && Buffer.byteLength(bytes) <= MAX_BYTES) {
          let record;
          try { record = JSON.parse(bytes); } catch {}
          if (record?.version === VERSION && record.key === key && timestamp(record.observedAt) &&
            Number.isFinite(record.expiresAt) && record.expiresAt > now() && Date.parse(record.observedAt) <= now() &&
            now() - Date.parse(record.observedAt) < ttl * 1000 && resultsValid(record.results)) {
            counters.hits++;
            return decorate(record, true);
          }
        }
        counters.misses++;
      } catch { unavailable(); }
    } else counters.bypasses++;
    counters.loads++;
    const results = await loader(); // Search failures propagate and are never cached.
    if (!resultsValid(results)) { counters.skippedWrites++; return results; }
    const record = { version: VERSION, key, observedAt: new Date(now()).toISOString(), expiresAt: now() + ttl * 1000, results };
    const bytes = JSON.stringify(record);
    if (Buffer.byteLength(bytes) > MAX_BYTES) counters.skippedWrites++;
    else if (!closed && redis?.isReady && client === redis) {
      try { await bounded(() => redis.set(key, bytes, { expiration: { type: 'EX', value: ttl } })); }
      catch { unavailable(); }
    }
    return decorate(record, false);
  }
  return {
    async search(spec, loader, { fresh = false } = {}) {
      counters.requests++;
      if (!enabled || closed) { counters.bypasses++; counters.loads++; return loader(); }
      const key = searchCacheKey(spec, scope), pendingKey = key + (fresh ? ':fresh' : '');
      // Coalescing is process-local, not a distributed lock or job queue.
      if (pending.has(pendingKey)) { counters.coalesced++; return structuredClone(await pending.get(pendingKey)); }
      const task = readThrough(key, loader, fresh);
      pending.set(pendingKey, task);
      try { return await task; } finally { pending.delete(pendingKey); }
    },
    info() {
      return { enabled, status: closed ? 'closed' : !enabled ? requested ? 'invalid-config' : 'disabled'
        : now() < retryAt ? 'degraded' : client?.isReady ? 'ready' : 'idle',
        ttlSeconds: enabled ? ttl : null, ...counters };
    },
    close() { closed = true; try { client?.destroy(); } catch {} client = null; },
  };
}
