// The backlog's views: pure functions from the backlog's view model (lib/backlog-view.mjs), the
// map's view model and the page's state to HTML strings: the board, a request's dialog, the create
// form, the unsent line and its drafts, the backlog's banners, a feature's requests and the New
// requests that wait. view.mjs puts them in the page; app.mjs wires their events. No DOM here.
import { esc, md, ICON, banner } from './html.mjs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A date the backlog writes, `YYYY-MM-DD` or `YYYY-MM-DD HH:MM` in UTC, as `12 Nov`. */
export function day(s) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(s ?? ''));
  return m && MONTHS[m[1] - 1] ? `${Number(m[2])} ${MONTHS[m[1] - 1]}` : esc(s ?? '');
}
const minute = (s) => /\d{2}:\d{2}$/.exec(String(s ?? ''))?.[0] ?? null;

/** The request's fields a person writes, with the words the page labels them by. */
const FIELDS = [['happens', 'What happens'], ['should', 'What should happen'], ['where', 'Where']];
const FIELD_WORD = { title: 'Title', about: 'Features', state: 'State', ...Object.fromEntries(FIELDS) };
const KIND = { add: 'New request', note: 'Note', move: 'Move', edit: 'Edit', link: 'Link' };

const DTAG = '<span class="dtag">Draft</span>';
const WARN = (title) => `<span class="ic changes-requested" title="${esc(title)}">${ICON['changes-requested']}</span>`;
const CLOSE = '<button class="s-btn icon sm x" data-act="close" aria-label="Close">×</button>';
const featurePath = (id) => `/explore/${String(id).split('/').map(encodeURIComponent).join('/')}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Whether the map has a backlog to show: it has one, though it may not be reachable. */
export const backlogOn = (bk) => !!bk && bk.status !== 'unavailable';

/** A request's state: its word and its icon. A request whose file gives no state says so. */
export function stateChip(state, label) {
  if (!state) return `<span class="rst bad">${ICON['changes-requested']}Can’t be read</span>`;
  return `<span class="rst ${esc(state)}">${ICON[state] ?? ''}${esc(label ?? state)}</span>`;
}

/* ---------- beside the features ---------- */

/** The New requests in Waiting for you: rows, newest first, each with who asked and when. */
export function waitingRequests(bk) {
  if (!backlogOn(bk)) return '';
  return bk.waiting.map((id) => {
    const r = bk.requests[id];
    return `<button class="a-item" data-req="${esc(id)}"><span class="t"><span class="ic new" title="New">${ICON.new}</span>${esc(r.title)}</span><span class="s">${esc(r.by)} · ${day(r.created)}</span></button>`;
  }).join('');
}

/** Suggest a change on a feature: starts a request naming it. */
export const suggestButton = (bk, id) => (backlogOn(bk) ? `<button class="s-btn" data-suggest="${esc(id)}">+ Suggest a change</button>` : '');

/** A feature's requests that are not Done, each with its state and a link to it. */
export function featureRequests(bk, id) {
  const ids = backlogOn(bk) ? bk.byFeature[id] ?? [] : [];
  if (!ids.length) return '';
  return '<h3 class="s-h2">Requests</h3><div class="rls">' + ids.map((k) => {
    const r = bk.requests[k];
    return `<div class="rl">${stateChip(r.shown, r.label)}<a class="s-link" href="${esc(r.address)}" data-req="${esc(k)}">${esc(r.title)}</a>${r.draft ? DTAG : ''}</div>`;
  }).join('') + '</div>';
}

/* ---------- the board ---------- */

function zero(title, text, act = '') {
  return `<div class="b-zero"><div class="zero"><h2 class="s-h1">${title}</h2><p>${text}</p>${act}</div></div>`;
}

function moveButton(r, where) {
  const off = r.problems.length ? ' disabled title="Its file doesn’t read as the format, so nothing is sent to it"' : '';
  return where === 'dlg'
    ? `<button class="s-btn sm" data-mv="${esc(r.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Move to another state"${off}>Move ▾</button>`
    : `<button class="mv" data-mv="${esc(r.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Move ${esc(r.title)}"${off}>⋯</button>`;
}

function card(bk, id) {
  const r = bk.requests[id];
  const flag = r.problems.length ? WARN('Its file doesn’t read as the format') : r.held.length ? WARN('Changed meanwhile') : '';
  return `<div class="card${r.draft ? ' dft' : ''}"${r.problems.length ? '' : ` draggable="true" data-drag="${esc(id)}"`}><div class="cb"><button class="ct" data-req="${esc(id)}">${esc(r.title)}</button>`
    + `<span class="s-faint">${r.draft ? DTAG + ' ' : ''}${flag}${esc(r.by ?? '')}</span></div>${moveButton(r, 'card')}</div>`;
}

/** The menu a Move button opens: the four states people set, the request's own checked. */
export function moveMenu(bk, id) {
  const r = bk.requests[id];
  return `<div class="menu" role="menu" aria-label="Move ${esc(r.title)}">` + bk.states.filter((s) => s.set).map((s) =>
    `<button role="menuitemradio" aria-checked="${r.state === s.id}" tabindex="-1" data-move="${esc(id)}" data-move-to="${esc(s.id)}"><span class="ic ${esc(s.id)}">${ICON[s.id] ?? ''}</span>${esc(s.label)}</button>`).join('') + '</div>';
}

/**
 * The Backlog view: the board's columns by the state each request shows, Done and Parked once
 * `ui.closed` is on; with no request at all, how to add the first.
 */
export function backlogBody(bk, ui) {
  const add = (primary) => `<button class="s-btn${primary ? ' primary' : ''}" data-act="new-request">+ New request</button>`;
  if (!bk) return zero('The backlog can’t be read', 'The map’s server didn’t send it. Press Refresh to ask again.');
  if (bk.status === 'unavailable') return zero('There’s no backlog here', bk.error ? `The map runs without one: <span class="mono">${esc(bk.error)}</span>.` : 'This map runs without a backlog, so there are no requests to show.');
  if (!Object.keys(bk.requests).length) return zero('No requests yet', 'Add one with New request, or Suggest a change on a feature. The first one you submit starts the backlog.', add(true));
  const settable = new Set(bk.states.filter((s) => s.set).map((s) => s.id));
  const cols = [...bk.board.open, ...(ui.closed ? bk.board.closed : [])];
  return `<div class="btb">${add(false)}<button class="fchip" data-act="closed" aria-pressed="${!!ui.closed}">Show done and parked</button></div>`
    + `<div class="bd${ui.closed ? ' all' : ''}">` + cols.map((c) => `<div class="col"${settable.has(c.state) ? ` data-col="${esc(c.state)}"` : ''}>`
      + `<h3 class="colh">${esc(c.label)} <span class="n">${c.requests.length}</span></h3>${c.requests.map((id) => card(bk, id)).join('')}</div>`).join('') + '</div>';
}

/* ---------- the request dialog ---------- */

function note(n) {
  const head = n.draft ? `<b>${esc(n.by ?? 'You')}</b> ${DTAG}` : `<b>${esc(n.by)}</b> <span class="s-faint"${minute(n.at) ? ` title="${day(n.at)}, ${minute(n.at)} UTC"` : ''}>${day(n.at)}</span>`;
  return `<div class="note${n.draft ? ' dft' : ''}">${head}<p class="pre">${md(n.text)}</p></div>`;
}

/** A held field's value in words: a state's name, the features' titles, or the text. */
function valueOf(vm, bk, field, v) {
  if (field === 'state') return esc(bk.states.find((s) => s.id === v)?.label ?? v);
  if (field === 'about') return (Array.isArray(v) ? v : []).map((id) => esc(vm.features?.[id]?.title ?? id)).join(', ') || 'none';
  return md(v);
}

function notices(vm, bk, r) {
  const held = r.held.map((h) => {
    const said = `${h.field === 'state' ? 'Changed' : `${esc(FIELD_WORD[h.field] ?? h.field)} changed`} meanwhile${h.by ? ` by ${esc(h.by)}` : ''}`;
    const theirs = valueOf(vm, bk, h.field, h.theirs);
    const yours = valueOf(vm, bk, h.field, h.yours);
    // A state, the features or a title fit in the sentence; a written field shows as two blocks.
    const what = ['state', 'about', 'title'].includes(h.field)
      ? `<p>${WARN('Changed meanwhile')}<span>${said}: <b>${theirs}</b>. Yours: <b>${yours}</b>.</span></p>`
      : `<p>${WARN('Changed meanwhile')}<span>${said}.</span></p><div class="cv"><span class="s-faint">Theirs</span><div class="pre">${theirs}</div><span class="s-faint">Yours</span><div class="pre">${yours}</div></div>`;
    return `<div class="cl" role="status">${what}<div class="s-actions"><button class="s-btn sm" data-held-drop="${esc(h.key)}">Drop mine</button><button class="s-btn sm" data-held-apply="${esc(h.key)}">Apply mine again</button></div></div>`;
  });
  const refused = r.refused.map((x) => `<div class="cl" role="status"><p>${WARN('Not sent')}<span>Your ${esc((KIND[x.op] ?? x.op).toLowerCase())} wasn’t sent: ${esc(x.reason)}</span></p><div class="s-actions"><button class="s-btn sm" data-discard="${esc(x.key)}">Drop mine</button></div></div>`);
  return [...held, ...refused].join('');
}

function problems(r) {
  if (!r.problems.length) return '';
  return `<div class="box prob"><div class="bh">${WARN('Format problems')}${plural(r.problems.length, 'format problem', 'format problems')} in this request’s file</div>`
    + r.problems.map((p) => `<div class="chg"><span class="mono">${p.line ? 'line ' + esc(p.line) : ''}</span><span>${md(p.message)}</span></div>`).join('')
    + '<div class="s-faint">Nothing is sent to it until its file is fixed.</div></div>';
}

function requestDialog(vm, bk, r, st) {
  const fields = FIELDS.filter(([k]) => r[k]).map(([k, l]) => `<dt>${l}</dt><dd class="pre">${md(r[k])}</dd>`).join('');
  const features = r.about.map((f) => `<dd>${f.exists ? `<a class="s-link" href="${esc(featurePath(f.id))}" data-open="${esc(f.id)}">${esc(f.title)}</a>` : `<span>${esc(f.title)}</span>`}</dd>`).join('');
  const changes = r.changes.map((c) => `<dd><span class="mono">${esc(c.id)}</span>${c.draft ? DTAG : stateChip(c.state, c.label)}</dd>`).join('');
  const details = (features ? `<dt>Features</dt>${features}` : '') + (changes ? `<dt>Changes</dt>${changes}` : '');
  const notes = r.notes.map(note).join('');
  const composer = r.problems.length ? ''
    : `<form class="cmp" data-form="note" data-id="${esc(r.id)}"><textarea id="note-text" name="text" aria-label="Add a note" placeholder="Add a note" required></textarea><button class="s-btn primary">Add note</button></form>`;
  return CLOSE + '<div class="dg">'
    + `<div class="g-t"><h2 class="s-h1" id="dlg-t" tabindex="-1">${esc(r.title)}</h2><span class="s-faint">${esc(r.by)} · ${day(r.created)}</span></div>`
    + `<div class="g-s"><dl class="dd"><dt>State</dt><dd>${stateChip(r.shown, r.label)}${moveButton(r, 'dlg')}</dd></dl>${notices(vm, bk, r)}${details ? `<dl class="dd">${details}</dl>` : ''}</div>`
    + `<div class="g-r">${problems(r)}${fields ? `<dl class="rq">${fields}</dl>` : ''}</div>`
    + `<div class="g-a">${notes ? `<h3 class="s-h2">Notes</h3>${notes}` : ''}</div>`
    + `<div class="g-c">${composer}</div></div>` + tray(bk, st, 'dlg');
}

/** A feature named on a request being written, with its Remove button. */
export function aboutChip(vm, id) {
  const title = vm.features?.[id]?.title ?? id;
  return `<span class="tg">${esc(title)}<button type="button" data-unabout="${esc(id)}" aria-label="Remove ${esc(title)}">×</button></span>`;
}

function featureSelect(vm, about) {
  const groups = (vm.byDomain ?? []).map((d) => {
    const opts = d.features.filter((f) => !about.includes(f)).map((f) => `<option value="${esc(f)}">${esc(vm.features[f].title)}</option>`).join('');
    return opts ? `<optgroup label="${esc(d.title)}">${opts}</optgroup>` : '';
  }).join('');
  return groups ? `<select class="s-btn sm" data-addabout aria-label="Add a feature"><option value="">+ Add</option>${groups}</select>` : '';
}

/** The create form, empty or naming its features; with a draft's `key`, that unsent request to change. */
function createForm(vm, { key = null, title = '', happens = '', should = '', where = '', about = [] }) {
  return CLOSE + `<form data-form="add"${key ? ` data-key="${esc(key)}"` : ''}><div class="fm">`
    + `<div class="t-row"><h2 class="s-h1" id="dlg-t" tabindex="-1">New request</h2>${key ? DTAG : ''}</div>`
    + `<label class="fl">Title<input name="title" required value="${esc(title)}"></label>`
    + `<label class="fl">What happens<textarea name="happens" placeholder="What you see now">${esc(happens)}</textarea></label>`
    + `<label class="fl">What should happen<textarea name="should" placeholder="What you expect instead">${esc(should)}</textarea></label>`
    + `<label class="fl">Where<input name="where" placeholder="The screen, device or step" value="${esc(where)}"></label>`
    + `<div class="fl" role="group" aria-labelledby="fl-about"><span id="fl-about">Features</span><div class="tgs">${about.map((id) => aboutChip(vm, id)).join('')}${featureSelect(vm, about)}</div></div>`
    + '</div><div class="ft"><button type="button" class="s-btn" data-act="close">Cancel</button><button class="s-btn primary">Save draft</button></div></form>';
}

/**
 * The dialog a state opens, or null: `{ key, cls, title, html }`. `key` names the dialog, so the
 * page keeps what was typed while the same one is drawn again. `ui.add` is the create form
 * (`{ about }`, the features already named); `ui.req` a request, an unsent one in the create form
 * to change it. `st.form`, `{ key, about }`, holds the features picked since that dialog opened.
 */
export function dialogView(vm, ui, st = {}) {
  const bk = st.backlog;
  const of = (key, cls, title, html) => ({ key, cls, title, html: `<div class="dw">${html}</div>` });
  const picked = (key, about) => (st.form?.key === key ? st.form.about : about);
  if (ui.add) return of('new', 'dlg nw', 'New request', createForm(vm, { about: picked('new', ui.add.about ?? []) }));
  if (!ui.req || !bk) return null;
  const r = backlogOn(bk) ? bk.requests[ui.req] : null;
  if (!r) return of(`missing:${ui.req}`, 'dlg nw', 'No such request', `${CLOSE}<div class="fm"><h2 class="s-h1" id="dlg-t" tabindex="-1">No such request</h2><p class="s-muted">The backlog holds no request <span class="mono">${esc(ui.req)}</span>.</p></div>`);
  const key = `req:${r.id}`;
  if (r.draft) return of(key, 'dlg nw', r.title, createForm(vm, { ...r, about: picked(key, r.about.map((a) => a.id)) }));
  return of(key, 'dlg', r.title, requestDialog(vm, bk, r, st));
}

/* ---------- what is unsent ---------- */

function draftLine(d) {
  const title = d.title ?? d.request ?? '';
  const what = d.op === 'move' ? `${esc(title)} → ${esc(d.toLabel ?? d.to)}`
    : d.op === 'edit' ? `${esc(title)}: ${esc(FIELD_WORD[d.field] ?? d.field)}`
    : d.op === 'link' ? `${esc(title)} → <span class="mono">${esc(d.change)}</span>`
    : esc(title);
  const open = d.missing ? `<span>${what}</span>` : `<button class="s-link plain" data-req="${esc(d.request)}">${what}</button>`;
  const flag = d.held ? ` ${WARN('Changed meanwhile')}<span class="s-faint">Changed meanwhile</span>`
    : d.refused ? ` ${WARN('Not sent')}<span class="s-faint">Not sent: ${esc(d.refused)}</span>`
    : d.missing ? ' <span class="s-faint">no longer on the backlog</span>' : '';
  return `<li><span class="k">${KIND[d.op] ?? esc(d.op)}</span><span class="w">${open}${flag}</span><button class="s-btn icon sm" data-discard="${esc(d.key)}" aria-label="Discard this draft">×</button></li>`;
}

/**
 * The unsent line at the foot of a view (`where` 'page') or of the request dialog ('dlg'): the
 * count, which opens the list of drafts when `st.draftsOpen` names this line, and Submit.
 */
export function tray(bk, st = {}, where = 'page') {
  const n = backlogOn(bk) ? bk.totals.unsent : 0;
  if (!n) return '';
  const open = st.draftsOpen === where;
  const list = open ? `<div class="pop" role="dialog" aria-label="Unsent drafts"><ul>${bk.drafts.map(draftLine).join('')}</ul></div>` : '';
  return `<div class="tray">${list}<button class="lk" data-act="drafts" aria-haspopup="dialog" aria-expanded="${open}">${n} unsent</button>`
    + `<button class="s-btn sm" data-act="submit"${st.submitting ? ' disabled' : ''}>${st.submitting ? 'Submitting…' : 'Submit'}</button></div>`;
}

/**
 * The backlog's banners, and Submit's last failure (`st.submitBanner`), which stays until Submit
 * is tried again and goes through.
 */
export function backlogBanners(bk, st = {}) {
  if (!bk) return '';
  const all = [...bk.banners.filter((b) => !b.kind.startsWith('submit-')), ...(st.submitBanner ? [st.submitBanner] : [])];
  const drafts = plural(backlogOn(bk) ? bk.totals.unsent : 0, 'draft is', 'drafts are');
  const again = '<button class="s-btn" data-act="submit">Try again</button>';
  return all.map((b) => {
    if (b.kind === 'backlog-stale') return banner(`Couldn’t fetch the backlog${bk.branch ? ` (<span class="mono">${esc(bk.branch)}</span>)` : ''}. It shows what this computer last fetched.`, '<button class="s-btn" data-act="refresh">Try again</button>');
    if (b.kind === 'backlog-off') return banner(`There’s no backlog here: <span class="mono">${esc(b.error)}</span>. Everything else shows.`);
    if (b.kind === 'backlog-branch') return banner(`The backlog’s branch holds more than requests, so nothing is sent to it: ${b.problems.map(esc).join('; ')}.`, '', 'req');
    if (b.kind === 'backlog-format') {
      return banner(`<b>${plural(b.requests.length, 'request doesn’t', 'requests don’t')}</b> read as the format: ${b.requests.map((r) => `<button class="s-link plain" data-req="${esc(r.id)}">${esc(r.title || r.id)}</button>`).join(', ')}. Each shows with its problem; nothing is sent to it until its file is fixed.`, '', 'req');
    }
    if (b.kind === 'backlog-drafts') return banner(`Your drafts can’t be read: <span class="mono">${esc(b.error)}</span>.`, '', 'req');
    if (b.kind === 'submit-unreachable') return banner(`Couldn’t reach the backlog. Nothing was sent; your ${drafts} kept.`, again, 'req');
    if (b.kind === 'submit-failed') return banner(`Nothing was sent${b.error ? `: <span class="mono">${esc(b.error)}</span>` : ''}. Your ${drafts} kept.`, again, 'req');
    return '';
  }).join('');
}
