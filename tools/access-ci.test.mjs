import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inputs, plan, FIXED_PLUGINS, TOOLCHAIN, verifyWorkspace } from './access-ci.mjs';

const valid = { ACCESS_APP_SHA: '1'.repeat(40), ACCESS_WIFIPROV_SHA: '2'.repeat(40),
  ACCESS_LIBRARY_SHA: '3'.repeat(40), ACCESS_ANDROID: 'false' };

test('projection regressions keep a fixed reviewed base available after the new App commit', () => {
  const source = fs.readFileSync(new URL('./access-source-selection.test.mjs', import.meta.url), 'utf8');
  const workflow = fs.readFileSync(new URL('../.github/workflows/device-v2-access.yml', import.meta.url), 'utf8');
  assert.ok(source.includes("reviewedBase + ':' + name"));
  assert.ok(!source.includes("'HEAD:' + name"));
  assert.match(workflow, /path: blinker-app\n[\s\S]*?fetch-depth: 0/);
  const steps = plan(inputs(valid)).steps;
  assert.ok(steps.some(step => step.args.includes('tools/access-source-selection.test.mjs')));
  assert.ok(steps.some(step => step.args.includes('tools/prepare-access-sources.test.mjs')));
  assert.ok(steps.some(step => step.args.includes('--preflight')));
});

test('CI input requires each full commit and an explicit Android choice', () => {
  assert.deepEqual(inputs(valid), { app: '1'.repeat(40), wifiprov: '2'.repeat(40), library: '3'.repeat(40), android: false });
  for (const key of ['ACCESS_APP_SHA', 'ACCESS_WIFIPROV_SHA', 'ACCESS_LIBRARY_SHA']) {
    for (const value of [undefined, 'main', 'abc123', 'A'.repeat(40), '0'.repeat(40), '../escape', 'a'.repeat(40) + '\n']) {
      assert.throws(() => inputs({ ...valid, [key]: value }), /full lowercase commit SHA/);
    }
  }
  for (const value of [undefined, '', '1', true, 'False']) assert.throws(() => inputs({ ...valid, ACCESS_ANDROID: value }), /explicitly/);
});

test('source plan pins all seven repositories and retains the Service golden hold', () => {
  const selected = plan(inputs(valid));
  assert.equal(selected.checkouts.length, 7);
  assert.equal(new Set(selected.checkouts.map(item => item.directory)).size, 7);
  for (const [directory, expected] of Object.entries(FIXED_PLUGINS)) {
    assert.deepEqual(selected.checkouts.find(item => item.directory === directory), { directory, ...expected });
  }
  assert.match(selected.serviceGolden, /^HOLD:/);
  assert.match(selected.libraryCompilation, /Not run here/);
  assert.deepEqual(TOOLCHAIN, { node: 'v22.22.3', npm: '10.9.8', pnpm: '11.19.0' });
  assert.throws(() => plan({ ...inputs(valid), wifiprov: 'main' }), /full lowercase/);
});

test('finite source steps reuse original lock/build/test entries without Android or publishing', () => {
  const selected = plan(inputs(valid));
  assert.equal(selected.steps.filter(step => step.command === 'npm' && step.args[0] === 'ci').length, 5);
  assert.equal(selected.steps.filter(step => step.command === 'npm' && step.args.join(' ') === 'run build').length, 5);
  const install = selected.steps.find(step => step.directory === 'blinker-app' && step.command === 'pnpm');
  assert.deepEqual(install.args, ['install', '--frozen-lockfile', '--ignore-scripts']);
  assert(selected.steps.some(step => step.args.join(' ') === 'tools/test-access-registration.mjs'));
  assert(selected.steps.some(step => step.args.includes('tools/source-handoff.test.mjs') && step.args.includes('tools/cloud-beta.test.mjs')));
  assert(!selected.steps.some(step => step.args.some(arg => /gradlew|publish|deploy|release|update|retries|access-registration-auth\.spec/.test(arg))));
});

test('Android opt-in adds exactly the existing cloud-beta sync and native compile/test/beta tasks', () => {
  const source = plan(inputs(valid)), android = plan(inputs({ ...valid, ACCESS_ANDROID: 'true' }));
  assert.equal(android.androidRequested, true);
  assert.deepEqual(android.steps.slice(0, -2), source.steps);
  assert.deepEqual(android.steps.at(-2), { directory: 'blinker-app', command: 'pnpm', args: ['run', 'sync:cloud-beta'] });
  assert.deepEqual(android.steps.at(-1), { directory: 'blinker-app/android', command: 'sh', args: [
    'gradlew', '--no-daemon', ':capacitor-wifiprov:compileDebugJavaWithJavac',
    ':capacitor-wifiprov:testDebugUnitTest', ':app:assembleBeta',
  ] });
});

test('workspace refuses commit/repository/dirty drift before lock checks or any installer', () => {
  const selected = inputs(valid);
  const git = stdout => () => ({ status: 0, stdout });
  assert.throws(() => verifyWorkspace('/not-a-workspace', selected, git('4'.repeat(40))), /commit drift/);
  assert.throws(() => verifyWorkspace('/not-a-workspace', selected, (command, args, options) => {
    assert.equal(command, 'git'); assert.equal(options.shell, false);
    return { status: 0, stdout: args.includes('HEAD') ? valid.ACCESS_APP_SHA : 'https://github.com/unreviewed/repository' };
  }), /repository drift/);
  assert.throws(() => verifyWorkspace('/not-a-workspace', selected, (command, args) => ({ status: 0,
    stdout: args.includes('HEAD') ? valid.ACCESS_APP_SHA : args.includes('origin') ? 'https://github.com/blinker-iot/blinker-app' : ' M package.json',
  })), /not clean/);
  assert.throws(() => verifyWorkspace('/not-a-workspace', selected, () => ({ status: 1, stdout: '' })), /Cannot verify/);
});

test('manual workflow fixes App event commit, dependency repositories and read-only boundaries', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/device-v2-access.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ACCESS_APP_SHA: \$\{\{ github\.sha \}\}/);
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 7);
  for (const value of Object.values(FIXED_PLUGINS)) {
    assert(workflow.includes(`repository: ${value.repository}\n          ref: ${value.sha}`));
  }
  for (const variable of ['wifiprov_sha', 'library_sha']) {
    assert(workflow.includes(`ref: \${{ inputs.${variable} }}`));
  }
  assert.match(workflow, /permissions:\n  contents: read/);
  assert(!/\b(?:push|pull_request|schedule):|\$\{\{ secrets\.|upload-artifact|workflow_run:/.test(workflow));
  assert(workflow.indexOf('access-ci.mjs validate') < workflow.indexOf('repository: i3water/capacitor-wifiprov'));
});
