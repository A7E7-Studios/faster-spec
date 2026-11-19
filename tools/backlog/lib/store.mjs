// The backlog's branch: read through git objects, written by plumbing alone. No write checks
// anything out or touches a checkout's HEAD, index, branches or files: it fetches the branch,
// replays its operations onto the tip in a temporary index, makes one commit and pushes it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Repo, runGit } from '../../gate/lib/git.mjs';
import { git as gitAsync, resolveRepos } from '../../solution-map/lib/sources.mjs';
import { parseItem, itemPath, ITEM_FILE } from './item.mjs';
import { applyOps, commitMessage } from './ops.mjs';

export const DEFAULT_BRANCH = 'backlog';
/** How many times a write replays onto a branch someone pushed to first. */
export const MAX_TRIES = 5;
/** How long a fetch or a push may take, in ms. */
export const NET_TIMEOUT = 60000;
const REMOTE = 'origin';
const REPO_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NEVER = ['main', 'master', 'HEAD'];

const lastLine = (s) => String(s ?? '').trim().split('\n').pop() || '';

/** A branch name the backlog may use: git's rules, a little stricter, and never main. */
function branchProblem(b) {
  if (typeof b !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(b)) return `backlog.branch "${b}" is letters, digits and . _ / -`;
  if (/\.\.|\/\/|\/\.|@\{|\.lock$|\/$|\.$/.test(b)) return `backlog.branch "${b}" is not a branch name git allows`;
  if (NEVER.includes(b)) return `backlog.branch "${b}" would write over the project's code; name a branch of its own`;
  return null;
}

/**
 * The config's `backlog` block, `{ repo, branch }`: `repo` an id in `solutionMap.repos` or null,
 * `branch` by default `backlog`. Throws on a bad value.
 * @param {object|null} config tools/gate/config.json
 */
export function backlogConfig(config) {
  const b = config?.backlog;
  if (b === undefined || b === null) return { repo: null, branch: DEFAULT_BRANCH };
  if (typeof b !== 'object' || Array.isArray(b)) throw new Error('backlog is { "repo": "<id in solutionMap.repos>", "branch": "<name>" }');
  for (const k of Object.keys(b)) if (k !== 'repo' && k !== 'branch') throw new Error(`backlog has no key "${k}" (repo, branch)`);
  if (b.repo !== undefined && (typeof b.repo !== 'string' || !REPO_ID.test(b.repo))) throw new Error(`backlog.repo "${b.repo}" is an id in solutionMap.repos`);
  const branch = b.branch ?? DEFAULT_BRANCH;
  const bad = branchProblem(branch);
  if (bad) throw new Error(bad);
  return { repo: b.repo ?? null, branch };
}

/**
 * Where the backlog lives: `{ dir, branch, repo }`. With `backlog.repo` in the config, that
 * repository of `repos` (else of the config's `solutionMap.repos`); without it, the repository the
 * tool runs in: the work tree holding `root`, else the git directory holding it (a map run from
 * inside a clone's git directory), else the first of `repos`. `repo` is the id of `repos`' entry
 * when one is that repository, else null. Throws when there is no such repository.
 * @param {{ config?: object|null, repos?: { id: string, dir: string }[], root?: string }} [o]
 */
export function locateBacklog({ config = null, repos = [], root = process.cwd() } = {}) {
  const { repo, branch } = backlogConfig(config);
  if (repo) {
    const list = repos.length ? repos : resolveRepos({ config, root });
    const r = list.find((x) => x.id === repo);
    if (!r) throw new Error(`backlog.repo "${repo}" is not an id in solutionMap.repos`);
    return { dir: r.dir, branch, repo: r.id };
  }
  const ask = (args) => {
    if (!fs.existsSync(root)) return null;
    const r = runGit(root, args, { allowFail: true });
    return r.status === 0 && String(r.stdout).trim() ? String(r.stdout).trim() : null;
  };
  const dir = ask(['rev-parse', '--show-toplevel']) ?? ask(['rev-parse', '--absolute-git-dir']) ?? repos[0]?.dir;
  if (!dir) throw new Error('the backlog lives in a git repository: run this in one, or name backlog.repo in tools/gate/config.json');
  const key = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  return { dir, branch, repo: repos.find((r) => key(r.dir) === key(dir))?.id ?? null };
}

/** The remote-tracking ref this clone reads the backlog from. */
export const trackingRef = (where) => `refs/remotes/${REMOTE}/${where.branch}`;

/** The commit this clone last fetched of the backlog's branch, or null. */
export function backlogTip(where) {
  return new Repo(where.dir).resolve(trackingRef(where));
}

/**
 * Fetches the backlog's branch into this clone's `origin/<branch>`, nothing else. Resolves
 * `{ state, tip, error? }`: `current` (fetched now), `absent` (the remote has no such branch yet:
 * nobody has written), or `unreachable` (the fetch failed, `tip` what this clone last fetched; or
 * no folder is there, `tip` null).
 * @param {{ dir: string, branch: string }} where
 * @param {{ net?: Function }} [o] runs git for the network: `(dir, args, { timeout }) => { ok, out, err }`
 */
export async function fetchBacklog(where, { net = gitAsync } = {}) {
  if (!fs.existsSync(where.dir)) return { state: 'unreachable', tip: null, error: `no repository at ${where.dir}` };
  const f = await net(where.dir, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', REMOTE, `+refs/heads/${where.branch}:${trackingRef(where)}`], { timeout: NET_TIMEOUT });
  if (f.ok) return { state: 'current', tip: backlogTip(where) };
  const ls = await net(where.dir, ['ls-remote', REMOTE, `refs/heads/${where.branch}`], { timeout: NET_TIMEOUT });
  const named = ls.ok && String(ls.out).split('\n').some((l) => l.trim().endsWith(`\trefs/heads/${where.branch}`));
  if (ls.ok && !named) return { state: 'absent', tip: backlogTip(where) };
  return { state: 'unreachable', tip: backlogTip(where), error: lastLine(f.err) || 'the fetch failed' };
}

/** Each item's id and file text at `tip`, and the paths there that are not items. */
function readTexts(dir, tip) {
  const repo = new Repo(dir);
  const files = [...repo.tree(tip).files.keys()];
  const items = files.filter((p) => ITEM_FILE.test(p));
  repo.prefetch(tip, items);
  return {
    texts: new Map(items.map((p) => [ITEM_FILE.exec(p)[1], repo.text(tip, p)])),
    stray: files.filter((p) => !ITEM_FILE.test(p)),
  };
}

/**
 * The backlog as this clone last fetched it: `{ tip, items, problems }`. No branch yet is an empty
 * backlog (`tip` null). Each item is what `parseItem` reads, with its `path`; an item that cannot be
 * read as the format carries its problems. `problems` names any file on the branch that is not an
 * item: a branch holding one is no backlog, and nothing is written to it.
 * @param {{ dir: string, branch: string }} where
 * @param {{ tip?: string|null }} [o] the commit to read; the clone's `origin/<branch>` by default
 */
export function readBacklog(where, { tip = backlogTip(where) } = {}) {
  if (!tip) return { tip: null, items: [], problems: [] };
  const { texts, stray } = readTexts(where.dir, tip);
  const items = [...texts].map(([id, text]) => ({ ...parseItem(text, { id }), path: itemPath(id) }));
  return { tip, items, problems: stray.map((p) => `${p} is not an item: the backlog's branch holds backlog/<id>.md files only`) };
}

/** The repository's `user.name` and `user.email`, or null when either is unset. */
export function gitIdentity(dir) {
  const repo = new Repo(dir);
  const name = repo.config('user.name');
  const email = repo.config('user.email');
  return name && email ? { name, email } : null;
}

/** A commit of `files` (id -> text) over `base` (or with no parent), built in a temporary index. */
function makeCommit(dir, base, files, message, who) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-index-'));
  try {
    const env = { GIT_INDEX_FILE: path.join(tmp, 'index') };
    if (base) runGit(dir, ['read-tree', base], { env });
    const entries = [...files].map(([id, text]) => `100644 ${runGit(dir, ['hash-object', '-w', '--stdin'], { input: text }).trim()}\t${itemPath(id)}`);
    runGit(dir, ['update-index', '--add', '--index-info'], { input: entries.join('\n') + '\n', env });
    const tree = runGit(dir, ['write-tree'], { env }).trim();
    const ident = { GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email };
    return runGit(dir, ['commit-tree', tree, ...(base ? ['-p', base] : []), '-F', '-'], { input: message, env: ident }).trim();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Writes `ops` to the backlog as one commit: fetches the branch, replays the operations onto its
 * tip (`applyOps`), commits with the repository's git name and email, and pushes. A push that
 * someone else's beat fetches and replays, MAX_TRIES tries in all. The first write makes the
 * branch: a commit with no parent, sharing no history with main.
 *
 * Resolves `{ ok: true, commit, results }`, `commit` null when nothing changed (every operation
 * unchanged, held or refused); or `{ ok: false, unreachable, error, results: [] }` when nothing was
 * sent: `unreachable` when the remote could not be fetched from or pushed to (or the branch kept
 * moving), false when the clone has no git name and email or the branch is no backlog.
 * @param {{ dir: string, branch: string }} where
 * @param {object[]} ops see `opProblem` in ops.mjs
 * @param {{ now?: Date, net?: Function }} [o]
 */
export async function writeBacklog(where, ops, { now = new Date(), net = gitAsync } = {}) {
  const who = gitIdentity(where.dir);
  if (!who) return { ok: false, unreachable: false, error: 'git has no user.name and user.email in this repository: set them with git config', results: [] };
  let f = await fetchBacklog(where, { net });
  for (let attempt = 1; ; attempt++) {
    if (f.state === 'unreachable') return { ok: false, unreachable: true, error: f.error, results: [] };
    const base = f.tip;
    const { texts, stray } = base ? readTexts(where.dir, base) : { texts: new Map(), stray: [] };
    if (stray.length) return { ok: false, unreachable: false, error: `${stray[0]} is not an item: ${where.branch} is not a backlog's branch, and nothing is written to it`, results: [] };
    const { files, results } = applyOps(texts, ops, { name: who.name, now });
    if (!files.size) return { ok: true, commit: null, results };
    const commit = makeCommit(where.dir, base, files, commitMessage(who.name, results), who);
    const p = await net(where.dir, ['push', '--quiet', REMOTE, `${commit}:refs/heads/${where.branch}`], { timeout: NET_TIMEOUT });
    if (p.ok) {
      // Sent: this clone reads it at once. Should the ref be locked, the next fetch brings it.
      runGit(where.dir, ['update-ref', '-m', 'backlog: write', trackingRef(where), commit], { allowFail: true });
      return { ok: true, commit, results };
    }
    f = await fetchBacklog(where, { net });
    if (f.state === 'unreachable') continue;
    // Refused although nobody moved the branch: a rule or a permission, not a race.
    if (f.tip === base) return { ok: false, unreachable: true, error: lastLine(p.err) || 'the push was refused', results: [] };
    if (attempt >= MAX_TRIES) return { ok: false, unreachable: true, error: `others pushed to ${where.branch} before each of ${MAX_TRIES} tries; nothing was sent`, results: [] };
  }
}
