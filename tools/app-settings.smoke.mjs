// Real compiled App, public login -> settings only, disposable browser context.
// No login, account substitution, service deployment or device operations.
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

assert.ok(process.argv[2] && isAbsolute(process.argv[2]), 'Pass the absolute compiled browser directory');
const root = resolve(process.argv[2]);
assert.ok(existsSync(resolve(root, 'index.html')), 'Build the App before this smoke check');
const require = createRequire(import.meta.url);
for (const key of ['SETTINGS_BROWSER_DRIVER', 'SETTINGS_BROWSER_EXECUTABLE']) {
  if (process.env[key]) assert.ok(isAbsolute(process.env[key]), `${key} must be absolute`);
}
const { chromium } = require(process.env.SETTINGS_BROWSER_DRIVER || 'playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const server = createServer((request, response) => {
  let file;
  try { file = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)); }
  catch { response.writeHead(400).end(); return; }
  if (relative(root, file).startsWith('..')) { response.writeHead(403).end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = resolve(root, 'index.html');
  response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  createReadStream(file).pipe(response);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.SETTINGS_BROWSER_EXECUTABLE ? { executablePath: process.env.SETTINGS_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 },
    timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  let blockedExternalRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    if (route.request().url().startsWith(origin + '/')) return route.continue();
    blockedExternalRequests++;
    return route.abort();
  });
  await page.goto(origin + '/login');
  try {
    await page.getByRole('button', { name: '打开设置', exact: true }).click({ timeout: 10000 });
  } catch (error) {
    console.error(JSON.stringify({ stage: 'public login entry', pageErrors: errors,
      body: (await page.locator('body').innerText()).slice(0, 1000) }));
    throw error;
  }
  await page.waitForURL('**/settings?from=login');
  const settings = page.locator('app-settings');
  await settings.locator('details').first().waitFor();
  assert.equal(await settings.locator('details[open]').count(), 0);
  const readSurfaces = () => settings.evaluate(element => {
    const content = element.querySelector('ion-content');
    const pageSurface = getComputedStyle(content.shadowRoot.querySelector('[part="background"]'));
    return {
      page: pageSurface.backgroundColor,
      card: getComputedStyle(element.querySelector('.settings-card')).backgroundColor,
      toolbar: getComputedStyle(element.querySelector('ion-toolbar')).getPropertyValue('--ion-toolbar-background').trim(),
    };
  });
  const lightSurfaces = await readSurfaces();
  assert.equal(lightSurfaces.page, 'rgb(242, 243, 245)');
  assert.equal(lightSurfaces.card, 'rgb(255, 255, 255)');
  await settings.locator('details').nth(1).locator('summary').click();
  await settings.locator('input[name="app-theme"][value="dark"]').check();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const surfaces = await readSurfaces();
  assert.equal(surfaces.page, 'rgb(17, 18, 21)', 'migrated content must not inherit the old blue page');
  assert.equal(surfaces.card, 'rgb(32, 34, 38)', 'migrated card must use the reviewed surface');
  await settings.locator('details').first().locator('summary').click();
  await settings.locator('input[name="app-language"][value="en"]').check();
  await page.waitForFunction(() => localStorage.getItem('language') === 'en');
  await settings.locator('input[name="app-language"][value="zh_cn"]').check();
  await page.waitForFunction(() => localStorage.getItem('language') === 'zh_cn');

  // A new public dictionary read fails; no API/command is intercepted or replayed.
  await page.route('**/i18n/ja/ja.json', route => route.abort());
  await settings.locator('input[name="app-language"][value="ja"]').check();
  await settings.locator('.error[role="alert"]').waitFor();
  assert.equal(await settings.locator('input[name="app-language"][value="zh_cn"]').isChecked(), true);
  assert.equal(await settings.locator('input[name="app-language"][value="ja"]').isChecked(), false);
  assert.equal(await settings.locator('.language-options').isDisabled(), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('language')), 'zh_cn');
  assert.equal(await page.evaluate(() => !!localStorage.getItem('session') || !!localStorage.getItem('blinker-dev-web-session')), false);

  const screenshots = [];
  const output = fileURLToPath(new URL('../tmp/app-settings-smoke/', import.meta.url));
  mkdirSync(output, { recursive: true });
  for (const [width, height] of [[320, 812], [844, 480]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await settings.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    const path = resolve(output, `settings-${width}.png`);
    await page.screenshot({ path });
    screenshots.push(path);
  }
  await settings.locator('ion-back-button').click();
  await page.waitForURL('**/login');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(JSON.stringify({ status: 'PASS', publicEntry: 'login -> settings -> login',
    themeAndLanguage: 'applied through existing services', failedLanguageRead: 'inline error and real selection restored',
    noAccount: true, lightSurfaces, darkSurfaces: surfaces, errors, blockedExternalRequests, screenshots,
    limit: 'Desktop Chromium with actual compiled Angular/Ionic; not native safe-area, keyboard, device or real account acceptance.' }, null, 2));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
