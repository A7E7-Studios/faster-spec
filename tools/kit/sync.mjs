#!/usr/bin/env node
// Writes a pinned kit version into a project and records it in the project's tools/kit/lock.json:
// the kit commit, the paths the kit owns, each file's git blob id. The gate's `kit` check then
// fails a project whose copy differs from its lock.
//
//   node tools/kit/sync.mjs [--kit <kit checkout>] [--ref <rev>] [--project <dir>] [--force] [--dry-run]
//   node tools/kit/sync.mjs --check [--project <dir>] [--rev <rev>]
//
// The kit is read at a revision through git objects (its working tree never matters); the project
// is written in its working tree, for the person to review and commit. Nothing is fetched.
// Exit: 0 done, 1 refused or not as the lock says, 2 usage or setup error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Repo, runGit } from '../gate/lib/git.mjs';
import { LOCK_FILE, LOCK_VERSION, blobId, owns, ownedPathProblems, parseLock, kitProblems } from '../gate/lib/kit.mjs';

/** The kit's manifest, at the root of the kit repository; never synced. */
export const MANIFEST = 'kit.json';

const USAGE = `usage:
  node tools/kit/sync.mjs [--kit <kit checkout>] [--ref <rev>] [--project <dir>] [--force] [--dry-run]
  node tools/kit/sync.mjs --check [--project <dir>] [--rev <rev>]
options:
  --kit <dir>      the kit's checkout (default: the one holding this script, when it is the kit)
  --ref <rev>      the kit revision to sync (default origin/main)
  --project <dir>  the project (default: the repository holding the current directory)
  --force          overwrite or delete kit files the project changed
  --dry-run        say what would change, write nothing
  --check          compare the project's copy at --rev (default HEAD) with its lock`;

class Usage extends Error {}

/** Reads and checks kit.json. Throws on a missing or mistyped key. */
export function parseManifest(text) {
  let o;
  try {
    o = JSON.parse(text);
  } catch (e) {
    throw new Error(`${MANIFEST}: not JSON: ${e.message}`);
  }
  const problems = o && typeof o === 'object' && !Array.isArray(o) ? ownedPathProblems(o) : ['a JSON object'];
  const starters = o?.starters ?? {};
  if (!starters || typeof starters !== 'object' || Array.isArray(starters) || !Object.values(starters).every((v) => typeof v === 'string')) {
    problems.push('"starters" is { <project-owned file>: <the kit file a project starts it from> }');
  } else {
    for (const target of Object.keys(starters)) if (!o.projectOwned?.includes(target)) problems.push(`starters: ${target} is not in "projectOwned"`);
  }
  if (problems.length) throw new Error(`${MANIFEST}: ${problems.join('; ')}`);
  return { paths: o.paths, projectOwned: o.projectOwned, starters };
}

/** The repository URL without any user or token in it, or null. */
export function publicUrl(url) {
  if (!url) return null;
  return url.replace(/^(https?:\/\/)[^@/]+@/i, '$1');
}

/** The git blob ids of working-tree files, as git would store them (its clean filters applied: CRLF to LF). */
function workingIds(projectDir, paths) {
  const present = paths.filter((p) => fs.existsSync(path.join(projectDir, ...p.split('/'))));
  const ids = new Map();
  if (!present.length) return ids;
  const out = runGit(projectDir, ['hash-object', '--stdin-paths'], { input: present.join('\n') + '\n' });
  String(out).trim().split(/\r?\n/).forEach((id, i) => ids.set(present[i], id.trim()));
  return ids;
}

/**
 * Paths under `paths` with uncommitted changes: differing from HEAD (staged or not, as git diff
 * sees content, so a checkout's line endings are no change), or untracked.
 */
function dirtyPaths(projectDir, paths) {
  if (!paths.length) return new Set();
  const specs = ['--', ...paths.map((p) => `:(literal)${p}`)];
  const list = (args) => String(runGit(projectDir, args)).split('\0').filter(Boolean);
  const hasHead = runGit(projectDir, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true }).status === 0;
  return new Set([
    ...(hasHead ? list(['diff', '--name-only', '-z', '--no-renames', 'HEAD', ...specs]) : list(['ls-files', '-z', '--cached', ...specs])),
    ...list(['ls-files', '-z', '--others', '--exclude-standard', ...specs]),
  ]);
}

/** Files under the kit's paths in the project's working tree: tracked, and untracked but not ignored. */
function filesOnDisk(projectDir, paths) {
  const out = runGit(projectDir, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...paths.map((p) => `:(literal)${p.replace(/\/$/, '')}`)]);
  return [...new Set(String(out).split('\0').filter(Boolean))].filter((p) => owns(paths, p) && fs.existsSync(path.join(projectDir, ...p.split('/'))));
}

/**
 * Plans a sync of the kit at `commit` into the project. Returns
 * { manifest, files: Map path -> { bytes, id, mode }, actions: [{ path, op, ... }], conflicts, stray, starters, oldLock }
 * where op is add | update | same | delete, and nothing is written.
 */
export function planSync({ kit, commit, projectDir }) {
  const manifestText = kit.text(commit, MANIFEST);
  if (manifestText === null) throw new Error(`no ${MANIFEST} at ${commit.slice(0, 9)} of ${kit.dir}: is it the kit?`);
  const manifest = parseManifest(manifestText);
  const tree = kit.tree(commit);
  const kitPaths = [...tree.files.keys()].filter((p) => owns(manifest.paths, p) && !manifest.projectOwned.includes(p) && p !== MANIFEST).sort();
  kit.prefetch(commit, [...kitPaths, ...Object.values(manifest.starters)]);
  const files = new Map(kitPaths.map((p) => [p, { bytes: kit.blob(commit, p), id: null, mode: tree.files.get(p).mode }]));
  for (const f of files.values()) f.id = blobId(f.bytes);

  const lockPath = path.join(projectDir, ...LOCK_FILE.split('/'));
  let oldLock = null;
  if (fs.existsSync(lockPath)) {
    const parsed = parseLock(fs.readFileSync(lockPath, 'utf8'));
    if (!parsed.lock) throw new Error(`${LOCK_FILE} does not read (${parsed.problems.join('; ')}): fix it, or delete it and sync again`);
    oldLock = parsed.lock;
  }
  const owned = [...new Set([...manifest.paths, ...(oldLock?.paths ?? [])])];
  const disk = filesOnDisk(projectDir, owned);
  const projectOwned = new Set([...manifest.projectOwned, ...(oldLock?.projectOwned ?? []), LOCK_FILE]);
  const candidates = [...new Set([...files.keys(), ...Object.keys(oldLock?.files ?? {}), ...disk])].sort().filter((p) => !projectOwned.has(p));
  const ids = workingIds(projectDir, candidates);
  const dirty = dirtyPaths(projectDir, candidates);

  const actions = [];
  const conflicts = [];
  const stray = [];
  for (const p of candidates) {
    const want = files.get(p);
    const have = ids.get(p) ?? null;
    const locked = oldLock?.files[p] ?? null;
    if (want) {
      if (have === want.id) {
        actions.push({ path: p, op: 'same' });
        continue;
      }
      // The project's own edit: it differs from what the old lock recorded, or is uncommitted.
      const edited = have !== null && ((oldLock && have !== locked) || dirty.has(p));
      if (edited) conflicts.push({ path: p, why: locked ? 'changed in the project since the last sync' : dirty.has(p) ? 'has uncommitted changes' : 'is the project\'s own file' });
      actions.push({ path: p, op: have === null ? 'add' : 'update', replaces: have !== null && !oldLock });
    } else if (locked) {
      if (have !== null && (have !== locked || dirty.has(p))) conflicts.push({ path: p, why: 'the kit dropped it, and the project changed it' });
      if (have !== null) actions.push({ path: p, op: 'delete' });
    } else if (have !== null) {
      stray.push(p);
    }
  }
  const starters = Object.entries(manifest.starters)
    .filter(([target]) => !fs.existsSync(path.join(projectDir, ...target.split('/'))))
    .map(([target, from]) => {
      const bytes = kit.blob(commit, from);
      if (bytes === null) throw new Error(`${MANIFEST}: the starter ${from} is not in the kit at ${commit.slice(0, 9)}`);
      return { path: target, from, bytes };
    });
  return { manifest, files, actions, conflicts, stray, starters, oldLock };
}

/** Removes `dir` and its parents while they are empty, never `stop` or above. */
function pruneEmpty(dir, stop) {
  let d = dir;
  while (d.length > stop.length && d.startsWith(stop)) {
    try {
      if (fs.readdirSync(d).length) return;
      fs.rmdirSync(d);
    } catch {
      return;
    }
    d = path.dirname(d);
  }
}

/** Writes a plan into the project, then the lock. */
export function applySync(plan, { projectDir, repository, commit }) {
  const root = path.resolve(projectDir);
  const abs = (p) => path.join(root, ...p.split('/'));
  for (const a of plan.actions) {
    if (a.op === 'add' || a.op === 'update') {
      const f = plan.files.get(a.path);
      fs.mkdirSync(path.dirname(abs(a.path)), { recursive: true });
      fs.writeFileSync(abs(a.path), f.bytes);
      if (process.platform !== 'win32') fs.chmodSync(abs(a.path), f.mode === '100755' ? 0o755 : 0o644);
    } else if (a.op === 'delete') {
      fs.rmSync(abs(a.path), { force: true });
      pruneEmpty(path.dirname(abs(a.path)), root);
    }
  }
  for (const s of plan.starters) {
    fs.mkdirSync(path.dirname(abs(s.path)), { recursive: true });
    fs.writeFileSync(abs(s.path), s.bytes);
  }
  const lock = {
    version: LOCK_VERSION,
    kit: { repository, commit },
    paths: plan.manifest.paths,
    projectOwned: plan.manifest.projectOwned,
    files: Object.fromEntries([...plan.files].map(([p, f]) => [p, f.id])),
  };
  fs.mkdirSync(path.dirname(abs(LOCK_FILE)), { recursive: true });
  fs.writeFileSync(abs(LOCK_FILE), JSON.stringify(lock, null, 2) + '\n');
  return lock;
}

function parseArgs(argv) {
  const o = { force: false, dryRun: false, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Usage(`${a} needs a value`);
      return v;
    };
    if (a === '--kit') o.kit = val();
    else if (a === '--ref') o.ref = val();
    else if (a === '--rev') o.rev = val();
    else if (a === '--project') o.project = val();
    else if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--check') o.check = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Usage(`unknown argument ${a}`);
  }
  if (o.check && (o.kit || o.ref || o.force || o.dryRun)) throw new Usage('--check takes only --project and --rev');
  if (!o.check && o.rev) throw new Usage('--rev goes with --check; the kit revision is --ref');
  return o;
}

const same = (a, b) => {
  const n = (p) => path.resolve(p);
  return process.platform === 'win32' ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
};

export function main(argv, { log = console.log, err = console.error } = {}) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    err(`sync: ${e.message}\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    log(USAGE);
    return 0;
  }
  let project;
  try {
    project = Repo.open(o.project ?? process.cwd());
  } catch (e) {
    err(`sync: ${o.project ?? process.cwd()} is not in a git repository (${e.message.split('\n')[0]})`);
    return 2;
  }

  if (o.check) {
    const rev = o.rev ?? 'HEAD';
    const sha = project.resolve(rev);
    if (!sha) {
      err(`sync: ${rev} does not resolve in ${project.dir}`);
      return 2;
    }
    const r = kitProblems(project, sha);
    if (!r) {
      err(`sync: no ${LOCK_FILE} at ${rev}: this project carries no synced kit`);
      return 1;
    }
    for (const p of r.problems) log(`${p.file}: ${p.message}`);
    if (r.problems.length) return 1;
    log(`sync: the kit copy at ${rev} is as ${LOCK_FILE} says: ${Object.keys(r.lock.files).length} file(s) of the kit at ${r.lock.kit.commit.slice(0, 9)}`);
    return 0;
  }

  const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const kitDir = o.kit ?? (fs.existsSync(path.join(here, MANIFEST)) ? here : null);
  if (!kitDir) {
    err(`sync: give --kit <the kit's checkout>; this script is a project's copy\n${USAGE}`);
    return 2;
  }
  let kit;
  try {
    kit = Repo.open(kitDir);
  } catch (e) {
    err(`sync: ${kitDir} is not a git repository (${e.message.split('\n')[0]})`);
    return 2;
  }
  if (same(kit.dir, project.dir)) {
    err('sync: the project is the kit itself; give --project <dir>, or run it from the project');
    return 2;
  }
  const ref = o.ref ?? 'origin/main';
  const commit = kit.resolve(ref);
  if (!commit) {
    err(`sync: ${ref} does not resolve in ${kit.dir}: git fetch there, or pass --ref`);
    return 2;
  }
  const repository = publicUrl(kit.config('remote.origin.url'));
  let plan;
  try {
    plan = planSync({ kit, commit, projectDir: project.dir });
  } catch (e) {
    err(`sync: ${e.message}`);
    return 2;
  }
  const count = (op) => plan.actions.filter((a) => a.op === op).length;
  const at = `the kit at ${commit.slice(0, 9)} (${ref}${repository ? `, ${repository}` : ''})`;
  if (plan.conflicts.length && !o.force) {
    for (const c of plan.conflicts) err(`sync: ${c.path} ${c.why}`);
    err(`sync: nothing written: ${plan.conflicts.length} file(s) the project changed; commit or move the change, or pass --force to take ${at}`);
    return 1;
  }
  for (const a of plan.actions) {
    if (a.op !== 'same') log(`${o.dryRun ? 'would ' : ''}${a.op === 'add' ? 'add' : a.op === 'delete' ? 'delete' : a.replaces ? 'replace' : 'update'} ${a.path}`);
  }
  for (const s of plan.starters) log(`${o.dryRun ? 'would ' : ''}start ${s.path} from ${s.from}: the project's own from now on`);
  if (!o.dryRun) applySync(plan, { projectDir: project.dir, repository, commit });
  log(
    `sync: ${o.dryRun ? 'would sync' : 'synced'} ${at}: ${count('add')} added, ${count('update')} updated, ${count('delete')} deleted, ${count('same')} unchanged` +
      (o.dryRun ? '; nothing written' : `; ${LOCK_FILE} written. Review and commit.`),
  );
  if (plan.stray.length) {
    for (const p of plan.stray) err(`sync: ${p} is not in the kit; the gate's kit check fails on it until it moves out of the kit's paths or into the kit`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2));
}
