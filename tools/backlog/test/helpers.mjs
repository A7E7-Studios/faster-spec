// Throwaway projects for the backlog's tests: bare origins and clones in the OS temp folder, each
// clone with its own git name. Git reads no global or system config while the tests run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../../gate/test/helpers.mjs';
import { runGit } from '../../gate/lib/git.mjs';

const CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-gitconfig-'));
const GLOBAL = path.join(CONFIG_DIR, 'config');
fs.writeFileSync(GLOBAL, '[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n[core]\n\tautocrlf = false\n');
process.env.GIT_CONFIG_GLOBAL = GLOBAL;
process.env.GIT_CONFIG_NOSYSTEM = '1';
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) delete process.env[k];
process.on('exit', () => fs.rmSync(CONFIG_DIR, { recursive: true, force: true }));

export { git };

/** Runs `fn(tmp)` with a fresh temp folder, removed afterwards. */
export async function withTmp(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-test-'));
  try {
    return await fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Writes `files` ({ path: text, or null to delete }) under `dir`. */
export function writeFiles(dir, files) {
  for (const [p, body] of Object.entries(files)) {
    const f = path.join(dir, ...p.split('/'));
    if (body === null) fs.rmSync(f, { recursive: true, force: true });
    else {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, body);
    }
  }
}

/** Sets a clone's own git name and email. */
export function identify(dir, name) {
  git(dir, ['config', 'user.name', name]);
  git(dir, ['config', 'user.email', `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`]);
}

/** Commits every change in `dir` on its current branch and pushes it to origin's main. */
export function land(dir, files, message = 'land') {
  writeFiles(dir, files);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', message]);
  git(dir, ['push', '-q', 'origin', 'HEAD:main']);
  return git(dir, ['rev-parse', 'HEAD']);
}

/**
 * A bare origin `<name>.git` whose main holds `files`, and a clone of it per person, each with
 * `origin/main` and that person's git name. Returns { origin, clones: [dir], main }.
 */
export function project(tmp, name = 'notes-app', { files = { 'README.md': '# Notes\n' }, people = ['Pat Example'] } = {}) {
  const origin = path.join(tmp, `${name}.git`);
  git(tmp, ['init', '-q', '--bare', origin]);
  const seed = path.join(tmp, `${name}-seed`);
  git(tmp, ['init', '-q', seed]);
  identify(seed, 'Seed');
  git(seed, ['remote', 'add', 'origin', origin]);
  const main = land(seed, files, 'first');
  fs.rmSync(seed, { recursive: true, force: true });
  const clones = people.map((person, i) => {
    const dir = path.join(tmp, `${name}-${i + 1}`);
    git(tmp, ['clone', '-q', origin, dir]);
    identify(dir, person);
    return dir;
  });
  return { origin, clones, main };
}

/** The file at `rev:p` in a repository (bare or not), byte for byte, or null. */
export function show(dir, rev, p) {
  const r = runGit(dir, ['show', `${rev}:${p}`], { allowFail: true });
  return r.status === 0 ? r.stdout : null;
}

/** Every commit on `ref` in `dir`, newest first: [{ sha, parents, subject, body, author }]. */
export function commits(dir, ref) {
  const out = git(dir, ['log', '--format=%H%x00%P%x00%an%x00%s%x00%b%x1e', ref]);
  return out
    .split('\x1e')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [sha, parents, author, subject, body] = s.split('\0');
      return { sha, parents: parents ? parents.split(' ') : [], author, subject, body: (body ?? '').trim() };
    });
}

/** Whether `ref` exists in `dir`. */
export function hasRef(dir, ref) {
  try {
    git(dir, ['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}
