// The page in the browser: loads the map and the backlog, keeps the state in the address, and wires
// the events. The views are pure (view.mjs, backlog.mjs); this module is the only one with a DOM.
import { renderPage, parseLocation, pathFor, settle } from './view.mjs';
import { dialogView, moveMenu } from './backlog.mjs';
import { esc } from './html.mjs';

/** A request only the map's own page may make (see lib/server.mjs). */
const post = (url, body = {}) => fetch(url, { method: 'POST', headers: { 'x-solution-map': '1', 'content-type': 'application/json' }, body: JSON.stringify(body) });
/** A route's answer as JSON; a refusal in plain text as `{ ok: false, error }`. */
const answer = async (r) => {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { ok: false, error: text || `the map answered ${r.status}` }; }
};
const NO_SERVER = 'The map’s server doesn’t answer.';

const root = document.getElementById('app');
const dlg = document.getElementById('dlg');
const here = () => location.pathname + location.search;
let vm = null;
/**
 * The page's state beside the address (see renderPage), the features picked in an open form, and
 * the field of a sent request open for editing (`{ req, field }`).
 */
const st = { refreshing: false, backlog: null, submitting: false, submitBanner: null, draftsOpen: null, restart: null, form: null, editing: null };
// A history entry holds the whole state, the view under a dialog too, so back, forward and a
// reload show what the address showed; an address opened from elsewhere is read as it says.
let ui = history.state?.path === here() ? history.state.ui : parseLocation(location.pathname, location.search);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* the page works without it */ } },
};
const theme = store.get('solution-map.theme');
if (theme) document.documentElement.dataset.theme = theme;
if (ui.tab === 'explore' && !location.pathname.includes('by-system') && store.get('solution-map.group') === 'system' && !ui.sel) ui.group = 'system';

/* ---------- focus and typed text across a redraw ---------- */

/** A selector that finds an element again once the page is drawn anew, or null. */
function focusKeyOf(el) {
  if (!el || el === document.body || !el.tagName) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  const attrs = [...el.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'name').map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
  return attrs ? el.tagName.toLowerCase() + attrs : null;
}
const fields = (box) => [...box.querySelectorAll('textarea, input:not([type=hidden]):not([type=search])')];
const keepValues = (box) => fields(box).map((el) => [focusKeyOf(el), el.value]).filter(([k]) => k);
function restoreValues(box, kept) {
  for (const [k, v] of kept) {
    const el = box.querySelector(k);
    if (el) el.value = v;
  }
}
/** Focuses the first of the selectors found, in the dialog when it is open. */
function focusFirst(targets) {
  const box = dlg.open ? dlg : root;
  for (const t of [].concat(targets)) {
    const el = t && box.querySelector(t);
    if (el) { el.focus(); return true; }
  }
  return false;
}

/* ---------- drawing ---------- */

let shownKey = null; // the dialog drawn, by its key
let opener = null; // what opened the dialog being opened, to give focus back to
let focusNext = null; // what to focus once the next draw is done
let toastNext = null; // what to say once the dialog has closed

/** Draws the dialog the state names, or closes it; `opened` when it has just opened. */
function syncDialog() {
  if (st.editing && st.editing.req !== ui.req) st.editing = null;
  const d = dialogView(vm, ui, st);
  if (!d) {
    if (dlg.open) dlg.close();
    if (shownKey) { dlg.innerHTML = ''; shownKey = null; st.form = null; }
    return { opened: false, d };
  }
  const same = d.key === shownKey && dlg.open;
  const kept = same ? keepValues(dlg) : [];
  const scroll = same ? dlg.scrollTop : 0;
  if (!same && st.form?.key !== d.key) st.form = null;
  dlg.className = d.cls;
  dlg.innerHTML = d.html;
  restoreValues(dlg, kept);
  dlg.scrollTop = scroll;
  shownKey = d.key;
  if (!dlg.open) dlg.showModal();
  if (!same) dlg.querySelector('#dlg-t')?.focus();
  return { opened: !same, d };
}

function render({ push = false, keepFocus = false, focus = null } = {}) {
  if (!vm) return;
  ui = settle(vm, ui);
  closeMenu(false);
  const active = document.activeElement;
  const activeKey = dlg.contains(active) || root.contains(active) ? focusKeyOf(active) : null;
  const caret = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const scroll = { list: [...root.querySelectorAll('.a-list')].map((el) => el.scrollTop), board: root.querySelector('.bd')?.scrollTop ?? 0 };
  root.innerHTML = renderPage(vm, ui, st);
  if (keepFocus) {
    const q = root.querySelector('#q');
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  } else {
    root.querySelectorAll('.a-list').forEach((el, i) => { el.scrollTop = scroll.list[i] || 0; });
    const bd = root.querySelector('.bd');
    if (bd) bd.scrollTop = scroll.board;
  }
  const { opened, d } = syncDialog();
  const want = pathFor(ui, vm);
  const prev = history.state;
  const entry = { ui: { ...ui, started: undefined }, path: want, back: push || !!prev?.back, opener: push ? opener : prev?.opener ?? null };
  history[push ? 'pushState' : 'replaceState'](entry, '', want);
  const f = ui.sel && vm.features[ui.sel];
  document.title = d ? `${d.title} · Solution map` : f ? `${f.title} · Solution map` : 'Solution map';
  const target = focus ?? focusNext;
  focusNext = null;
  if (target) focusFirst(target);
  else if (!opened && !keepFocus && activeKey && !document.activeElement?.closest?.('#app, #dlg')) {
    if (focusFirst(activeKey) && caret) document.activeElement.setSelectionRange?.(...caret);
  }
  if (toastNext && !dlg.open) { toast(toastNext); toastNext = null; }
}

function go(next, opts = { push: true }) {
  ui = { ...ui, ...next };
  render(opts);
  if (opts.push) root.querySelector('.a-detail')?.scrollTo(0, 0);
}

const dialogOpen = () => !!(ui.req || ui.add);

/** Opens a request (`{ req }`) or the create form (`{ add }`) over the view; another dialog is replaced. */
function openDialog(next, trigger) {
  const replace = dialogOpen();
  if (!replace) opener = focusKeyOf(trigger);
  st.draftsOpen = null;
  st.form = null;
  ui = { ...ui, req: null, add: null, ...next };
  render({ push: !replace });
}

let leaving = false; // gone back already; the view under the dialog draws on popstate

/** Leaves the dialog for the view under it: back, when the page opened it, so forward opens it again. */
function leaveDialog(focus = null) {
  if (leaving || !dialogOpen()) return;
  focusNext = [].concat(focus ?? [], history.state?.opener ?? []);
  st.draftsOpen = null;
  if (history.state?.back) { leaving = true; history.back(); } else { ui = { ...ui, req: null, add: null }; render(); }
}

/* ---------- loading ---------- */

async function loadBacklog() {
  try {
    const r = await fetch('/api/backlog');
    if (r.ok) st.backlog = await r.json();
  } catch { /* the map shows without the backlog */ }
}

async function load(url, method = 'GET') {
  st.refreshing = true;
  if (vm) render();
  try {
    let r;
    try {
      r = await (method === 'POST' ? post(url) : fetch(url));
    } catch (e) {
      root.innerHTML = `<div class="banner req"><span class="bt">The map’s server doesn’t answer (${esc(e.message || e)}). Start it again with <span class="mono">node tools/solution-map/solution-map.mjs</span>.</span></div>`;
      return;
    }
    if (!r.ok) {
      root.innerHTML = `<div class="banner req"><span class="bt">The map couldn’t be built: <span class="mono">${esc(await r.text())}</span></span><button class="s-btn" data-act="refresh">Try again</button></div>`;
      return;
    }
    vm = await r.json();
    // The build fetches the backlog's branch; read it after, so it shows what was just fetched.
    await loadBacklog();
  } finally {
    st.refreshing = false;
  }
  render();
}

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  (dlg.open ? dlg : document.body).appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- the backlog's writes: drafts, then Submit ---------- */

/**
 * Saves, drops or applies a draft; the page draws the backlog the server answers with. While Submit
 * sends, the server refuses (409) and says so: what was typed stays in its form, to save once it is done.
 */
async function changeDrafts(body, { focus = null } = {}) {
  let r;
  try { r = await answer(await post('/api/drafts', body)); } catch { r = { ok: false, error: NO_SERVER }; }
  if (!r.ok) { toast(r.error); return null; }
  st.backlog = r.backlog;
  render({ focus });
  return r;
}

const labelOf = (state) => st.backlog?.states.find((s) => s.id === state)?.label ?? state;
/** The fields of a draft that names a request: by its id once sent, by its draft's key until then. */
const target = (r) => (r.draft ? { ref: r.key } : { id: r.id });

async function move(id, to) {
  const r = st.backlog?.requests[id];
  const back = `[data-mv="${CSS.escape(id)}"]`;
  if (!r || r.state === to) { focusFirst(back); return; }
  // One draft per request's state: moving again changes it, and a held one keeps its key.
  const key = r.held.find((h) => h.field === 'state')?.key ?? r.drafted?.state;
  const res = await changeDrafts({ save: { op: 'move', ...target(r), to, ...(key ? { key } : {}) } }, { focus: back });
  if (res) toast(`“${r.title}” moves to ${labelOf(to)} once you submit.`);
}

async function submit() {
  if (st.submitting) return;
  st.submitting = true;
  st.draftsOpen = null;
  render();
  let r;
  try { r = await answer(await post('/api/submit')); } catch { r = { ok: false, error: NO_SERVER }; }
  st.submitting = false;
  if (r.backlog) st.backlog = r.backlog;
  if (r.ok) {
    st.submitBanner = null;
    // A request sent from its draft has its own id now: an open dialog follows it.
    const sent = (r.sent ?? []).find((d) => d.op === 'add' && d.key === ui.req && d.id);
    if (sent) ui = { ...ui, req: sent.id };
    const n = (k) => (r[k] ?? []).length;
    toast([`Sent ${n('sent')} ${n('sent') === 1 ? 'draft' : 'drafts'}`, n('held') && `${n('held')} held: changed meanwhile, open ${n('held') === 1 ? 'its request' : 'their requests'} to choose`, n('refused') && `${n('refused')} not sent`].filter(Boolean).join('; ') + '.');
  } else if (r.backlog) {
    // Submit's failure stays on the page until Submit is tried again and goes through.
    st.submitBanner = r.backlog.banners.find((b) => b.kind.startsWith('submit-')) ?? { kind: 'submit-failed', error: r.error ?? null };
  } else toast(r.error);
  // Once nothing is left to send, Submit is gone: the dialog's title, or the view's tab, takes focus.
  render({ focus: ['[data-act="submit"]', '#dlg-t', '.s-tab.on'] });
}

/* ---------- the Move menu ---------- */

let menu = null; // { el, button }

function closeMenu(refocus) {
  if (!menu) return;
  menu.el.remove();
  menu.button.setAttribute('aria-expanded', 'false');
  if (refocus) menu.button.focus();
  menu = null;
}

function openMenu(button) {
  const same = menu?.button === button;
  closeMenu(same);
  if (same || !st.backlog?.requests[button.dataset.mv]) return;
  // Over the dialog it lives in the dialog, the only part of the page that is not inert then.
  const host = button.closest('dialog') ?? document.body;
  host.insertAdjacentHTML('beforeend', moveMenu(st.backlog, button.dataset.mv));
  menu = { el: host.lastElementChild, button };
  button.setAttribute('aria-expanded', 'true');
  const at = button.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: h } = menu.el;
  menu.el.style.left = `${Math.max(8, Math.min(at.right - w, innerWidth - w - 8))}px`;
  menu.el.style.top = `${at.bottom + 4 + h > innerHeight ? Math.max(8, at.top - h - 4) : at.bottom + 4}px`;
  (menu.el.querySelector('[aria-checked="true"]') ?? menu.el.querySelector('button')).focus({ preventScroll: true });
}

function menuKeys(e) {
  const items = [...menu.el.querySelectorAll('[role^="menuitem"]')];
  const i = items.indexOf(document.activeElement);
  const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
  if (to !== undefined) {
    e.preventDefault();
    items[(to + items.length) % items.length].focus({ preventScroll: true });
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeMenu(true);
  } else if (e.key === 'Tab') closeMenu(false);
}

/* ---------- a sent request's fields, edited in place ---------- */

const editKey = (r, field) => r.held.find((h) => h.field === field)?.key ?? r.drafted?.[field];
const sameText = (a, b) => String(a ?? '').replace(/\r\n?/g, '\n').trim() === String(b ?? '').replace(/\r\n?/g, '\n').trim();
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** Opens the title or the description of the request open in the dialog, the caret at its end. */
function startEdit(field) {
  const r = st.backlog?.requests[ui.req];
  if (!r || r.draft || r.problems.length) return;
  st.editing = { req: r.id, field };
  render({ focus: `#edit-${field}` });
  const el = dlg.querySelector(`#edit-${field}`);
  el?.setSelectionRange?.(el.value.length, el.value.length);
}

/** Closes the field open, what was typed in it dropped, focus back on what opens it. */
function closeEdit(field) {
  st.editing = null;
  render({ focus: [`button[data-edit="${field}"]`, '#dlg-t'] });
}

/**
 * Keeps a change of a sent request's field as a draft: one draft per field, changed again by its
 * key; a change back to the branch's value drops that draft instead. Resolves whether it was kept.
 */
async function saveField(r, field, to, { focus = null } = {}) {
  const key = editKey(r, field);
  const back = field === 'about' ? r.sent.about && sameSet(to, r.sent.about) : field in r.sent && sameText(to, r.sent[field]);
  if (key && back) return !!(await changeDrafts({ drop: key }, { focus }));
  return !!(await changeDrafts({ save: { op: 'edit', id: r.id, field, to, ...(key ? { key } : {}) } }, { focus }));
}

/** Sets the features of the request open in the dialog. */
function saveAbout(ids, focus) {
  const r = st.backlog?.requests[ui.req];
  if (r && !r.draft) saveField(r, 'about', ids, { focus });
}
const aboutOf = (r) => r.about.map((a) => a.id);

/* ---------- the features a request being written names ---------- */

const picked = () => [...dlg.querySelectorAll('[data-unabout]')].map((b) => b.dataset.unabout);
function pick(about, focus) {
  st.form = { key: shownKey, about };
  render({ focus });
}

/* ---------- Restart to update ---------- */

async function restart() {
  // Not while Submit sends, as its button says; the server too hands over only once Submit is done.
  if (st.submitting) return;
  st.restart = { phase: 'asking' };
  render();
  let r;
  try { r = await answer(await post('/api/restart')); } catch { r = { ok: false, error: NO_SERVER }; }
  if (!r.ok) {
    st.restart = { phase: 'error', error: r.error };
    render({ focus: '[data-act="restart"]' });
    return;
  }
  st.restart = { phase: 'restarting' };
  render();
  // The newer map is back once the map answers and is not this one: it went away, or built anew.
  const before = vm.generatedAt;
  const started = Date.now();
  let gone = false;
  const poll = async () => {
    try {
      const m = await fetch('/api/map', { cache: 'no-store' });
      if (m.ok && (gone || (await m.json()).generatedAt !== before)) { location.reload(); return; }
      if (!m.ok) gone = true;
    } catch { gone = true; }
    if (Date.now() - started > 30000 && st.restart.phase !== 'late') {
      st.restart = { phase: 'late' };
      render();
    }
    setTimeout(poll, 1000);
  };
  setTimeout(poll, 1000);
}

/* ---------- events ---------- */

document.addEventListener('click', (e) => {
  const el = (sel) => e.target.closest(sel);
  if (menu && !el('.menu') && !el('[data-mv]')) closeMenu(false);
  if (vm && st.draftsOpen && !el('.pop') && !el('[data-act="drafts"]')) { st.draftsOpen = null; render(); }
  const plain = !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button);
  let x;
  if ((x = el('[data-review]'))) {
    const id = x.dataset.review;
    x.disabled = true;
    post('/api/review').then(answer).then((r) => {
      if (r.ok) go({ started: id }, { push: false });
      else { toast(r.error); x.disabled = false; }
    }, () => { toast(NO_SERVER); x.disabled = false; });
  } else if ((x = el('[data-move-to]'))) move(x.dataset.move, x.dataset.moveTo);
  else if ((x = el('[data-mv]'))) openMenu(x);
  else if ((x = el('[data-discard]'))) changeDrafts({ drop: x.dataset.discard }, { focus: ['.pop [data-discard]', '[data-act="drafts"]', '#dlg-t'] });
  else if ((x = el('[data-held-drop]'))) changeDrafts({ drop: x.dataset.heldDrop }, { focus: 'button[data-mv]' });
  else if ((x = el('[data-held-apply]'))) changeDrafts({ apply: x.dataset.heldApply }, { focus: 'button[data-mv]' });
  else if ((x = el('[data-unabout]'))) pick(picked().filter((a) => a !== x.dataset.unabout), ['[data-unabout]', 'select[data-addabout]']);
  else if ((x = el('[data-about-drop]'))) {
    const r = st.backlog?.requests[ui.req];
    if (r) saveAbout(aboutOf(r).filter((a) => a !== x.dataset.aboutDrop), ['[data-about-drop]', 'select[data-about-add]']);
  } else if ((x = el('[data-edit-cancel]'))) closeEdit(x.dataset.editCancel);
  else if ((x = el('[data-edit]'))) startEdit(x.dataset.edit);
  else if ((x = el('[data-suggest]'))) openDialog({ add: { about: [x.dataset.suggest] } }, x);
  else if ((x = el('[data-req]'))) {
    if (!plain && x.tagName === 'A') return;
    e.preventDefault();
    openDialog({ req: x.dataset.req }, x);
  } else if ((x = el('[data-act]'))) {
    const act = x.dataset.act;
    if (act === 'refresh') load('/api/refresh', 'POST');
    else if (act === 'theme') {
      const dark = (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
      document.documentElement.dataset.theme = dark ? 'light' : 'dark';
      store.set('solution-map.theme', document.documentElement.dataset.theme);
    } else if (act === 'close') leaveDialog();
    else if (act === 'new-request') openDialog({ add: { about: [] } }, x);
    else if (act === 'closed') go({ closed: !ui.closed }, { push: false, focus: '[data-act="closed"]' });
    else if (act === 'drafts') {
      const where = dlg.contains(x) ? 'dlg' : 'page';
      st.draftsOpen = st.draftsOpen === where ? null : where;
      render({ focus: st.draftsOpen ? '.pop button' : '[data-act="drafts"]' });
    } else if (act === 'submit') submit();
    else if (act === 'restart') restart();
  } else if ((x = el('[data-group]'))) {
    store.set('solution-map.group', x.dataset.group);
    go({ tab: 'explore', group: x.dataset.group, q: '' });
  } else if ((x = el('[data-open]'))) {
    if (!plain && x.tagName === 'A') return;
    e.preventDefault();
    go({ tab: 'explore', group: 'domain', sel: x.dataset.open, q: '', req: null, add: null });
  } else if ((x = el('[data-sel]'))) go({ sel: x.dataset.sel });
  else if ((x = el('[data-tab]'))) go({ tab: x.dataset.tab, q: x.dataset.tab === 'search' ? ui.q : '', sel: null, req: null, add: null });
});

document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.dataset.form !== 'note' && f.dataset.form !== 'add' && f.dataset.form !== 'edit') return;
  e.preventDefault();
  const v = (name) => f.elements[name]?.value.trim() ?? '';
  const button = f.querySelector('.s-btn.primary');
  if (f.dataset.form === 'edit') {
    const r = st.backlog?.requests[f.dataset.id];
    const field = f.dataset.field;
    if (!r) return;
    const to = field === 'title' ? v('value') : f.elements.value.value.replace(/\r\n?/g, '\n').trimEnd();
    if (field === 'title' && !to) { f.elements.value.value = ''; f.reportValidity(); return; }
    // Nothing changed: the field closes and no draft is kept.
    if (sameText(to, r[field])) { closeEdit(field); return; }
    button.disabled = true;
    if (await saveField(r, field, to)) closeEdit(field);
    else button.disabled = false;
    return;
  }
  if (f.dataset.form === 'note') {
    const r = st.backlog?.requests[f.dataset.id];
    if (!r || !v('text')) return;
    button.disabled = true;
    const res = await changeDrafts({ save: { op: 'note', ...target(r), text: v('text') } }, { focus: '#note-text' });
    if (res) { const t = dlg.querySelector('#note-text'); if (t) t.value = ''; } else button.disabled = false;
    return;
  }
  if (!v('title')) { f.elements.title.value = ''; f.reportValidity(); return; }
  button.disabled = true;
  const save = { op: 'add', title: v('title'), description: v('description'), about: picked(), ...(f.dataset.key ? { key: f.dataset.key } : {}) };
  const res = await changeDrafts({ save });
  if (!res) { button.disabled = false; return; }
  toastNext = f.dataset.key ? 'Your draft request is saved.' : 'Saved as a draft. Submit sends it.';
  leaveDialog(`[data-req="${CSS.escape(res.draft.key)}"]`);
});

document.addEventListener('change', (e) => {
  const s = e.target.closest?.('select[data-addabout]');
  if (s?.value) pick([...picked(), s.value], 'select[data-addabout]');
  const a = e.target.closest?.('select[data-about-add]');
  const r = a?.value && st.backlog?.requests[ui.req];
  if (r) saveAbout([...aboutOf(r), a.value], 'select[data-about-add]');
});

root.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  const q = e.target.value;
  ui = { ...ui, q, tab: q.trim() ? 'search' : (ui.tab === 'search' ? 'waiting' : ui.tab), sel: null };
  render({ keepFocus: true });
});

// A drag is only an extra: every card's Move menu does the same, with a single pointer or keys.
let dragging = null;
const clearOver = () => root.querySelectorAll('.col.over').forEach((c) => c.classList.remove('over'));
root.addEventListener('dragstart', (e) => {
  const card = e.target.closest?.('[data-drag]');
  if (!card) return;
  dragging = card.dataset.drag;
  e.dataTransfer.setData('text/plain', dragging);
  e.dataTransfer.effectAllowed = 'move';
});
root.addEventListener('dragover', (e) => {
  const col = dragging && e.target.closest?.('[data-col]');
  if (!col) return;
  e.preventDefault();
  if (!col.classList.contains('over')) { clearOver(); col.classList.add('over'); }
});
root.addEventListener('drop', (e) => {
  const col = dragging && e.target.closest?.('[data-col]');
  if (!col) return;
  e.preventDefault();
  const id = dragging;
  dragging = null;
  clearOver();
  move(id, col.dataset.col);
});
root.addEventListener('dragend', () => { dragging = null; clearOver(); });

// Escape asks the dialog to close (its cancel event, at once); the page leaves it, as Close does,
// and the dialog closes when the page draws the view under it. Only the page ever closes it, so
// nothing waits on the close event, which a browser may deliver late. An Escape that closed a menu
// or the drafts list leaves the dialog open.
let swallowCancel = false;
const swallow = () => { swallowCancel = true; setTimeout(() => { swallowCancel = false; }, 0); };
dlg.addEventListener('cancel', (e) => {
  e.preventDefault();
  if (!swallowCancel) leaveDialog();
});

document.addEventListener('keydown', (e) => {
  if (!vm) return;
  if (menu) { if (e.key === 'Escape') swallow(); menuKeys(e); return; }
  // A field open in place: Escape closes it and keeps the dialog; Ctrl or Cmd and Enter is Done.
  if (st.editing && dlg.open) {
    if (e.key === 'Escape') { e.preventDefault(); swallow(); closeEdit(st.editing.field); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.closest?.('form[data-form="edit"]')) { e.preventDefault(); e.target.form.requestSubmit(); return; }
  }
  if (e.key === 'Escape' && st.draftsOpen) {
    e.preventDefault();
    swallow();
    st.draftsOpen = null;
    render({ focus: '[data-act="drafts"]' });
    return;
  }
  if (dlg.open) return;
  if (e.target.id === 'q' && e.key === 'Escape') { go({ q: '', tab: 'waiting', sel: null }); return; }
  if (e.target.closest?.('input, textarea, select')) return;
  if (e.key === '/') { e.preventDefault(); root.querySelector('#q')?.focus(); return; }
  if ((e.key === 'j' || e.key === 'k') && ui.tab === 'waiting' && vm.waiting.length) {
    const i = vm.waiting.indexOf(ui.sel);
    go({ sel: vm.waiting[Math.max(0, Math.min(vm.waiting.length - 1, i + (e.key === 'j' ? 1 : -1)))] });
  }
});

addEventListener('scroll', () => closeMenu(false), true);
window.addEventListener('popstate', (e) => {
  leaving = false;
  ui = e.state?.ui ?? parseLocation(location.pathname, location.search);
  st.draftsOpen = null;
  render();
});

// Opening the page fetches every repository again, as Refresh does.
load('/api/refresh', 'POST');
