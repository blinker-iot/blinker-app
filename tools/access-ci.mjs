// Explicit source/Android CI only. No deployment, model, account or device calls.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkLocks, PLUGINS, rebuildEnvironment } from './source-handoff.mjs';

export const FIXED_PLUGINS = Object.freeze({
  'capacitor-android-shortcuts': Object.freeze({ repository: 'coloz/capacitor-android-shortcuts', sha: '2c187e447542843dba1264bd95c297686ade6c49' }),
  'capacitor-mdns': Object.freeze({ repository: 'i3water/capacitor-mdns', sha: '8525b992e8a53c4f60b97b076da48606a373135e' }),
  'capacitor-ntfy': Object.freeze({ repository: 'i3water/capacitor-ntfy', sha: 'ed658dd2b6e89fa6fd89a8c85df7b5680851170e' }),
  'capacitor-wechat': Object.freeze({ repository: 'coloz/capacitor-wechat', sha: 'ba0bfc5677b2a0dfe11d231c43b52e07af0bf487' }),
});
export const TOOLCHAIN = Object.freeze({ node: 'v22.22.3', npm: '10.9.8', pnpm: '11.19.0' });
const SHA = /^(?!0{40}$)[a-f0-9]{40}$/;
const root = fileURLToPath(new URL('../', import.meta.url));

export function inputs(env) {
  const result = { app: env.ACCESS_APP_SHA, wifiprov: env.ACCESS_WIFIPROV_SHA, library: env.ACCESS_LIBRARY_SHA };
  for (const [name, value] of Object.entries(result)) {
    if (typeof value !== 'string' || value.length !== 40 || !SHA.test(value)) throw Error(`Expected full lowercase commit SHA: ${name}`);
  }
  if (!['true', 'false'].includes(env.ACCESS_ANDROID)) throw Error('ACCESS_ANDROID must be explicitly true or false');
  return { ...result, android: env.ACCESS_ANDROID === 'true' };
}

export function plan(selected) {
  // Revalidate caller-supplied objects too; no branch names or implicit Android run.
  const value = inputs({ ACCESS_APP_SHA: selected.app, ACCESS_WIFIPROV_SHA: selected.wifiprov,
    ACCESS_LIBRARY_SHA: selected.library, ACCESS_ANDROID: String(selected.android) });
  const checkouts = [
    { directory: 'blinker-app', repository: 'blinker-iot/blinker-app', sha: value.app },
    ...PLUGINS.map(directory => ({ directory, ...(directory === 'capacitor-wifiprov'
      ? { repository: 'i3water/capacitor-wifiprov', sha: value.wifiprov } : FIXED_PLUGINS[directory]) })),
    { directory: 'blinker-library', repository: 'blinker-iot/blinker-library', sha: value.library },
  ];
  if (checkouts.some(item => !item.repository || !SHA.test(item.sha))) throw Error('Reviewed plugin closure changed');
  const steps = [];
  const add = (directory, command, ...args) => steps.push({ directory, command, args });
  for (const plugin of PLUGINS) {
    add(plugin, 'npm', 'ci', '--ignore-scripts');
    add(plugin, 'npm', 'run', 'build');
  }
  add('blinker-app', 'pnpm', 'install', '--frozen-lockfile', '--ignore-scripts');
  add('capacitor-wifiprov', 'node', '--test', 'test/platform-mode-contract.test.mjs');
  add('blinker-app', 'node', '--test', 'tools/access-ci.test.mjs', 'tools/access-source-selection.test.mjs',
    'tools/prepare-access-sources.test.mjs', 'tools/source-handoff.test.mjs', 'tools/cloud-beta.test.mjs', 'tools/cloud-bc5-profile.test.mjs');
  add('blinker-app', 'node', 'tools/test-access-registration.mjs', '--preflight');
  add('blinker-app', 'node', 'tools/test-access-registration.mjs');
  if (value.android) {
    add('blinker-app', 'pnpm', 'run', 'sync:cloud-beta');
    add('blinker-app/android', 'sh', 'gradlew', '--no-daemon', ':capacitor-wifiprov:compileDebugJavaWithJavac',
      ':capacitor-wifiprov:testDebugUnitTest', ':app:assembleBeta');
  }
  return { checkouts, toolchain: TOOLCHAIN, androidRequested: value.android, steps,
    scope: 'Finite access-registration source checks; optional cloud-beta Android compilation, never deployment or hardware acceptance',
    serviceGolden: 'HOLD: access-registration-auth.spec.ts/server golden and Service protocol compatibility are not covered',
    libraryCompilation: 'Not run here; require the same library SHA to pass its existing device-v2-ci workflow',
  };
}

export function verifyWorkspace(workspace, selected, git = spawnSync) {
  const expected = plan(selected);
  for (const item of expected.checkouts) {
    const directory = path.join(workspace, item.directory);
    const query = args => {
      const result = git('git', ['-C', directory, ...args], { encoding: 'utf8', windowsHide: true, shell: false });
      if (result.status !== 0) throw Error(`Cannot verify checkout: ${item.directory}`);
      return result.stdout.trim();
    };
    if (query(['rev-parse', 'HEAD']) !== item.sha) throw Error(`Checkout commit drift: ${item.directory}`);
    const origin = query(['remote', 'get-url', 'origin']).replace(/\.git$/, '');
    if (origin !== `https://github.com/${item.repository}`) throw Error(`Checkout repository drift: ${item.directory}`);
    if (query(['status', '--porcelain'])) throw Error(`Checkout is not clean: ${item.directory}`);
  }
  checkLocks(workspace);
  const sdk = fs.readFileSync(path.join(workspace, 'capacitor-wifiprov/android/build.gradle'), 'utf8');
  if (!sdk.includes("implementation 'com.github.espressif:esp-idf-provisioning-android:lib-2.4.4'")) {
    throw Error('Original WiFiProv SDK 2.4.4 is required');
  }
  return expected;
}

function execute(selected, env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.CI !== 'true') throw Error('Execution is restricted to explicit GitHub Actions CI');
  const workspace = path.dirname(root), selectedPlan = verifyWorkspace(workspace, selected);
  if (process.version !== TOOLCHAIN.node) throw Error('Use the reviewed Node version');
  const runEnv = { ...rebuildEnvironment(env), NG_BUILD_MAX_WORKERS: '1' };
  for (const [command, version] of [['npm', TOOLCHAIN.npm], ['pnpm', TOOLCHAIN.pnpm]]) {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8', shell: false, env: runEnv });
    if (result.status !== 0 || result.stdout.trim() !== version) throw Error(`Use the reviewed ${command} version`);
  }
  // This public tuple is evidence, not a claim that legacy APKs match these new commits.
  console.log(JSON.stringify(selectedPlan, null, 2));
  for (const step of selectedPlan.steps) {
    const result = spawnSync(step.command === 'node' ? process.execPath : step.command, step.args, {
      cwd: path.join(workspace, step.directory), env: runEnv, stdio: 'inherit', shell: false, windowsHide: true,
    });
    if (result.error || result.status !== 0) throw Error(`CI step failed: ${step.directory}/${step.command}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2];
    if (process.argv.length !== 3 || !['validate', 'plan', 'run'].includes(mode)) throw Error('Use access-ci.mjs validate|plan|run with explicit ACCESS_* inputs');
    const selected = inputs(process.env);
    if (mode === 'run') execute(selected, process.env);
    else console.log(JSON.stringify(mode === 'plan' ? plan(selected) : selected, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
