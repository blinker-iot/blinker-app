import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareAccessSources, validateSelection, parseTreeRecord } from './prepare-access-sources.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const reviewed = JSON.parse(fs.readFileSync(new URL('./access-source-files.json', import.meta.url), 'utf8'));
function git(directory, args) {
  const result = spawnSync('git', ['-C', directory, ...args], { windowsHide: true, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}
function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blinker-access-selection-'));
  t.after(() => {
    assert.equal(path.dirname(temp), os.tmpdir());
    assert.ok(path.basename(temp).startsWith('blinker-access-selection-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const repo = path.join(temp, 'app'); fs.mkdirSync(repo);
  const put = (name, value) => {
    const file = path.join(repo, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value);
  };
  for (const name of reviewed.projections) put(name, git(app, ['show', `${reviewed.baseCommit}:${name}`]));
  put('src/unrelated.ts', 'original baseline\n');
  put('public/binary.png', Buffer.from([0, 255, 10, 4]));
  put('.gitignore', 'build/\n');
  git(repo, ['init', '--quiet']);
  git(repo, ['add', '.']);
  // Only this disposable synthetic repository is committed; never the real App.
  git(repo, ['-c', 'user.name=Source selection fixture', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  const selection = { schema: 1, baseCommit: git(repo, ['rev-parse', 'HEAD']).toString().trim(),
    baseline: [], access: ['src/access-entry.ts'], projections: reviewed.projections, tooling: [] };
  for (const name of reviewed.projections) put(name, fs.readFileSync(path.join(app, name)));
  put('src/access-entry.ts', 'explicit access source\n');
  put('src/unrelated.ts', 'unrelated local edit must stay here\n');
  return { temp, repo, selection, put, output: path.join(repo, 'build/candidate') };
}

test('isolated candidate uses Git baseline plus explicit access inputs, without touching dirty sources or index', t => {
  const f = fixture(t), before = git(f.repo, ['status', '--porcelain=v1', '-uall']);
  const result = prepareAccessSources(f.repo, f.output, f.selection);
  assert.equal(fs.readFileSync(path.join(f.output, 'src/unrelated.ts'), 'utf8'), 'original baseline\n');
  assert.equal(fs.readFileSync(path.join(f.output, 'src/access-entry.ts'), 'utf8'), 'explicit access source\n');
  assert.deepEqual(fs.readFileSync(path.join(f.output, 'public/binary.png')), Buffer.from([0, 255, 10, 4]));
  assert.deepEqual(git(f.repo, ['status', '--porcelain=v1', '-uall']), before);
  assert.equal(git(f.repo, ['diff', '--cached', '--name-only']).length, 0);
  const config = fs.readFileSync(path.join(f.output, f.selection.projections[0]), 'utf8');
  assert.ok(config.includes('ACCESS_REGISTRATION_INTENTS'));
  assert.ok(!config.includes('LOCATION_LATEST'));
  const localeName = 'public/i18n/zh_cn/zh_cn.json';
  const locale = JSON.parse(fs.readFileSync(path.join(f.output, localeName), 'utf8'));
  const base = JSON.parse(git(f.repo, ['show', `HEAD:${localeName}`]).toString());
  assert.deepEqual(locale.PROFILE, base.PROFILE);
  assert.ok(locale.DEVICE_GUIDE.BLE_REGISTRATION_TITLE);
  assert.equal(result.compiled, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.output, 'access-source-report.json'))), result);
});

test('selection rejects duplicate, unsafe, private and unreviewed projection paths', () => {
  const selection = { ...reviewed, baseline: [...reviewed.baseline], access: [...reviewed.access] };
  assert.throws(() => validateSelection({ ...selection, access: [...selection.access, selection.baseline[0]] }), /Repeated/);
  for (const name of ['../outside.ts', 'src/secret.key', 'src/line\nnext.ts', 'node_modules/fake.js']) {
    assert.throws(() => validateSelection({ ...selection, access: [name] }), /Unsafe|Private|Outside/);
  }
  assert.throws(() => validateSelection({ ...selection, projections: [] }), /Exact API/);
});

test('selected provisioning consumers retain their eight sealed-install and rekey baseline imports', () => {
  const directory = 'src/app/core/device-v2/provisioning/';
  const page = 'src/app/tools/esp32-provision/esp32-provision.page.ts';
  const pairs = [
    [page, 'wifiprov-sealed-allocation'],
    [page, 'wifiprov-sealed-installation-contract'],
    [page, 'wifiprov-rekey-coordinator'],
    [page, 'wifiprov-rekey-gateway'],
    [page, 'wifiprov-rekey-journal'],
    [page, 'wifiprov-rekey-wire'],
    [directory + 'wifiprov-allocation-store.ts', 'wifiprov-sealed-installation-store'],
    [directory + 'wifiprov-rekey-journal.ts', 'wifiprov-rekey-checkpoint'],
  ];
  const missing = [];
  for (const [consumer, module] of pairs) {
    const dependency = directory + module + '.ts';
    const source = fs.readFileSync(path.join(app, consumer), 'utf8');
    const specifier = consumer === page ? 'src/app/core/device-v2/provisioning/' + module : './' + module;
    assert.ok(source.includes("from '" + specifier + "'"), consumer + ' must retain the reviewed static import');
    assert.ok(fs.existsSync(path.join(app, dependency)), 'Expected reviewed source: ' + dependency);
    if (!reviewed.baseline.includes(dependency)) missing.push(dependency);
  }
  assert.deepEqual(missing, [], 'Static imports must not disappear from the isolated baseline projection');
  assert.ok(reviewed.baseline.includes(page));
  assert.ok(reviewed.baseline.includes(directory + 'wifiprov-allocation-store.ts'));
});

test('ref drift and existing or source-directory outputs fail before writing', t => {
  const f = fixture(t);
  assert.throws(() => prepareAccessSources(f.repo, f.output, { ...f.selection, baseCommit: '0'.repeat(40) }), /HEAD changed/);
  assert.throws(() => prepareAccessSources(f.repo, f.repo, f.selection), /Output must/);
  assert.throws(() => prepareAccessSources(f.repo, path.join(f.repo, 'src/new'), f.selection), /Output must/);
  assert.throws(() => prepareAccessSources(f.repo, f.temp, f.selection), /Output must/);
  assert.equal(fs.existsSync(f.output), false);
  fs.mkdirSync(f.output, { recursive: true });
  assert.throws(() => prepareAccessSources(f.repo, f.output, f.selection), /Output must not exist/);
  assert.deepEqual(fs.readdirSync(f.output), []);
});

test('a missing selected input never creates a successful or partial candidate', t => {
  const f = fixture(t); fs.unlinkSync(path.join(f.repo, 'src/access-entry.ts'));
  assert.throws(() => prepareAccessSources(f.repo, f.output, f.selection), /ENOENT/);
  assert.equal(fs.existsSync(f.output), false);
});

test('source and output ancestor junctions are rejected', t => {
  const f = fixture(t), outside = path.join(f.temp, 'outside'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'access-entry.ts'), 'outside');
  fs.symlinkSync(outside, path.join(f.repo, 'src/link'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => prepareAccessSources(f.repo, f.output, { ...f.selection, access: ['src/link/access-entry.ts'] }), /links/);
  fs.mkdirSync(path.join(f.repo, 'build'));
  fs.symlinkSync(outside, path.join(f.repo, 'build/output-link'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => prepareAccessSources(f.repo, path.join(f.repo, 'build/output-link/candidate'), f.selection), /links/);
  assert.equal(fs.existsSync(path.join(outside, 'candidate')), false);
});

test('Git tree paths keep the complete filename and reject TAB/newline instead of truncating it', () => {
  const prefix = '100644 blob ' + 'a'.repeat(40) + '\t';
  assert.deepEqual(parseTreeRecord(prefix + 'src/ordinary.ts'), { mode: '100644', name: 'src/ordinary.ts' });
  for (const name of ['src/ordinary.ts\tignored.ts', 'src/ordinary.ts\nnext.ts', '../outside.ts']) {
    assert.throws(() => parseTreeRecord(prefix + name), /Unsafe/);
  }
});

test('only explicitly ignored App build output is allowed, never a sibling source repository', t => {
  const f = fixture(t);
  assert.throws(() => prepareAccessSources(f.repo, path.join(f.temp, 'capacitor-wifiprov/new-source'), f.selection), /ignored App build/);
  f.put('.gitignore', '');
  assert.throws(() => prepareAccessSources(f.repo, f.output, f.selection), /must be Git ignored/);
  assert.equal(fs.existsSync(f.output), false);
});
