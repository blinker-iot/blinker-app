// Finite public entry over the existing runners. Plain Vitest retains relative
// vi.mock for the two core suites; Angular's builder owns the real UI template
// suites. No custom TestBed, template transform, install or private build input.
// Requires the matching sibling ../capacitor-wifiprov source checkout, already
// declared by package.json/pnpm-lock.yaml as a file dependency. The finite
// tsconfig uses that source instead of potentially stale packed declarations.
// Run from any cwd with the repository's already-installed dependencies:
//   node tools/test-access-registration.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const preflightOnly = process.argv.length === 3 && process.argv[2] === '--preflight';
if (process.argv.length !== 2 && !preflightOnly) {
  console.error('Usage: node tools/test-access-registration.mjs [--preflight]');
  process.exitCode = 2;
} else {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const config = 'tools/test-access-registration.tsconfig.json';
  const read = JSON.parse(fs.readFileSync(path.join(root, config), 'utf8'));
  const app = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const pluginSources = ['index.ts', 'definitions.ts', 'web.ts'];
  if (app.dependencies?.['capacitor-wifiprov'] !== 'file:../capacitor-wifiprov'
    || !pluginSources.every(file => fs.existsSync(path.resolve(root, '../capacitor-wifiprov/src', file)))) {
    throw Error('The matching sibling capacitor-wifiprov source checkout is required by the existing file dependency');
  }
  const tests = read.include.filter(name => name.endsWith('.spec.ts'))
    .map(name => path.posix.normalize('tools/' + name));
  if (tests.length !== 4 || new Set(tests).size !== 4
    || tests.some(name => !name.startsWith('src/app/') || !fs.existsSync(path.join(root, name)))) {
    throw Error('Exact four access-registration test inputs are required');
  }
  const angular = path.join(root, 'node_modules/@angular/cli/bin/ng.js');
  const vitest = path.join(root, 'node_modules/vitest/vitest.mjs');
  if (![angular, vitest].every(file => fs.existsSync(file))) {
    throw Error('Install the existing lockfile dependencies before testing');
  }
  const core = tests.filter(name => /\/(access-registration-ports|device-v2-ble-access-registration)\.spec\.ts$/.test(name));
  const template = tests.filter(name => !core.includes(name));
  if (core.length !== 2 || template.length !== 2) throw Error('Exact core/template suite partition required');
  for (const args of preflightOnly ? [] : [
    [vitest, 'run', '--config=tools/test-access-registration.vitest.mts'],
    [angular, 'test', 'app', '--watch=false', '--progress=false', '--coverage=false',
      '--ts-config=' + config, ...template.map(name => '--include=' + name)],
  ]) {
    const status = await new Promise(resolve => {
      const child = spawn(process.execPath, args, {
        cwd: root, shell: false, windowsHide: true, stdio: 'inherit',
        env: { ...process.env, NG_BUILD_MAX_WORKERS: '1' },
      });
      child.once('error', error => {
        console.error('Access-registration test process could not start:', error.code || error.name);
        resolve(1);
      });
      child.once('close', (status, signal) => {
        if (signal) console.error('Access-registration test process stopped:', signal);
        resolve(Number.isInteger(status) ? status : 1);
      });
    });
    if (status !== 0) { process.exitCode = status; break; }
  }
  if (preflightOnly) console.log('Access-registration preflight passed: four suites, original installed runners and sibling WiFiProv source files exist. Matching source/native versions still require review.');
}
