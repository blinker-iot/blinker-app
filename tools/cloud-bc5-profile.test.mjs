import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import ts from 'typescript';
import { bc5Profile, cloudBetaEnvironment, readBc5Admission, readInitialNetworkAdmission, verifyNativeInputs } from './sync-cloud-beta.mjs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const compiled = ts.transpileModule(read('capacitor.config.ts'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const evaluate = env => {
  const sandbox = { exports: {}, process: { env }, require: name => {
    assert.equal(name, './tools/sync-cloud-beta.mjs');
    return { bc5Profile, readBc5Admission, readInitialNetworkAdmission };
  } };
  vm.runInNewContext(compiled, sandbox);
  return sandbox.exports.default;
};
const registry = [
  { pkg: '@aparajita/capacitor-secure-storage', classpath: 'SecureStorage' },
  { pkg: 'capacitor-wifiprov', classpath: 'com.wifiprov.capacitor.WiFiProvPlugin' },
];
const admission = { origin: 'https://bc5.example.test:8443', ownerUserId: 'candidate-owner', tenantId: 'candidate-tenant',
  region: 'Development', intentId: Buffer.alloc(16, 4).toString('base64url'), sourceLogicalDeviceId: 'candidate-ble-source', expiresAt: 1700000000000 };

test('candidate web traffic uses the same explicit private origin without changing ordinary Beta', () => {
  const source = ts.transpileModule(read('src/environments/environment.cloud-beta.ts'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const base = { gatewayBaseUrl: 'https://ordinary.example.test', deployment: {} };
  const build = define => {
    const context = { exports: {}, require: () => ({ environment: base }), URL,
      ...(define === undefined ? {} : { BLINKER_BC5_GATEWAY_ORIGIN: define }) };
    vm.runInNewContext(source, context);
    return context.exports.environment.gatewayBaseUrl;
  };
  assert.equal(build(), base.gatewayBaseUrl);
  assert.equal(build(admission.origin), admission.origin);
  for (const invalid of ['http://private.example.test', 'https://private.example.test/path', 'https://user@private.example.test'])
    assert.throws(() => build(invalid));
});

function candidateFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'blinker-bc5-profile-'));
  const path = join(directory, 'admission.json');
  t.after(() => { unlinkSync(path); rmdirSync(directory); });
  writeFileSync(path, JSON.stringify(admission));
  return { path, env: { BLINKER_BC5_CANDIDATE: '1', BLINKER_BC5_ADMISSION_FILE: path } };
}

function initialNetworkFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'blinker-initial-network-profile-'));
  const path = join(directory, 'admission.json');
  t.after(() => { unlinkSync(path); rmdirSync(directory); });
  const id = (value, size = 16) => Buffer.alloc(size, value).toString('base64url');
  const originalRecovery = { ...admission, sourceLogicalDeviceId: `ble_${id(3)}` };
  const operation = { contract: 'blinker.installed-key-initial-network.v1', operationId: id(5),
    sourceLogicalDeviceId: originalRecovery.sourceLogicalDeviceId, targetLogicalDeviceId: `device_${id(6)}`,
    expectedRoot: { deviceInstanceId: id(7), accessEpoch: 8, controllerId: id(9), credentialVersion: 10,
      adminFingerprint: id(11, 32) }, existingLocator: id(12), expiresAt: 1800000000000,
    origin: admission.origin, region: admission.region, tenantId: admission.tenantId, ownerUserId: admission.ownerUserId,
    cloudCredentialVersion: 1 };
  const value = { originalRecovery, operation };
  writeFileSync(path, JSON.stringify(value));
  return { path, value, env: { BLINKER_INITIAL_NETWORK_RECOVERY: '1', BLINKER_INITIAL_NETWORK_ADMISSION_FILE: path } };
}

function nativeLoaderEnvironment(selected) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/^BLINKER_(?:BC5_|INITIAL_NETWORK_|WIFIPROV_SEALED_FIRST_INSTALL$|LOCAL_CLEARTEXT$|DEBUG_NETWORK_CONFIG_DIR$)/i.test(name)) delete env[name];
  return { ...env, ...selected, BLINKER_APP_PROFILE: 'cloud-beta', BLINKER_LOCAL_CLEARTEXT: '', BLINKER_DEBUG_NETWORK_CONFIG_DIR: '' };
}

test('installed-Key initial-network recovery is an exclusive explicit beta profile with only its new native write scope', t => {
  const { env, value } = initialNetworkFixture(t);
  assert.equal(bc5Profile(env), 'initialNetworkAdmission');
  assert.throws(() => evaluate(env), /explicit cloud beta profile/);
  const selected = evaluate(cloudBetaEnvironment(env));
  assert.equal(selected.plugins.WiFiProv.initialCloudWifiCandidate, true);
  assert.deepEqual(Object.keys(selected.plugins.BlinkerBc5Checkpoint), ['initialNetworkAdmission']);
  assert.deepEqual(selected.plugins.BlinkerBc5Checkpoint.initialNetworkAdmission, value);
  verifyNativeInputs(selected, registry, 'initialNetworkAdmission', value);
  assert.equal(selected.plugins.BlinkerWiFiProvAllocation, undefined);
  for (const conflicting of [
    { BLINKER_BC5_CANDIDATE: '1' }, { BLINKER_BC5_RECOVERY: '1' },
    { BLINKER_WIFIPROV_SEALED_FIRST_INSTALL: '1' }, { BLINKER_INITIAL_NETWORK_RECOVERY: 'enabled' },
    { BLINKER_BC5_ADMISSION_FILE: 'unexpected-old-file' },
  ]) {
    assert.throws(() => cloudBetaEnvironment({ ...env, ...conflicting }));
    assert.throws(() => evaluate({ ...env, ...conflicting, BLINKER_APP_PROFILE: 'cloud-beta' }));
  }
  assert.throws(() => verifyNativeInputs(selected, registry));
  assert.throws(() => verifyNativeInputs(selected, registry, 'admission', value.originalRecovery));
  assert.throws(() => verifyNativeInputs(selected, registry.slice(0, 1), 'initialNetworkAdmission', value));
  assert.throws(() => verifyNativeInputs({ ...selected, plugins: { ...selected.plugins,
    WiFiProv: { initialCloudWifiCandidate: false } } }, registry, 'initialNetworkAdmission', value));
  assert.throws(() => verifyNativeInputs({ ...selected, plugins: { ...selected.plugins,
    BlinkerBc5Checkpoint: { initialNetworkAdmission: value, admission: value.originalRecovery } } }, registry, 'initialNetworkAdmission', value));
  assert.throws(() => cloudBetaEnvironment({ BLINKER_INITIAL_NETWORK_ADMISSION_FILE: env.BLINKER_INITIAL_NETWORK_ADMISSION_FILE }));
  assert.throws(() => evaluate({ BLINKER_INITIAL_NETWORK_ADMISSION_FILE: env.BLINKER_INITIAL_NETWORK_ADMISSION_FILE }));
  assert.equal(evaluate(cloudBetaEnvironment({ BLINKER_INITIAL_NETWORK_RECOVERY: '0' })).plugins.BlinkerBc5Checkpoint, undefined);
});

test('network-only profile requires exact non-secret metadata and a new operation bound to the old read scope', t => {
  const { path, env, value } = initialNetworkFixture(t);
  assert.throws(() => readInitialNetworkAdmission('relative.json'), /explicit local file/);
  assert.throws(() => cloudBetaEnvironment({ BLINKER_INITIAL_NETWORK_RECOVERY: '1' }), /explicit local file/);
  for (const changed of [
    { ...value, token: 'forbidden' },
    { ...value, operation: { ...value.operation, secret: 'forbidden' } },
    { ...value, originalRecovery: { ...value.originalRecovery, receipt: 'forbidden' } },
    ...[
      { operationId: value.originalRecovery.intentId }, { operationId: Buffer.alloc(16).toString('base64url') },
      { operationId: `${value.operation.operationId}=` }, { cloudCredentialVersion: 0 }, { existingLocator: 'bad' },
      { locator: value.operation.existingLocator }, { ownerUserId: 'another-owner' }, { region: 'Global' },
      { origin: 'http://network.example.test' }, { origin: 'https://network.example.test/path' },
      { sourceLogicalDeviceId: `ble_${Buffer.alloc(16, 9).toString('base64url')}` },
      { targetLogicalDeviceId: value.operation.sourceLogicalDeviceId }, { targetLogicalDeviceId: 'arbitrary-routing-text' },
      { expectedRoot: { ...value.operation.expectedRoot, cloudCredentialVersion: 1 } },
      { expectedRoot: { ...value.operation.expectedRoot, credentialVersion: 0 } },
      { expectedRoot: { ...value.operation.expectedRoot, adminFingerprint: Buffer.alloc(32).toString('base64url') } },
    ].map(operation => ({ ...value, operation: { ...value.operation, ...operation } })),
  ]) {
    writeFileSync(path, JSON.stringify(changed));
    assert.throws(() => cloudBetaEnvironment(env), /Initial network recovery requires an exact non-secret admission/);
  }
  writeFileSync(path, ' '.repeat(4097));
  assert.throws(() => readInitialNetworkAdmission(path), /explicit local file/);
});

test('BC-5 native candidate is off by default and allowed only in explicit HTTPS beta', t => {
  const { env: explicitCandidate } = candidateFixture(t);
  for (const env of [{}, cloudBetaEnvironment({}), cloudBetaEnvironment({ BLINKER_BC5_CANDIDATE: '0' })]) {
    assert.equal(evaluate(env).plugins.WiFiProv, undefined);
  }
  assert.throws(() => evaluate(explicitCandidate), /explicit cloud beta profile/);
  const selected = evaluate(cloudBetaEnvironment(explicitCandidate));
  assert.equal(selected.appId, 'iot.diandeng.tech.beta');
  assert.equal(selected.loggingBehavior, 'none');
  assert.equal(selected.server.androidScheme, 'https');
  assert.equal(selected.server.cleartext, false);
  assert.equal(selected.plugins.WiFiProv.initialCloudWifiCandidate, true);
  assert.deepEqual(selected.plugins.BlinkerBc5Checkpoint.admission, admission);
  for (const value of ['true', 'enabled', '']) {
    assert.throws(() => cloudBetaEnvironment({ BLINKER_BC5_CANDIDATE: value }));
  }
  for (const env of [{ BLINKER_LOCAL_CLEARTEXT: '1' }, { BLINKER_DEBUG_NETWORK_CONFIG_DIR: 'not-allowed' }]) {
    assert.throws(() => cloudBetaEnvironment({ ...explicitCandidate, ...env }));
    assert.throws(() => evaluate({ BLINKER_APP_PROFILE: 'cloud-beta', ...explicitCandidate, ...env }));
  }
});

test('candidate sync requires exact WiFiProv registration and rejects stale generated assets both ways', t => {
  const { env: explicitCandidate } = candidateFixture(t);
  const selected = evaluate(cloudBetaEnvironment(explicitCandidate));
  const ordinary = evaluate(cloudBetaEnvironment({}));
  verifyNativeInputs(selected, registry, 'admission', admission);
  verifyNativeInputs(ordinary, registry);
  assert.throws(() => verifyNativeInputs(selected, registry));
  assert.throws(() => verifyNativeInputs(ordinary, registry, 'admission', admission));
  assert.throws(() => verifyNativeInputs(selected, registry.slice(0, 1), 'admission', admission));
  assert.throws(() => verifyNativeInputs(selected, [registry[0], { ...registry[1], classpath: 'Other' }], 'admission', admission));
  assert.throws(() => verifyNativeInputs({ ...selected, plugins: { WiFiProv: { initialCloudWifiCandidate: 'true' } } }, registry, 'admission', admission));
  assert.throws(() => verifyNativeInputs(selected, registry, 'admission', { ...admission, sourceLogicalDeviceId: 'other-source' }));
  assert.throws(() => verifyNativeInputs({ ...ordinary, plugins: { BlinkerBc5Checkpoint: { admission } } }, registry));
});

test('recovery packages only an explicit, read-only beta profile and rejects mixed or stale inputs', t => {
  const { path, env } = candidateFixture(t);
  const recovery = { BLINKER_BC5_RECOVERY: '1', BLINKER_BC5_ADMISSION_FILE: path };
  const selected = evaluate(cloudBetaEnvironment(recovery));
  const ordinary = evaluate(cloudBetaEnvironment({}));
  assert.equal(selected.plugins.WiFiProv, undefined);
  assert.deepEqual(Object.keys(selected.plugins.BlinkerBc5Checkpoint), ['recoveryAdmission']);
  assert.deepEqual(selected.plugins.BlinkerBc5Checkpoint.recoveryAdmission, admission);
  verifyNativeInputs(selected, registry, 'recoveryAdmission', admission);
  assert.throws(() => evaluate(recovery), /explicit cloud beta profile/);
  for (const invalid of [{ ...env, ...recovery }, { ...recovery, BLINKER_WIFIPROV_SEALED_FIRST_INSTALL: '1' },
    { ...recovery, BLINKER_BC5_RECOVERY: 'true' }, { BLINKER_BC5_RECOVERY: '1' }]) {
    assert.throws(() => cloudBetaEnvironment(invalid));
    assert.throws(() => evaluate({ ...invalid, BLINKER_APP_PROFILE: 'cloud-beta' }));
  }
  assert.throws(() => verifyNativeInputs(selected, registry));
  assert.throws(() => verifyNativeInputs(ordinary, registry, 'recoveryAdmission', admission));
  assert.throws(() => verifyNativeInputs(selected, registry, 'admission', admission));
  assert.throws(() => verifyNativeInputs(selected, registry, 'recoveryAdmission', { ...admission, intentId: Buffer.alloc(16, 1).toString('base64url') }));
  for (const invalid of [
    { ...selected.plugins, WiFiProv: { initialCloudWifiCandidate: true } },
    { ...selected.plugins, BlinkerBc5Checkpoint: { admission, recoveryAdmission: admission } },
    { ...selected.plugins, BlinkerWiFiProvAllocation: { enabled: true } },
  ]) assert.throws(() => verifyNativeInputs({ ...selected, plugins: invalid }, registry, 'recoveryAdmission', admission));
});

test('BC-5 admission is explicit, bounded, and cannot carry credentials or an operator-supplied request URL', t => {
  const { path, env } = candidateFixture(t);
  assert.throws(() => cloudBetaEnvironment({ BLINKER_BC5_CANDIDATE: '1' }), /explicit local file/);
  assert.throws(() => cloudBetaEnvironment({ BLINKER_BC5_ADMISSION_FILE: path }), /explicit local file/);
  assert.throws(() => evaluate({ BLINKER_BC5_ADMISSION_FILE: path }), /only permitted/);
  assert.throws(() => readBc5Admission('relative.json'), /explicit local file/);
  for (const invalid of [{ ...admission, token: 'unexpected-secret' }, { ...admission, ownerUserId: undefined },
    { ...admission, origin: 'http://bc5.example.test' }, { ...admission, origin: 'https://user@bc5.example.test' },
    { ...admission, origin: admission.origin + '/path' }, { ...admission, origin: admission.origin + '?x=y' },
    { ...admission, origin: 'https://bc5.example.test:0' }, { ...admission, region: 'Other' },
    { ...admission, intentId: Buffer.alloc(16).toString('base64url') }, { ...admission, expiresAt: '1700000000000' },
    { ...admission, ownerUserId: 'a'.repeat(2100) }]) {
    writeFileSync(path, JSON.stringify(invalid));
    assert.throws(() => cloudBetaEnvironment(env), error => error.message === 'BC-5 requires an exact non-secret admission in an explicit local file');
  }
});

test('the pinned Capacitor loader resolves the host-only admission reader for the explicit candidate', t => {
  const { env } = candidateFixture(t);
  for (const [profile, selected] of [['admission', env], ['recoveryAdmission', {
    ...env, BLINKER_BC5_CANDIDATE: '0', BLINKER_BC5_RECOVERY: '1',
  }]]) {
    const result = spawnSync(process.execPath, ['-e', `
      const { requireTS } = require('./node_modules/@capacitor/cli/dist/util/node.js');
      requireTS(require('typescript'), 'capacitor.config.ts').then(({ default: config }) => {
        if (config.appId !== 'iot.diandeng.tech.beta' || !config.plugins.BlinkerBc5Checkpoint.${profile}.intentId) process.exitCode = 1;
      }).catch(() => { process.exitCode = 2; });
    `], { cwd: new URL('../', import.meta.url), env: nativeLoaderEnvironment(selected) });
    assert.equal(result.status, 0);
  }
});

test('the pinned Capacitor loader resolves the independent network recovery input without opening install admission', t => {
  const { env } = initialNetworkFixture(t);
  const result = spawnSync(process.execPath, ['-e', `
    const { requireTS } = require('./node_modules/@capacitor/cli/dist/util/node.js');
    requireTS(require('typescript'), 'capacitor.config.ts').then(({ default: config }) => {
      const checkpoint = config.plugins.BlinkerBc5Checkpoint;
      if (config.appId !== 'iot.diandeng.tech.beta' || !config.plugins.WiFiProv.initialCloudWifiCandidate ||
          Object.keys(checkpoint).join() !== 'initialNetworkAdmission' || !checkpoint.initialNetworkAdmission.operation.operationId)
        process.exitCode = 1;
    }).catch(() => { process.exitCode = 2; });
  `], { cwd: new URL('../', import.meta.url), env: nativeLoaderEnvironment(env) });
  assert.equal(result.status, 0);
});

test('install and recovery are distinct exact routes with native-only guards and no tools-page entry', () => {
  const routes = read('src/app/app.routes.ts');
  assert.match(routes, /path: 'tools\/bc5-acceptance',\s*pathMatch: 'full',[\s\S]*?readBc5LaunchProfile\(\)[\s\S]*?m\.Bc5AcceptancePage/);
  assert.match(routes, /path: 'tools\/bc5-acceptance\/recovery',\s*pathMatch: 'full',[\s\S]*?readBc5RecoveryProfile\(\)[\s\S]*?m\.Bc5RecoveryPage/);
  for (const file of ['tab-tools.ts', 'tab-tools.html', 'tool-navigation.ts']) {
    assert.doesNotMatch(read('src/app/home/components/tab-tools/' + file), /bc5-acceptance|bc5-recovery/);
  }
});

test('the source-only diagnostic build replaces the private recovery route component without adding a route', () => {
  const routes = read('src/app/app.routes.ts');
  const compile = define => transformSync(routes, { loader: 'ts', minifySyntax: true,
    define: { BLINKER_BC5_SOURCE_DIAGNOSTIC: define } }).code;
  assert.match(compile('false'), /bc5-recovery\.page/);
  assert.doesNotMatch(compile('false'), /bc5-source-diagnostic\.page/);
  const diagnostic = compile('true');
  assert.match(diagnostic, /readBc5RecoveryProfile/);
  assert.match(diagnostic, /bc5-source-diagnostic\.page/);
  assert.doesNotMatch(diagnostic, /bc5-recovery\.page/);
  assert.equal([...diagnostic.matchAll(/path: "tools\/bc5-acceptance\/recovery"/g)].length, 1);
  const page = read('src/app/tools/bc5-acceptance/bc5-source-diagnostic.page.ts');
  assert.match(page, /this\.ble\.diagnoseBc5SourcePresence\(profile, owner\.signal\)/);
  assert.doesNotMatch(page, /restoreCommittedBc5PresenceAlias|recoverBc5Acceptance|runBc5Acceptance/);
});

test('ordinary debug and release builds cannot consume leftover private beta assets', () => {
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /if \(name == 'preBetaBuild'\) dependsOn 'verifyCloudBetaConfig'/);
  assert.match(gradle, /if \(name == 'preDebugBuild' \|\| name == 'preReleaseBuild'\) dependsOn 'verifyBc5CandidateDisabled'/);
  assert.match(gradle, /bc5AssetProfile\(config\) != profile/);
  assert.match(gradle, /config\.plugins\.BlinkerBc5Checkpoint\[profile\] != admission/);
  assert.match(gradle, /bc5AdmissionInput\(null\)/);
  assert.match(gradle, /bc5ProfileRequested\(\) \|\| \(asset\.isFile\(\) && bc5AssetProfile/);
});

test('explicit beta modes share only the checkpoint read; recovery cannot mutate it', () => {
  const java = 'android/app/src/main/java/iot/diandeng/tech/';
  assert.match(read(java + 'MainActivity.java'),
    /if \(BlinkerBc5CheckpointPlugin\.enabled\(this\)\) registerPlugin\(BlinkerBc5CheckpointPlugin\.class\)/);
  const native = read(java + 'bc5/BlinkerBc5CheckpointPlugin.java');
  assert.match(native, /BETA_PACKAGE\.equals\(context\.getPackageName\(\)\)/);
  assert.match(native, /boolean recovery = network \|\| !Boolean\.TRUE\.equals\(installFlag\)/);
  assert.match(native, /checkpoint\.getJSONObject\(recovery \? "recoveryAdmission" : "admission"\)/);
  assert.match(native, /profile\.isRecovery\(\) != recovery/);
  assert.match(native, /profile\.isRecovery\(\) && \(!profile\.recoveryScope\.equals\(scope\) \|\| !profile\.admission\.optString\("intentId"\)\.equals\(intent\)\)/);
  assert.match(native, /compareAndSet\(PluginCall call\)[\s\S]*?profile == null \|\| \(profile\.isRecovery\(\) && profile\.networkAccess == null\)[\s\S]*?store\(getContext\(\)\)\.compareAndSet/);
  assert.match(native, /profile\.networkAccess != null && \(!profile\.networkAccess\.permitsWrite/);
  assert.match(native, /profile\.networkAccess != null \? !profile\.networkAccess\.permitsRead/);
  assert.match(native, /getSharedPreferences\("blinker\.bc5-install", Context\.MODE_PRIVATE\)/);
  const beta = 'android/app/src/beta/';
  const manifest = read(beta + 'AndroidManifest.xml');
  assert.match(manifest, /android:fullBackupContent="@xml\/bc5_backup_rules"/);
  assert.match(manifest, /android:dataExtractionRules="@xml\/bc5_data_extraction_rules"/);
  for (const [file, count] of [['bc5_backup_rules', 1], ['bc5_data_extraction_rules', 2]]) {
    const rules = read(`${beta}res/xml/${file}.xml`);
    const entries = [...rules.matchAll(/<(?:include|exclude)\b[^>]+>/g)].map(([tag]) => tag);
    assert.deepEqual(entries, Array(count).fill('<exclude domain="sharedpref" path="blinker.bc5-install.xml" />'));
  }
});
