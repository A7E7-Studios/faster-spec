// The backlog's view model: pure functions from the backlog's items (each with the state it shows),
// this clone's unsent drafts and the map's features to what the page draws: the board, a request's
// dialog, each feature's open requests and the New requests that wait for the owner. What a person
// sees is the branch with their own drafts on it. Nothing here touches git or the file system.
import { SET_STATES } from '../../backlog/lib/item.mjs';
import { fieldOf } from '../../backlog/lib/ops.mjs';
import { STATE_LABELS } from '../../backlog/lib/state.mjs';

/** The board's columns, in order; Done and Parked show only once their filter is on. */
export const OPEN_STATES = ['new', 'discussing', 'ready', 'in-progress', 'to-review'];
export const CLOSED_STATES = ['done', 'parked'];
const ORDER = [...OPEN_STATES, ...CLOSED_STATES];

/** Every state a request shows, in the board's order: `{ id, label, set, closed }`. */
export const STATES = ORDER.map((id) => ({ id, label: STATE_LABELS[id], set: SET_STATES.includes(id), closed: CLOSED_STATES.includes(id) }));

/** The page's address of a request: `/backlog/<id>`, an unsent one by its draft's key. */
export const requestAddress = (id) => `/backlog/${encodeURIComponent(id)}`;

const label = (state) => STATE_LABELS[state] ?? null;

function fromItem(item) {
  return {
    id: item.id,
    key: null,
    draft: false,
    title: item.title,
    by: item.by,
    created: item.created || null,
    state: item.state,
    shown: item.shown ?? null,
    happens: item.happens,
    should: item.should,
    where: item.where,
    about: [...(item.about ?? [])],
    changes: (item.changes ?? []).map((c) => ({ id: c.id, state: c.state, label: label(c.state), draft: false })),
    notes: (item.notes ?? []).map((n) => ({ by: n.by, at: n.at, text: n.text, draft: false, key: null })),
    drafted: {},
    held: [],
    refused: [],
    unsent: 0,
    problems: item.problems ?? [],
    savedAt: null,
  };
}

function fromAdd(d, me) {
  return {
    id: d.key,
    key: d.key,
    draft: true,
    title: d.title,
    by: me,
    created: null,
    state: 'new',
    shown: 'new',
    happens: d.happens ?? '',
    should: d.should ?? '',
    where: d.where ?? '',
    about: [...(d.about ?? [])],
    changes: [],
    notes: [],
    drafted: {},
    held: [],
    refused: d.refused ? [{ key: d.key, op: 'add', reason: d.refused }] : [],
    unsent: 1,
    problems: [],
    savedAt: d.savedAt ?? null,
  };
}

/**
 * The requests as this person sees them: every request on the branch and every unsent one, each
 * with its drafts applied, and a row per draft for the list of what is unsent.
 *
 * A drafted note is appended after the sent ones (`draft: true`, `at: null`); a drafted edit or
 * move shows its value and names its draft in `drafted[field]`; a held one leaves the field with
 * the other person's value and is listed in `held` as `{ key, field, theirs, yours, by }`; a
 * refused one changes nothing and is listed in `refused`. A request's `shown` is its changes'
 * state when it names one, else the state it is set to; `null` when the file cannot be read.
 * @param {object[]} items as `withShownStates` gives them
 * @param {object[]} drafts as `readDrafts` gives them, oldest first
 * @param {{ me?: string|null, heldBy?: Record<string, string|null> }} [o] the person's git name;
 *   per held draft's key, who gave the field its value
 * @returns {{ requests: Map<string, object>, rows: object[] }}
 */
export function applyDrafts(items, drafts, { me = null, heldBy = {} } = {}) {
  const requests = new Map(items.map((i) => [i.id, fromItem(i)]));
  const targets = [];
  for (const d of drafts) {
    if (d.op === 'add') {
      if (!requests.has(d.key)) requests.set(d.key, fromAdd(d, me));
      targets.push([d, requests.get(d.key)]);
      continue;
    }
    const r = requests.get(d.id ?? d.ref) ?? null;
    targets.push([d, r]);
    if (!r) continue;
    r.unsent++;
    if (d.refused) r.refused.push({ key: d.key, op: d.op, reason: d.refused });
    else if (d.op === 'note') r.notes.push({ by: me, at: null, text: d.text, draft: true, key: d.key });
    else if (d.op === 'link') {
      if (!r.changes.some((c) => c.id === d.change)) r.changes.push({ id: d.change, state: null, label: null, draft: true });
    } else if (d.held) r.held.push({ key: d.key, field: fieldOf(d), theirs: d.held.theirs, yours: d.to, by: heldBy[d.key] ?? null });
    else {
      r[fieldOf(d)] = d.to;
      r.drafted[fieldOf(d)] = d.key;
    }
  }
  for (const r of requests.values()) {
    // A request that names a change shows that change's state, whatever state it is set to.
    if (!r.changes.some((c) => !c.draft)) r.shown = SET_STATES.includes(r.state) ? r.state : null;
    r.label = label(r.shown);
    r.address = requestAddress(r.id);
  }
  const rows = targets.map(([d, r]) => ({
    key: d.key,
    op: d.op,
    request: r?.id ?? d.id ?? d.ref ?? null,
    title: r?.title ?? null,
    ...(d.op === 'edit' ? { field: d.field } : {}),
    ...(d.op === 'edit' || d.op === 'move' ? { to: d.to } : {}),
    ...(d.op === 'move' ? { toLabel: label(d.to) } : {}),
    ...(d.op === 'note' ? { text: d.text } : {}),
    ...(d.op === 'link' ? { change: d.change } : {}),
    held: d.held ? { theirs: d.held.theirs, yours: d.to, by: heldBy[d.key] ?? null } : null,
    refused: d.refused ?? null,
    missing: !r,
    savedAt: d.savedAt ?? null,
  }));
  return { requests, rows };
}

// Unsent requests first, the newest saved first; then the newest asked first, by id within a day.
function newestFirst(a, b) {
  if (a.draft !== b.draft) return a.draft ? -1 : 1;
  if (a.draft) return String(b.savedAt ?? '').localeCompare(String(a.savedAt ?? ''));
  return String(b.created ?? '').localeCompare(String(a.created ?? '')) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The board's columns: `{ state, label, requests: [id] }` for New, Discussing, Ready, In progress
 * and To review, or with `closed` for Done and Parked, the columns behind the filter.
 * @param {Map<string, object>|object[]} requests
 * @param {{ closed?: boolean }} [o]
 */
export function boardColumns(requests, { closed = false } = {}) {
  const all = [...requests.values()];
  return (closed ? CLOSED_STATES : OPEN_STATES).map((state) => ({
    state,
    label: label(state),
    requests: all.filter((r) => r.shown === state).sort(newestFirst).map((r) => r.id),
  }));
}

/** The requests in New that were sent, newest first: what waits for the owner beside the features. */
export function waitingRequests(requests) {
  return [...requests.values()].filter((r) => !r.draft && r.shown === 'new').sort(newestFirst).map((r) => r.id);
}

/**
 * Per feature id, the requests about it that are not Done, in the board's order of states and
 * newest first; an unsent one is among them.
 */
export function requestsByFeature(requests) {
  const by = {};
  const rank = (r) => (r.shown === null ? ORDER.length : ORDER.indexOf(r.shown));
  const open = [...requests.values()].filter((r) => r.shown !== 'done').sort((a, b) => rank(a) - rank(b) || newestFirst(a, b));
  for (const r of open) for (const f of r.about) (by[typeof f === 'string' ? f : f.id] ??= []).push(r.id);
  return by;
}

/** The backlog's banners, as the map's: what is wrong, what still shows. */
function backlogBanners({ status, error, problems, requests, submit, draftsError, unsent }) {
  const out = [];
  if (status === 'unreachable') out.push({ kind: 'backlog-stale', error });
  if (status === 'unavailable' && error) out.push({ kind: 'backlog-off', error });
  if (problems.length) out.push({ kind: 'backlog-branch', problems });
  const broken = [...requests.values()].filter((r) => r.problems.length);
  if (broken.length) out.push({ kind: 'backlog-format', requests: broken.map((r) => ({ id: r.id, title: r.title, message: r.problems[0].message })) });
  if (draftsError) out.push({ kind: 'backlog-drafts', error: draftsError });
  if (submit && !submit.ok) out.push(submit.unreachable ? { kind: 'submit-unreachable', drafts: unsent, error: submit.error ?? null } : { kind: 'submit-failed', error: submit.error ?? null });
  return out;
}

/**
 * The backlog's view model.
 * @param {object} o
 * @param {object[]} [o.items] as `withShownStates` gives them
 * @param {object[]} [o.drafts] as `readDrafts` gives them
 * @param {Record<string, { title: string }>} [o.features] the map's features, for their titles
 * @param {string|null} [o.me] this clone's git name: who the drafts are by
 * @param {{ state: 'current'|'absent'|'unreachable'|'unavailable', error?: string|null }} [o.status]
 * @param {string[]} [o.problems] files on the branch that are not items
 * @param {Record<string, string|null>} [o.heldBy] per held draft's key, who gave the field its value
 * @param {{ branch?: string, repo?: string|null }|null} [o.where]
 * @param {object|null} [o.submit] the Submit just made, for its banner
 * @param {string|null} [o.draftsError] why the drafts file cannot be read
 */
export function backlogView({ items = [], drafts = [], features = {}, me = null, status = { state: 'current' }, problems = [], heldBy = {}, where = null, submit = null, draftsError = null } = {}) {
  const { requests, rows } = applyDrafts(items, drafts, { me, heldBy });
  for (const r of requests.values()) r.about = r.about.map((id) => ({ id, title: features[id]?.title ?? id, exists: !!features[id] }));
  const sent = [...requests.values()].filter((r) => !r.draft);
  return {
    status: status.state,
    error: status.error ?? null,
    branch: where?.branch ?? null,
    repo: where?.repo ?? null,
    me,
    states: STATES,
    requests: Object.fromEntries(requests),
    board: {
      open: boardColumns(requests),
      closed: boardColumns(requests, { closed: true }),
      unreadable: [...requests.values()].filter((r) => r.shown === null).map((r) => r.id),
    },
    waiting: waitingRequests(requests),
    byFeature: requestsByFeature(requests),
    drafts: rows,
    totals: {
      open: sent.filter((r) => OPEN_STATES.includes(r.shown)).length,
      closed: sent.filter((r) => CLOSED_STATES.includes(r.shown)).length,
      unsent: rows.length,
    },
    banners: backlogBanners({ status: status.state, error: status.error ?? null, problems, requests, submit, draftsError, unsent: rows.length }),
  };
}
