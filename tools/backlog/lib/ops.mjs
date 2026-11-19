// A write to the backlog is a list of operations replayed onto the branch's latest commit, so two
// people writing at once never lose a note and a field someone changed meanwhile is held, not
// overwritten. Pure functions over item texts; nothing here touches git.
import { ID } from '../../gate/lib/spec.mjs';
import { parseItem, writeItem, newId, cleanText, cleanLine, utcDate, utcMinute, SET_STATES, FEATURE_ID } from './item.mjs';

export const OPS = ['add', 'note', 'edit', 'move', 'link'];
/** The fields an edit changes: the title, the request's three sections and the features it is about. */
export const EDIT_FIELDS = ['title', 'happens', 'should', 'where', 'about'];

const isText = (v) => v === undefined || typeof v === 'string';
const isFeatures = (v) => Array.isArray(v) && v.every((a) => typeof a === 'string' && FEATURE_ID.test(a));

/**
 * What is wrong with an operation's shape, or null. An operation is one of
 *   { op: 'add', key?, title, happens?, should?, where?, about?: [<feature id>] }
 *   { op: 'note', id | ref, text }
 *   { op: 'edit', id | ref, field, from?, to }
 *   { op: 'move', id | ref, from?, to }
 *   { op: 'link', id | ref, change }
 * where `id` names an item on the branch and `ref` the `key` of an `add` sent in the same batch.
 * A `from` left out sets the field whatever it holds.
 */
export function opProblem(op) {
  if (!op || typeof op !== 'object') return 'an operation is an object';
  if (!OPS.includes(op.op)) return `"${op.op}" is not an operation (${OPS.join(', ')})`;
  if (op.op === 'add') {
    if (typeof op.title !== 'string' || !cleanLine(op.title)) return 'a request needs a title';
    if (!isText(op.happens) || !isText(op.should) || !isText(op.where)) return 'what happens, what should happen and where are text';
    if (op.about !== undefined && !isFeatures(op.about)) return 'about lists feature ids, <domain>/<capability>';
    if (op.key !== undefined && (typeof op.key !== 'string' || !op.key)) return 'a key is a non-empty string';
    return null;
  }
  const target = op.id !== undefined
    ? typeof op.id === 'string' && ID.test(op.id) && op.ref === undefined
    : typeof op.ref === 'string' && op.ref !== '';
  if (!target) return `${op.op} names one request: its id, or the key of a request sent with it`;
  if (op.op === 'note') return typeof op.text === 'string' && cleanText(op.text) ? null : 'a note needs text';
  if (op.op === 'link') return typeof op.change === 'string' && ID.test(op.change) ? null : `"${op.change}" is not a change id`;
  if (op.op === 'move') {
    if (!SET_STATES.includes(op.to)) return `a request moves to ${SET_STATES.join(', ')}, not "${op.to}"`;
    if (op.from !== undefined && !SET_STATES.includes(op.from)) return `"${op.from}" is not ${SET_STATES.join(', ')}`;
    return null;
  }
  if (!EDIT_FIELDS.includes(op.field)) return `an edit changes ${EDIT_FIELDS.join(', ')}, not "${op.field}"`;
  const ok = op.field === 'about' ? isFeatures : (v) => typeof v === 'string';
  if (!ok(op.to) || (op.from !== undefined && !ok(op.from))) return op.field === 'about' ? 'about lists feature ids, <domain>/<capability>' : `${op.field} is text`;
  if (op.field === 'title' && !cleanLine(op.to)) return 'a request needs a title';
  return null;
}

/** The field a move or an edit sets: `state` for a move, the edit's `field`. */
export const fieldOf = (op) => (op.op === 'move' ? 'state' : op.field);

/** A field's value as the file keeps it. */
function norm(field, v) {
  if (field === 'about') return [...new Set(v)];
  if (field === 'title' || field === 'state') return cleanLine(v);
  return cleanText(v);
}

function same(field, a, b) {
  return field === 'about' ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()) : a === b;
}

/**
 * Replays `ops`, in order, onto the items at the branch's tip.
 *
 * Returns { files: Map<id, text>, results }: the new text of each item that changed, and one result
 * per operation, in order: { op, status, id?, before?, theirs?, reason? } where status is `applied`;
 * `unchanged` (the field already holds the value, the change is already linked); `held` (an edit or
 * a move whose field holds neither its `from` nor its `to`: `theirs` is what it holds); or `refused`
 * (`reason`: a bad operation, no such request, or a file that cannot be read as the format).
 * @param {Map<string, string>} tip each item's id and file text
 * @param {object[]} ops
 * @param {{ name: string, now?: Date }} who the git name the request and its notes are written by
 */
export function applyOps(tip, ops, { name, now = new Date() }) {
  const items = new Map();
  const taken = new Set(tip.keys());
  const keys = new Map();
  const changed = new Set();
  const results = [];
  const get = (id) => {
    if (!items.has(id) && tip.has(id)) items.set(id, parseItem(tip.get(id), { id }));
    return items.get(id);
  };
  for (const op of ops) {
    const bad = opProblem(op);
    if (bad) {
      results.push({ op, status: 'refused', reason: bad });
      continue;
    }
    if (op.op === 'add') {
      const id = newId(op.title, taken);
      taken.add(id);
      if (op.key !== undefined) keys.set(op.key, id);
      items.set(id, {
        id,
        title: cleanLine(op.title),
        by: name,
        created: utcDate(now),
        state: 'new',
        about: [...new Set(op.about ?? [])],
        change: [],
        happens: cleanText(op.happens),
        should: cleanText(op.should),
        where: cleanText(op.where),
        notes: [],
        problems: [],
      });
      changed.add(id);
      results.push({ op, status: 'applied', id });
      continue;
    }
    const id = op.id ?? keys.get(op.ref);
    if (id === undefined) {
      results.push({ op, status: 'refused', reason: 'the request it belongs to is not sent with it' });
      continue;
    }
    const item = get(id);
    if (!item) {
      results.push({ op, status: 'refused', id, reason: `no request "${id}"` });
      continue;
    }
    if (item.problems.length) {
      results.push({ op, status: 'refused', id, reason: `backlog/${id}.md cannot be read: ${item.problems[0].message}` });
      continue;
    }
    if (op.op === 'note') {
      item.notes.push({ by: name, at: utcMinute(now), text: cleanText(op.text) });
      changed.add(id);
      results.push({ op, status: 'applied', id });
      continue;
    }
    if (op.op === 'link') {
      if (item.change.includes(op.change)) results.push({ op, status: 'unchanged', id });
      else {
        item.change.push(op.change);
        changed.add(id);
        results.push({ op, status: 'applied', id });
      }
      continue;
    }
    const field = fieldOf(op);
    const current = item[field];
    const to = norm(field, op.to);
    if (same(field, current, to)) results.push({ op, status: 'unchanged', id });
    else if (op.from !== undefined && !same(field, current, norm(field, op.from))) results.push({ op, status: 'held', id, theirs: current });
    else {
      item[field] = to;
      changed.add(id);
      results.push({ op, status: 'applied', id, before: current });
    }
  }
  return { files: new Map([...changed].map((id) => [id, writeItem(items.get(id))])), results };
}

const COUNTS = [
  ['add', 'new request', 'new requests'],
  ['note', 'note', 'notes'],
  ['edit', 'edit', 'edits'],
  ['move', 'move', 'moves'],
  ['link', 'link', 'links'],
];

/** What the applied operations did, counted: `1 new request, 2 notes, 1 move`. */
export function summary(results) {
  const applied = results.filter((r) => r.status === 'applied');
  return COUNTS.map(([op, one, many]) => {
    const n = applied.filter((r) => r.op.op === op).length;
    return n ? `${n} ${n === 1 ? one : many}` : null;
  })
    .filter(Boolean)
    .join(', ');
}

function line(r) {
  const { op } = r;
  if (op.op === 'add') return `add ${r.id}: ${cleanLine(op.title)}`;
  if (op.op === 'note') return `note ${r.id}`;
  if (op.op === 'edit') return `edit ${r.id}: ${op.field}`;
  if (op.op === 'move') return `move ${r.id}: ${r.before} -> ${op.to}`;
  return `link ${r.id}: ${op.change}`;
}

/** The commit message of a write: `<name>: <summary>`, then one line per applied operation. */
export function commitMessage(name, results) {
  const lines = results.filter((r) => r.status === 'applied').map(line);
  return `${cleanLine(name)}: ${summary(results)}\n\n${lines.join('\n')}\n`;
}
