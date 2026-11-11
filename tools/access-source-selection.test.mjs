import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { selectAccessApi, selectAccessLocale } from './access-source-selection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewedBase = JSON.parse(fs.readFileSync(new URL('./access-source-files.json', import.meta.url), 'utf8')).baseCommit;
const head = name => execFileSync('git', ['show', reviewedBase + ':' + name], { cwd: root, encoding: 'utf8' });
const current = name => fs.readFileSync(path.join(root, name), 'utf8');
const apiSource = current('src/app/configs/api.config.ts').replace(/\r\n/g, '\n');
const registration = Object.fromEntries(Object.entries(JSON.parse(current('public/i18n/en/en.json')).DEVICE_GUIDE)
  .filter(([key]) => key.startsWith('BLE_REGISTRATION_') || key === 'BLE_CLOUD_IDENTITY_CONFLICT')
  .map(([key]) => [key, 'fixture ' + key]));
assert.equal(Object.keys(registration).length, 27);

function apiFixture() {
  const referenceImport = apiSource.match(/^import \{ isLogicalDeviceReferenceId \} from .*;\n/m)[0];
  const constants = apiSource.match(/^    ACCESS_REGISTRATION_[A-Z_]+:.*\n/gm).join('');
  const helper = apiSource.slice(apiSource.indexOf('function isAccessRegistrationUrl('),
    apiSource.indexOf('function isManagedMapUrl('));
  const base = `// Keep this unrelated baseline byte-for-byte.\nimport { environment } from '../../environments/environment';\nexport const API = { DEVICE_V2: {
    BLE_ENROLLMENT_CANCEL: (intentId: string) =>
      API_V2_URL + '/ble-enrollment/intents/' + encodeURIComponent(intentId) + '/cancel',
    EDGE_GATEWAY_ATTACHMENTS: API_V2_URL + '/edge-gateway/attachments',
} };
export function isGatewayUrl(url: string): boolean {
  return false
    || url.startsWith(API.DEVICE_V2.BLE_ENROLLMENT_INTENTS + '/')
    || isManagedMapUrl(url);
}
function isManagedMapUrl(url: string): boolean {
  return false;
}
`;
  const dirty = base.replace("import { environment } from '../../environments/environment';\n",
    "import { environment } from '../../environments/environment';\n" + referenceImport)
    .replace('    EDGE_GATEWAY_ATTACHMENTS:', constants + '    EDGE_GATEWAY_ATTACHMENTS:')
    .replace("    || url.startsWith(API.DEVICE_V2.BLE_ENROLLMENT_INTENTS + '/')\n",
      "    || url.startsWith(API.DEVICE_V2.BLE_ENROLLMENT_INTENTS + '/')\n    || isAccessRegistrationUrl(url)\n")
    .replace('function isManagedMapUrl(', helper + 'function isManagedMapUrl(');
  return { base, dirty, constants, helper, referenceImport };
}

test('real API projection selects registration, not the separate location dirty hunks', () => {
  const name = 'src/app/configs/api.config.ts', base = head(name), dirty = current(name);
  const before = [base, dirty], selected = selectAccessApi(base, dirty);
  assert.match(selected, /ACCESS_REGISTRATION_PRESENCE:/);
  assert.match(selected, /function isAccessRegistrationUrl\(url: string\): boolean/);
  assert.match(selected, /import \{ isLogicalDeviceReferenceId \} from '\.\.\/core\/protocol\/device-v2\/logical-device-reference';/);
  for (const key of ['INSTALL_STATUS:', 'LOCATION_LATEST:', 'LOCATION_LEASE:', 'LOCATION_NETWORK:', 'const originalUrl = url;']) {
    assert.equal(selected.includes(key), base.includes(key), key + ' must retain the HEAD baseline');
  }
  assert.deepEqual([base, dirty], before);
  assert.equal(current(name), dirty, 'the real worktree source is unchanged');
});

test('the exact independent install-status hunk retains only its supplied baseline, never a policy fallback', () => {
  const { base, dirty } = apiFixture();
  const hunk = "    INSTALL_STATUS: API_V2_URL + '/devices:install-status',\n";
  const add = value => value.replace('    BLE_ENROLLMENT_CANCEL:', hunk + '    BLE_ENROLLMENT_CANCEL:');
  assert.equal(selectAccessApi(base, add(dirty)), dirty);
  assert.equal(selectAccessApi(add(base), dirty), add(dirty));
  assert.throws(() => selectAccessApi(base, add(dirty).replace('/devices:install-status', '/devices:unreviewed')), /ACCESS_SOURCE_API_SHAPE/);
  assert.throws(() => selectAccessApi(base, add(dirty).replace(hunk, hunk + hunk)), /ACCESS_SOURCE_API_SHAPE/);
});

test('projected API resolves the selected metadata helper without widening its authority origin or BBP routing', () => {
  const selection = JSON.parse(current('tools/access-source-files.json'));
  const helper = 'src/app/core/protocol/device-v2/logical-device-reference.ts';
  for (const name of [helper, helper.replace('.ts', '.spec.ts')]) assert(selection.access.includes(name));
  const compile = value => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const pure = { exports: {} };
  vm.runInNewContext(compile(current(helper)), pure);
  const api = { exports: {}, require: name => {
    if (name === '../../environments/environment') return { environment: { gatewayBaseUrl: 'https://gateway.example.test' } };
    assert.equal(name, '../core/protocol/device-v2/logical-device-reference');
    return pure.exports;
  } };
  const name = 'src/app/configs/api.config.ts';
  vm.runInNewContext(compile(selectAccessApi(head(name), current(name))), api);
  const opaque = 'device_' + Buffer.alloc(16, 7).toString('base64url');
  const url = api.exports.API.DEVICE_V2.ACCESS_REGISTRATION_PRESENCE(opaque);
  assert(api.exports.isGatewayUrl(url));
  for (const invalid of [url + '?owner=other', url + '/extra', url.replace('gateway.example.test', 'other.example.test')]) {
    assert.equal(api.exports.isGatewayUrl(invalid), false);
  }
  assert(!current(helper).includes('logicalDevicePeerId'));
});

test('finite core runner and selected sources retain the metadata and paired Presence regressions', () => {
  const selected = JSON.parse(current('tools/access-source-files.json'));
  const core = current('tools/test-access-registration.vitest.mts');
  for (const name of ['src/app/core/protocol/device-v2/logical-device-reference.spec.ts',
    'src/app/core/device-v2/ble-direct/registration-presence-api.spec.ts',
    'src/app/core/device-v2/ble-direct/bc5-registered-presence.spec.ts',
    'src/app/core/device-v2/account-peer-id.spec.ts', 'src/app/core/device-v2/account-client.spec.ts',
    'src/app/core/device-v2/ready-waits.spec.ts', 'src/app/core/protocol/device-v2/presence.spec.ts',
    'src/app/core/protocol/device-v2/session.spec.ts']) {
    assert([...selected.access, ...selected.baseline].includes(name));
    assert.equal(core.split("'" + name + "'").length, 2);
    assert([...selected.access, ...selected.baseline].includes(name.replace('.spec.ts', '.ts')));
  }
  assert(selected.access.includes('src/app/core/protocol/device-v2/store.ts'));
});

test('real locale projections preserve HEAD sharing count and select registration in all 11 locales', () => {
  const locales = ['ar', 'de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh_cn', 'zh_hk'];
  for (const locale of locales) {
    const name = `public/i18n/${locale}/${locale}.json`, base = head(name), dirty = current(name);
    const before = [base, dirty], selected = selectAccessLocale(base, dirty);
    const baseline = JSON.parse(base), actual = JSON.parse(selected), source = JSON.parse(dirty);
    assert.deepEqual(actual.PROFILE, baseline.PROFILE, locale + ': no sharing-count hunk');
    assert.equal(actual.DEVICE_GUIDE.BLE_REGISTRATION_PRESENCE_PENDING,
      source.DEVICE_GUIDE.BLE_REGISTRATION_PRESENCE_PENDING);
    assert.equal(actual.DEVICE_GUIDE.BLE_CLOUD_IDENTITY_CONFLICT,
      source.DEVICE_GUIDE.BLE_CLOUD_IDENTITY_CONFLICT);
    assert.deepEqual([base, dirty], before);
    assert.equal(current(name), dirty, locale + ': original worktree is unchanged');
  }
});

test('small API fixture copies exactly the reviewed import and three sections, preserving the baseline and CRLF', () => {
  const { base, dirty } = apiFixture();
  assert.equal(selectAccessApi(base, dirty), dirty);
  assert.equal(selectAccessApi(base.replace(/\n/g, '\r\n'), dirty), dirty.replace(/\n/g, '\r\n'));
});

test('API rejects missing, duplicate, changed, unknown, or wrongly placed registration inputs', () => {
  const { base, dirty, constants, helper, referenceImport } = apiFixture();
  const invalid = [
    dirty.replace(referenceImport, ''),
    dirty.replace(referenceImport, referenceImport + referenceImport),
    dirty.replace(referenceImport, referenceImport.replace('logical-device-reference', 'unreviewed-dependency')),
    dirty.replace('isLogicalDeviceReferenceId(url.slice(presence.length))', 'true'),
    dirty.replace(/^    ACCESS_REGISTRATION_CANCEL:.*\n/m, ''),
    dirty.replace(constants, constants + constants),
    dirty.replace(helper, helper.replace('[AQgw]', '[A-Za-z]')),
    dirty.replace(constants, constants + '    ACCESS_REGISTRATION_OTHER: "unexpected",\n'),
    dirty.replace('    || isAccessRegistrationUrl(url)\n', '') + '    || isAccessRegistrationUrl(url)\n',
    dirty + '// A separate unreviewed API change.\n',
  ];
  for (const value of invalid) assert.throws(() => selectAccessApi(base, value), /ACCESS_SOURCE_API_SHAPE/);
  assert.throws(() => selectAccessApi(base, base), /ACCESS_SOURCE_API_SHAPE/);
  assert.throws(() => selectAccessApi(dirty, dirty), /ACCESS_SOURCE_API_SHAPE/);
  assert.throws(() => selectAccessApi(base + 'function isManagedMapUrl(url: string): boolean {\n', dirty), /ACCESS_SOURCE_API_SHAPE/);
});

test('API requires the complete known outside-location shape, not partial or arbitrary policy edits', () => {
  const name = 'src/app/configs/api.config.ts', base = head(name), dirty = current(name);
  assert.throws(() => selectAccessApi(base,
    dirty.replace(/^    LOCATION_LEASE:.*\r?\n/m, '')), /ACCESS_SOURCE_API_SHAPE/);
  assert.throws(() => selectAccessApi(base,
    dirty.replace("parts[2] === 'network' && originalUrl === url", "parts[2] === 'network'")), /ACCESS_SOURCE_API_SHAPE/);
  assert.throws(() => selectAccessApi(base, dirty.replace(/\r?\n/, '\r')), /ACCESS_SOURCE_API_SHAPE/);
});

test('locale inserts into an existing guide without rewriting any other baseline bytes', () => {
  const base = '{"PROFILE":{"SHARED_DEVICE_COUNT":"keep"},"DEVICE_GUIDE":{"KEEP":"value"}}\n';
  const dirty = JSON.stringify({ PROFILE: { RECEIVED_DEVICE_COUNT: 'outside' },
    DEVICE_GUIDE: { ...registration, KEEP: 'different outside text' }, OTHER: 'outside' });
  const entries = Object.entries(registration).map(([key, value]) => JSON.stringify(key) + ': ' + JSON.stringify(value));
  const expected = base.replace('"KEEP":"value"', '"KEEP":"value",\n    ' + entries.join(',\n    '));
  assert.equal(selectAccessLocale(base, dirty), expected);
});

test('locale adds a missing or empty guide and preserves BOM, CRLF, escapes, arrays and nested baseline data', () => {
  const dirty = JSON.stringify({ DEVICE_GUIDE: registration });
  for (const guide of [undefined, {}]) {
    const baseline = { PROFILE: { SHARED_DEVICE_COUNT: 'keep' }, KEEP: ['literal } { \\"', { a: true }],
      ...(guide ? { DEVICE_GUIDE: guide } : {}) };
    const base = '\uFEFF' + JSON.stringify(baseline, null, 2).replace(/\n/g, '\r\n') + '\r\n';
    const selected = selectAccessLocale(base, dirty);
    assert.ok(selected.startsWith('\uFEFF'));
    assert.ok(!/(^|[^\r])\n/.test(selected));
    assert.deepEqual(JSON.parse(selected.slice(1)), { ...baseline, DEVICE_GUIDE: registration });
  }
});

test('locale refuses missing, unknown, empty or non-string registration keys and invalid parents', () => {
  const base = '{"PROFILE":{"SHARED_DEVICE_COUNT":"keep"}}';
  const missing = { ...registration }; delete missing.BLE_REGISTRATION_TITLE;
  const values = [
    { DEVICE_GUIDE: missing },
    { DEVICE_GUIDE: { ...registration, BLE_REGISTRATION_UNKNOWN: 'unknown' } },
    { DEVICE_GUIDE: { ...registration, BLE_REGISTRATION_TITLE: '' } },
    { DEVICE_GUIDE: { ...registration, BLE_REGISTRATION_TITLE: ' \n\t' } },
    { DEVICE_GUIDE: { ...registration, BLE_REGISTRATION_TITLE: false } },
    { DEVICE_GUIDE: [] }, {}, [],
  ];
  for (const value of values) assert.throws(() => selectAccessLocale(base, JSON.stringify(value)), /ACCESS_SOURCE_LOCALE_SHAPE/);
  assert.throws(() => selectAccessLocale('{"DEVICE_GUIDE":null}', JSON.stringify({ DEVICE_GUIDE: registration })), /ACCESS_SOURCE_LOCALE_SHAPE/);
  assert.throws(() => selectAccessLocale('{"DEVICE_GUIDE":{"BLE_REGISTRATION_TITLE":"already present"}}',
    JSON.stringify({ DEVICE_GUIDE: registration })), /ACCESS_SOURCE_LOCALE_SHAPE/);
});

test('locale refuses duplicate root/guide keys instead of silently accepting the last JSON value', () => {
  const base = '{"PROFILE":{"SHARED_DEVICE_COUNT":"keep"}}';
  const dirty = JSON.stringify({ DEVICE_GUIDE: registration });
  const duplicateRoot = dirty.slice(0, -1) + ',"DEVICE_GUIDE":' + JSON.stringify(registration) + '}';
  const duplicateKey = dirty.replace('"BLE_REGISTRATION_TITLE":', '"BLE_REGISTRATION_TITLE":"first","BLE_REGISTRATION_TITLE":');
  const escapedDuplicate = dirty.replace('"BLE_REGISTRATION_TITLE":', '"BLE_REGISTRATION_\\u0054ITLE":"first","BLE_REGISTRATION_TITLE":');
  for (const value of [duplicateRoot, duplicateKey, escapedDuplicate, dirty.slice(0, -1)]) {
    assert.throws(() => selectAccessLocale(base, value), /ACCESS_SOURCE_LOCALE_SHAPE/);
  }
  assert.throws(() => selectAccessLocale('{"DEVICE_GUIDE":{"KEEP":1,"KEEP":2}}', dirty), /ACCESS_SOURCE_LOCALE_SHAPE/);
});

test('projection functions reject non-string inputs and do not mutate their supplied input objects', () => {
  const fixture = Object.freeze(apiFixture());
  assert.equal(selectAccessApi(fixture.base, fixture.dirty), fixture.dirty);
  for (const value of [undefined, null, {}, new String('{}')]) {
    assert.throws(() => selectAccessApi(value, fixture.dirty), /ACCESS_SOURCE_API_SHAPE/);
    assert.throws(() => selectAccessLocale('{}', value), /ACCESS_SOURCE_LOCALE_SHAPE/);
  }
});
