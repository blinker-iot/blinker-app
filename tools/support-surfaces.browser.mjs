// Finite presentation regression: actual template AST, literal source content,
// Angular Emulated SCSS and installed Ionic. No Angular bootstrap, handlers,
// credentials, APIs, native IME, saved data or device acceptance are exercised.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encapsulateStyle } from '@angular/compiler';
import { compile, dictionary, presentation, read, renderTemplate } from './discovery-collection.browser.mjs';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const ts = require('typescript'), data = presentation();
const paths = {
  services: 'src/app/sections/third-party-services/third-party-services.page',
  about: 'src/app/sections/about/about.page',
};
const sourceHashes = {};
const remember = path => {
  const value = read(path); sourceHashes[path] = createHash('sha256').update(value).digest('hex'); return value;
};

// Read only literals from the actual source. Do not execute or instantiate the
// page, its services, local storage, providers or validation network requests.
function literal(node) {
  assert.ok(node, 'Expected an actual literal initializer');
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
    assert.ok(ts.isPropertyAssignment(property), 'Only literal property assignments are supported');
    assert.ok(ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name));
    return [property.name.text, literal(property.initializer)];
  }));
  assert.fail(`Unsupported literal input: ${ts.SyntaxKind[node.kind]}`);
}
const servicesSource = ts.createSourceFile(paths.services + '.ts', remember(paths.services + '.ts'), ts.ScriptTarget.Latest, true);
function member(name) {
  const page = servicesSource.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'ThirdPartyServicesPage');
  assert.ok(page, 'Actual ThirdPartyServicesPage missing');
  return literal(page.members.find(node => ts.isPropertyDeclaration(node) && node.name?.getText(servicesSource) === name)?.initializer);
}
const weatherProviders = member('weatherProviders'), geolocationProviders = member('geolocationProviders');
const configPath = 'src/app/configs/app.config.ts';
const configSource = ts.createSourceFile(configPath, remember(configPath), ts.ScriptTarget.Latest, true);
const configDeclaration = configSource.statements.filter(ts.isVariableStatement)
  .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(configSource) === 'CONFIG');
const config = literal(configDeclaration?.initializer);
assert.equal(typeof config.ABOUT_US, 'string');
const selectLongestName = providers => [...providers].sort((a, b) => b.name.length - a.name.length)[0].id;
const selectedWeatherProvider = selectLongestName(weatherProviders), selectedGeolocationProvider = selectLongestName(geolocationProviders);
const selectedProviderLabels = {
  'active-weather-provider': weatherProviders.find(provider => provider.id === selectedWeatherProvider).name,
  'active-geolocation-provider': geolocationProviders.find(provider => provider.id === selectedGeolocationProvider).name,
};
const states = ['idle', 'validating', 'invalid', 'valid'].map(status => ({
  kind: 'services', name: status,
  model: {
    weatherProviders, geolocationProviders, selectedWeatherProvider, selectedGeolocationProvider,
    weatherKeys: Object.fromEntries(weatherProviders.map(provider => [provider.id, ''])),
    geolocationKeys: Object.fromEntries(geolocationProviders.map(provider => [provider.id, ''])),
    weatherValidationStatus: status, geolocationValidationStatus: status,
    hasSavedWeatherKeys: status !== 'idle', hasSavedGeolocationKeys: status !== 'idle',
  },
}));
states.push({ kind: 'about', name: 'information', model: { ABOUT_US: config.ABOUT_US } });
const css = Object.fromEntries(Object.entries(paths).map(([kind, path]) => {
  remember(path + '.html'); remember(path + '.scss');
  return [kind, encapsulateStyle(compile(path + '.scss'), `ui34-${kind}`)];
}));
const globalCss = data.baseCss + compile('src/app/sections/_transparent-page-header.scss');
const environments = [];
for (const rootSize of [16, 24]) for (const theme of ['light', 'dark']) for (const mode of ['ios', 'md'])
  environments.push({ width: 320, height: 704, rootSize, theme, mode });
environments.push(
  { width: 375, height: 812, rootSize: 16, theme: 'light', mode: 'ios' },
  { width: 375, height: 812, rootSize: 24, theme: 'dark', mode: 'md' },
  { width: 844, height: 390, rootSize: 16, theme: 'light', mode: 'md' },
  { width: 844, height: 390, rootSize: 24, theme: 'dark', mode: 'ios' },
);
for (const name of ['WIDGET_BROWSER_DRIVER', 'WIDGET_BROWSER_EXECUTABLE', 'SUPPORT_SURFACES_OUTPUT_DIR'])
  if (process.env[name]) assert.ok(isAbsolute(process.env[name]), `${name} must be absolute`);
const destination = resolve(process.env.SUPPORT_SURFACES_OUTPUT_DIR || join(tmpdir(), 'blinker-support-ui'));
const fromRepo = relative(fileURLToPath(root), destination);
assert.ok(fromRepo === '..' || fromRepo.startsWith('..' + sep) || isAbsolute(fromRepo), 'Evidence must stay outside the App worktree');
mkdirSync(destination, { recursive: true });
const outputDir = mkdtempSync(join(destination, 'support-'));
const failures = [], measurements = [], screenshots = [], pageErrors = [], requestErrors = [];
let browser, externalRequests = 0, writeRequests = 0;
const server = createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { writeRequests++; response.writeHead(405).end(); return; }
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  if (pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fontawesome6/css/all.min.css"></head><body></body></html>'); return;
  }
  let file;
  if (/^\/ionic\/[\w./-]+\.(js|svg)$/.test(pathname) && !pathname.includes('..')) file = new URL('node_modules/@ionic/core/' + pathname.slice(7), root);
  else if (/^\/fontawesome6\/(?:css\/[\w.-]+\.css|webfonts\/[\w.-]+\.(?:woff2?|ttf))$/.test(pathname)) file = new URL('public' + pathname, root);
  if (!file) { requestErrors.push(pathname); response.writeHead(404).end(); return; }
  try {
    response.setHeader('Content-Type', { js: 'text/javascript', svg: 'image/svg+xml', css: 'text/css', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf' }[pathname.split('.').at(-1)]);
    response.end(readFileSync(file));
  } catch { requestErrors.push(pathname); response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`, deadline = Date.now() + 180000;
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
  await page.goto(origin);
  await page.addStyleTag({ content: data.themeCss + 'html,body{margin:0;overflow:hidden}*{box-sizing:border-box}' });
  await page.evaluate(async () => { const { defineCustomElements } = await import('/ionic/loader/index.es2017.js'); await defineCustomElements(window); });
  for (const environment of environments) for (const state of states) {
    const label = `${state.kind}/${state.name}/${environment.width}/root${environment.rootSize}/${environment.theme}/${environment.mode}`;
    try {
      assert.ok(Date.now() < deadline, 'Finite browser deadline exceeded');
      const html = renderTemplate(paths[state.kind] + '.html', state.model, dictionary(), { isKeyVisible: () => false });
      await page.setViewportSize({ width: environment.width, height: environment.height });
      await page.evaluate(({ environment, state, html, globalCss, pageCss }) => {
        const safeTop = environment.width > environment.height ? 0 : 35;
        const safeSides = environment.width > environment.height ? 20 : 0;
        document.documentElement.dataset.uiTheme = environment.theme === 'light' ? 'natural' : 'dark';
        document.documentElement.style.cssText = `font-size:${environment.rootSize}px;color-scheme:${environment.theme};--ion-safe-area-top:${safeTop}px;--ion-safe-area-bottom:26px;--ion-safe-area-left:${safeSides}px;--ion-safe-area-right:${safeSides}px`;
        document.body.innerHTML = `<style>${globalCss}${pageCss}support-probe{display:block;position:absolute;inset:0;background:var(--blinker-bg)}</style><support-probe class="ion-page" _nghost-ui34-${state.kind}>${html}</support-probe>`;
        const host = document.querySelector('support-probe');
        for (const node of host.querySelectorAll('*')) {
          node.setAttribute(`_ngcontent-ui34-${state.kind}`, '');
          if (node.localName.startsWith('ion-')) node.setAttribute('mode', environment.mode);
        }
        // Static HTML rendering does not apply Angular option-selection props;
        // reflect the real readonly input model without firing a change event.
        for (const select of host.querySelectorAll('select')) {
          for (const option of select.options) option.value = option.getAttribute('ngValue');
          select.value = select.getAttribute('value');
        }
      }, { environment, state: { kind: state.kind }, html, globalCss, pageCss: css[state.kind] });
      await page.waitForFunction(() => [...document.querySelectorAll('ion-header,ion-toolbar,ion-title,ion-buttons,ion-back-button,ion-content')]
        .every(node => node.classList.contains('hydrated')));
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      const result = await page.evaluate(async ({ kind, width, height, rootSize, status, selectedProviderLabels }) => {
        const host = document.querySelector('support-probe'), content = host.querySelector('ion-content'), main = host.querySelector('main');
        const scroll = await content.getScrollElement(), header = host.querySelector('ion-header'), toolbar = host.querySelector('ion-toolbar');
        const errors = [], check = (condition, error) => { if (!condition) errors.push(error); };
        const box = node => { const r = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : node; return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const rgb = value => {
          if (value.startsWith('color(srgb')) {
            const parts = value.slice(10, -1).trim().split(/[\s/]+/).map(Number); return [...parts.slice(0, 3).map(v => v * 255), parts[3] ?? 1];
          }
          return value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
        };
        const over = (top, bottom) => top.slice(0, 3).map((v, i) => v * (top[3] ?? 1) + bottom[i] * (1 - (top[3] ?? 1)));
        const luminance = color => color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
          .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const background = element => {
          const colors = [];
          while (element) { colors.push(rgb(getComputedStyle(element).backgroundColor)); element = element.parentElement; }
          return colors.reverse().reduce((bottom, top) => over(top, bottom), [255, 255, 255]);
        };
        const rangeBoxes = element => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), results = []; let text;
          while ((text = walker.nextNode())) if (text.textContent.trim()) {
            const range = document.createRange(); range.selectNodeContents(text); results.push(...[...range.getClientRects()].map(box));
          }
          return results;
        };
        const headerBox = box(header), scrollBox = box(scroll), toolbarBox = box(toolbar);
        const safeTop = width > height ? 0 : 35;
        check(Math.abs(headerBox.height - (safeTop + 56)) <= 1, '56px header plus safe top not retained');
        const toolbarClip = toolbar.shadowRoot.querySelector('.toolbar-container');
        check(Math.abs(box(toolbarClip).height - 56) <= 1, 'Toolbar body height changed');
        check(document.documentElement.scrollWidth <= width + 1, 'document horizontal overflow');
        check(host.scrollWidth <= width + 1, 'host horizontal overflow');
        check(scroll.scrollWidth <= scroll.clientWidth + 1, 'ion-content horizontal overflow');
        check(main.scrollWidth <= main.clientWidth + 1, 'main horizontal overflow');
        const mainBox = box(main);
        check(mainBox.width <= 720.5 && mainBox.x >= 0 && mainBox.right <= width + 1, 'content max width or centered bounds changed');
        check(matchMedia('(prefers-reduced-motion: reduce)').matches, 'reduced motion absent');
        const back = host.querySelector('ion-back-button'), nativeBack = back.shadowRoot.querySelector('button,a');
        check(!!nativeBack, 'actual Ionic back target absent');
        for (const element of [back, nativeBack, ...host.querySelectorAll('.key-toggle,.clear-button,.save-button,.legal-card button')].filter(Boolean)) {
          const bounds = box(element);
          check(bounds.width >= 47.5 && bounds.height >= 47.5, `${element.localName}.${element.className}: target below48`);
          check(bounds.x >= -.5 && bounds.right <= width + .5, `${element.localName}.${element.className}: target outside width`);
        }
        const texts = [...host.querySelectorAll('.selector-help,.privacy-tip p,.service-card-heading p,.field-label,.about-description,.card-heading p,.capability-grid strong,.capability-grid small,.legal-copy small,.copyright,.save-button,.clear-button')];
        const contrast = [];
        for (const element of texts) {
          const computed = getComputedStyle(element), bounds = box(element), bg = background(element), fg = over(rgb(computed.color), bg);
          const [high, low] = [luminance(fg), luminance(bg)].sort((a, b) => b - a), ratio = (high + .05) / (low + .05);
          contrast.push({ selector: element.className || element.localName, ratio });
          check(ratio >= 4.5 - .01, `${element.localName}.${element.className}: text contrast below4.5 (${ratio.toFixed(2)})`);
          check(computed.textOverflow !== 'ellipsis' && computed.webkitLineClamp === 'none', `${element.localName}.${element.className}: essential text clamped`);
          if (bounds.width && bounds.height) {
            check(element.scrollWidth <= element.clientWidth + 1 || element.clientWidth === 0, `${element.localName}.${element.className}: text horizontal overflow`);
            for (const range of rangeBoxes(element)) check(range.x >= bounds.x - 1 && range.right <= bounds.right + 1
              && range.y >= bounds.y - 1 && range.bottom <= bounds.bottom + 1, `${element.localName}.${element.className}: text outside own box`);
          }
        }
        const title = host.querySelector('ion-title'), titleBox = box(title);
        check(toolbarClip.scrollWidth <= toolbarClip.clientWidth + 1, 'toolbar hidden horizontal overflow');
        for (const range of rangeBoxes(title)) check(range.x >= titleBox.x - 1 && range.right <= titleBox.right + 1, 'header title clipped');
        const focus = [];
        if (kind === 'services') {
          check(Math.abs(scrollBox.y - headerBox.bottom) <= 1, 'form scrollport still begins beneath transparent header');
          check(host.querySelectorAll('input').length === 2, 'actual selected provider inputs missing');
          for (const select of host.querySelectorAll('select')) {
            check(select.selectedIndex >= 0 && select.value === select.getAttribute('value'), `${select.id}: actual ngValue selection missing`);
            check(select.selectedOptions[0]?.textContent.trim() === selectedProviderLabels[select.id], `${select.id}: selected real provider label differs from literal source`);
          }
          check([...host.querySelectorAll('input')].every(input => input.type === 'password'), 'key not masked by pure presentation input');
          check([...host.querySelectorAll('.save-button')].every(button => button.disabled === (status === 'validating')), 'validation disabled state changed');
          check(host.querySelectorAll('.validation-label').length === (status === 'idle' ? 0 : 2), 'actual validation presentation state missing');
          for (const input of host.querySelectorAll('input,select')) {
            const beforeTop = scroll.scrollTop;
            // Ordinary focus must reveal the control inside the production
            // scrollport. No preventScroll or scripted scroll compensation.
            input.focus();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const inputBox = box(input), viewport = box(scroll), outline = getComputedStyle(input.closest('.input-shell,.select-shell'));
            focus.push({ id: input.id, beforeTop, afterTop: scroll.scrollTop, box: inputBox, viewport, outline: outline.outlineWidth });
            check(document.activeElement === input, `${input.id}: native control did not focus`);
            check(inputBox.y >= viewport.y - 1 && inputBox.bottom <= viewport.bottom + 1, `${input.id}: focused control obscured`);
            check(parseFloat(outline.outlineWidth) >= 2, `${input.id}: keyboard focus ring absent`);
            check(Math.abs(scroll.scrollLeft) <= 1, `${input.id}: focus scrolled horizontally`);
            input.blur();
          }
          check(Math.abs(parseFloat(getComputedStyle(host.querySelector('input')).fontSize) - rootSize) < .1, 'input did not scale with root text');
        } else {
          const items = [...host.querySelectorAll('.capability-grid article')].map(box);
          check(items.length === 3, 'actual capabilities changed');
          check(width < 720 ? items[1].y > items[0].y && items[2].y > items[1].y : Math.abs(items[0].y - items[2].y) <= 1,
            'capability layout not phone vertical / wide three-column');
          const legalCopy = [...host.querySelectorAll('.legal-copy small')];
          check(legalCopy.length === 2, 'both original legal descriptions must remain');
          check(legalCopy.every(item => getComputedStyle(item).whiteSpace !== 'nowrap'), 'legal description still forced to one line');
        }
        return { errors, header: headerBox, toolbar: toolbarBox, scrollport: scrollBox, main: mainBox, focus, minimumContrast: Math.min(...contrast.map(item => item.ratio)),
          contrast, actualTitle: title.textContent.trim(), bodyText: main.textContent.trim(), rootFont: getComputedStyle(document.documentElement).fontSize };
      }, { kind: state.kind, status: state.name, ...environment, selectedProviderLabels });
      if (state.kind === 'services' && state.name !== 'validating') {
        const primary = page.locator('.save-button').first();
        await primary.scrollIntoViewIfNeeded();
        const bounds = await primary.boundingBox();
        assert.ok(bounds, 'Actual primary button missing');
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await page.mouse.down();
        try {
          const pressed = await primary.evaluate(element => {
            const style = getComputedStyle(element);
            const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
            const filter = style.filter, match = /^brightness\(([\d.]+)\)$/.exec(filter);
            const brightness = match ? Number(match[1]) : 1;
            const foreground = rgb(style.color).map(value => value * brightness);
            const background = rgb(style.backgroundColor).map(value => value * brightness);
            const luminance = color => color.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
              .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
            const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
            return { active: element.matches(':active'), disabled: element.disabled, color: style.color, background: style.backgroundColor,
              filter, brightness, sampledContrast: (high + .05) / (low + .05) };
          });
          result.pressed = pressed;
          if (!pressed.active || pressed.disabled || pressed.brightness !== .94 || pressed.sampledContrast < 4.5)
            result.errors.push('Real enabled mouse-down primary feedback / composed contrast failed');
          if (environment.width === 320 && environment.rootSize === 24 && environment.mode === 'md' && state.name === 'idle') {
            const file = join(outputDir, `services-primary-pressed-${environment.theme}-320-root24-md.png`);
            await primary.screenshot({ path: file }); screenshots.push(file);
          }
        } finally {
          // Releasing outside the button avoids a click/native form submit.
          await page.mouse.move(1, 1); await page.mouse.up();
        }
      }
      measurements.push({ label, ...environment, kind: state.kind, state: state.name, ...result });
      if (result.errors.length) failures.push({ label, errors: result.errors });
      if (environment.width === 320 && environment.rootSize === 24 && environment.theme === 'light' && environment.mode === 'md'
        || environment.width === 375 && environment.rootSize === 16 && ['idle', 'information'].includes(state.name)) {
        await page.evaluate(async () => { const scroll = await document.querySelector('ion-content').getScrollElement(); scroll.scrollTop = 0; });
        const file = join(outputDir, `${state.kind}-${state.name}-${environment.width}-root${environment.rootSize}-${environment.theme}-${environment.mode}.png`);
        await page.screenshot({ path: file }); screenshots.push(file);
        if (environment.width === 320 && state.name === 'information' || environment.width === 320 && state.name === 'idle') {
          const section = page.locator(state.kind === 'about' ? '.legal-card' : '.service-section').last();
          await section.scrollIntoViewIfNeeded();
          const lower = join(outputDir, `${state.kind}-${state.name}-lower-320-root24-light-md.png`);
          await page.screenshot({ path: lower }); screenshots.push(lower);
        }
      }
    } catch (error) { failures.push({ label, errors: [String(error.stack ?? error)] }); }
  }
  assert.deepEqual(pageErrors, []); assert.deepEqual(requestErrors, []); assert.equal(externalRequests, 0); assert.equal(writeRequests, 0);
} catch (error) { failures.push({ label: 'runner', errors: [String(error.stack ?? error)] }); }
finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  const report = { kind: 'actual-template-AST-literal-content-Emulated-SCSS-installed-Ionic-not-Angular-or-native',
    passed: failures.length === 0, sourceHashes, environmentCount: environments.length, stateCount: measurements.length,
    selectedWeatherProvider, selectedGeolocationProvider, externalRequests, writeRequests, failures, pageErrors, requestErrors, measurements, screenshots };
  writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ passed: report.passed, environmentCount: report.environmentCount, stateCount: report.stateCount,
    failures: failures.map(item => ({ label: item.label, firstError: item.errors[0], errorCount: item.errors.length })), externalRequests, writeRequests, outputDir }, null, 2));
}
assert.equal(measurements.length, environments.length * states.length, 'Complete the bounded actual-template matrix');
assert.equal(failures.length, 0, 'Finite support-page presentation regressions; see report.json');
