// The shortcut's script: runs the newest Solution map from main, never from a checkout.
//
//   node <git common dir>/faster-spec/launcher/launch.mjs --root <repository folder> [-- <map arguments>]
//
// Setup copies this file alone into the backlog's repository's git folder, so it imports nothing
// but Node's own modules. The map imports what it shares from here (MAP_PATHS, mapTree,
// missingObjects, fetchObjects, RESTART_CODE), so the two never hold two versions of one rule.
//
// 1. Fetches every clone `origin/main:tools/gate/config.json` names (`solutionMap.repos`, paths
//    relative to --root), 20 s each, in parallel.
// 2. Takes one tree id over the map's code on --root's `origin/main` (MAP_PATHS): `ls-tree` into a
//    temporary index (GIT_INDEX_FILE), then `write-tree`.
// 3. When `<git common dir of --root>/faster-spec/maps/<tree id>/` is missing, fetches the blobs a
//    clone without them lacks in one request and writes those paths there with `checkout-index`.
// 4. Takes main's copy of this file from that folder when it differs and passes `node --check`:
//    a launcher fix on main runs from the shortcut's next opening (this process goes on with the
//    code it started with). Only a launcher in a git directory, where setup puts it, is replaced;
//    a copy in a checkout never is.
// 5. Runs `tools/solution-map/solution-map.mjs` from that folder as its child, in this window, with
//    `--launched <tree id> --root <root>`, a `--repo <id>=<folder>` for each entry of the folder's
//    own config and the arguments after `--`, and waits. A map that exits with RESTART_CODE
//    (Restart to update) has the steps run again, its port and `--no-open` added to the map's
//    arguments; any other exit code is the launcher's.
//
// When the fetch of --root fails, or main's map cannot be written, it runs the map last run here
// (the newest folder in maps/; each run touches its folder). It never moves a clone's HEAD, never
// reads or writes its index, and never writes its working files.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The paths on main the map runs from; one tree id names them together. */
export const MAP_PATHS = ['tools/solution-map/', 'tools/backlog/', 'tools/overview/', 'tools/gate/lib/', 'tools/gate/config.json'];
const MAP_SCRIPT = 'tools/solution-map/solution-map.mjs';
const LAUNCH_SCRIPT = 'tools/solution-map/launcher/launch.mjs';
const CONFIG = 'tools/gate/config.json';
/** A tree id, SHA-1 or SHA-256: the name of a folder in maps/. */
export const TREE_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/**
 * The exit code a launched map gives for Restart to update: the launcher runs main's newest map in
 * its place. Before it exits, the map sends `{ restart: { port } }` over the IPC channel the
 * launcher opens, so the newer map takes the same port.
 */
export const RESTART_CODE = 75;
const FETCH_TIMEOUT = 20000;
const SELF = fileURLToPath(import.meta.url);
const USAGE = 'usage: node <git common dir>/faster-spec/launcher/launch.mjs --root <repository folder> [-- <map arguments>]';

/** Runs git in a folder; resolves `{ ok, out, err }` (out a Buffer), never rejects. */
function git(dir, args, { input, env, timeout = 0 } = {}) {
  return new Promise((resolve) => {
    const child = execFile('git', ['-C', dir, ...args], {
      timeout, windowsHide: true, maxBuffer: 256 * 1024 * 1024, encoding: 'buffer',
      env: env ? { ...process.env, ...env } : process.env,
    }, (e, out, err) => resolve({ ok: !e, out, err: String(err || (e && e.message) || '') }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

const lastLine = (s) => s.trim().split('\n').pop() || 'failed';

async function gitOrThrow(dir, args, opts) {
  const r = await git(dir, args, opts);
  if (!r.ok) throw new Error(`git ${args[0]}: ${lastLine(r.err)}`);
  return r.out;
}

/** The parsed command line: `{ root, help, mapArgs }`, `mapArgs` what follows `--`; throws on a bad argument. */
export function parseArgs(argv) {
  const o = { root: null, help: false, mapArgs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      o.mapArgs = argv.slice(i + 1);
      break;
    }
    if (a === '--root') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error('--root needs a folder');
      o.root = path.resolve(v);
    } else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.root && !o.help) throw new Error('--root names the repository the map is launched for');
  return o;
}

/** The repositories a config names, `[{ id, dir }]`, paths relative to `root`; entries the map would refuse are left to it. */
export function configRepos(config, root) {
  const named = config?.solutionMap?.repos;
  if (!Array.isArray(named)) return [];
  return named.filter((r) => r && typeof r.id === 'string' && typeof r.path === 'string')
    .map((r) => ({ id: r.id, dir: path.resolve(root, r.path) }));
}

function parseJson(buf) {
  try { return JSON.parse(String(buf).replace(/^﻿/, '')); } catch { return null; }
}

/** The tree id of the map's code at `commit`, read into a temporary index that is removed after. */
export async function mapTree(root, commit, scratch) {
  const index = path.join(scratch, `.index-${process.pid}-${Date.now()}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    const listing = await gitOrThrow(root, ['ls-tree', '-r', '-z', '--full-tree', commit, '--', ...MAP_PATHS]);
    await gitOrThrow(root, ['update-index', '-z', '--index-info'], { input: listing, env });
    // --missing-ok: a clone without blobs has the trees, and the id needs nothing else.
    const tree = String(await gitOrThrow(root, ['write-tree', '--missing-ok'], { env })).trim();
    return { tree, index };
  } catch (e) {
    fs.rmSync(index, { force: true });
    throw e;
  }
}

/** The tree id of the map's code on `root`'s `origin/main`, as the launcher names its folder; null without an `origin/main`. */
export async function mainMapTree(root, scratch = os.tmpdir()) {
  const commit = await git(root, ['rev-parse', '--verify', '--quiet', 'origin/main^{commit}']);
  if (!commit.ok) return null;
  const { tree, index } = await mapTree(root, String(commit.out).trim(), scratch);
  fs.rmSync(index, { force: true });
  return tree;
}

/**
 * The objects a clone lacks among those `git rev-list --objects <args> --stdin` walks, `input` the
 * revisions (and after a `--` line, the paths): in a clone made without blobs, the files' blobs. It
 * fetches nothing.
 */
export async function missingObjects(dir, args, input) {
  const out = String(await gitOrThrow(dir, ['rev-list', '--objects', '--missing=print', '--no-object-names', ...args, '--stdin'], { input }));
  return [...new Set(out.split('\n').filter((l) => l.startsWith('?')).map((l) => l.slice(1).trim()))];
}

/**
 * Fetches `oids` from origin in one request: the request git sends for a single object it lacks,
 * asking for all of them at once. Resolves `{ ok, err }`; nothing to fetch is ok.
 */
export async function fetchObjects(dir, oids, { timeout = 120000 } = {}) {
  if (!oids.length) return { ok: true, err: '' };
  return git(dir, ['-c', 'fetch.negotiationAlgorithm=noop', 'fetch', '--quiet', 'origin', '--no-tags', '--no-write-fetch-head',
    '--recurse-submodules=no', '--filter=blob:none', '--stdin'], { input: oids.join('\n') + '\n', timeout });
}

/** Writes the map's code, held in `index`, into `dest` (a new folder, renamed into place when complete). */
async function writeMap(root, tree, index, dest) {
  const env = { GIT_INDEX_FILE: index };
  const f = await fetchObjects(root, await missingObjects(root, [], `${tree}\n`));
  if (!f.ok) throw new Error(`git fetch: ${lastLine(f.err)}`);
  const part = `${dest}.part-${process.pid}`;
  fs.rmSync(part, { recursive: true, force: true });
  try {
    await gitOrThrow(root, ['checkout-index', '-a', '-f', `--prefix=${part.split(path.sep).join('/')}/`], { env });
    try {
      fs.renameSync(part, dest);
    } catch (e) {
      if (!fs.existsSync(dest)) throw e; // another launch wrote the same map first
    }
  } finally {
    fs.rmSync(part, { recursive: true, force: true });
  }
}

/** Whether `node --check` reads a file without a syntax error. */
function checks(node, file) {
  return new Promise((resolve) => {
    execFile(node, ['--check', file], { timeout: 20000, windowsHide: true }, (e) => resolve(!e));
  });
}

/**
 * Replaces the launcher at `self` with the copy in the map folder `mapDir` when the two differ, the
 * copy passes `node --check` and `self` lives in a git directory, where setup installs it.
 * Resolves `'updated'`, `'same'`, `'kept'` (not one setup installed, or no copy in the map) or
 * `'broken'` (the copy does not check).
 */
export async function updateLauncher(self, mapDir, { node = process.execPath } = {}) {
  const copy = path.join(mapDir, LAUNCH_SCRIPT);
  let next, now;
  try {
    next = fs.readFileSync(copy);
    now = fs.readFileSync(self);
  } catch {
    return 'kept';
  }
  if (next.equals(now)) return 'same';
  const installed = await git(path.dirname(self), ['rev-parse', '--is-inside-git-dir']);
  if (!installed.ok || String(installed.out).trim() !== 'true') return 'kept';
  if (!(await checks(node, copy))) return 'broken';
  const part = `${self}.part-${process.pid}`;
  try {
    fs.writeFileSync(part, next);
    fs.renameSync(part, self);
  } finally {
    fs.rmSync(part, { force: true });
  }
  return 'updated';
}

/** The folder in `maps` run last (the newest of those named for a tree id), or null. */
export function lastRun(maps) {
  let best = null;
  let names = [];
  try { names = fs.readdirSync(maps); } catch { return null; }
  for (const name of names) {
    if (!TREE_ID.test(name)) continue;
    const dir = path.join(maps, name);
    let st;
    try { st = fs.statSync(dir); } catch { continue; }
    if (st.isDirectory() && fs.existsSync(path.join(dir, MAP_SCRIPT)) && (!best || st.mtimeMs > best.mtimeMs)) best = { dir, tree: name, mtimeMs: st.mtimeMs };
  }
  return best;
}

/** Ctrl+C, a closed window, a stop: passed on to the map, whose exit then ends the launcher. */
const PASSED_ON = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * Runs the map as this process's child, in this window, and resolves `{ code, port }` once it has
 * gone: its exit code (1 for a signal or a map that cannot start), and the port it sent before a
 * restart. A signal this process gets meanwhile is passed on to the map.
 */
function runMap(node, args, { cwd }) {
  return new Promise((resolve) => {
    let port = null;
    let done = false;
    const child = spawn(node, args, { cwd, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    const pass = (signal) => { try { child.kill(signal); } catch { /* it has gone */ } };
    for (const s of PASSED_ON) process.on(s, pass);
    const end = (code) => {
      if (done) return;
      done = true;
      for (const s of PASSED_ON) process.off(s, pass);
      resolve({ code, port });
    };
    child.on('message', (m) => { if (Number.isInteger(m?.restart?.port)) port = m.restart.port; });
    child.on('error', (e) => { console.error(`launch: cannot start the map: ${e.message}`); end(1); });
    child.on('close', (code) => end(code ?? 1));
  });
}

/**
 * Fetches, picks the map to run (main's, else the last run) and runs it; a map that exits with
 * RESTART_CODE has all of it done again, on the port it had and with `--no-open`. Resolves the exit
 * code. `run(node, args, { cwd })` runs the map and resolves `{ code, port }`; `mapArgs` go to it
 * last; `self` is the launcher that main's copy replaces; `log` and `warn` take a line each.
 */
export async function launch({ mapArgs = [], log = console.log, ...o }) {
  for (let args = mapArgs; ;) {
    const { code, port } = await launchOnce({ ...o, mapArgs: args, log });
    if (code !== RESTART_CODE) return code;
    log('launch: restarting with main\'s newest map');
    args = [...mapArgs, ...(port ? ['--port', String(port)] : []), '--no-open'];
  }
}

/** One run of the steps: resolves the map's `{ code, port }`, or `{ code: 1 }` when no map could start. */
async function launchOnce({ root, mapArgs, self = SELF, node = process.execPath, run = runMap, log, warn = console.error }) {
  const common = await git(root, ['rev-parse', '--git-common-dir']);
  if (!common.ok) { warn(`launch: ${root} is not a clone: ${lastLine(common.err)}`); return { code: 1 }; }
  const maps = path.join(path.resolve(root, String(common.out).trim()), 'faster-spec', 'maps');
  fs.mkdirSync(maps, { recursive: true });

  const before = parseJson((await git(root, ['show', `origin/main:${CONFIG}`], { timeout: FETCH_TIMEOUT })).out);
  const clones = configRepos(before, root).filter((r) => fs.existsSync(path.join(r.dir, '.git')) && path.resolve(r.dir) !== path.resolve(root));
  const [own, ...others] = await Promise.all([root, ...clones.map((r) => r.dir)].map((dir) => git(dir, ['fetch', '--quiet', 'origin'], { timeout: FETCH_TIMEOUT })));
  others.forEach((r, i) => { if (!r.ok) warn(`launch: could not fetch ${clones[i].dir}: ${lastLine(r.err)}`); });

  let chosen = null;
  if (!own.ok) warn(`launch: could not fetch ${root}: ${lastLine(own.err)}; opening the map last run here`);
  else {
    let index = null;
    try {
      const commit = String(await gitOrThrow(root, ['rev-parse', '--verify', 'origin/main^{commit}'])).trim();
      const t = await mapTree(root, commit, maps);
      index = t.index;
      const dir = path.join(maps, t.tree);
      if (!fs.existsSync(dir)) {
        log(`launch: writing main's map into ${dir}`);
        await writeMap(root, t.tree, index, dir);
      }
      if (!fs.existsSync(path.join(dir, MAP_SCRIPT))) throw new Error(`main has no ${MAP_SCRIPT}`);
      chosen = { dir, tree: t.tree };
    } catch (e) {
      warn(`launch: could not write main's map: ${e.message}; opening the map last run here`);
    } finally {
      if (index) fs.rmSync(index, { force: true });
    }
  }
  if (chosen) {
    try {
      const u = await updateLauncher(self, chosen.dir, { node });
      if (u === 'updated') log(`launch: took main's launcher into ${self}; it runs from the next opening`);
      if (u === 'broken') warn(`launch: main's ${LAUNCH_SCRIPT} does not pass node --check; kept this launcher`);
    } catch (e) {
      warn(`launch: could not take main's launcher: ${e.message}`);
    }
  }
  chosen ??= lastRun(maps);
  if (!chosen) {
    warn('launch: no map has run on this computer yet; connect to the network and open it again');
    return { code: 1 };
  }
  try {
    const now = new Date();
    fs.utimesSync(chosen.dir, now, now); // marks it the map last run
  } catch { /* it still runs; the next failed fetch may pick an older one */ }
  let config = null;
  try { config = parseJson(fs.readFileSync(path.join(chosen.dir, CONFIG))); } catch { /* the map says what is missing */ }
  const repoArgs = configRepos(config, root).flatMap((r) => ['--repo', `${r.id}=${r.dir}`]);
  return run(node, [path.join(chosen.dir, MAP_SCRIPT), '--launched', chosen.tree, '--root', root, ...repoArgs, ...mapArgs], { cwd: chosen.dir });
}

export async function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(`launch: ${e.message}\n${USAGE}`);
    return 2;
  }
  if (o.help) { console.log(USAGE); return 0; }
  return launch({ root: o.root, mapArgs: o.mapArgs });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
