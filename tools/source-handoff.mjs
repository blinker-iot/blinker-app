// Maintainer-only Android source closure. Not an APK, deployment or package manager.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PLUGINS = Object.freeze([
  'capacitor-android-shortcuts', 'capacitor-mdns', 'capacitor-ntfy',
  'capacitor-wechat', 'capacitor-wifiprov',
]);
// Explicit maintainer builds only; priority remains absent from ordinary profiles.
export const REBUILD_CONFIGURATIONS = Object.freeze([
  'production', 'local,local-device', 'local,ble-priority-test',
]);
export const APP_FILES = [
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'readme.md',
  'angular.json', 'capacitor.config.ts',
  'tsconfig.json', 'tsconfig.app.json', 'tsconfig.spec.json', 'vitest.config.ts',
  'eslint.config.js', 'ionic.config.json',
  'android/build.gradle', 'android/settings.gradle', 'android/variables.gradle',
  'android/gradle.properties', 'android/gradlew', 'android/gradlew.bat',
  'android/app/build.gradle', 'android/app/proguard-rules.pro',
  'android/geolocation/build.gradle', 'android/geolocation/README.md',
  'android/geolocation/LICENSE.capacitor-geolocation', 'android/geolocation/LICENSE.iongeolocation',
  'android/geolocation/upstream-core.json',
  'device-template/package.json', 'device-template/tsconfig.json',
  'device-template/vite.config.ts', 'device-template/index.html',
  'tests/fixtures/time_sync_golden_vectors.properties',
  'tools/source-handoff.mjs', 'tools/source-handoff.test.mjs',
  'tools/sync-cloud-beta.mjs', 'tools/cloud-beta.test.mjs',
  'tools/custom-panel/pack.mjs',
];
export const APP_TREES = ['src', 'public', 'android/app/src', 'android/gradle', 'android/geolocation/src',
  'device-template/src', 'device-template/tests'];
export const PLUGIN_FILES = ['package.json', 'package-lock.json', 'tsconfig.json',
  'rollup.config.mjs', 'LICENSE', 'README.md', 'android/build.gradle'];
const GENERATED = /^(?:public\/custom-panel-runtime\/|android\/app\/src\/main\/(?:assets\/(?:public\/|capacitor\.(?:config|plugins)\.json$)|res\/xml\/config\.xml$))/;
const PRIVATE = /(?:^|\/)(?:\.env(?:\.|$)|local\.properties$|google-services\.json$)|\.(?:jks|keystore|pem|key|p12|pfx|db|bin|apk|aar)$|\.private\./i;
const HASH = /^[a-f0-9]{64}$/;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const sorted = value => Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));

export function rebuildEnvironment(inherited = process.env) {
  const env = { ...inherited };
  for (const key of Object.keys(env)) if (/^BLINKER_/i.test(key) || /^NODE_OPTIONS$/i.test(key)) delete env[key];
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = path.dirname(process.execPath) + path.delimiter + (env[pathKey] ?? '');
  // Keep Capacitor's default HTTPS origin: changing it partitions caches/journals.
  return env;
}

function safeName(name) {
  if (typeof name !== 'string' || !name || /[\\:]/.test(name)
      || name.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Unsafe source path');
  return name;
}

export function inventory(directory) {
  const entries = {};
  function walk(relative) {
    const current = path.join(directory, relative), stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw Error('Source symlinks/junctions are not portable');
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current).sort()) walk(relative ? `${relative}/${name}` : name);
    } else if (stat.isFile()) entries[safeName(relative)] = hash(fs.readFileSync(current));
    else throw Error('Unsupported source entry');
  }
  walk('');
  return entries;
}

function copyInput(from, to, relative, optional = false) {
  if (optional && !fs.existsSync(path.join(from, relative))) return;
  function copy(name) {
    if (GENERATED.test(name)) return; // Capacitor recreates these, never copy installed assets/config.
    if (PRIVATE.test(name)) throw Error('Private or generated artifact in selected source');
    const source = path.join(from, name), stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw Error('Source symlinks/junctions are not portable');
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(source).sort()) copy(`${name}/${child}`);
    } else if (stat.isFile()) {
      const destination = path.join(to, name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    } else throw Error('Unsupported source entry');
  }
  // Reject intermediate links too, including a selected subtree's parents.
  let current = from;
  if (fs.lstatSync(current).isSymbolicLink()) throw Error('Source root is a link');
  for (const part of safeName(relative).split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw Error('Source parent is a link');
  }
  copy(relative);
}

export function checkLocks(workspace) {
  for (const name of ['blinker-app', ...PLUGINS]) {
    const dir = path.join(workspace, name), pkg = json(path.join(dir, 'package.json'));
    if (name === 'blinker-app') {
      if (pkg.packageManager !== 'pnpm@11.19.0') throw Error('Use the tested pnpm version');
      if (fs.existsSync(path.join(dir, 'package-lock.json'))) throw Error('App must have one install lock');
      if (!/^lockfileVersion: '9.0'\r?$/m.test(fs.readFileSync(path.join(dir, 'pnpm-lock.yaml'), 'utf8'))) {
        throw Error('Unsupported pnpm lock');
      }
      // pnpm performs semantic package/workspace/lock validation during frozen install.
      // Do not implement a second YAML parser or silently regenerate a lock here.
      fs.readFileSync(path.join(dir, 'pnpm-workspace.yaml'));
      json(path.join(dir, 'device-template/package.json'));
    } else {
      const lock = json(path.join(dir, 'package-lock.json'));
      if (pkg.name !== name || lock.lockfileVersion !== 3 || !lock.packages?.['']) throw Error(`Unsupported plugin lock: ${name}`);
      for (const field of ['dependencies', 'devDependencies']) {
        if (JSON.stringify(sorted(pkg[field])) !== JSON.stringify(sorted(lock.packages[''][field]))) {
          throw Error(`Package/lock drift: ${name}/${field}`);
        }
      }
    }
    const files = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
      .filter(([, value]) => /^(?:file:|link:|workspace:)/.test(value));
    const expected = name === 'blinker-app' ? PLUGINS.map(p => [p, `file:../${p}`]) : [];
    if (JSON.stringify(sorted(Object.fromEntries(files))) !== JSON.stringify(sorted(Object.fromEntries(expected)))) {
      throw Error('Local dependency closure changed');
    }
  }
}

export function exportSource(appRoot, destination, git = 'git') {
  appRoot = path.resolve(appRoot); destination = path.resolve(destination);
  if (fs.existsSync(destination)) throw Error('Destination must not exist');
  const workspace = path.dirname(appRoot);
  for (const name of ['blinker-app', ...PLUGINS]) {
    const base = path.join(workspace, name);
    if (destination === base || destination.startsWith(base + path.sep)) throw Error('Destination must be outside source repositories');
  }
  checkLocks(workspace);
  fs.mkdirSync(destination, { recursive: false });
  const provenance = {};
  for (const name of ['blinker-app', ...PLUGINS]) {
    const from = path.join(workspace, name), to = path.join(destination, 'source', name);
    const files = name === 'blinker-app' ? APP_FILES : PLUGIN_FILES;
    const trees = name === 'blinker-app' ? APP_TREES : ['src', 'android/src'];
    for (const entry of [...files, ...trees]) copyInput(from, to, entry);
    if (name !== 'blinker-app') copyInput(from, to, 'android/proguard-rules.pro', true);
    const head = spawnSync(git, ['-C', from, 'rev-parse', 'HEAD'], { windowsHide: true, encoding: 'utf8' });
    if (head.status !== 0 || !/^[a-f0-9]{40}$/.test(head.stdout.trim())) throw Error('Git HEAD provenance unavailable');
    provenance[name] = { head: head.stdout.trim(), inputsSha256: hash(JSON.stringify(inventory(to))) };
  }
  const manifest = { schema: 2, kind: 'blinker-android-source',
    scope: 'Maintainer source closure; no credentials, SDK, node_modules, dist, APK, iOS build or deployment',
    toolchain: { node: process.version, npm: '10.9.8', pnpm: '11.19.0', jdk: '21', androidSdk: '36',
      gradle: '8.14.3', agp: '8.13.0', dependencyManager: 'App/template: pnpm frozen; plugins: npm ci; ignore install hooks, explicit builds' },
    provenance, files: inventory(path.join(destination, 'source')) };
  writeJson(path.join(destination, 'manifest.json'), manifest);
  verifySource(destination);
  return manifest;
}

export function verifySource(bundle) {
  const manifest = json(path.join(bundle, 'manifest.json'));
  if (manifest.schema !== 2 || manifest.kind !== 'blinker-android-source'
      || !manifest.files || !Object.keys(manifest.files).length) throw Error('Unsupported source manifest');
  for (const [name, value] of Object.entries(manifest.files)) {
    safeName(name);
    if (!HASH.test(value) || PRIVATE.test(name)) throw Error('Invalid source inventory');
  }
  const actual = inventory(path.join(bundle, 'source'));
  if (JSON.stringify(sorted(actual)) !== JSON.stringify(sorted(manifest.files))) throw Error('Source missing, changed or unexpected');
  if (fs.readdirSync(bundle).sort().join(',') !== 'manifest.json,source') throw Error('Unexpected bundle entry');
  checkLocks(path.join(bundle, 'source'));
  for (const name of ['blinker-app', ...PLUGINS]) {
    if (hash(JSON.stringify(inventory(path.join(bundle, 'source', name)))) !== manifest.provenance?.[name]?.inputsSha256) {
      throw Error('Source provenance drift');
    }
  }
  return manifest;
}

export function rebuild(bundle, work, configuration, android = false, pnpmCli) {
  bundle = path.resolve(bundle); work = path.resolve(work);
  const manifest = verifySource(bundle);
  if (!REBUILD_CONFIGURATIONS.includes(configuration)) throw Error('Explicit known Angular configuration required');
  if (fs.existsSync(work) || work.startsWith(bundle + path.sep)) throw Error('Work must be a new directory outside bundle');
  if (process.version !== manifest.toolchain.node) throw Error('Use the recorded Node version');
  const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (!fs.existsSync(npm)) throw Error('npm CLI must accompany this Node runtime');
  const version = spawnSync(process.execPath, [npm, '--version'], { encoding: 'utf8', windowsHide: true });
  if (version.stdout.trim() !== manifest.toolchain.npm) throw Error('Use the recorded npm version');
  if (!pnpmCli || !path.isAbsolute(pnpmCli) || !fs.statSync(pnpmCli).isFile()) {
    throw Error('Explicit absolute --pnpm-cli path required (pnpm.cjs or pnpm.mjs)');
  }
  const pnpmVersion = spawnSync(process.execPath, [pnpmCli, '--version'], { encoding: 'utf8', windowsHide: true });
  if (pnpmVersion.status !== 0 || pnpmVersion.stdout.trim() !== manifest.toolchain.pnpm) throw Error('Use the recorded pnpm version');
  // Clear ambient candidate/debug settings. This rebuild does not adopt private CA overlays.
  const env = rebuildEnvironment();
  fs.mkdirSync(work);
  fs.cpSync(path.join(bundle, 'source'), path.join(work, 'source'), { recursive: true });
  const steps = [];
  function run(label, cwd, exe, args) {
    const log = path.join(work, `${label}.log`), fd = fs.openSync(log, 'wx'), start = Date.now();
    let result;
    try { result = spawnSync(exe, args, { cwd, env, windowsHide: true, stdio: ['ignore', fd, fd], timeout: 900000 }); }
    finally { fs.closeSync(fd); }
    steps.push({ label, passed: result.status === 0, durationMs: Date.now() - start });
    if (result.status !== 0) throw Error(`${label} failed; inspect its isolated log`);
    console.log(`${label} passed`);
  }
  const app = path.join(work, 'source/blinker-app');
  const report = { configuration, sourceManifestSha256: hash(fs.readFileSync(path.join(bundle, 'manifest.json'))),
    node: process.version, npm: version.stdout.trim(), pnpm: pnpmVersion.stdout.trim(), androidRequested: android,
    bleBootstrapPriorityExperiment: configuration === 'local,ble-priority-test',
    installedOnPhone: false, matchesPreviouslyInstalledApk: false,
    webViewOriginPolicy: 'Default HTTPS; no automatic cleartext/origin switch', steps };
  try {
    for (const plugin of PLUGINS) {
      const dir = path.join(work, 'source', plugin);
      run(`${plugin}-install`, dir, process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund']);
      run(`${plugin}-build`, dir, process.execPath, [npm, 'run', 'build']);
    }
    const lockedInputs = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'device-template/package.json'];
    const before = lockedInputs.map(file => hash(fs.readFileSync(path.join(app, file))));
    run('app-install', app, process.execPath, [pnpmCli, 'install', '--frozen-lockfile', '--ignore-scripts', '--reporter', 'append-only']);
    if (lockedInputs.some((file, i) => hash(fs.readFileSync(path.join(app, file))) !== before[i])) throw Error('Frozen install changed dependency inputs');
    report.dependencies = {};
    for (const relative of ['', 'device-template']) {
      const dir = path.join(app, relative), pkg = json(path.join(dir, 'package.json'));
      report.dependencies[relative || '.'] = Object.fromEntries(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
        .sort().map(name => [name, json(path.join(dir, 'node_modules', name, 'package.json')).version]));
    }
    run('template-build', app, process.execPath, [npm, 'run', 'device-template:build']);
    run('app-types', app, process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.app.json']);
    run('app-web', app, process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'build', '--configuration', configuration]);
    run('capacitor-sync', app, process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']);
    if (android) {
      if (!env.ANDROID_HOME || !env.JAVA_HOME) throw Error('Explicit ANDROID_HOME and JAVA_HOME required');
      const cwd = path.join(app, 'android');
      run('android-debug', cwd, process.platform === 'win32' ? 'cmd.exe' : 'sh',
        process.platform === 'win32' ? ['/d', '/s', '/c', 'gradlew.bat --no-daemon :app:assembleDebug']
          : ['gradlew', '--no-daemon', ':app:assembleDebug']);
      const apk = path.join(cwd, 'app/build/outputs/apk/debug/app-debug.apk');
      report.apk = { sha256: hash(fs.readFileSync(apk)), bytes: fs.statSync(apk).size, developmentOnly: true };
    }
    verifySource(bundle);
    report.passed = true;
  } finally {
    writeJson(path.join(work, 'rebuild.json'), report);
  }
  return report;
}

function main(args) {
  const [mode, ...rest] = args, options = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!/^--[a-z-]+$/.test(rest[i]) || !rest[i + 1] || options[rest[i]]) throw Error('Expected unique --name value options');
    options[rest[i]] = rest[i + 1];
  }
  let result;
  if (mode === 'export' && options['--out']) result = exportSource(root, options['--out'], options['--git']);
  else if (mode === 'verify' && options['--bundle']) result = verifySource(options['--bundle']);
  else if (mode === 'rebuild' && options['--bundle'] && options['--work'] && options['--configuration']) {
    if (options['--android'] && options['--android'] !== 'true') throw Error('--android only accepts true');
    result = rebuild(options['--bundle'], options['--work'], options['--configuration'], options['--android'] === 'true', options['--pnpm-cli']);
  } else throw Error(`Use export --out DIR | verify --bundle DIR | rebuild --bundle DIR --work NEW_DIR --configuration ${REBUILD_CONFIGURATIONS.join('|')} --pnpm-cli PATH [--android true]`);
  console.log(JSON.stringify({ mode, verified: true, files: result.files && Object.keys(result.files).length, apk: result.apk }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
