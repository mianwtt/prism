import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, resolve, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';

const root = fileURLToPath(new URL('../', import.meta.url));
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
const args = process.argv.slice(2);
let base, child, directory, output = '', childError;
const created = new Set();

async function request(path, {method = 'GET', body, status = 200} = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {'Content-Type': 'application/json', Origin: base},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, status, `${method} ${path}`);
  return response.json();
}

try {
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--url') throw new Error('Usage: npm run test:runtime [-- --url http://127.0.0.1:PORT]');
    const url = new URL(args[1]);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Runtime smoke URL must be a loopback HTTP origin');
    }
    base = url.origin;
  } else {
    directory = await realpath(await mkdtemp(resolve(tmpdir(), 'prism-runtime-smoke-')));
    const reservation = createServer();
    await new Promise(r => reservation.listen(0, '127.0.0.1', r));
    const port = reservation.address().port;
    await new Promise(r => reservation.close(r));
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['src/server.mjs'], {
      cwd: root,
      windowsHide: true,
      env: {...process.env, HOST: '127.0.0.1', PORT: String(port), PRISM_DATA_DIR: directory, LLM_API_KEY: '', LLM_MODEL: '', TAVILY_API_KEY: ''},
    });
    child.on('error', error => { childError = error; });
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
  }

  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (childError) throw childError;
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error('Isolated server exited before startup: ' + output);
    try {
      const response = await fetch(base + '/api/health', {signal: AbortSignal.timeout(1000)});
      if (response.ok) { ready = true; break; }
    } catch {}
    await delay(250);
  }
  assert.ok(ready, 'Server did not become ready');
  const health = await request('/api/health');
  assert.equal(health.ok, true);
  assert.equal(health.agent.checkpointStorage, 'sqlite');
  if (child) assert.equal(health.live, false, 'Isolated smoke must not use live provider configuration');

  const code = await readFile(resolve(root, 'src/server.mjs'), 'utf8');
  const routes = [...code.matchAll(/"(\/[^"\r\n]*)": \["(?:public|src)\//g)].map(match => match[1]);
  assert.ok(routes.includes('/') && routes.includes('/app.mjs'), 'Static route discovery must include entry points');
  for (const route of routes) {
    const response = await fetch(base + route, {signal: AbortSignal.timeout(10000)});
    assert.equal(response.status, 200, route);
  }

  const laptop = await request('/api/spaces/demo', {method: 'POST', status: 201});
  created.add(laptop.id);
  const housing = await request('/api/spaces/demo/housing', {method: 'POST', status: 201});
  created.add(housing.id);
  assert.ok(laptop.id && housing.id && laptop.id !== housing.id);
  const listed = await request('/api/spaces');
  assert.ok(listed.some(space => space.id === laptop.id) && listed.some(space => space.id === housing.id));
  const exported = await request(`/api/spaces/${housing.id}/export`);
  const imported = await request('/api/spaces/import', {method: 'POST', body: exported, status: 201});
  created.add(imported.id);
  assert.ok(imported.id && imported.id !== housing.id);
  const deleted = await request(`/api/spaces/${housing.id}`, {method: 'DELETE'});
  assert.ok(deleted.deletedVersionIds.includes(housing.id));
  created.delete(housing.id);
  await request(`/api/spaces/${housing.id}`, {status: 404});
  console.log('Runtime smoke passed: ' + JSON.stringify({node: process.version, version: health.version, staticRoutes: routes.length, checks: ['health', 'SQLite startup', 'static assets', 'laptop demo', 'housing demo', 'list', 'export/import', 'delete'], storage: child ? 'isolated temporary directory' : 'explicit target; only smoke-created spaces are removed'}));
} catch (error) {
  console.error('Runtime smoke failed: ' + error.message);
  process.exitCode = 1;
} finally {
  for (const id of created) {
    if (!/^[a-f0-9-]{36}$/.test(id)) continue;
    try { await request(`/api/spaces/${id}`, {method: 'DELETE'}); }
    catch { console.error('Could not remove a smoke-created fictional space: ' + id); process.exitCode = 1; }
  }
  if (child && child.exitCode === null && child.pid) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  if (directory) {
    const target = resolve(directory);
    if (dirname(target) !== await realpath(tmpdir()) || !basename(target).startsWith('prism-runtime-smoke-')) throw new Error('Refusing cleanup outside the smoke directory');
    await rm(target, {recursive: true, force: true});
  }
}
