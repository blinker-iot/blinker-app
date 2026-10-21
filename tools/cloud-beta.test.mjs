import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { cloudBetaEnvironment, verifyNativeInputs } from './sync-cloud-beta.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const beta = { appId: 'iot.diandeng.tech.beta', loggingBehavior: 'none',
  server: { androidScheme: 'https', cleartext: false } };
const plugins = [{ pkg: '@aparajita/capacitor-secure-storage', classpath: 'SecureStorage' }];

test('cloud beta has an explicit production Web build followed by official native sync', () => {
  const pkg = JSON.parse(read('package.json'));
  const angular = JSON.parse(read('angular.json'));
  assert.equal(pkg.scripts['build:cloud-beta'], 'ng build app --configuration production,cloud-beta');
  assert.equal(pkg.scripts['prebuild:cloud-beta'], 'pnpm run prebuild');
  assert.equal(pkg.scripts['sync:cloud-beta'], 'pnpm run build:cloud-beta && node tools/sync-cloud-beta.mjs');
  assert.equal(angular.projects.app.architect.build.configurations['cloud-beta']
    .fileReplacements[0].with, 'src/environments/environment.cloud-beta.ts');
});

test('the actual beta opens only automation and Task routes without mutating production', () => {
  const production = { production: true, gatewayBaseUrl: 'https://iot.yiyu.pro', deployment: Object.freeze({
    notifications: false, messages: false, tasks: false, automation: false,
    directAccess: false, directedSharing: false, consoleLinks: false,
  }) };
  const compiled = ts.transpileModule(read('src/environments/environment.cloud-beta.ts'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const sandbox = { exports: {}, require: name => {
    assert.equal(name, './environment.prod');
    return { environment: production };
  } };
  vm.runInNewContext(compiled, sandbox);
  const selected = JSON.parse(JSON.stringify(sandbox.exports.environment));
  assert.deepEqual(selected, { ...production, deployment: { ...production.deployment, automation: true, tasks: true } });
  assert.equal(production.deployment.automation, false);
  assert.equal(production.deployment.tasks, false);
});

test('the existing panel packer declares its direct build dependency from the lock', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.devDependencies.esbuild, '0.28.2');
  assert.match(read('tools/custom-panel/pack.mjs'), /from 'esbuild'/);
  assert.match(read('pnpm-lock.yaml'), /      esbuild:\r?\n        specifier: 0\.28\.2\r?\n        version: 0\.28\.2/);
});

test('profile selection preserves the caller environment and rejects local trust', () => {
  const env = { KEEP: 'unchanged' };
  assert.deepEqual(cloudBetaEnvironment(env), { KEEP: 'unchanged', BLINKER_APP_PROFILE: 'cloud-beta' });
  assert.deepEqual(env, { KEEP: 'unchanged' });
  for (const invalid of [{ BLINKER_APP_PROFILE: 'other' }, { BLINKER_LOCAL_CLEARTEXT: '1' },
    { BLINKER_DEBUG_NETWORK_CONFIG_DIR: '/local-ca' }]) {
    assert.throws(() => cloudBetaEnvironment(invalid));
  }
});

test('actual Capacitor config selects a parallel package with HTTPS and no argument logging', () => {
  const compiled = ts.transpileModule(read('capacitor.config.ts'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  function config(env) {
    const sandbox = { exports: {}, process: { env }, require: () => ({}) };
    vm.runInNewContext(compiled, sandbox);
    return sandbox.exports.default;
  }
  assert.equal(config({}).appId, 'iot.diandeng.tech');
  const selected = config(cloudBetaEnvironment({}));
  verifyNativeInputs(selected, plugins);
  assert.equal(selected.appName, 'Blinker 内测');
  assert.throws(() => config({ BLINKER_APP_PROFILE: 'cloud-beta', BLINKER_LOCAL_CLEARTEXT: '1' }));
  assert.throws(() => config({ BLINKER_APP_PROFILE: 'unknown' }));
});

test('native gate rejects missing registration, wrong package, remote server and insecure origin', () => {
  verifyNativeInputs(beta, plugins);
  for (const config of [{ ...beta, appId: 'iot.diandeng.tech.debug' },
    { ...beta, loggingBehavior: 'debug' }, { ...beta, server: { androidScheme: 'http', cleartext: true } },
    { ...beta, server: { ...beta.server, url: 'https://example.com' } }]) {
    assert.throws(() => verifyNativeInputs(config, plugins));
  }
  for (const registry of [null, [], [{ ...plugins[0], classpath: '' }]]) {
    assert.throws(() => verifyNativeInputs(beta, registry));
  }
});

test('Android beta stays separate from debug local trust and has a guarded native registry', () => {
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /beta\s*\{\s*initWith debug\s*applicationIdSuffix "\.beta"/);
  assert.match(gradle, /name == 'preBetaBuild'.*verifyCloudBetaConfig/);
  assert.match(gradle, /android\.sourceSets\.debug\.manifest/);
  assert.doesNotMatch(gradle, /android\.sourceSets\.beta/);
  assert.match(read('android/app/src/beta/AndroidManifest.xml'), /usesCleartextTraffic="false"/);
});
