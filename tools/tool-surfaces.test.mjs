// Bounded UI38 source/presentation contracts. Actual Angular event behavior is
// separately covered by component-template specs; no real tool action is run.
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTemplate } from '@angular/compiler';
import { compile, read } from './discovery-collection.browser.mjs';
import { toolPaths, derivePresentationTemplate, toolStates, presentationCalls } from './tool-surfaces.browser.mjs';

test('four low-frequency pages opt into existing header and one visible scrollport', () => {
  for (const path of Object.values(toolPaths)) {
    const html = read(path + '.html'), css = compile(path + '.scss');
    assert.equal(parseTemplate(html, path + '.html').errors, null);
    assert.match(html, /control-page-header/);
    assert.match(css, /ion-content::part\(scroll\)\s*\{[^}]*top: var\(--transparent-page-content-top\);[^}]*scroll-padding-block: 16px;/s);
    assert.match(css, /main::before\s*\{\s*display: none !important;/);
    assert.doesNotMatch(read(path + '.scss'), /linear-gradient|radial-gradient|font-size:\s*(?:9|10|11)px|text-overflow:\s*ellipsis/);
    assert.match(css, /min-height: 48px;/);
  }
});

test('OTA presentation is shared locally, without legacy global transport-page selectors', () => {
  for (const key of ['ble', 'wifi']) {
    assert.match(read(toolPaths[key] + '.scss'), /@use .*ota-surface.* as ota/);
    assert.match(read(toolPaths[key] + '.scss'), /@include ota\.page;/);
    const html = read(toolPaths[key] + '.html');
    for (const event of ['chooseFirmware($event)', 'clearFirmware()', 'upload()', 'cancelUpload()'])
      assert.ok(html.includes(`="${event}"`), event);
    assert.match(html, /\[disabled\]="!canUpload"/);
    assert.match(html, /\[disabled\]="isBusy"/);
    assert.match(html, /role="progressbar"[^>]*\[attr\.aria-valuenow\]="progress"/);
    for (const state of ['success', 'error', 'cancelled']) assert.ok(html.includes(`[class.${state}]="state === '${state}'"`));
  }
  assert.doesNotMatch(read('src/tool-pages.scss'), /app-ble-ota|app-wifi-ota/);
  assert.match(read(toolPaths.ble + '.html'), /最大 32 MB/);
  assert.match(read(toolPaths.wifi + '.html'), /最大 64 MB/);
  const wifi = read(toolPaths.wifi + '.html');
  assert.match(wifi, /\[type\]="passwordVisible \? 'text' : 'password'"/);
  assert.match(wifi, /autocomplete="current-password"/);
  for (const parameter of ['host', 'port', 'uploadPath', 'username', 'password', 'timeoutSeconds'])
    assert.ok(wifi.includes(`[(ngModel)]="${parameter}"`), parameter);
});

test('LAN retains discovery, filter, expansion and explicit copy with visible narrow-screen states', () => {
  const html = read(toolPaths.lan + '.html'), scss = read(toolPaths.lan + '.scss');
  for (const event of ['clearResults()', 'selectType(preset.type)', 'toggleScan()', 'toggleDetails(service)', 'copyEndpoint(service)'])
    assert.ok(html.includes(`="${event}"`), event);
  assert.match(html, /\[disabled\]="!isScanning && !canStartScan"/);
  assert.match(html, /\[attr\.aria-expanded\]="isExpanded\(service\)"/);
  assert.match(html, /aria-label="筛选发现结果"/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(scss, /\.service-state[^}]*display:\s*none/s);
});

test('gateway preserves ownership/deployment gate, recovery and explicit enrollment actions', () => {
  const html = read(toolPaths.gateway + '.html'), ts = read(toolPaths.gateway + '.ts');
  for (const event of ['resume(recovery)', 'selectCandidate(target)', 'startDiscovery()', 'refreshRecoveries()', 'continueWaiting()', 'finish()'])
    assert.ok(html.includes(`="${event}"`), event);
  assert.match(html, /@if \(!available\)/);
  assert.match(html, /maxlength="128"/);
  assert.match(html, /\[attr\.aria-busy\]="busy"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status"/);
  assert.match(ts, /!this\.hub\.config\.isShared/);
  assert.match(read('src/app/app.routes.ts'), /canMatch: \[deploymentGuard\('directAccess'\)\]/);
  // Continue is an existing mutating recovery workflow, NOT a harmless retry.
  assert.match(ts, /async continueWaiting\(\)/);
});

test('static fixture derivation accepts only the exact existing pure style and IP-join bindings', () => {
  for (const key of Object.keys(toolPaths)) {
    const result = derivePresentationTemplate(key);
    assert.equal(result.changes.length, key === 'lan' ? 2 : ['ble', 'wifi'].includes(key) ? 1 : 0);
    assert.equal(parseTemplate(result.derived, key + '.html').errors, null);
    for (const change of result.changes) assert.ok(change.original.length > 0);
  }
  assert.ok(toolStates().length >= 20);
  assert.ok(toolStates().every(item => !['ble', 'wifi'].includes(item.kind) || item.model.canUpload === false));
  assert.equal(presentationCalls.presentationJoin(['local-only'], ', '), 'local-only');
  assert.throws(() => presentationCalls.presentationJoin({}, ', '));
});
