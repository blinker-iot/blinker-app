// Finite IP-4 pre-commit projection. Never changes the worktree or Git index.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAppSourceInput } from './source-handoff.mjs';
import { selectAccessApi, selectAccessLocale } from './access-source-selection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function git(app, args, input) {
  const result = spawnSync('git', ['-C', app, ...args], {
    input, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw Error('Source Git input unavailable: ' + args[0]);
  return result.stdout;
}
function sourcePath(base, name) {
  if (typeof name !== 'string' || !name || /[\\:\x00-\x1f]/.test(name)
      || name.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Unsafe source path');
  const target = path.resolve(base, name);
  if (!target.startsWith(path.resolve(base) + path.sep)) throw Error('Source escaped root');
  for (let current = target; ; current = path.dirname(current)) {
    try { if (fs.lstatSync(current).isSymbolicLink()) throw Error('Source links are not allowed'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (path.dirname(current) === current) break;
  }
  return target;
}
export function validateSelection(selection) {
  if (selection?.schema !== 1 || !/^[a-f0-9]{40}$/.test(selection.baseCommit ?? '')
      || !Array.isArray(selection.baseline) || !Array.isArray(selection.access)
      || !Array.isArray(selection.projections) || !Array.isArray(selection.tooling)) throw Error('Unsupported selection');
  const names = [...selection.baseline, ...selection.access, ...selection.projections, ...selection.tooling];
  if (!names.length || new Set(names).size !== names.length) throw Error('Repeated or empty source selection');
  for (const name of names) {
    sourcePath(root, name);
    if (!isAppSourceInput(name)) throw Error('Outside App source boundary');
  }
  if (selection.projections.length !== 12 || selection.projections[0] !== 'src/app/configs/api.config.ts'
      || selection.projections.slice(1).some(name => !/^public\/i18n\/[a-z_]+\/[a-z_]+\.json$/.test(name))) {
    throw Error('Exact API and eleven locale projections required');
  }
  return names;
}

export function parseTreeRecord(record) {
  const separator = record.indexOf('\t');
  if (separator < 0) throw Error('Invalid Git tree record');
  const header = record.slice(0, separator).split(' '), name = record.slice(separator + 1);
  if (header.length !== 3 || !/^[0-7]{6}$/.test(header[0]) || !/^[a-f0-9]{40}$/.test(header[2])) {
    throw Error('Invalid Git tree record');
  }
  // Do not split the rest again: TAB/newline bytes belong to the filename and
  // must be rejected, never silently folded into an existing safe basename.
  sourcePath(root, name);
  return { mode: header[0], name };
}

export function prepareAccessSources(app, output, selection) {
  app = path.resolve(app); output = path.resolve(output);
  const names = validateSelection(selection);
  if (git(app, ['rev-parse', 'HEAD']).toString().trim() !== selection.baseCommit) throw Error('Reviewed App HEAD changed');
  const relative = path.relative(app, output).split(path.sep).join('/');
  if (!relative.startsWith('build/')) throw Error('Output must be new ignored App build output');
  sourcePath(path.dirname(output), path.basename(output));
  if (fs.existsSync(output)) throw Error('Output must not exist');
  const ignored = spawnSync('git', ['-C', app, 'check-ignore', '--quiet', '--', relative], { windowsHide: true });
  if (ignored.status !== 0) throw Error('App build output must be Git ignored');
  const selected = new Map();
  // Exact base files are normal blobs only; no archive hooks, Git worktrees or links.
  const tree = git(app, ['ls-tree', '-rz', '--full-tree', selection.baseCommit]).toString();
  const entries = tree.split('\0').filter(Boolean).map(parseTreeRecord).filter(entry => {
    sourcePath(app, entry.name);
    return isAppSourceInput(entry.name);
  });
  if (entries.some(entry => !['100644', '100755'].includes(entry.mode))) throw Error('Git source links are not allowed');
  // Read all selected blobs in one bounded Git invocation, preserving binary assets.
  const responses = git(app, ['cat-file', '--batch'], entries.map(e => `${selection.baseCommit}:${e.name}\n`).join(''));
  let offset = 0;
  for (const entry of entries) {
    const end = responses.indexOf(10, offset), header = responses.subarray(offset, end).toString().split(' ');
    const size = Number(header[2]);
    if (header[1] !== 'blob' || !Number.isSafeInteger(size) || size < 0 || end < 0
        || end + 1 + size >= responses.length) throw Error('Invalid Git source response');
    selected.set(entry.name, Buffer.from(responses.subarray(end + 1, end + 1 + size)));
    offset = end + size + 2;
  }
  if (offset !== responses.length) throw Error('Unexpected Git source response');
  const inputs = {};
  for (const name of names) {
    const bytes = fs.readFileSync(sourcePath(app, name));
    inputs[name] = digest(bytes);
    if (selection.projections.includes(name)) {
      const base = selected.get(name);
      if (!base) throw Error('Projection lacks reviewed base');
      const project = name.endsWith('.ts') ? selectAccessApi : selectAccessLocale;
      selected.set(name, Buffer.from(project(base.toString('utf8'), bytes.toString('utf8'))));
    } else selected.set(name, bytes);
  }
  // Assemble only after every selected input and projection was validated.
  fs.mkdirSync(output, { recursive: true });
  for (const [name, bytes] of selected) {
    const target = sourcePath(output, name);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' });
  }
  const report = { schema: 1, baseCommit: selection.baseCommit,
    kind: 'reviewed-source-projection-not-a-commit-or-release',
    inputs, files: Object.fromEntries([...selected].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => [name, digest(bytes)])),
    worktreeChanged: false, indexChanged: false, compiled: false, deployed: false };
  fs.writeFileSync(path.join(output, 'access-source-report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--out') throw Error('Use --out NEW_DIRECTORY');
    const selection = JSON.parse(fs.readFileSync(path.join(root, 'tools/access-source-files.json'), 'utf8'));
    const report = prepareAccessSources(root, process.argv[3], selection);
    console.log(JSON.stringify({ baseCommit: report.baseCommit, files: Object.keys(report.files).length, compiled: false }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
