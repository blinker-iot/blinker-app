import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { bc5Profile, cloudBetaEnvironment, verifyNativeInputs } from './sync-cloud-beta.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const beta = { appId: 'iot.diandeng.tech.beta', loggingBehavior: 'none',
  server: { androidScheme: 'https', cleartext: false } };
const plugins = [{ pkg: '@aparajita/capacitor-secure-storage', classpath: 'SecureStorage' }];
const cleanNetworkSecurityXml = xml => xml.replace(/^\uFEFF/, '')
  .replace(/^\s*<\?xml\s+[^?]*\?>\s*/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
// A deliberately narrow static resource contract, not a second runtime policy
// implementation: exactly one fixed AP domain and no trust/CA overrides.
const assertProvisioningCleartextScope = xml => assert.match(cleanNetworkSecurityXml(xml),
  /^<network-security-config>\s*<base-config\s+cleartextTrafficPermitted="false"\s*\/>\s*<domain-config\s+cleartextTrafficPermitted="true">\s*<domain\s+includeSubdomains="false">\s*192\.168\.4\.1\s*<\/domain>\s*<\/domain-config>\s*<\/network-security-config>$/);

test('cloud beta has an explicit production Web build followed by official native sync', () => {
  const pkg = JSON.parse(read('package.json'));
  const angular = JSON.parse(read('angular.json'));
  assert.equal(pkg.scripts['build:cloud-beta'], 'ng build app --configuration production,cloud-beta');
  assert.equal(pkg.scripts['prebuild:cloud-beta'], 'pnpm run prebuild');
  assert.equal(pkg.scripts['sync:cloud-beta'], 'pnpm run build:cloud-beta && node tools/sync-cloud-beta.mjs');
  assert.equal(angular.projects.app.architect.build.configurations['cloud-beta']
    .fileReplacements[0].with, 'src/environments/environment.cloud-beta.ts');
});

test('the actual beta opens automation, Task and Direct without mutating production', () => {
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
  assert.deepEqual(selected, { ...production, wifiProvSealedFirstInstall: false,
    deployment: { ...production.deployment, automation: true, tasks: true, directAccess: true } });
  assert.equal(production.deployment.automation, false);
  assert.equal(production.deployment.tasks, false);
  assert.equal(production.deployment.directAccess, false);
  const explicit = { ...sandbox, exports: {}, BLINKER_WIFIPROV_SEALED_FIRST_INSTALL: true };
  vm.runInNewContext(compiled, explicit);
  assert.equal(explicit.exports.environment.wifiProvSealedFirstInstall, true);
  assert.throws(() => vm.runInNewContext(compiled, { ...explicit, exports: {}, BLINKER_BC5_GATEWAY_ORIGIN: 'https://example.com', URL }));
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
    const sandbox = { exports: {}, process: { env }, require: () => ({ bc5Profile }) };
    vm.runInNewContext(compiled, sandbox);
    return sandbox.exports.default;
  }
  assert.equal(config({}).appId, 'iot.diandeng.tech');
  const selected = config(cloudBetaEnvironment({}));
  verifyNativeInputs(selected, plugins);
  const sealed = config(cloudBetaEnvironment({ BLINKER_WIFIPROV_SEALED_FIRST_INSTALL: '1' }));
  verifyNativeInputs(sealed, plugins, undefined, undefined, true);
  assert.throws(() => verifyNativeInputs(sealed, plugins));
  assert.throws(() => config({ BLINKER_WIFIPROV_SEALED_FIRST_INSTALL: '1' }));
  assert.throws(() => cloudBetaEnvironment({ BLINKER_WIFIPROV_SEALED_FIRST_INSTALL: '1', BLINKER_BC5_CANDIDATE: '1' }));
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

test('beta references the fixed provisioning-only network policy without enabling global cleartext', () => {
  const manifest = read('android/app/src/beta/AndroidManifest.xml');
  const application = manifest.match(/<application\b[^>]*>/)?.[0];
  assert(application, 'beta application overlay is required');
  assert.match(application, /android:usesCleartextTraffic="false"/);
  assert.match(application, /android:networkSecurityConfig="@xml\/wifiprov_network_security_config"/);
  const replaced = application.match(/tools:replace="([^"]+)"/)?.[1].split(',').map(value => value.trim());
  assert(replaced?.includes('android:usesCleartextTraffic'));
  assert(replaced?.includes('android:networkSecurityConfig'));
  assert.doesNotMatch(read('android/app/src/main/AndroidManifest.xml'), /wifiprov_network_security_config/);
  verifyNativeInputs(beta, plugins); // The Capacitor HTTPS/cleartext=false contract is unchanged.
});

test('provisioning cleartext policy admits only the exact AP, never Cloud, LAN ranges or CA overrides', () => {
  const xml = cleanNetworkSecurityXml(read('android/app/src/beta/res/xml/wifiprov_network_security_config.xml'));
  assertProvisioningCleartextScope(xml);
  for (const invalid of [
    xml.replace(/(<base-config\s+cleartextTrafficPermitted=)"false"/, '$1"true"'),
    xml.replace('includeSubdomains="false"', 'includeSubdomains="true"'),
    xml.replace('192.168.4.1', '*.192.168.4.1'),
    xml.replace('192.168.4.1', '192.168.0.0/16'),
    xml.replace('192.168.4.1', '192.168.1.1'),
    xml.replace('192.168.4.1', 'iot.yiyu.pro'),
    xml.replace('192.168.4.1', 'mqtt.yiyu.pro'),
    xml.replace('</domain-config>', '<domain includeSubdomains="false">192.168.1.2</domain></domain-config>'),
    xml.replace('</network-security-config>', '<domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">example.com</domain></domain-config></network-security-config>'),
    xml.replace('</network-security-config>', '<debug-overrides><trust-anchors><certificates src="user"/></trust-anchors></debug-overrides></network-security-config>'),
  ]) assert.throws(() => assertProvisioningCleartextScope(invalid));
});

test('maintained Geolocation keeps one registered plugin and fixed reviewed sources', () => {
  const settings = read('android/settings.gradle');
  assert(settings.indexOf("apply from: 'capacitor.settings.gradle'") < settings.indexOf("project(':capacitor-geolocation').projectDir"));
  const native = read('android/geolocation/build.gradle');
  assert.match(native, /version != '8\.2\.2'/);
  assert.doesNotMatch(native, /implementation.*io\.ionic\.libs:iongeolocation-android/);
  assert.match(read('tools/source-handoff.mjs'), /APP_TREES[^;]+android\/geolocation/);
  assert.match(read('android/geolocation/README.md'), /Default is off/);
});

test('system one-shot uses the existing owner without Google acquisition or another deadline', () => {
  const plugin = read('android/geolocation/src/main/kotlin/com/capacitorjs/plugins/geolocation/GeolocationPlugin.kt');
  const oneShot = plugin.slice(plugin.indexOf('private fun getPosition('), plugin.indexOf('private fun getJSObjectForSystemLocation('));
  assert.match(oneShot, /SystemLocationProvider\(/);
  assert(oneShot.indexOf('owner.linkCancellation') < oneShot.indexOf('provider.start()'));
  assert.doesNotMatch(oneShot, /controller\.getCurrentPosition|CoroutineStart|postDelayed/);
  assert.match(plugin, /IONGLOCController by lazy/);
  for (const key of ['source', 'timestamp', 'coordinateSystem']) assert(plugin.includes(`put("${key}"`));
  const adapter = read('android/geolocation/src/main/kotlin/com/capacitorjs/plugins/geolocation/SystemLocationProvider.kt');
  assert.doesNotMatch(adapter, /FusedLocationProviderClient|LocationServices|postDelayed/);
  assert.match(adapter, /LocationRequestCompat\.Builder\(1000\)/);
});
