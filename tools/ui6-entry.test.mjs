import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import { parseTemplate } from '@angular/compiler';

const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const ts = require('typescript');
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const read = path => readFileSync(new URL(path, root), 'utf8');
const compile = path => sass.compile(fileURLToPath(new URL(path, root)), {
  loadPaths: [fileURLToPath(new URL('node_modules/', root))], logger: sass.Logger.silent,
}).css;
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('src/app/tools/tool-menu.config.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module, exports: module.exports });
const groups = module.exports.TOOL_MENU_GROUPS;
const items = groups.flatMap(group => group.tools);

test('tool presentation preserves the four groups and five real route destinations', () => {
  assert.deepEqual(Array.from(groups, group => group.title), [
    'TOOLS.GROUP_DEVICE_CONNECTION', 'TOOLS.GROUP_FIRMWARE_UPGRADE',
    'TOOLS.GROUP_COMMUNICATION_DEBUG', 'TOOLS.GROUP_DIAGNOSTICS',
  ]);
  assert.equal(items.length, 12);
  assert.deepEqual(Object.fromEntries(items.filter(item => item.route).map(item => [item.id, item.route])), {
    'esp32-provision': '/tools/esp32-provision', 'ble-debug': '/tools/ble-debug',
    'lan-discovery': '/tools/lan-discovery', 'ble-ota': '/tools/ble-ota', 'wifi-ota': '/tools/wifi-ota',
  });
});

test('planned entries keep the original toast state and gain no fake navigation arrow', () => {
  const planned = items.filter(item => !item.route);
  assert.deepEqual(Array.from(planned, item => item.id), [
    'mqtt-client', 'tcp-udp', 'http-websocket', 'modbus', 'network-diagnostics', 'crc-hex', 'scan-device-info',
  ]);
  for (const item of planned) {
    assert.equal(item.muted, true);
    assert.equal(item.badge, 'TOOLS.COMING_SOON');
    assert.equal(item.showChevron, false);
    assert.notEqual(item.disabled, true, 'existing explanatory toast stays operable');
  }
});

test('all tool icons resolve through the already installed line-icon family', () => {
  const css = read('public/fontawesome6/css/all.css');
  for (const item of items) {
    assert.match(item.icon, /^fa-[a-z0-9-]+$/);
    assert.match(css, new RegExp(`\\.${item.icon}::?before\\s*\\{`), item.id);
    assert.equal(item.iconColor, undefined, 'do not add a per-tool palette');
  }
});

test('routed entry pages compile with the existing opt-in workflow primitives', () => {
  for (const path of [
    'src/app/sections/guide/guide.page.scss', 'src/app/sections/guide/connection-method.page.scss',
    'src/app/sections/guide/key-device/key-device.page.scss', 'src/app/tools/esp32-provision/esp32-provision.page.scss',
    'src/app/sections/device/share-manager/share-manager.page.scss', 'src/app/sections/device/device-share/device-share.scss',
    'src/app/sections/device/share-invitation/share-invitation.page.scss',
  ]) {
    assert.match(read(path), /@include workflow\.page/, path);
    assert.doesNotMatch(read(path), /::ng-deep|#[0-9a-f]{3,8}\b/i, path);
    const css = compile(path);
    assert.match(css, /--transparent-page-header-height: 56px/, path);
    assert.match(css, /min-height: 48px/, path);
  }
});

test('tools reuse the settings menu without adopting the routed-page header geometry', () => {
  const html = read('src/app/home/components/tab-tools/tab-tools.html');
  const parsed = parseTemplate(html, 'tab-tools.html');
  assert.equal(parsed.errors, null);
  const header = parsed.nodes.find(node => node.name === 'ion-header');
  const classes = header.attributes.find(attribute => attribute.name === 'class').value.split(/\s+/).sort();
  assert.deepEqual(classes, ['home-tab-header', 'main-tab-header']);
  assert.match(html, /appearance="settings"/);
  const source = read('src/app/home/components/tab-tools/tab-tools.scss');
  assert.match(source, /@include settings\.tokens/);
  assert.doesNotMatch(source, /@include workflow\.page|::ng-deep/);
  const css = compile('src/app/home/components/tab-tools/tab-tools.scss');
  assert.match(css, /--top-scroll-mask-height: calc\(var\(--ion-safe-area-top, 0px\) \+ 64px\)/);
  assert.match(css, /padding-bottom: calc\(88px \+/);
});

test('public console still owns its read-only panel and Agent scroll boundary', () => {
  const html = read('src/app/sections/device/shared-console/shared-console.page.html');
  assert.match(html, /\[scrollY\]="!customPanel"/);
  assert.match(html, /\[interactive\]="false" \[restricted\]="true" \[readOnlyScroll\]="true"/);
  assert.match(html, /app-page-layout-panel \[cards\]="cards" \[interactive\]="false"/);
  assert.doesNotMatch(read('src/app/sections/device/shared-console/shared-console.page.scss'), /workflow\.page/);
});
