import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const app = new URL('../', import.meta.url);
const workflow = fs.readFileSync(new URL('.github/workflows/build-web.yml', app), 'utf8').replace(/\r\n/g, '\n');
const manifest = JSON.parse(fs.readFileSync(new URL('package.json', app), 'utf8'));
const step = name => {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `Missing workflow step: ${name}`);
  const end = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, end < 0 ? undefined : end);
};

test('App deployment consumes its declared pnpm workspace and frozen lock', () => {
  assert.match(manifest.packageManager, /^pnpm@\d+\.\d+\.\d+$/);
  const node = /NODE_VERSION: "(\d+)\.(\d+)\.(\d+)"/.exec(workflow).slice(1).map(Number);
  assert.ok(manifest.engines.node.split(' || ').some(range => {
    const minimum = range.replace(/^\^/, '').split('.').map(Number);
    return node[0] === minimum[0] && (node[1] > minimum[1] || node[1] === minimum[1] && node[2] >= minimum[2]);
  }), 'The deployment Node release must satisfy the declared supported major/minimum');
  assert.equal(fs.existsSync(new URL('pnpm-lock.yaml', app)), true);
  assert.equal(fs.existsSync(new URL('package-lock.json', app)), false);
  assert.match(step('Enable the declared package manager'), /run: corepack enable/);
  const build = step('Build web app');
  assert.match(build, /working-directory: blinker-app/);
  assert.match(build, /corepack install\s+pnpm install --frozen-lockfile\s+pnpm --config\.enable-pre-post-scripts=true run build/);
  assert.doesNotMatch(build, /npm ci/);
  assert.match(build, /test -f www\/index\.html/);
  assert.match(manifest.scripts.prebuild, /device-template:build.*custom-panel:build/);
});

test('all file dependencies are sibling checkouts pinned to reviewed commits', () => {
  const expected = {
    'capacitor-android-shortcuts': ['coloz', '2c187e447542843dba1264bd95c297686ade6c49'],
    'capacitor-mdns': ['i3water', '00f994f2896327781c64f93851932f1acbddcb8e'],
    'capacitor-ntfy': ['i3water', '83b57ee2efdd829db025d37fb898d349e6cd6a35'],
    'capacitor-wechat': ['coloz', 'ba0bfc5677b2a0dfe11d231c43b52e07af0bf487'],
    'capacitor-wifiprov': ['i3water', 'a21e87642a853242677f7dccd8847e9785837ab0'],
  };
  const local = Object.entries(manifest.dependencies).filter(([, ref]) => ref.startsWith('file:'));
  assert.deepEqual(local.map(([name]) => name).sort(), Object.keys(expected).sort());
  for (const [name, ref] of local) {
    assert.equal(ref, `file:../${name}`);
    const [owner, commit] = expected[name];
    const checkout = step(`Checkout ${name}`);
    assert.match(checkout, new RegExp(`repository: ${owner}/${name}\\s+ref: ${commit}\\s+path: ${name}`));
    assert.match(checkout, /persist-credentials: false/);
  }
  const plugins = step('Build local Capacitor plugins');
  assert.match(plugins, /npm --prefix "\$plugin" ci/);
  assert.match(plugins, /npm --prefix "\$plugin" run build/);
});

test('merge preserves the deployment branch, runner and non-destructive upload contract', () => {
  assert.match(workflow, /branches:\s+- 3\.0-deploy/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/3\.0-deploy'/);
  assert.match(workflow, /runs-on: \[self-hosted, ailydeMac-mini, macOS, ARM64\]/);
  assert.match(workflow, /cancel-in-progress: false/);
  const upload = step('Upload web files');
  assert.match(upload, /source: "blinker-app\/www\/\*"/);
  assert.match(upload, /overwrite: true/);
  assert.match(upload, /rm: false/);
});
