import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = new URL('../../', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('package.json', app), 'utf8'));

test('the custom-panel packer declares its direct bundler in the root frozen importer', () => {
  const packer = fs.readFileSync(new URL('tools/custom-panel/pack.mjs', app), 'utf8');
  assert.match(packer, /import\s+\{\s*build\s*\}\s+from\s+['"]esbuild['"]/);
  const version = manifest.devDependencies.esbuild;
  assert.match(version ?? '', /^\d+\.\d+\.\d+$/, 'A root build script must not rely on a transitive esbuild');
  const lock = fs.readFileSync(new URL('pnpm-lock.yaml', app), 'utf8').replace(/\r\n/g, '\n');
  const rootImporter = lock.split('\n  .:\n')[1]?.split(/\n  \S/)[0] ?? '';
  const escaped = version.replaceAll('.', '\\.');
  assert.match(rootImporter, new RegExp(`^      esbuild:\\n        specifier: ${escaped}\\n        version: ${escaped}(?:\\n|$)`, 'm'));
});
