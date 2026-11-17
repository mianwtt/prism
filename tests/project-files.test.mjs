import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink, unlink, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname, resolve, basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {auditProject, collectSourceFiles, sha256, inside} from '../scripts/lib/project-files.mjs';
import {buildSourceArchive} from '../scripts/lib/source-archive.mjs';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'prism-source-test-')));
  t.after(async () => {
    const target = resolve(root);
    assert.equal(dirname(target), await realpath(tmpdir()));
    assert.ok(basename(target).startsWith('prism-source-test-'));
    await rm(target, {recursive: true, force: true});
  });
  const put = async (path, text) => {
    assert.ok(inside(root, resolve(root, path)));
    await mkdir(dirname(join(root, path)), {recursive: true});
    await writeFile(join(root, path), text);
  };
  const pkg = {name: 'prism-source-test', version: '0.4.0', type: 'module', dependencies: {}};
  await put('package.json', JSON.stringify(pkg));
  await put('package-lock.json', JSON.stringify({...pkg, lockfileVersion: 3, packages: {'': pkg}}));
  await put('README.md', '# Prism\n\n[Setup](docs/SETUP.md#install)\n');
  await put('docs/i18n/README.en.md', '# Prism English\n\n[中文](../../README.md)\n');
  await put('LICENSE', 'MIT\n');
  await put('.env.example', 'LLM_BASE_URL=XXX\nLLM_MODEL=XXX\nLLM_API_KEY=XXX\nTAVILY_API_KEY=XXX\nSEARCH_PROVIDER=XXX\n');
  await put('src/server.mjs', "import './core.mjs';\nconst asset = 'public/index.html';\n");
  await put('src/core.mjs', 'export const ready = true;\n');
  await put('public/index.html', '<!doctype html><title>Prism</title>');
  await put('docs/SETUP.md', '# Setup\n\n## Install\n\nRun npm ci.\n');
  return {root, put};
}

test('source audit includes new modules and omits private data and generated directories', async t => {
  const {root, put} = await fixture(t);
  await put('src/new-agent.mjs', "export {ready} from './core.mjs';\n");
  for (const path of ['.env', 'data/provider-settings.json', 'work/preview/spaces.json', 'node_modules/pkg/index.mjs', 'src/__pycache__/bridge.pyc', 'tests/test-results/snapshot.json']) {
    await put(path, 'PRIVATE_CANARY');
  }
  const result = await auditProject(root);
  const names = result.files.map(file => file.path);
  assert.ok(names.includes('src/new-agent.mjs'));
  assert.ok(names.includes('.env.example'));
  assert.equal(result.summary.relativeImports, 2);
  assert.equal(result.summary.documentLinks, 2);
  assert.equal(result.summary.staticAssets, 1);
  assert.equal(result.summary.indexChecked, false);
  assert.ok(result.files.every(file => !file.bytes.includes('PRIVATE_CANARY')));
  assert.ok(names.every(path => !/^(?:data|work|node_modules)\//.test(path)));
});

test('source audit detects broken references, changed lock metadata and nonplaceholder provider values without printing credentials', async t => {
  const {root, put} = await fixture(t);
  const fake = 'sk-' + 'a'.repeat(24);
  await put('src/core.mjs', "import './missing.mjs';\nexport const key = '" + fake + "';\n");
  await put('README.md', '# Prism\n\n[Setup](docs/SETUP.md#missing)\n[Bad](docs/SETUP.md#%xy)\n');
  await put('.env.example', 'LLM_API_KEY=local-secret-canary\n');
  await put('package-lock.json', JSON.stringify({name: 'wrong', version: '0.1.0', packages: {'': {version: '0.1.0', dependencies: {extra: '1'}}}}));
  await assert.rejects(auditProject(root), error => {
    assert.match(error.message, /unresolved literal relative import/);
    assert.match(error.message, /missing documentation anchor/);
    assert.match(error.message, /malformed local documentation anchor/);
    assert.match(error.message, /name\/version do not agree/);
    assert.match(error.message, /dependencies do not agree/);
    assert.match(error.message, /public provider values must use XXX/);
    assert.match(error.message, /possible credential detected/);
    assert.equal(error.message.includes(fake), false);
    assert.equal(error.message.includes('local-secret-canary'), false);
    return true;
  });
});

test('source audit checks actual module imports without treating code examples in strings or comments as dependencies', async t => {
  const {root, put} = await fixture(t);
  await put('src/core.mjs', [
    'const example = "import \'./not-a-dependency.mjs\'";',
    '// import "./comment-only.mjs";',
    'const pattern = /import "fake"/;',
    'export async function load() { return import("./lazy.mjs"); }',
  ].join('\n'));
  await put('src/lazy.mjs', 'export default true;');
  assert.equal((await auditProject(root)).summary.relativeImports, 2);
  await rm(join(root, 'src/lazy.mjs'));
  await assert.rejects(auditProject(root), /src\/core.mjs: unresolved literal relative import near line 4/);
});

test('source audit rejects a Redis credential URL and nonplaceholder template without printing credentials', async t => {
  const { root, put } = await fixture(t);
  const credential = 'cache-fixture-password', uri = 'redis://' + ':' + credential + '@127.0.0.1:6379';
  await put('src/cache.mjs', 'export const endpoint = ' + JSON.stringify(uri) + ';');
  await put('.env.example', 'REDIS_URL=' + uri + '\n');
  await assert.rejects(auditProject(root), error => {
    assert.match(error.message, /possible credential detected/);
    assert.match(error.message, /public provider values must use XXX/);
    assert.equal(error.message.includes(credential), false); return true;
  });
});

test('source and archive checks reject redirected directories', async t => {
  const {root} = await fixture(t);
  const external = await fixture(t);
  const kind = process.platform === 'win32' ? 'junction' : 'dir';
  const link = join(root, 'docs', 'external');
  await symlink(external.root, link, kind);
  await assert.rejects(collectSourceFiles(root), /symlinks are not allowed/);
  await unlink(link);
  await symlink(external.root, join(root, 'work'), kind);
  await assert.rejects(buildSourceArchive(root), /redirected directories/);
  assert.equal(await readFile(join(external.root, 'README.md'), 'utf8'), '# Prism\n\n[Setup](docs/SETUP.md#install)\n');
});

test('source archive round-trips every checked byte and manifest hash while excluding local information', async t => {
  const {root, put} = await fixture(t);
  await put('deploy/docker/Dockerfile', 'FROM node:24-bookworm-slim\n');
  await put('deploy/docker/Dockerfile.dockerignore', '.env\ndata\nwork\n');
  await put('deploy/docker/compose.yaml', 'name: prism\nservices: {}\n');
  await put('scripts/requirements-search.txt', '# Optional search dependencies\n');
  await put('.env', 'PRIVATE_CANARY');
  await put('data/decision.json', 'PRIVATE_CANARY');
  await put('work/experiment.txt', 'PRIVATE_CANARY');
  await put('docs/fixture-image.png', Buffer.from([137, 80, 78, 71, 0, 255, 1, 2]));
  const expected = await auditProject(root);
  for (const path of ['deploy/docker/Dockerfile', 'deploy/docker/Dockerfile.dockerignore', 'deploy/docker/compose.yaml', 'scripts/requirements-search.txt', 'docs/i18n/README.en.md']) {
    assert.ok(expected.files.some(file => file.path === path), 'Distribution must include ' + path);
  }
  // A second build checks safe replacement of an existing generated archive/checksum.
  await buildSourceArchive(root);
  const result = await buildSourceArchive(root);
  const lockPath = join(root, 'work/releases/.source-build.lock');
  await assert.rejects(readFile(lockPath), {code: 'ENOENT'});
  await writeFile(lockPath, 'another active build');
  await assert.rejects(buildSourceArchive(root), /build is already running/);
  assert.equal(sha256(await readFile(result.archive)), result.sha256, 'A competing build must not replace the verified artifact');
  await unlink(lockPath);
  const tar = args => execFileSync('tar', args, {maxBuffer: 16 * 1024 * 1024, windowsHide: true});
  const manifest = JSON.parse(tar(['-xOzf', result.archive, result.manifest]));
  assert.equal(manifest.kind, 'working-tree-source');
  assert.equal(result.files, expected.files.length);
  assert.deepEqual(manifest.files, expected.files.map(({path, size, sha256}) => ({path, size, sha256})));
  const prefix = dirname(result.manifest).replaceAll('\\', '/');
  const members = tar(['-tzf', result.archive]).toString().trim().split(/\r?\n/).sort();
  assert.deepEqual(members, [...expected.files.map(file => prefix + '/' + file.path), result.manifest].sort());
  for (const file of expected.files) {
    const stored = tar(['-xOzf', result.archive, prefix + '/' + file.path]);
    assert.deepEqual(stored, file.bytes, file.path);
    assert.equal(sha256(stored), file.sha256, file.path);
  }
  assert.equal(sha256(await readFile(result.archive)), result.sha256);
  assert.equal((await readFile(result.archive + '.sha256', 'utf8')).trim(), result.sha256 + '  ' + basename(result.archive));
});

test('publication audit requires complete current staged source without changing staging choices', async t => {
  const {root, put} = await fixture(t);
  const git = (...args) => execFileSync('git', args, {cwd: root, stdio: 'pipe'});
  git('init', '-q');
  const snapshot = await auditProject(root);
  const before = git('ls-files', '--stage', '-z');
  await assert.rejects(auditProject(root, {checkIndex: true}), /source file is not in the Git index/);
  assert.deepEqual(git('ls-files', '--stage', '-z'), before);
  git('add', '--', ...snapshot.files.map(file => file.path));
  assert.equal((await auditProject(root, {checkIndex: true})).summary.indexChecked, true);
  await put('src/core.mjs', 'export const ready = false;\n');
  const staged = git('ls-files', '--stage', '-z');
  await assert.rejects(auditProject(root, {checkIndex: true}), /working copy differs from staged source/);
  assert.deepEqual(git('ls-files', '--stage', '-z'), staged);
  git('add', '--', 'src/core.mjs');
  await put('obsolete.txt', 'old staged file');
  git('add', '--', 'obsolete.txt');
  await assert.rejects(auditProject(root, {checkIndex: true}), /staged path is outside the current source package/);
});

test('source audit rejects missing runtime files and private configuration nested in public source', async t => {
  const {root, put} = await fixture(t);
  await rm(join(root, 'src/server.mjs'));
  await assert.rejects(auditProject(root), /src\/server.mjs: required source file missing/);
  await put('public/provider-settings.json', '{"private":"PRIVATE_CANARY"}');
  await assert.rejects(auditProject(root), error => {
    assert.match(error.message, /private configuration cannot be packaged/);
    assert.equal(error.message.includes('PRIVATE_CANARY'), false);
    return true;
  });
});
