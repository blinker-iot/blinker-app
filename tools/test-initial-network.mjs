// Finite original runners: pure ports first, then the existing real template.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preflight = process.argv.length === 3 && process.argv[2] === '--preflight';
if (process.argv.length !== (preflight ? 3 : 2)) throw Error('Use [--preflight]');
const page = 'src/app/tools/bc5-acceptance/bc5-acceptance.page.initial-network.spec.ts';
const config = 'tools/test-initial-network.tsconfig.json';
for (const file of [page, config, 'tools/test-initial-network.vitest.mts',
  'node_modules/@angular/cli/bin/ng.js', 'node_modules/vitest/vitest.mjs',
  '../capacitor-wifiprov/src/index.ts']) {
  if (!fs.existsSync(path.resolve(root, file))) throw Error('Matching source input missing: ' + file);
}
for (const args of preflight ? [] : [
  ['node_modules/vitest/vitest.mjs', 'run', '--config=tools/test-initial-network.vitest.mts'],
  ['node_modules/@angular/cli/bin/ng.js', 'test', 'app', '--watch=false', '--progress=false', '--coverage=false',
    '--ts-config=' + config, '--include=' + page],
]) {
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, shell: false,
      stdio: 'inherit', env: { ...process.env, NG_BUILD_MAX_WORKERS: '1' } });
    child.once('error', () => resolve(1)); child.once('close', code => resolve(code ?? 1));
  });
  if (code !== 0) { process.exitCode = code; break; }
}
if (preflight) console.log('Initial network finite source preflight passed');
