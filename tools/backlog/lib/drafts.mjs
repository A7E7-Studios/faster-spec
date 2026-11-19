// Drafts: what a person wrote on the map and has not sent. They live in the backlog's repository's
// git directory, `<git common dir>/faster-spec/backlog-drafts.json`: per clone, never committed,
// out of `git status`, kept across restarts. Submit sends every draft as one write. Every process
// on the clone shares the file (two maps' windows, two worktrees), so each change of it, and a
// Submit from its read to its clearing, holds the lock beside it, `backlog-drafts.lock`.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { runGit } from '../../gate/lib/git.mjs';
import { opProblem, fieldOf, EDIT_FIELDS } from './ops.mjs';
import { writeBacklog } from './store.mjs';

export const DRAFTS_VERSION = 1;
// What a draft carries besides its operation.
const META = ['key', 'rev', 'savedAt', 'held', 'refused'];
/** How long a draft change waits for the lock while another holds it, in ms. */
export const LOCK_WAIT = 2000;
/**
 * When a lock is stale and taken over, in ms: older than this, well past the longest a Submit's
 * fetches and pushes take (store.mjs: MAX_TRIES tries, NET_TIMEOUT each), or held by a process
 * that has gone.
 */
export const LOCK_STALE = 60 * 60 * 1000;
// A lock that does not read is being written: its holder writes it as it creates it.
const UNREAD_STALE = 10000;
/** The `code` of the error a draft change gives, and the `busy` of a Submit, when another holds the lock. */
export const DRAFTS_BUSY = 'drafts-busy';
/** What a Submit, or a draft change that waited, says when another Submit holds the lock. */
export const SENDING_ELSEWHERE = 'another map on this computer is sending; try again once it is done';

/** The drafts file of the repository holding `dir`, shared by every worktree of one clone. */
export function draftsPath(dir) {
  const common = runGit(dir, ['rev-parse', '--git-common-dir']).trim();
  return path.join(path.resolve(dir, common), 'faster-spec', 'backlog-drafts.json');
}

/** The lock beside the drafts file: `{ pid, at, what: 'write' | 'submit', token }` while it is held. */
export function lockPath(dir) {
  return draftsPath(dir).replace(/\.json$/, '.lock');
}

/**
 * The unsent drafts, oldest first: each an operation (see `opProblem` in ops.mjs) with `key`
 * (this clone's name for it, which an `add`'s notes and moves name as `ref` until it is sent),
 * `rev` (how many times it was saved), `savedAt`, and after a Submit that kept it, `held:
 * { theirs }` (the value someone else gave the field; the draft's `to` is the other) or `refused`
 * (why it could not be sent). No file is no drafts; a file that does not read throws. It takes no
 * lock: the file is only ever replaced whole.
 * @param {string} dir a folder in the backlog's repository
 */
export function readDrafts(dir) {
  const file = draftsPath(dir);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`${file} cannot be read: ${e.message}`);
  }
  if (data?.version !== DRAFTS_VERSION || !Array.isArray(data.drafts)) throw new Error(`${file} is not version ${DRAFTS_VERSION} drafts`);
  return data.drafts;
}

/** Replaces the drafts file whole: written beside it, then renamed over it, so no reader sees half. */
function writeDrafts(dir, drafts) {
  const file = draftsPath(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ version: DRAFTS_VERSION, drafts }, null, 2) + '\n');
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/* ---------- the lock ---------- */

/** Whether a process is there: signal 0 only asks. */
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** The lock's holder as it reads: null when there is no lock, `{}` when it does not read. */
function holderOf(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return e.code === 'ENOENT' ? null : {}; }
  try { const h = JSON.parse(text); return h && typeof h === 'object' && !Array.isArray(h) ? h : {}; } catch { return {}; }
}

function isStale(file, h) {
  if (Number.isInteger(h.pid) && Number.isFinite(h.at)) return !alive(h.pid) || Date.now() - h.at > LOCK_STALE;
  try { return Date.now() - fs.statSync(file).mtimeMs > UNREAD_STALE; } catch { return false; }
}

/**
 * Removes a stale lock `h` read at `file`: renamed aside first, and given back should it turn out
 * to be another's, taken between the read and the rename.
 */
function takeOver(file, h) {
  const aside = `${file}.stale-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try { fs.renameSync(file, aside); } catch { return; } // gone already: another took it over
  if (JSON.stringify(holderOf(aside)) !== JSON.stringify(h)) {
    try { fs.linkSync(aside, file); } catch { /* yet another holds it now */ }
  }
  fs.rmSync(aside, { force: true });
}

/** One try at the lock: `{ token }` when this call holds it now, else `{ holder }`, who does. */
function tryLock(file, what) {
  const mine = { pid: process.pid, at: Date.now(), what, token: crypto.randomBytes(8).toString('hex') };
  for (let i = 0; i < 3; i++) {
    try {
      fs.writeFileSync(file, JSON.stringify(mine), { flag: 'wx' });
      return { token: mine.token };
    } catch (e) {
      // EPERM: on Windows, a lock being removed still holds its name for a moment.
      if (e.code !== 'EEXIST' && e.code !== 'EPERM') throw e;
    }
    const h = holderOf(file);
    if (h && !isStale(file, h)) return { holder: h };
    if (h) takeOver(file, h);
  }
  return { holder: holderOf(file) ?? {} };
}

/** Lets the lock go, when it is still this holder's: one taken over as stale is another's now. */
function release(file, token) {
  try {
    if (holderOf(file)?.token === token) fs.rmSync(file, { force: true });
  } catch { /* the next taker finds it stale */ }
}

/**
 * Runs `fn` holding the drafts lock of `dir`'s clone; `what` names the holder (`write`, `submit`).
 * The lock taken first is tried at once, before anything waits. Another holder is waited on for
 * `wait` ms, a Submit never waiting on another Submit; then it throws an error with code DRAFTS_BUSY.
 */
async function locked(dir, what, fn, { wait = LOCK_WAIT } = {}) {
  const file = lockPath(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const until = Date.now() + wait; ;) {
    const l = tryLock(file, what);
    if (l.token) {
      try {
        return await fn();
      } finally {
        release(file, l.token);
      }
    }
    // A Submit that waited on another would send what that one sends.
    if ((what === 'submit' && l.holder.what === 'submit') || Date.now() >= until) {
      throw Object.assign(new Error(l.holder.what === 'submit' ? SENDING_ELSEWHERE : 'another map on this computer is saving a draft; try again'), { code: DRAFTS_BUSY });
    }
    await sleep(50);
  }
}

/* ---------- drafts ---------- */

const opOf = (draft) => Object.fromEntries(Object.entries(draft).filter(([k]) => !META.includes(k)));
/** A key no draft of `drafts` has. */
function freshKey(drafts) {
  let k;
  do k = `d-${crypto.randomBytes(6).toString('hex')}`; while (drafts.some((d) => d.key === k));
  return k;
}
// The operation a draft sends: an `add` keeps its key, so the drafts naming it by `ref` go with it.
const sendOf = (draft) => (draft.op === 'add' ? { ...opOf(draft), key: draft.key } : opOf(draft));

/**
 * Adds a draft, or changes the one with the draft's `key`; saving clears `held` and `refused`.
 * Holds the drafts lock, waiting `wait` ms (LOCK_WAIT) for another holder. Rejects on an operation
 * that is not one, a key with no draft, or the lock held all that time (code DRAFTS_BUSY), and then
 * changes nothing. Resolves { draft, drafts }.
 * @param {string} dir
 * @param {object} draft an operation, with `key` to change that draft
 * @param {{ wait?: number }} [o]
 */
export async function saveDraft(dir, draft, { wait } = {}) {
  const op = opOf(draft ?? {});
  const bad = opProblem(op);
  if (bad) throw new Error(bad);
  return locked(dir, 'write', () => {
    const drafts = readDrafts(dir);
    const key = draft.key;
    const i = key === undefined ? -1 : drafts.findIndex((d) => d.key === key);
    if (key !== undefined && i < 0) throw new Error(`no draft "${key}"`);
    if (op.ref !== undefined && !drafts.some((d) => d.key === op.ref && d.op === 'add')) throw new Error(`no unsent request "${op.ref}"`);
    const k = key ?? freshKey(drafts);
    const saved = { key: k, ...op, rev: i < 0 ? 1 : (drafts[i].rev ?? 0) + 1, savedAt: new Date().toISOString() };
    if (i < 0) drafts.push(saved);
    else drafts[i] = saved;
    writeDrafts(dir, drafts);
    return { draft: saved, drafts };
  }, { wait });
}

/**
 * Drops a draft, and with an unsent request every draft that names it, holding the lock as
 * `saveDraft` does. Resolves the drafts left.
 */
export async function dropDraft(dir, key, { wait } = {}) {
  return locked(dir, 'write', () => {
    const left = readDrafts(dir).filter((d) => d.key !== key && d.ref !== key);
    writeDrafts(dir, left);
    return left;
  }, { wait });
}

/** A field of a request being written as an edit sends it: text '' and no features when left out. */
const fieldValue = (add, field) => add[field] ?? (field === 'about' ? [] : '');

/**
 * The drafts that carry an unsent request's change made while it was sent: one edit of request `id`
 * per field `now` gives otherwise than `sent`, from the value sent, so a field someone else set
 * meanwhile is held, not written over. Each gets a key none of `taken` has.
 */
function editsOf(sent, now, id, taken) {
  const keys = [...taken];
  return EDIT_FIELDS.filter((f) => JSON.stringify(fieldValue(sent, f)) !== JSON.stringify(fieldValue(now, f))).map((field) => {
    const edit = { key: freshKey(keys), op: 'edit', id, field, from: fieldValue(sent, field), to: fieldValue(now, field), rev: 1, savedAt: now.savedAt };
    keys.push(edit);
    return edit;
  });
}

const chains = new Map();

/**
 * Sends every draft as one write (`writeBacklog`), holding the drafts lock from its read of the
 * drafts to their clearing, so no draft changes meanwhile and no other Submit sends them too. A
 * sent draft is removed, and a draft naming a sent request by `ref` names it by its new `id`; a
 * held one stays with `held: { theirs }`, a refused one with `refused`. When nothing could be sent
 * (the remote unreachable), every draft stays. Submits of one clone in one process run one after
 * the other; one that finds another process's Submit holding the lock sends nothing and resolves
 * `busy`. A draft that changed all the same, its lock taken over as stale, keeps the change on top
 * of what was sent: an unsent request that was sent becomes an edit of it per field changed, and a
 * move or an edit that was sent takes the value it sent as its `from`.
 *
 * Resolves { ok, commit, sent, held, refused, drafts, unreachable?, busy?, error? }: `drafts` those left.
 * @param {{ dir: string, branch: string }} where
 * @param {{ now?: Date, net?: Function }} [o] passed to `writeBacklog`
 */
export function submitDrafts(where, o = {}) {
  const file = draftsPath(where.dir);
  const run = (chains.get(file) ?? Promise.resolve()).then(() => submitOnce(where, o));
  chains.set(file, run.catch(() => {}));
  return run;
}

async function submitOnce(where, o) {
  try {
    return await locked(where.dir, 'submit', () => sendDrafts(where, o));
  } catch (e) {
    if (e.code !== DRAFTS_BUSY) throw e;
    return { ok: false, busy: true, unreachable: false, error: e.message, commit: null, sent: [], held: [], refused: [], drafts: readDrafts(where.dir) };
  }
}

async function sendDrafts(where, o) {
  const drafts = readDrafts(where.dir);
  const none = { commit: null, sent: [], held: [], refused: [] };
  if (!drafts.length) return { ok: true, ...none, drafts };
  const w = await writeBacklog(where, drafts.map(sendOf), o);
  if (!w.ok) return { ok: false, unreachable: w.unreachable, error: w.error, ...none, drafts: readDrafts(where.dir) };
  const outcome = new Map(drafts.map((d, i) => [d.key, { draft: d, result: w.results[i] }]));
  // A request sent now has its id: the drafts that named it by its key name it by that.
  const ids = new Map();
  drafts.forEach((d, i) => {
    if (d.op === 'add' && w.results[i].status === 'applied') ids.set(d.key, w.results[i].id);
  });
  const byId = ({ ref, ...rest }) => ({ ...rest, id: ids.get(ref) });
  const sent = [];
  const held = [];
  const refused = [];
  const left = [];
  const now = readDrafts(where.dir);
  for (const d of now) {
    const out = outcome.get(d.key);
    const named = d.ref !== undefined && ids.has(d.ref) ? byId(d) : d;
    if (!out) {
      left.push(named);
      continue;
    }
    const r = out.result;
    const went = r.status === 'applied' || r.status === 'unchanged';
    if (out.draft.rev !== d.rev) {
      // Changed while the write was out (its lock taken over as stale). What was sent is on the
      // branch; sent again as it is now, an unsent request would be a second request, and a move
      // or an edit would be held against the value it set itself.
      if (went) sent.push({ ...out.draft, id: r.id });
      if (went && d.op === 'add') left.push(...editsOf(out.draft, d, r.id, [...now, ...left]));
      else if (went && (d.op === 'move' || d.op === 'edit') && named.id === r.id && fieldOf(d) === fieldOf(out.draft)) left.push({ ...named, from: out.draft.to });
      else left.push(named);
      continue;
    }
    if (went) sent.push({ ...d, id: r.id });
    else if (r.status === 'held') {
      const h = { ...named, held: { theirs: r.theirs } };
      held.push(h);
      left.push(h);
    } else {
      const x = { ...named, refused: r.reason };
      refused.push(x);
      left.push(x);
    }
  }
  writeDrafts(where.dir, left);
  return { ok: true, commit: w.commit, sent, held, refused, drafts: left };
}
