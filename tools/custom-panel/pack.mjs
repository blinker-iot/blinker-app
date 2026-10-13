import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { build } from 'esbuild';

const root = resolve('dist/custom-panel');
const assets = resolve('public/custom-panel-runtime');

await mkdir(assets, { recursive: true });

const bundle = await build({ entryPoints: [resolve(root, 'main.js')], bundle: true,
  format: 'iife', write: false, minify: true, target: 'es2022' });

async function inlineFonts(css, base) {
  const urls = [...new Set([...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1]))];

  for (const url of urls) {
    if (!/\.(woff2?|ttf)$/.test(url)) continue;

    const bytes = await readFile(resolve(base, url));
    const mime = url.endsWith('woff2') ? 'font/woff2' : url.endsWith('woff') ? 'font/woff' : 'font/ttf';

    css = css.split(url).join(`data:${mime};base64,${bytes.toString('base64')}`);
  }

  return css;
}

let styles = await inlineFonts(await readFile(resolve(root, 'styles.css'), 'utf8'), root);

for (const file of ['fontawesome.min.css', 'light.min.css']) {
  const path = resolve('public/fontawesome6/css', file);

  styles += await inlineFonts(await readFile(path, 'utf8'), dirname(path));
}

await writeFile(resolve(assets, 'runtime.json'), JSON.stringify({ script: bundle.outputFiles[0].text, styles }));

const guideBundle = await build({
  stdin: { contents: `export { ATOM_GUIDE } from './src/app/device/custom-panel/atom-catalog.ts';
export { CUSTOM_PANEL_TEMPLATE } from './src/app/device/custom-panel/custom-panel-template.ts';`, resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false,
});

const { ATOM_GUIDE, CUSTOM_PANEL_TEMPLATE } = await import('data:text/javascript;base64,' + Buffer.from(guideBundle.outputFiles[0].text).toString('base64'));

await writeFile(resolve(assets, 'template.html'), CUSTOM_PANEL_TEMPLATE);
await writeFile(resolve(assets, 'atoms.json'), JSON.stringify(ATOM_GUIDE, null, 2));
