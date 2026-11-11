// UI38 presentation-only fixtures. Actual Angular template AST + Emulated SCSS
// + installed Ionic are rendered locally; no Angular bootstrap, event handlers,
// app storage, API/native calls, discovery, enrollment or OTA are installed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BindingType, encapsulateStyle, parseTemplate } from '@angular/compiler';
import { compile, dictionary, presentation, read, renderTemplate } from './discovery-collection.browser.mjs';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
export const toolPaths = {
  lan: 'src/app/tools/lan-discovery/lan-discovery.page',
  ble: 'src/app/tools/ble-ota/ble-ota.page',
  wifi: 'src/app/tools/wifi-ota/wifi-ota.page',
  gateway: 'src/app/sections/device/edge-gateway-enrollment/edge-gateway-enrollment.page',
};
const digest = value => createHash('sha256').update(value).digest('hex');

// The shared fail-closed renderer deliberately supports neither arbitrary style
// bindings nor Array.join. Derive ONLY the actual width-% and two IP-list joins
// using compiler source spans; originals and replacements remain in the report.
// No production template, expression behavior or event handler is modified.
export function derivePresentationTemplate(kind) {
  const path = toolPaths[kind] + '.html', source = read(path).replaceAll('\r\n', '\n');
  const parsed = parseTemplate(source, path, { preserveWhitespaces: true });
  assert.equal(parsed.errors, null);
  const changes = [], seen = new Set();
  function visit(node) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (node.constructor.name === 'BoundAttribute' && node.type === BindingType.Style) {
      assert.equal(node.name, 'width'); assert.equal(node.unit, '%');
      assert.equal(node.value.source, 'progress');
      changes.push({ start: node.sourceSpan.start.offset, end: node.sourceSpan.end.offset,
        replacement: `[attr.style]="'width:' + progress + '%'"` });
    }
    if (node.constructor.name === 'Call' && node.receiver?.name === 'join') {
      const receiver = node.receiver.receiver;
      assert.equal(receiver.constructor.name, 'PropertyRead');
      assert.ok(['ipv4Addresses', 'ipv6Addresses'].includes(receiver.name));
      assert.equal(receiver.receiver.name, 'service');
      assert.equal(node.args.length, 1); assert.equal(node.args[0].value, ', ');
      changes.push({ start: node.sourceSpan.start, end: node.sourceSpan.end,
        replacement: `presentationJoin(service.${receiver.name}, ', ')` });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key.endsWith('Span')) continue;
      if (Array.isArray(value)) value.forEach(visit); else visit(value);
    }
  }
  parsed.nodes.forEach(visit);
  assert.equal(changes.length, kind === 'lan' ? 2 : ['ble', 'wifi'].includes(kind) ? 1 : 0);
  let derived = source;
  for (const item of [...changes].sort((a, b) => b.start - a.start)) {
    assert.ok(Number.isInteger(item.start) && Number.isInteger(item.end));
    item.original = source.slice(item.start, item.end);
    derived = derived.slice(0, item.start) + item.replacement + derived.slice(item.end);
  }
  assert.equal(parseTemplate(derived, path).errors, null);
  return { sourceHash: digest(source), derivedHash: digest(derived), derived, changes };
}

export const localFixture = {
  failure: '本地呈现夹具：连接暂时不可用。已有信息仍然保留，请检查设备和网络后按原入口继续；不会自动重新执行未确认操作。',
  file: { name: '本地呈现夹具_ONLY_NOT_A_REAL_FIRMWARE_0123456789_很长的固件名称.bin', size: 1048576 },
  name: '本地呈现夹具：客厅设备及非常长的名称应完整换行而不是省略',
  host: 'presentation-fixture-device-with-long-local-hostname.local',
};
const service = { id: 'local-static-only-1', name: localFixture.name, type: '_http._tcp.', domain: 'local.',
  hostname: localFixture.host, ipv4Addresses: ['192.0.2.1', '192.0.2.2'],
  ipv6Addresses: ['2001:db8:1234:5678:90ab:cdef:1234:5678'], port: 8080, resolved: true };
const otaDevice = { deviceId: 'LOCAL_STATIC_ONLY_DEVICE_ID_0123456789', name: localFixture.name, rssi: -64 };
const otaTarget = { id: 'local-static-only-target', name: localFixture.name, host: localFixture.host, port: 8080, uploadPath: '/local-fixture-only' };
export const presentationCalls = {
  presentationJoin: (items, separator) => { assert.ok(Array.isArray(items)); return items.join(separator); },
  typeLabel: type => type === '_http._tcp.' ? 'HTTP' : type,
  isExpanded: item => item.id === service.id,
  serviceIcon: () => 'fa-light fa-globe',
  primaryAddress: item => item.ipv4Addresses[0] || item.ipv6Addresses[0] || item.hostname || '正在解析地址…',
  txtEntries: () => [{ key: 'local-fixture-only', value: 'LONG_PRESENTATION_VALUE_0123456789_NO_DEVICE_DATA' }],
  endpoint: item => item.resolved ? `http://${item.hostname}:${item.port}/local-fixture-only` : '',
  serviceUrl: item => item.resolved ? `http://${item.hostname}:${item.port}/local-fixture-only` : '',
  formatBytes: bytes => bytes === 1048576 ? '1 MB' : `${bytes} B`,
  signalIcon: () => 'fa-light fa-signal-bars',
  deviceName: item => item.name,
  recoveryLabel: () => '本地呈现夹具：继续未完成的接入确认',
  candidateCode: () => 'A1B2C3D4',
};

export function toolStates() {
  const lanBase = { nativeSupported: true, networkStatus: { connected: true, connectionType: 'wifi' },
    networkLabel: 'Wi-Fi 已连接', canStartScan: true, services: [], visibleServices: [],
    serviceTypes: [
      { type: '_http._tcp.', label: 'HTTP', icon: 'fa-globe' }, { type: '_https._tcp.', label: 'HTTPS', icon: 'fa-lock' },
      { type: '_mqtt._tcp.', label: 'MQTT', icon: 'fa-share-nodes' },
      { type: '_home-assistant._tcp.', label: 'Home Assistant', icon: 'fa-house-signal' },
      { type: '_esphomelib._tcp.', label: 'ESPHome', icon: 'fa-microchip' },
      { type: '_googlecast._tcp.', label: 'Chromecast', icon: 'fa-display' },
      { type: '_airplay._tcp.', label: 'AirPlay', icon: 'fa-airplay' },
    ], serviceType: '_http._tcp.', domain: 'local.', isScanning: false, scanElapsed: 10,
    searchKeyword: '', errorMessage: '', statusMessage: '本地呈现夹具：准备发现 HTTP 服务' };
  const otaBase = { isBusy: false, firmwareFile: null, state: 'idle', isScanning: false,
    progress: 0, statusMessage: '本地呈现夹具：等待开始', statusDetail: localFixture.failure,
    canUpload: false, bytesSent: 524288, speedText: '本地夹具：12 KB/s', canCancelUpload: false };
  const bleBase = { ...otaBase, updateType: 'flash', selectedDevice: null, devices: [], scanButtonLabel: '扫描附近设备' };
  const wifiBase = { ...otaBase, targets: [], selectedTargetId: '', useHttps: false, host: '', port: 8080,
    uploadPath: '/local-fixture-only', username: 'LOCAL_PRESENTATION_ONLY', password: '', passwordVisible: false,
    timeoutSeconds: 60, targetPreview: '本地夹具：未填写地址' };
  const gatewayBase = { available: true, edgeHubLogicalDeviceId: 'LOCAL_STATIC_ONLY_HUB',
    hub: { config: { customName: localFixture.name } }, recoveries: [], phase: 'idle', busy: false,
    deviceName: localFixture.name, candidates: [], error: '', retirementPending: false,
    logicalDeviceId: 'LOCAL_STATIC_ONLY_CHILD_DEVICE_0123456789' };
  return [
    { kind: 'lan', name: 'offline', model: { ...lanBase, networkStatus: { connected: false, connectionType: 'none' }, networkLabel: '未连接网络', canStartScan: false } },
    { kind: 'lan', name: 'unsupported', model: { ...lanBase, nativeSupported: false, canStartScan: false } },
    { kind: 'lan', name: 'busy', model: { ...lanBase, isScanning: true } },
    { kind: 'lan', name: 'error', model: { ...lanBase, errorMessage: localFixture.failure } },
    { kind: 'lan', name: 'results', model: { ...lanBase, services: [service, { ...service, id: 'local-static-only-2', resolved: false }],
      visibleServices: [service, { ...service, id: 'local-static-only-2', resolved: false }], searchKeyword: '本地夹具' } },
    ...['ble', 'wifi'].flatMap(kind => ['idle', 'busy', 'error', 'success', 'cancelled'].map(name => ({ kind, name,
      model: { ...(kind === 'ble' ? bleBase : wifiBase), state: name === 'busy' ? 'uploading' : name,
        isBusy: name === 'busy', canCancelUpload: name === 'busy', progress: name === 'success' ? 100 : name === 'idle' ? 0 : 50,
        firmwareFile: name === 'idle' ? null : localFixture.file,
        ...(kind === 'ble' ? { selectedDevice: name === 'idle' ? null : otaDevice, devices: name === 'idle' ? [] : [otaDevice] }
          : { host: name === 'idle' ? '' : localFixture.host, targets: name === 'idle' ? [] : [otaTarget],
            selectedTargetId: name === 'idle' ? '' : otaTarget.id,
            targetPreview: `http://${localFixture.host}:8080/local-fixture-only` }),
        statusMessage: name === 'error' ? localFixture.failure : `本地呈现夹具：${name}` } }))),
    { kind: 'gateway', name: 'blocked', model: { ...gatewayBase, available: false } },
    { kind: 'gateway', name: 'idle', model: { ...gatewayBase } },
    { kind: 'gateway', name: 'busy', model: { ...gatewayBase, phase: 'discovering', busy: true } },
    { kind: 'gateway', name: 'selecting', model: { ...gatewayBase, phase: 'selecting', candidates: [{ device: { deviceId: 'local-only-candidate' }, rssi: -60 }] } },
    { kind: 'gateway', name: 'error-recovery', model: { ...gatewayBase, error: localFixture.failure,
      recoveries: [{ id: 'local-only-recovery', logicalDeviceId: gatewayBase.logicalDeviceId }] } },
    { kind: 'gateway', name: 'waiting', model: { ...gatewayBase, phase: 'waiting' } },
    { kind: 'gateway', name: 'ready', model: { ...gatewayBase, phase: 'ready' } },
  ];
}

export async function runToolBrowser() {
  for (const name of ['WIDGET_BROWSER_DRIVER', 'WIDGET_BROWSER_EXECUTABLE', 'TOOL_SURFACES_OUTPUT_DIR'])
    if (process.env[name]) assert.ok(isAbsolute(process.env[name]), `${name} must be absolute`);
  const destination = resolve(process.env.TOOL_SURFACES_OUTPUT_DIR || join(tmpdir(), 'blinker-tool-surfaces-ui'));
  const fromRepo = relative(fileURLToPath(root), destination);
  assert.ok(fromRepo === '..' || fromRepo.startsWith('..' + sep) || isAbsolute(fromRepo), 'Evidence must stay outside App worktree');
  mkdirSync(destination, { recursive: true }); const outputDir = mkdtempSync(join(destination, 'tool-surfaces-'));
  const data = presentation(), states = toolStates(), sourceHashes = {}, derived = {}, templates = {};
  const remember = path => { sourceHashes[path] = digest(read(path)); };
  for (const [kind, path] of Object.entries(toolPaths)) {
    for (const suffix of ['.html', '.scss', '.ts']) remember(path + suffix);
    derived[kind] = derivePresentationTemplate(kind);
    const file = join(outputDir, `${kind}-presentation-only.html`);
    writeFileSync(file, derived[kind].derived, { flag: 'wx' }); templates[kind] = pathToFileURL(file).href;
  }
  for (const path of ['tools/tool-surfaces.browser.mjs', 'tools/discovery-collection.browser.mjs',
    'src/app/sections/_transparent-page-header.scss', 'src/app/tools/_tool-page-layout.scss',
    'src/theme/_settings-surface.scss', 'src/theme/_control-page-chrome.scss', 'src/theme/ui-theme.scss', 'src/app/tools/ota/_ota-surface.scss',
    'src/tool-pages.scss', 'src/global.scss', 'public/i18n/zh_cn/zh_cn.json', 'node_modules/@ionic/core/package.json']) remember(path);
  const styles = Object.fromEntries(Object.entries(toolPaths).map(([kind, path]) => [kind, encapsulateStyle(compile(path + '.scss'), `ui38-${kind}`)]));
  // These are the actual production global imports. Include tool-pages.scss so
  // a competing legacy global OTA rule cannot silently escape this regression.
  const globalCss = data.baseCss + compile('src/app/sections/_transparent-page-header.scss')
    + compile('src/app/tools/_tool-page-layout.scss') + compile('src/tool-pages.scss');
  const environments = [
    { width: 375, height: 844, rootSize: 16, theme: 'light', mode: 'ios', safeTop: 35, safeBottom: 26, safeSides: 0 },
    { width: 320, height: 844, rootSize: 16, theme: 'dark', mode: 'md', safeTop: 0, safeBottom: 0, safeSides: 0 },
    { width: 320, height: 844, rootSize: 24, theme: 'light', mode: 'md', safeTop: 35, safeBottom: 26, safeSides: 0 },
    { width: 320, height: 844, rootSize: 24, theme: 'dark', mode: 'ios', safeTop: 35, safeBottom: 26, safeSides: 0 },
    { width: 844, height: 390, rootSize: 16, theme: 'light', mode: 'ios', safeTop: 0, safeBottom: 26, safeSides: 20 },
    { width: 844, height: 390, rootSize: 24, theme: 'dark', mode: 'md', safeTop: 0, safeBottom: 26, safeSides: 20 },
  ];
  const failures = [], measurements = [], screenshots = [], pageErrors = [], requestErrors = [];
  let browser, externalRequests = 0, writeRequests = 0;
  const server = createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { writeRequests++; response.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fontawesome6/css/all.min.css"></head><body></body></html>'); return; }
    let file;
    if (/^\/ionic\/[\w./-]+\.(js|svg)$/.test(pathname) && !pathname.includes('..')) file = new URL('node_modules/@ionic/core/' + pathname.slice(7), root);
    else if (/^\/fontawesome6\/(?:css\/[\w.-]+\.css|webfonts\/[\w.-]+\.(?:woff2?|ttf))$/.test(pathname)) file = new URL('public' + pathname, root);
    if (!file) { requestErrors.push(pathname); response.writeHead(404).end(); return; }
    try { response.setHeader('Content-Type', { js: 'text/javascript', svg: 'image/svg+xml', css: 'text/css', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf' }[pathname.split('.').at(-1)]); response.end(readFileSync(file)); }
    catch { requestErrors.push(pathname); response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, deadline = Date.now() + 300000;
  try {
    const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
    browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
    const page = await browser.newPage({ reducedMotion: 'reduce' }); page.setDefaultTimeout(8000);
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.route('**/*', route => {
      if (!route.request().url().startsWith(origin + '/')) { externalRequests++; return route.abort(); }
      if (!['GET', 'HEAD'].includes(route.request().method())) { writeRequests++; return route.abort(); }
      return route.continue();
    });
    await page.goto(origin); await page.addStyleTag({ content: data.themeCss + 'html,body{margin:0;overflow:hidden}*{box-sizing:border-box}' });
    await page.evaluate(async () => { const { defineCustomElements } = await import('/ionic/loader/index.es2017.js'); await defineCustomElements(window); });
    for (const environment of environments) for (const state of states) {
      const label = `${state.kind}/${state.name}/${environment.width}/root${environment.rootSize}/${environment.theme}/${environment.mode}`;
      try {
        assert.ok(Date.now() < deadline, 'Finite browser deadline exceeded');
        const html = renderTemplate(templates[state.kind], state.model, dictionary(), presentationCalls);
        await page.setViewportSize({ width: environment.width, height: environment.height });
        await page.evaluate(({ environment, kind, html, globalCss, pageCss }) => {
          document.documentElement.dataset.uiTheme = environment.theme === 'light' ? 'natural' : 'dark';
          document.documentElement.style.cssText = `font-size:${environment.rootSize}px;color-scheme:${environment.theme};--ion-safe-area-top:${environment.safeTop}px;--ion-safe-area-bottom:${environment.safeBottom}px;--ion-safe-area-left:${environment.safeSides}px;--ion-safe-area-right:${environment.safeSides}px`;
          document.body.innerHTML = `<style>${globalCss}${pageCss}tool-probe{display:block;position:absolute;inset:0;background:var(--blinker-bg)}</style><tool-probe class="ion-page" _nghost-ui38-${kind}>${html}</tool-probe>`;
          const host = document.querySelector('tool-probe');
          for (const node of host.querySelectorAll('*')) { node.setAttribute(`_ngcontent-ui38-${kind}`, ''); if (node.localName.startsWith('ion-')) node.setAttribute('mode', environment.mode); }
          for (const input of host.querySelectorAll('input:not([type=file])')) input.value = input.getAttribute('value') ?? '';
        }, { environment, kind: state.kind, html, globalCss, pageCss: styles[state.kind] });
        await page.waitForFunction(() => [...document.querySelectorAll('ion-header,ion-toolbar,ion-title,ion-buttons,ion-button,ion-back-button,ion-content')].every(node => node.classList.contains('hydrated')));
        await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
        const result = await page.evaluate(async ({ environment, kind, stateName }) => {
          const host = document.querySelector('tool-probe'), content = host.querySelector('ion-content');
          const scroll = await content.getScrollElement(), main = host.querySelector('main');
          const errors = [], check = (condition, message) => { if (!condition) errors.push(message); };
          const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
          const header = box(host.querySelector('ion-header')), viewport = box(scroll);
          check(Math.abs(header.height - environment.safeTop - 56) <= 1, 'Header must retain56px plus safe top');
          check(Math.abs(viewport.y - header.bottom) <= 1, 'Native scrollport must begin below header');
          check(document.documentElement.scrollWidth <= environment.width + 1 && host.scrollWidth <= environment.width + 1, 'Document/host horizontal overflow');
          check(scroll.scrollWidth <= scroll.clientWidth + 1 && main.scrollWidth <= main.clientWidth + 1, 'Content horizontal overflow');
          check(main.getBoundingClientRect().width <= 720.5, 'Shared reading width exceeds720px');
          check(matchMedia('(prefers-reduced-motion: reduce)').matches, 'Reduced motion not active');
          const visible = node => !!(node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
          const targets = [...host.querySelectorAll('button,input:not([type=file]),ion-button,ion-back-button')].filter(visible).map(node => {
            const r = box(node); check(r.width >= 47.5 && r.height >= 47.5, `${node.localName}.${node.className}: target below48px (${r.width}x${r.height})`);
            check(r.x >= environment.safeSides - 1 && r.right <= environment.width - environment.safeSides + 1, `${node.localName}.${node.className}: target outside safe width`);
            if (node.localName.startsWith('ion-')) { const native = node.shadowRoot?.querySelector('button,a'); check(!!native && box(native).width >= 47.5 && box(native).height >= 47.5, `${node.localName}: installed Ionic native target below48px`); }
            return { tag: node.localName, className: node.className, disabled: !!node.disabled, ...r };
          });
          const essential = 'h1,h2,.notice,.scan-status,.service-copy strong,.service-copy small,.service-state,.service-details dd,.txt-records code,.result-copy strong,.result-copy small,.status-copy strong,.status-copy small,.target-preview span,.result h2,.result p,.recovery-card button strong,.recovery-card button small,.candidates strong,.candidates small,.ota-notice span';
          const texts = [...host.querySelectorAll(essential)].filter(visible).map(node => {
            const r = box(node), style = getComputedStyle(node);
            check(style.textOverflow !== 'ellipsis' && !Number(style.webkitLineClamp), `${node.className||node.localName}: essential text clamped`);
            check(!node.clientWidth || node.scrollWidth <= node.clientWidth + 1, `${node.className||node.localName}: essential text horizontal overflow`);
            const range = document.createRange(); range.selectNodeContents(node);
            for (const text of range.getClientRects()) check(text.x >= r.x - 1.5 && text.right <= r.right + 1.5, `${node.className||node.localName}: text exceeds its box`);
            return { text: node.textContent.trim(), className: node.className, fontSize: style.fontSize, ...r };
          });
          const focus = [];
          for (const input of host.querySelectorAll('input:not([type=file]):not(:disabled)')) {
            input.focus(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const r = box(input), v = box(scroll);
            check(document.activeElement === input, 'Native local fixture field did not focus');
            check(r.y >= v.y - 1 && r.bottom <= v.bottom + 1, 'Focused native field is obscured');
            check(Math.abs(scroll.scrollLeft) <= 1, 'Focus caused horizontal scrolling');
            const style = getComputedStyle(input), shell = input.closest('.input-shell');
            check(parseFloat(style.outlineWidth) >= 2 || !!shell && parseFloat(getComputedStyle(shell).outlineWidth) >= 2, 'Native field/shell focus ring missing');
            focus.push({ ...r, fontSize: style.fontSize }); input.blur();
          }
          if (kind === 'lan' && stateName === 'offline') check(host.querySelector('.scan-button').disabled, 'Offline scan must stay disabled');
          if (kind === 'lan' && stateName === 'results') check([...host.querySelectorAll('.service-state')].every(visible), 'Resolved/resolving state must not disappear on narrow screens');
          if (['ble','wifi'].includes(kind)) {
            check(host.querySelector('.primary-button').disabled, 'Fixture must never enable a real upgrade');
            const progress = host.querySelector('[role=progressbar]');
            if (progress) check(Number(progress.getAttribute('aria-valuenow')) === (stateName === 'success' ? 100 : 50), 'Progress semantic value differs from fixture');
          }
          scroll.scrollTop = scroll.scrollHeight; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const last = box(main.lastElementChild); check(last.bottom <= environment.height - environment.safeBottom + 1, 'Last content does not clear bottom safe area');
          scroll.scrollTop = 0;
          return { errors, header, viewport, main: box(main), targets, texts, focus, last };
        }, { environment, kind: state.kind, stateName: state.name });
        measurements.push({ label, ...environment, kind: state.kind, state: state.name, ...result });
        if (result.errors.length) failures.push({ label, errors: result.errors });
        if (environment.width === 320 && environment.rootSize === 24 && environment.theme === 'light'
          && ['results','error','error-recovery','busy'].includes(state.name)
          || environment.width === 375 && ['offline','idle','ready'].includes(state.name)) {
          const file = join(outputDir, `${state.kind}-${state.name}-${environment.width}-root${environment.rootSize}-${environment.theme}.png`);
          await page.screenshot({ path: file }); screenshots.push(file);
          if (['ble','wifi'].includes(state.kind)) { await page.locator('main > :last-child').scrollIntoViewIfNeeded(); const lower = file.replace('.png', '-lower.png'); await page.screenshot({ path: lower }); screenshots.push(lower); }
        }
        if (environment.width === 320 && environment.rootSize === 24
          && (state.kind === 'lan' && state.name === 'results' && environment.theme === 'light'
            || state.kind === 'gateway' && state.name === 'waiting' && environment.theme === 'dark'
            || state.kind === 'wifi' && state.name === 'idle' && environment.theme === 'light')) {
          const selector = state.kind === 'lan' ? '.service-details' : state.kind === 'gateway' ? '.result.waiting' : '.field-row';
          await page.locator(selector).first().scrollIntoViewIfNeeded();
          const file = join(outputDir, `${state.kind}-${state.name}-${environment.width}-root${environment.rootSize}-${environment.theme}-detail.png`);
          await page.screenshot({ path: file }); screenshots.push(file);
        }
      } catch (error) { failures.push({ label, errors: [String(error.stack ?? error)] }); }
    }
    assert.deepEqual(pageErrors, []); assert.deepEqual(requestErrors, []); assert.equal(externalRequests, 0); assert.equal(writeRequests, 0);
    for (const [path, hash] of Object.entries(sourceHashes)) assert.equal(digest(read(path)), hash, `Frozen source changed during matrix: ${path}`);
  } catch (error) { failures.push({ label: 'runner', errors: [String(error.stack ?? error)] }); }
  finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
    const report = { kind: 'actual-template-AST-Emulated-SCSS-installed-Ionic-static-local-fixtures-not-Angular-or-native',
      fixtureBoundary: 'Local presentation fixtures, never real contents or request evidence; handlers/services/storage/native capabilities are absent',
      passed: failures.length === 0, environmentCount: environments.length, stateCount: measurements.length, sourceHashes,
      derived: Object.fromEntries(Object.entries(derived).map(([kind, value]) => [kind, { sourceHash: value.sourceHash, derivedHash: value.derivedHash, changes: value.changes }])),
      externalRequests, writeRequests, failures, pageErrors, requestErrors, measurements, screenshots };
    writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ passed: report.passed, outputDir, environmentCount: environments.length, stateCount: measurements.length,
      failureCount: failures.length, firstFailures: failures.slice(0, 8).map(item => ({ label: item.label, firstError: item.errors[0], errorCount: item.errors.length })), externalRequests, writeRequests }, null, 2));
  }
  assert.equal(measurements.length, environments.length * states.length, 'Complete bounded actual-template matrix');
  assert.equal(failures.length, 0, 'Finite tool/gateway presentation checks; see report.json');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runToolBrowser();
