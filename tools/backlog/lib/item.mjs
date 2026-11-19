// The item file, `backlog/<id>.md`: the gate's front matter subset (title, by, created, state,
// about, change), the request's three sections, then `## Notes`, each note headed by its author and
// its time in UTC. Pure functions over text; nothing here touches git or the file system.
import { parseFrontMatter, scenarioSlug, ID } from '../../gate/lib/spec.mjs';
import { splitLines, fenceMask } from '../../gate/lib/markdown.mjs';

/** The states people set. */
export const SET_STATES = ['new', 'discussing', 'ready', 'parked'];
/** The request's sections: the item's field and its heading. */
export const SECTIONS = [
  ['happens', 'What happens'],
  ['should', 'What should happen'],
  ['where', 'Where'],
];
export const NOTES = 'Notes';
/** A feature id, `<domain>/<capability>`. */
export const FEATURE_ID = /^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;
/** The longest id a title gives. */
export const ID_MAX = 60;
/** `backlog/<id>.md` */
export const ITEM_FILE = /^backlog\/([^/]+)\.md$/;

const KEYS = ['title', 'by', 'created', 'state', 'about', 'change'];
const HEADINGS = [...SECTIONS.map(([, h]) => h), NOTES];
const H2 = /^ {0,3}##(?:[ \t]+(.*?))?[ \t]*$/;
const H3 = /^ {0,3}###(?:[ \t]+(.*?))?[ \t]*$/;
const NOTE_HEAD = /^(.+) · (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) UTC$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The item's file in the branch. */
export const itemPath = (id) => `backlog/${id}.md`;

/** `YYYY-MM-DD`, in UTC. */
export const utcDate = (d) => d.toISOString().slice(0, 10);
/** `YYYY-MM-DD HH:MM`, in UTC: a note's time. */
export const utcMinute = (d) => d.toISOString().slice(0, 16).replace('T', ' ');

function realDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && utcDate(d) === s;
}

function realMinute(s) {
  const d = new Date(`${s.replace(' ', 'T')}:00Z`);
  return !Number.isNaN(d.getTime()) && utcMinute(d) === s;
}

/** A person's text as it is kept: LF line ends, no blank lines before it, no space after it. */
export function cleanText(s) {
  return String(s ?? '').replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '').trimEnd();
}

/** A one-line value (a title, a name): every run of space one space, trimmed. */
export function cleanLine(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

// A line of a person's text that would read as a section heading (`## `), or inside the notes as a
// note heading (`### `), is kept with a backslash before its `#`: Markdown shows the same line, and
// the file keeps its shape. An unclosed code fence is closed, so it cannot swallow what follows.
function escapeText(text, { notes = false } = {}) {
  const lines = text.split('\n');
  const mask = fenceMask(lines);
  const out = lines.map((l, i) => (mask[i] ? l : l.replace(notes ? /^( {0,3})(#{2,3})(?=[ \t]|$)/ : /^( {0,3})(##)(?=[ \t]|$)/, '$1\\$2')));
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = mask[i] && FENCE.exec(lines[i]);
    if (!m) continue;
    if (!open) open = m[1];
    else if (m[1][0] === open[0] && m[1].length >= open.length && lines[i].trim() === m[1]) open = null;
  }
  if (open) out.push(open);
  return out.join('\n');
}

function unescapeText(text, { notes = false } = {}) {
  const lines = text.split('\n');
  const mask = fenceMask(lines);
  return lines.map((l, i) => (mask[i] ? l : l.replace(notes ? /^( {0,3})\\(#{2,3})(?=[ \t]|$)/ : /^( {0,3})\\(##)(?=[ \t]|$)/, '$1$2'))).join('\n');
}

/** A front matter value that reads back as itself: one line, quoted when quotes would be dropped. */
function fmValue(v) {
  const s = cleanLine(v);
  return /^".*"$|^'.*'$/.test(s) ? `"${s}"` : s;
}

/**
 * What is wrong with an item to write, or null: the fields `writeItem` needs, each in its form.
 * @param {object} item
 */
export function itemProblem(item) {
  if (!item || typeof item !== 'object') return 'no item';
  if (!ID.test(item.id ?? '')) return `id "${item.id}" is not kebab-case`;
  if (!cleanLine(item.title)) return 'a request needs a title';
  if (!cleanLine(item.by)) return 'a request needs who asked';
  if (!realDate(item.created ?? '')) return `created "${item.created}" is not a date, YYYY-MM-DD`;
  if (!SET_STATES.includes(item.state)) return `state "${item.state}" is not ${SET_STATES.join(', ')}`;
  for (const a of item.about ?? []) if (!FEATURE_ID.test(a)) return `about "${a}" is not a feature id, <domain>/<capability>`;
  for (const c of item.change ?? []) if (!ID.test(c)) return `change "${c}" is not a change id`;
  for (const n of item.notes ?? []) {
    if (!cleanLine(n.by)) return 'a note needs its author';
    if (!realMinute(n.at ?? '')) return `note time "${n.at}" is not YYYY-MM-DD HH:MM`;
  }
  return null;
}

/**
 * The item's file text. Throws when the item breaks the format (`itemProblem`). Writing what
 * `parseItem` read gives the same text back.
 */
export function writeItem(item) {
  const bad = itemProblem(item);
  if (bad) throw new Error(bad);
  const fm = [
    '---',
    `title: ${fmValue(item.title)}`,
    `by: ${fmValue(item.by)}`,
    `created: ${item.created}`,
    `state: ${item.state}`,
    'about:',
    ...(item.about ?? []).map((a) => `  - ${a}`),
    'change:',
    ...(item.change ?? []).map((c) => `  - ${c}`),
    '---',
  ];
  const blocks = [fm.join('\n')];
  for (const [key, heading] of SECTIONS) {
    blocks.push(`## ${heading}`);
    const t = cleanText(item[key]);
    if (t) blocks.push(escapeText(t));
  }
  blocks.push(`## ${NOTES}`);
  for (const n of item.notes ?? []) {
    blocks.push(`### ${cleanLine(n.by)} · ${n.at} UTC`);
    const t = cleanText(n.text);
    if (t) blocks.push(escapeText(t, { notes: true }));
  }
  return blocks.join('\n\n') + '\n';
}

/**
 * Reads an item file. Returns { id, title, by, created, state, about, change, happens, should,
 * where, notes: [{ by, at, text }], problems: [{ line, message }] }: whatever the text holds, and
 * every break of the format. An item with problems is shown with them and is never written to.
 * @param {string} text
 * @param {{ id?: string|null }} [o] the id its file name gives
 */
export function parseItem(text, { id = null } = {}) {
  const problems = [];
  if (id !== null && !ID.test(id)) problems.push({ line: 1, message: `the file name "${id}.md" is not a kebab-case id` });
  const fm = parseFrontMatter(text);
  problems.push(...fm.problems);
  for (const k of Object.keys(fm.data)) {
    if (!KEYS.includes(k)) problems.push({ line: 1, message: `unknown front matter key "${k}" (one of ${KEYS.join(', ')})` });
  }
  const one = (k) => {
    const v = fm.data[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (fm.present) problems.push({ line: 1, message: v === undefined ? `front matter lacks "${k}"` : `front matter "${k}" must be one value` });
    return '';
  };
  const many = (k, re, what) => {
    const v = fm.data[k];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      problems.push({ line: 1, message: `front matter "${k}" must be a list of "  - item" lines` });
      return [];
    }
    for (const x of v) if (!re.test(x)) problems.push({ line: 1, message: `${k} "${x}" is not ${what}` });
    return v;
  };
  const title = one('title');
  const by = one('by');
  const created = one('created');
  const state = one('state');
  if (created && !realDate(created)) problems.push({ line: 1, message: `created "${created}" is not a date, YYYY-MM-DD` });
  if (state && !SET_STATES.includes(state)) problems.push({ line: 1, message: `state "${state}" is not ${SET_STATES.join(', ')}` });
  const about = many('about', FEATURE_ID, 'a feature id, <domain>/<capability>');
  const change = many('change', ID, 'a change id');

  const lines = splitLines(text).slice(fm.bodyStart);
  const mask = fenceMask(lines);
  const blocks = { happens: [], should: [], where: [] };
  const notes = [];
  let sink = null; // the lines the current block collects, or null before the first section
  let inNotes = false;
  let last = -1;
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const n = fm.bodyStart + i + 1;
    if (!mask[i]) {
      const h2 = H2.exec(l);
      if (h2) {
        const heading = (h2[1] ?? '').trim();
        const at = HEADINGS.indexOf(heading);
        inNotes = false;
        sink = [];
        if (at < 0) problems.push({ line: n, message: `"## ${heading}" is not a section (${HEADINGS.join(', ')})` });
        else if (seen.has(at)) problems.push({ line: n, message: `"## ${heading}" appears twice` });
        else if (at < last) problems.push({ line: n, message: `"## ${heading}" is out of order (${HEADINGS.join(', ')})` });
        else {
          seen.add(at);
          last = at;
          inNotes = at === HEADINGS.length - 1;
          sink = inNotes ? null : blocks[SECTIONS[at][0]];
        }
        continue;
      }
      const h3 = inNotes && H3.exec(l);
      if (h3) {
        const m = NOTE_HEAD.exec((h3[1] ?? '').trim());
        if (!m || !realMinute(m[2])) problems.push({ line: n, message: `note heading "${l.trim()}" is not "### <name> · YYYY-MM-DD HH:MM UTC"` });
        const note = { by: m ? m[1].trim() : '', at: m ? m[2] : '', lines: [] };
        notes.push(note);
        sink = note.lines;
        continue;
      }
    }
    if (sink === null) {
      if (l.trim()) problems.push({ line: n, message: inNotes ? 'text under "## Notes" before the first note heading' : 'text before "## What happens"' });
      continue;
    }
    sink.push(l);
  }
  const textOf = (ls, o) => unescapeText(cleanText(ls.join('\n')), o);
  return {
    id,
    title,
    by,
    created,
    state,
    about,
    change,
    happens: textOf(blocks.happens),
    should: textOf(blocks.should),
    where: textOf(blocks.where),
    notes: notes.map((x) => ({ by: x.by, at: x.at, text: textOf(x.lines, { notes: true }) })),
    problems,
  };
}

const FOLD = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ð: 'd', þ: 'th', ł: 'l', ı: 'i', ŋ: 'n', ħ: 'h' };

/** Lower case, accents dropped and the letters that have no accent to drop spelled in ASCII. */
export function asciiFold(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[ßæœøđðþłıŋħ]/g, (c) => FOLD[c]);
}

/** `s` cut to at most `max` characters, at the last `-` when that cuts a word, never ending in `-`. */
function cut(s, max) {
  if (s.length <= max) return s;
  let c = s.slice(0, max);
  if (s[max] !== '-' && c.includes('-')) c = c.slice(0, c.lastIndexOf('-'));
  return c.replace(/-+$/, '');
}

/**
 * The id a title gives: kebab-case, ASCII-folded, at most 60 characters; `-2`, `-3` … when the id
 * is taken. A title with no letter or digit left gives `request`.
 * @param {string} title
 * @param {Iterable<string>} [taken] the ids in use
 */
export function newId(title, taken = []) {
  const used = taken instanceof Set ? taken : new Set(taken);
  const base = cut(scenarioSlug(asciiFold(title)) || 'request', ID_MAX);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${cut(base, ID_MAX - String(n).length - 1)}-${n}`;
    if (!used.has(id)) return id;
  }
}
