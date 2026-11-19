// Drafts: what a person wrote on the map and has not sent. They live in the backlog's repository's
// git directory, `<git common dir>/faster-spec/backlog-drafts.json`: per clone, never committed,
// out of `git status`, kept across restarts. Submit sends every draft as one write.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runGit } from '../../gate/lib/git.mjs';
import { opProblem } from './ops.mjs';
import { writeBacklog } from './store.mjs';

export const DRAFTS_VERSION = 1;
// What a draft carries besides its operation.
const META = ['key', 'rev', 'savedAt', 'held', 'refused'];

/** The drafts file of the repository holding `dir`, shared by every worktree of one clone. */
export function draftsPath(dir) {
  const common = runGit(dir, ['rev-parse', '--git-common-dir']).trim();
  return path.join(path.resolve(dir, common), 'faster-spec', 'backlog-drafts.json');
}

/**
 * The unsent drafts, oldest first: each an operation (see `opProblem` in ops.mjs) with `key`
 * (this clone's name for it, which an `add`'s notes and moves name as `ref` until it is sent),
 * `rev` (how many times it was saved), `savedAt`, and after a Submit that kept it, `held:
 * { theirs }` (the value someone else gave the field; the draft's `to` is the other) or `refused`
 * (why it could not be sent). No file is no drafts; a file that does not read throws.
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

function writeDrafts(dir, drafts) {
  const file = draftsPath(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: DRAFTS_VERSION, drafts }, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

const opOf = (draft) => Object.fromEntries(Object.entries(draft).filter(([k]) => !META.includes(k)));
// The operation a draft sends: an `add` keeps its key, so the drafts naming it by `ref` go with it.
const sendOf = (draft) => (draft.op === 'add' ? { ...opOf(draft), key: draft.key } : opOf(draft));

/**
 * Adds a draft, or changes the one with the draft's `key`; saving clears `held` and `refused`.
 * Throws on an operation that is not one, or a key with no draft. Returns { draft, drafts }.
 * @param {string} dir
 * @param {object} draft an operation, with `key` to change that draft
 */
export function saveDraft(dir, draft) {
  const op = opOf(draft ?? {});
  const bad = opProblem(op);
  if (bad) throw new Error(bad);
  const drafts = readDrafts(dir);
  const key = draft.key;
  const i = key === undefined ? -1 : drafts.findIndex((d) => d.key === key);
  if (key !== undefined && i < 0) throw new Error(`no draft "${key}"`);
  if (op.ref !== undefined && !drafts.some((d) => d.key === op.ref && d.op === 'add')) throw new Error(`no unsent request "${op.ref}"`);
  let k = key;
  if (k === undefined) do k = `d-${crypto.randomBytes(6).toString('hex')}`; while (drafts.some((d) => d.key === k));
  const saved = { key: k, ...op, rev: i < 0 ? 1 : (drafts[i].rev ?? 0) + 1, savedAt: new Date().toISOString() };
  if (i < 0) drafts.push(saved);
  else drafts[i] = saved;
  writeDrafts(dir, drafts);
  return { draft: saved, drafts };
}

/** Drops a draft, and with an unsent request every draft that names it. Returns the drafts left. */
export function dropDraft(dir, key) {
  const left = readDrafts(dir).filter((d) => d.key !== key && d.ref !== key);
  writeDrafts(dir, left);
  return left;
}

const chains = new Map();

/**
 * Sends every draft as one write (`writeBacklog`). A sent draft is removed, and a draft naming a
 * sent request by `ref` names it by its new `id`; a held one stays with `held: { theirs }`, a
 * refused one with `refused`; a draft saved while the write was out stays as it was saved. When
 * nothing could be sent (the remote unreachable), every draft stays. Submits of one clone run one
 * after the other.
 *
 * Resolves { ok, commit, sent, held, refused, drafts, unreachable?, error? }: `drafts` those left.
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
  const drafts = readDrafts(where.dir);
  const none = { commit: null, sent: [], held: [], refused: [] };
  if (!drafts.length) return { ok: true, ...none, drafts };
  const w = await writeBacklog(where, drafts.map(sendOf), o);
  if (!w.ok) return { ok: false, unreachable: w.unreachable, error: w.error, ...none, drafts: readDrafts(where.dir) };
  const outcome = new Map(drafts.map((d, i) => [d.key, { rev: d.rev, result: w.results[i] }]));
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
  for (const d of readDrafts(where.dir)) {
    const out = outcome.get(d.key);
    const named = d.ref !== undefined && ids.has(d.ref) ? byId(d) : d;
    if (!out || out.rev !== d.rev) {
      left.push(named);
      continue;
    }
    const r = out.result;
    if (r.status === 'applied' || r.status === 'unchanged') sent.push({ ...d, id: r.id });
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
