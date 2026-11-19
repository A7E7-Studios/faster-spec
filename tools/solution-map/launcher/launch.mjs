// The shortcut's script: runs the newest Solution map from main, never from a checkout.
//
//   node <git common dir>/faster-spec/launcher/launch.mjs --root <repository folder>
//
// Setup copies this file alone into the backlog's repository's git folder, so it imports nothing
// but Node's own modules, and the setup command is the only thing that ever replaces it.
//
// 1. Fetches every clone `origin/main:tools/gate/config.json` names (`solutionMap.repos`, paths
//    relative to --root), 20 s each, in parallel.
// 2. Takes one tree id over the map's code on --root's `origin/main` (MAP_PATHS): `ls-tree` into a
//    temporary index (GIT_INDEX_FILE), then `write-tree`.
// 3. When `<git common dir of --root>/faster-spec/maps/<tree id>/` is missing, fetches the blobs a
//    clone without them lacks in one request and writes those paths there with `checkout-index`.
// 4. Runs `tools/solution-map/solution-map.mjs` from that folder with `--launched <tree id>` and a
//    `--repo <id>=<folder>` for each entry of the folder's own config, and exits with its code.
//
// When the fetch of --root fails, or main's map cannot be written, it runs the map last run here
// (the newest folder in maps/; each run touches its folder). It never moves a clone's HEAD, never
// reads or writes its index, and never writes its working files.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The paths on main the map runs from; one tree id names them together. */
export const MAP_PATHS = ['tools/solution-map/', 'tools/backlog/', 'tools/overview/', 'tools/gate/lib/', 'tools/gate/config.json'];
const MAP_SCRIPT = 'tools/solution-map/solution-map.mjs';
const CONFIG = 'tools/gate/config.json';
const TREE_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const FETCH_TIMEOUT = 20000;
const USAGE = 'usage: node <git common dir>/faster-spec/launcher/launch.mjs --root <repository folder>';

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

/** The parsed command line: `{ root, help }`; throws on a bad argument. */
export function parseArgs(argv) {
  const o = { root: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
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
  try { return JSON.parse(String(buf).replace(/^\uFEFF/, '')); } catch { return null; }
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

/** Writes the map's code, held in `index`, into `dest` (a new folder, renamed into place when complete). */
async function writeMap(root, tree, index, dest) {
  const env = { GIT_INDEX_FILE: index };
  // A clone made without blobs fetches the ones it lacks in one request, not one per file.
  const objects = String(await gitOrThrow(root, ['rev-list', '--objects', '--missing=print', tree]));
  const missing = objects.split('\n').filter((l) => l.startsWith('?')).map((l) => l.slice(1).trim());
  if (missing.length) {
    await gitOrThrow(root, ['-c', 'fetch.negotiationAlgorithm=noop', 'fetch', '--quiet', 'origin', '--no-tags', '--no-write-fetch-head',
      '--recurse-submodules=no', '--filter=blob:none', '--stdin'], { input: missing.join('\n') + '\n', timeout: 120000 });
  }
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

/** Runs the map and resolves its exit code. */
function runMap(node, args, { cwd }) {
  return new Promise((resolve) => {
    const child = spawn(node, args, { cwd, stdio: 'inherit' });
    child.on('error', (e) => { console.error(`launch: cannot start the map: ${e.message}`); resolve(1); });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

/**
 * Fetches, picks the map to run (main's, else the last run) and runs it. Resolves the exit code.
 * `run(node, args, { cwd })` starts the map; `log` and `warn` take a line each.
 */
export async function launch({ root, node = process.execPath, run = runMap, log = console.log, warn = console.error }) {
  const common = await git(root, ['rev-parse', '--git-common-dir']);
  if (!common.ok) { warn(`launch: ${root} is not a clone: ${lastLine(common.err)}`); return 1; }
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
  chosen ??= lastRun(maps);
  if (!chosen) {
    warn('launch: no map has run on this computer yet; connect to the network and open it again');
    return 1;
  }
  try {
    const now = new Date();
    fs.utimesSync(chosen.dir, now, now); // marks it the map last run
  } catch { /* it still runs; the next failed fetch may pick an older one */ }
  let config = null;
  try { config = parseJson(fs.readFileSync(path.join(chosen.dir, CONFIG))); } catch { /* the map says what is missing */ }
  const repoArgs = configRepos(config, root).flatMap((r) => ['--repo', `${r.id}=${r.dir}`]);
  return run(node, [path.join(chosen.dir, MAP_SCRIPT), '--launched', chosen.tree, ...repoArgs], { cwd: chosen.dir });
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
  return launch({ root: o.root });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
