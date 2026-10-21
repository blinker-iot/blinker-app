import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { APP_FILES, APP_TREES, PLUGIN_FILES, PLUGINS, REBUILD_CONFIGURATIONS,
  checkLocks, exportSource, inventory, rebuild, rebuildEnvironment, verifySource } from './source-handoff.mjs';

const git = process.env.BLINKER_TEST_GIT ?? 'git';

test('rebuild preserves default HTTPS origin and rejects ambient debug/CA settings without changing the caller', () => {
  const inherited = { Path: 'external-tools', JAVA_HOME: 'jdk', ANDROID_HOME: 'sdk',
    BLINKER_LOCAL_CLEARTEXT: '1', blinker_debug_network_config_dir: 'private-ca', NODE_OPTIONS: '--require private.js' };
  const env = rebuildEnvironment(inherited);
  assert.equal(env.JAVA_HOME, 'jdk');
  assert.equal(env.ANDROID_HOME, 'sdk');
  assert.ok(env.Path.endsWith(path.delimiter + 'external-tools'));
  assert.ok(!Object.keys(env).some(key => /^BLINKER_|^NODE_OPTIONS$/i.test(key)));
  assert.equal(inherited.BLINKER_LOCAL_CLEARTEXT, '1');
  assert.equal(inherited.NODE_OPTIONS, '--require private.js');
});
function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blinker-source-test-'));
  t.after(() => {
    assert.equal(path.dirname(temp), os.tmpdir());
    assert.ok(path.basename(temp).startsWith('blinker-source-test-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const workspace = path.join(temp, 'workspace'); fs.mkdirSync(workspace);
  const put = (name, relative, value) => {
    const file = path.join(workspace, name, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
    return file;
  };
  for (const name of ['blinker-app', ...PLUGINS]) {
    const dir = path.join(workspace, name);
    for (const file of name === 'blinker-app' ? APP_FILES : PLUGIN_FILES) put(name, file, 'fixture');
    for (const tree of name === 'blinker-app' ? APP_TREES : ['src', 'android/src']) put(name, `${tree}/fixture.txt`, 'source');
    const dependencies = name === 'blinker-app' ? Object.fromEntries(PLUGINS.map(p => [p, `file:../${p}`])) : {};
    put(name, 'package.json', { name, dependencies, ...(name === 'blinker-app' ? { packageManager: 'pnpm@11.19.0' } : {}) });
    if (name === 'blinker-app') {
      put(name, 'pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
      put(name, 'pnpm-workspace.yaml', 'packages:\n  - device-template\n');
      put(name, 'device-template/package.json', { name: '@blinker/device-template' });
    } else put(name, 'package-lock.json', { lockfileVersion: 3, packages: { '': { dependencies } } });
    for (const args of [['init', '--quiet'], ['-c', 'user.name=Source Test', '-c', 'user.email=test@example.invalid',
      'commit', '--allow-empty', '--quiet', '-m', 'fixture']]) {
      assert.equal(spawnSync(git, ['-C', dir, ...args], { windowsHide: true }).status, 0);
    }
  }
  const bundle = path.join(temp, 'bundle'), app = path.join(workspace, 'blinker-app');
  const create = () => exportSource(app, bundle, git);
  return { temp, workspace, app, bundle, put, create };
}

test('six-source closure includes untracked inputs but no caches, signing material or generated native paths', t => {
  const f = fixture(t);
  f.put('blinker-app', 'src/new-feature.ts', 'new source');
  for (const file of ['blinker.jks', 'blinker.jks.txt', '.env', 'node_modules/fake.js', 'www/app.js',
    'android/local.properties', 'android/capacitor.settings.gradle',
    'android/app/src/main/assets/capacitor.config.json', 'android/app/src/main/assets/public/app.js',
    'public/custom-panel-runtime/runtime.json', 'public/custom-panel-runtime/atoms.json',
    'public/custom-panel-runtime/template.html']) f.put('blinker-app', file, 'private/generated');
  f.put('capacitor-ntfy', 'dist/plugin.js', 'old dist');
  const m = f.create();
  assert.equal(Object.keys(m.provenance).length, 6);
  assert.ok(m.files['blinker-app/src/new-feature.ts']);
  assert.ok(m.files['blinker-app/tests/fixtures/time_sync_golden_vectors.properties']);
  for (const file of ['tools/sync-cloud-beta.mjs', 'tools/cloud-beta.test.mjs',
    'tools/custom-panel/pack.mjs']) {
    assert.ok(m.files[`blinker-app/${file}`]);
  }
  assert.ok(!Object.keys(m.files).some(name => /private|node_modules|\.jks|\.env|\/dist\/|capacitor\.settings/.test(name)));
  assert.ok(!Object.keys(m.files).some(name => name.startsWith('blinker-app/public/custom-panel-runtime/')));
  assert.deepEqual(verifySource(f.bundle), m);
  assert.throws(() => f.create(), /must not exist/);
});

test('package/lock drift and missing fifth plugin fail before export', t => {
  const f = fixture(t);
  const file = path.join(f.workspace, 'capacitor-wechat/package-lock.json'), before = fs.readFileSync(file);
  const lock = JSON.parse(before); lock.packages[''].dependencies['unexpected'] = '^1';
  fs.writeFileSync(file, JSON.stringify(lock));
  assert.throws(f.create, /lock drift/);
  assert.equal(fs.existsSync(f.bundle), false);
  fs.writeFileSync(file, before);
  fs.renameSync(path.join(f.workspace, 'capacitor-wechat'), path.join(f.temp, 'moved-plugin'));
  assert.throws(() => checkLocks(f.workspace), /ENOENT/);
});

test('changed local link and hidden dev file dependency are not admitted', t => {
  const f = fixture(t);
  const packageFile = path.join(f.app, 'package.json'), pkg = JSON.parse(fs.readFileSync(packageFile));
  pkg.dependencies['capacitor-mdns'] = 'file:../../elsewhere';
  fs.writeFileSync(packageFile, JSON.stringify(pkg));
  assert.throws(f.create, /closure changed/);
  pkg.dependencies['capacitor-mdns'] = 'file:../capacitor-mdns';
  pkg.devDependencies = { hidden: 'file:../hidden' };
  fs.writeFileSync(packageFile, JSON.stringify(pkg));
  assert.throws(f.create, /closure changed/);
});

test('App uses one pnpm lock and an explicit tested manager; lock bytes are frozen in inventory', t => {
  const f = fixture(t);
  const packageFile = path.join(f.app, 'package.json'), before = fs.readFileSync(packageFile), pkg = JSON.parse(before);
  pkg.packageManager = 'pnpm@10'; fs.writeFileSync(packageFile, JSON.stringify(pkg));
  assert.throws(f.create, /tested pnpm/); fs.writeFileSync(packageFile, before);
  const npmLock = f.put('blinker-app', 'package-lock.json', '{}');
  assert.throws(f.create, /one install lock/); fs.unlinkSync(npmLock);
  const m = f.create();
  assert.equal(m.schema, 2);
  assert.ok(m.files['blinker-app/pnpm-lock.yaml']);
  assert.ok(!m.files['blinker-app/package-lock.json']);
  fs.appendFileSync(path.join(f.bundle, 'source/blinker-app/pnpm-lock.yaml'), '# changed\n');
  assert.throws(() => verifySource(f.bundle), /changed/);
});

test('private inputs inside selected source fail rather than silently disappear', t => {
  const f = fixture(t); f.put('capacitor-wifiprov', 'android/src/main/secret.key', 'private');
  assert.throws(f.create, /Private/);
  assert.equal(fs.existsSync(path.join(f.bundle, 'manifest.json')), false);
});

test('missing, modified, additional files and forged provenance fail verification', t => {
  const f = fixture(t); f.create();
  const file = path.join(f.bundle, 'source/blinker-app/src/fixture.txt'), original = fs.readFileSync(file);
  fs.writeFileSync(file, 'modified'); assert.throws(() => verifySource(f.bundle), /changed/);
  fs.unlinkSync(file); assert.throws(() => verifySource(f.bundle), /missing/);
  fs.writeFileSync(file, original);
  const extra = path.join(f.bundle, 'source/blinker-app/extra.txt');
  fs.writeFileSync(extra, 'extra'); assert.throws(() => verifySource(f.bundle), /unexpected/); fs.unlinkSync(extra);
  const manifestFile = path.join(f.bundle, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestFile));
  manifest.provenance['capacitor-wechat'].inputsSha256 = '0'.repeat(64);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  assert.throws(() => verifySource(f.bundle), /provenance drift/);
});

test('unsafe inventory paths and unexpected bundle files fail', t => {
  const f = fixture(t); f.create();
  const file = path.join(f.bundle, 'manifest.json'), before = fs.readFileSync(file), manifest = JSON.parse(before);
  manifest.files['../outside'] = '0'.repeat(64); fs.writeFileSync(file, JSON.stringify(manifest));
  assert.throws(() => verifySource(f.bundle), /Unsafe/); fs.writeFileSync(file, before);
  fs.writeFileSync(path.join(f.bundle, 'extra.json'), '{}');
  assert.throws(() => verifySource(f.bundle), /Unexpected bundle/);
});

test('source junctions are refused; verification does not follow an external directory', t => {
  const f = fixture(t), outside = path.join(f.temp, 'outside'); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.app, 'src/link'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(f.create, /symlinks/);
  assert.throws(() => inventory(f.app), /symlinks/);
});

test('rebuild rejects implicit profiles, overwrites and work inside frozen bundle without running installers', t => {
  const f = fixture(t); f.create();
  assert.throws(() => rebuild(f.bundle, path.join(f.temp, 'work'), ''), /configuration/);
  assert.throws(() => rebuild(f.bundle, f.app, 'production'), /new directory/);
  assert.throws(() => rebuild(f.bundle, path.join(f.bundle, 'work'), 'production'), /outside bundle/);
  assert.throws(() => exportSource(f.app, path.join(f.app, 'output'), git), /outside source/);
});

test('known builds preserve ordinary configurations and admit only the explicit local priority experiment', t => {
  assert.deepEqual(REBUILD_CONFIGURATIONS, ['production', 'local,local-device', 'local,ble-priority-test']);
  assert.ok(Object.isFrozen(REBUILD_CONFIGURATIONS));
  const f = fixture(t); f.create();
  // Reaching the existing-work check proves admission without starting installers.
  for (const configuration of REBUILD_CONFIGURATIONS) {
    assert.throws(() => rebuild(f.bundle, f.app, configuration), /new directory/);
  }
});

test('priority shortcuts, production mixes and arbitrary combinations fail before creating work', t => {
  const f = fixture(t); f.create();
  const work = path.join(f.temp, 'must-not-create');
  for (const configuration of ['ble-priority-test', 'production,ble-priority-test',
    'local,local-device,ble-priority-test', 'local,ble-priority-test,production', 'local,unknown', '']) {
    assert.throws(() => rebuild(f.bundle, work, configuration), /Explicit known Angular configuration required/);
    assert.equal(fs.existsSync(work), false);
  }
});
