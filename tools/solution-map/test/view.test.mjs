import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adapt } from '../lib/adapt.mjs';
import { backlogView } from '../lib/backlog-view.mjs';
import { renderPage, parseLocation, pathFor, searchFeatures, featurePage, settle } from '../page/view.mjs';
import { dialogView, moveMenu } from '../page/backlog.mjs';
import { mdBlocks } from '../page/html.mjs';
import { item, draft, ITEMS, sampleBacklog } from './fixtures/backlog.mjs';

const sample = () => JSON.parse(fs.readFileSync(new URL('./fixtures/overview-v3.json', import.meta.url), 'utf8'));
const ui = (o = {}) => ({ tab: 'waiting', group: 'domain', sel: null, q: '', ...o });
const count = (html, re) => (html.match(re) || []).length;
/** The unsent line as the page draws it with the sample's three drafts. */
const UNSENT = /<div class="tray"><button class="lk" data-act="drafts" aria-haspopup="dialog" aria-expanded="false">3 unsent<\/button><button class="s-btn sm" data-act="submit">Submit<\/button><\/div>/;

test('start review says what to say at the start of the take', () => {
  const vm = adapt(sample());
  const before = renderPage(vm, ui({ sel: 'editing/offline-edits' }));
  assert.match(before, /<button class="s-btn primary" data-review="editing\/offline-edits"[^>]*>▶ Start review<\/button>/);
  assert.doesNotMatch(before, /CueReview is opening/);
  assert.doesNotMatch(before, /Copy for triage/);
  const after = renderPage(vm, ui({ sel: 'editing/offline-edits', started: 'editing/offline-edits' }));
  assert.match(after, /CueReview is opening/);
  assert.match(after, /Start the take by saying “Offline edits”/);
  assert.match(after, /press Copy for agent in CueReview and give it to a triage session/);
  assert.doesNotMatch(renderPage(vm, ui({ sel: 'sharing/share-links', started: 'editing/offline-edits' })), /CueReview is opening/);
  assert.match(renderPage(vm, ui({ sel: 'sharing/share-links' })), /The change that names it, share-links-expiry, has no Review section/);
  assert.match(renderPage(vm, ui({ sel: 'accounts/sign-in' })), /No change names this feature, so there is no review note/);
});

test('nothing waiting says so and points at untested scenarios', () => {
  const ov = sample();
  for (const c of ov.capabilities) c.review = 'approved';
  const vm = adapt(ov);
  assert.deepEqual(vm.waiting, []);
  const html = renderPage(vm, ui());
  assert.match(html, /Nothing waits for you/);
  assert.match(html, /2 of 11 scenarios have no test yet\./);
  assert.match(html, /data-open="editing\/offline-edits">The banner shows after five seconds<\/button> <span class="s-faint">Offline edits<\/span>/);
  assert.match(html, /data-open="importing\/markdown-import">A picture travels with its note<\/button> <span class="s-faint">Markdown import<\/span>/);
  // With a backlog, nothing waits only while no request is in New: one being discussed waits for no one.
  const discussed = backlogView({ items: [item('dark-mode', { state: 'discussing' })], features: vm.features });
  const quiet = renderPage(vm, ui(), { backlog: discussed });
  assert.match(quiet, /Nothing waits for you/);
  assert.match(quiet, /Waiting for you <span class="n">0<\/span>/);
  assert.match(quiet, /2 of 11 scenarios have no test yet\./);
  // A request in New waits: the list holds it, and the page no longer says nothing waits.
  const asked = renderPage(vm, ui(), { backlog: sampleBacklog(vm) });
  assert.doesNotMatch(asked, /Nothing waits for you/);
  assert.match(asked, /<h2 class="s-h1">No feature waits for your review<\/h2><p>All 8 features are approved\. 2 new requests wait in the list\.<\/p>/);
  assert.match(asked, /Waiting for you <span class="n">2<\/span>/);
  assert.match(asked, /<div class="s-sect"><span>New requests<\/span><span>2<\/span><\/div>/);
  assert.match(asked, /2 of 11 scenarios have no test yet\./);
});

test('an approved feature folds its behaviour away', () => {
  const vm = adapt(sample(), { webs: { app: 'https://github.com/example/notes-app' } });
  const html = featurePage(vm, 'importing/markdown-import', ui({ tab: 'explore' }));
  assert.match(html, /<h3 class="s-h2">Summary<\/h3>/);
  assert.match(html, /<details class="beh"><summary>Behaviour <span class="s-faint">1 requirement · 3 scenarios · 2 tested/);
  assert.doesNotMatch(html, /<details class="beh" open/);
  assert.match(html, /✓ test: tools\/importer\/markdown\/headings\.test\.ts/);
  assert.match(html, /untested/);
  assert.match(html, /ships in<\/span><span class="sys">Importer<\/span>/);
  assert.match(html, /tools\/importer\/markdown\//);
  assert.match(html, /Approved 12 Oct in #30/);
});

test('explore by system without systems says so, and keeps the features', () => {
  const ov = sample();
  ov.systems = [];
  for (const c of ov.capabilities) c.systems = [];
  const html = renderPage(adapt(ov), ui({ tab: 'explore', group: 'system' }));
  assert.match(html, /<h2 class="s-h1">No feature ships in a system yet<\/h2><p>The project declares no systems in <span class="mono">specs\/systems\.json<\/span>, so there is nothing to group by system\.<\/p>/);
  assert.doesNotMatch(html, /No features yet/);
  // Systems declared, but none of the features' code in any of them.
  const off = sample();
  for (const c of off.capabilities) c.systems = [];
  for (const s of off.systems) s.capabilities = [];
  assert.match(renderPage(adapt(off), ui({ tab: 'explore', group: 'system' })), /<p>The systems’ paths cover none of the features’ code, so there is nothing to group by system\.<\/p>/);
  const none = renderPage(adapt({ ...sample(), capabilities: [] }), ui({ tab: 'explore', group: 'system' }));
  assert.match(none, /No features yet/);
});

test('a system no feature ships in, and a project with no spec, say so in words', () => {
  const html = renderPage(adapt(sample()), ui({ tab: 'explore', group: 'system' }));
  assert.match(html, /<span class="h">Telemetry<span class="repo">api<\/span><\/span><span class="p">Crash and usage reports\.<\/span><\/div><div class="a-none sm">No feature yet: no spec covers this system\.<\/div>/);
  assert.match(html, /Code no spec names:<\/span><span>src\/spellcheck\/<\/span>/);
  const empty = renderPage(adapt({ ...sample(), capabilities: [], changes: [] }), ui());
  assert.match(empty, /<h2 class="s-h1">No features yet<\/h2>/);
  assert.match(empty, /Ask an agent to run the <b>spec<\/b> skill on one system or area/);
  assert.match(empty, /data-group="system">See the systems<\/button>/);
});

test('a page line that does not answer becomes a placeholder', () => {
  const ov = sample();
  const down = adapt(ov, { pages: 'http://localhost:5173', pageAnswers: { 'http://localhost:5173/notes/demo': false } });
  const html = renderPage(down, ui({ sel: 'editing/offline-edits' }));
  assert.match(html, /The page won’t open<\/b>Nothing answers at <span class="mono">http:\/\/localhost:5173\/notes\/demo/);
  assert.match(html, /The live pages don’t open: nothing answers at <span class="mono">http:\/\/localhost:5173<\/span>/);
  const up = renderPage(adapt(ov, { pages: 'http://localhost:5173', pageAnswers: { 'http://localhost:5173/notes/demo': true } }), ui({ sel: 'editing/offline-edits' }));
  assert.match(up, /<iframe class="frame" sandbox="allow-scripts allow-forms allow-same-origin" src="http:\/\/localhost:5173\/notes\/demo"/);
  assert.match(up, /<iframe class="frame" sandbox src="\/board\/app\/specs\/editing\/offline-edits\/looks\/offline-banner\.html\?section=banner"/);
  const nobase = renderPage(adapt(ov), ui({ sel: 'editing/offline-edits' }));
  assert.match(nobase, /the project names no address for its pages/);
  // A pages address that is no web address: a banner, never a failed build.
  for (const pages of ['localhost:5173/x', 'not an address']) {
    const vm = adapt(ov, { pages });
    assert.deepEqual(vm.banners.filter((b) => b.kind === 'pages-address'), [{ kind: 'pages-address', value: pages }]);
    assert.match(renderPage(vm, ui({ sel: 'editing/offline-edits' })), /isn’t a web address/);
  }
});

test('search finds features by title, summary, requirement, scenario and system', () => {
  const vm = adapt(sample());
  const where = (q) => Object.fromEntries(searchFeatures(vm, q).map(([k, w]) => [k, w]));
  assert.deepEqual(where('tables'), { 'editing/tables': 'Title' });
  assert.equal(where('30 days')['accounts/sign-in'], 'Summary');
  assert.equal(where('headings and links')['importing/markdown-import'], 'Requirement');
  assert.equal(where('expired link')['sharing/share-links'], 'Scenario');
  assert.equal(where('folder of markdown')['importing/markdown-import'], 'Summary');
  assert.deepEqual(where('importer'), { 'importing/markdown-import': 'Requirement', 'importing/import-report': 'Requirement' });
  assert.equal(where('web app')['accounts/audit-log'], 'Ships in');
  const html = renderPage(vm, ui({ tab: 'search', q: 'tables' }));
  assert.match(html, /Results for “tables” <span class="n">1/);
  assert.match(html, /<mark>Tables<\/mark>/);
  assert.match(renderPage(vm, ui({ tab: 'search', q: 'zebra' })), /No feature matches “zebra”/);
});

test('every view has its own address', () => {
  const vm = adapt(sample());
  const states = [
    ui({ sel: 'sharing/share-links' }),
    ui({ tab: 'explore', sel: 'importing/import-report' }),
    ui({ tab: 'explore', group: 'system', sel: 'importing/import-report' }),
    ui({ tab: 'search', q: 'link', sel: 'sharing/share-links' }),
    ui({ tab: 'backlog' }),
    ui({ tab: 'backlog', req: 'show-the-offline-banner-sooner' }),
    ui({ tab: 'backlog', add: { about: ['editing/offline-edits'] } }),
    ui({ tab: 'backlog', add: { about: [] } }),
  ];
  const paths = states.map((s) => pathFor(s, vm));
  assert.deepEqual(paths, [
    '/waiting/sharing/share-links',
    '/explore/importing/import-report',
    '/explore/by-system/importer/importing/import-report',
    '/search/sharing/share-links?q=link',
    '/backlog',
    '/backlog/show-the-offline-banner-sooner',
    '/backlog/new?about=editing/offline-edits',
    '/backlog/new',
  ]);
  for (let i = 0; i < states.length; i++) {
    const [p, s] = paths[i].split('?');
    assert.deepEqual(settle(vm, parseLocation(p, s ? '?' + s : '')), settle(vm, states[i]));
  }
  assert.deepEqual(parseLocation('/'), ui());
  // Opening an address draws what it names: the board, a request's dialog, the create form.
  const bk = sampleBacklog(vm);
  const at = (p, s = '') => ({ ui: parseLocation(p, s), page: renderPage(vm, parseLocation(p, s), { backlog: bk }), dialog: dialogView(vm, parseLocation(p, s), { backlog: bk }) });
  const board = at('/backlog');
  assert.match(board.page, /<button class="s-tab on" data-tab="backlog" aria-current="page">Backlog <span class="n">7<\/span>/);
  assert.match(board.page, /<div class="bd">/);
  assert.equal(board.dialog, null);
  const open = at('/backlog/show-the-offline-banner-sooner');
  assert.match(open.page, /<div class="bd">/);
  assert.equal(open.dialog.title, 'Show the offline banner sooner');
  assert.equal(at('/backlog/new', '?about=editing/offline-edits').dialog.title, 'New request');
  // A dialog over another view names the dialog: its address reopens it over the board.
  assert.equal(pathFor(ui({ sel: 'sharing/share-links', req: 'pen-colour-presets' }), vm), '/backlog/pen-colour-presets');
  assert.equal(pathFor(ui({ tab: 'explore', sel: 'sharing/share-links', add: { about: ['sharing/share-links'] } }), vm), '/backlog/new?about=sharing/share-links');
  // An unsent request's address is its draft's key, the one the server gives it.
  assert.equal(pathFor(ui({ tab: 'backlog', req: 'd-1a2b3c4d5e6f' }), vm), bk.requests['d-1a2b3c4d5e6f'].address);
  // A request the backlog does not hold says so in its dialog, at the address asked for.
  const gone = at('/backlog/no-such-thing');
  assert.equal(gone.dialog.title, 'No such request');
  assert.match(gone.dialog.html, /holds no request <span class="mono">no-such-thing<\/span>/);
});

test('an item shows its notes, its features and its changes', () => {
  const vm = adapt(sample());
  const bk = sampleBacklog(vm);
  const d = dialogView(vm, ui({ tab: 'backlog', req: 'show-the-offline-banner-sooner' }), { backlog: bk });
  assert.equal(d.cls, 'dlg');
  const h = d.html;
  // The title takes focus, and opens for editing; who asked and when sit under it.
  assert.match(h, /<div class="tt"><h2 class="s-h1" id="dlg-t" tabindex="-1"><button class="ed" data-edit="title" aria-describedby="dlg-te">Show the offline banner sooner<\/button><\/h2><\/div><span class="vh" id="dlg-te">Edit the title<\/span><span class="s-faint">jdoe · 11 Nov<\/span>/);
  assert.match(h, /<button class="s-btn icon sm x" data-act="close" aria-label="Close">×<\/button>/);
  // The request: its description as its Markdown's blocks, opened for editing by a click or its button.
  assert.match(h, /<div class="ed ds" data-edit="description"><button class="s-btn sm eb" data-edit="description">Edit the description<\/button><p>The offline banner shows five seconds after the connection drops, so people keep typing and think their edits are lost\.<\/p><p>It should show within a second or two and say the edits are kept\. Seen on:<\/p><ul><li>any open note, when the network drops<\/li><li>the note list while it syncs<\/li><\/ul><\/div>/);
  // Its notes in the order they came, each with who wrote it and the day, the time in its tooltip;
  // the person's unsent note last, marked Draft.
  const order = ['Five seconds was a guess', 'Two customers mentioned it', 'Started change <code>offline-banner-delay</code> from this request', 'Could the banner also say how many edits'].map((t) => h.indexOf(t));
  assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), `notes in order: ${order}`);
  assert.match(h, /<div class="note"><b>asmith<\/b> <span class="s-faint" title="12 Nov, 10:04 UTC">12 Nov<\/span><p class="pre">Five seconds was a guess/);
  assert.match(h, /<div class="note dft"><b>asmith<\/b> <span class="dtag">Draft<\/span><p class="pre">Could the banner also say how many edits are waiting to send\?<\/p><\/div>/);
  // The features it names, each a link to the feature, with Remove and Add.
  assert.match(h, /<dt>Features<\/dt><dd><span class="tg"><a class="s-link" href="\/explore\/editing\/offline-edits" data-open="editing\/offline-edits">Offline edits<\/a><button type="button" data-about-drop="editing\/offline-edits" aria-label="Remove Offline edits">×<\/button><\/span><select class="s-btn sm" data-about-add aria-label="Add a feature"><option value="">\+ Add<\/option>/);
  // The changes it led to, each with that change's state; the request shows what its change shows.
  assert.match(h, /<dt>Changes<\/dt><dd><span class="mono">offline-banner-delay<\/span><span class="rst to-review"><svg[^>]*>.*?<\/svg>To review<\/span><\/dd>/);
  assert.match(h, /<dt>State<\/dt><dd><span class="rst to-review"><svg[^>]*>.*?<\/svg>To review<\/span><button class="s-btn sm" data-mv="show-the-offline-banner-sooner" aria-haspopup="menu" aria-expanded="false" aria-label="Move to another state">Move ▾<\/button>/);
  // A note is added in the dialog, and the unsent line is at its foot.
  assert.match(h, /<form class="cmp" data-form="note" data-id="show-the-offline-banner-sooner"><textarea id="note-text" name="text" aria-label="Add a note" placeholder="Add a note" required><\/textarea><button class="s-btn primary">Add note<\/button><\/form>/);
  assert.match(h, UNSENT);
  // A feature no longer on main shows by its id, as plain text; a request with no changes lists none.
  const other = backlogView({ items: [item('dark-mode', { title: 'Dark mode', about: ['editing/gone'] })], features: vm.features });
  const o = dialogView(vm, ui({ tab: 'backlog', req: 'dark-mode' }), { backlog: other }).html;
  assert.match(o, /<dt>Features<\/dt><dd><span class="tg"><span>editing\/gone<\/span><button type="button" data-about-drop="editing\/gone" aria-label="Remove editing\/gone">×<\/button><\/span>/);
  assert.doesNotMatch(o, /<dt>Changes<\/dt>|<h3 class="s-h2">Notes<\/h3>/);
  // No description yet: the place to add one.
  assert.match(o, /<div class="ed ds" data-edit="description"><button class="s-btn sm eb" data-edit="description">Edit the description<\/button><p class="s-faint">Add a description<\/p><\/div>/);
  // A change linked by a draft shows as a draft until it is sent.
  const linked = backlogView({ items: [item('dark-mode', { title: 'Dark mode' })], drafts: [draft('d-l', 'link', { id: 'dark-mode', change: 'dark-theme' })], features: vm.features });
  assert.match(dialogView(vm, ui({ tab: 'backlog', req: 'dark-mode' }), { backlog: linked }).html, /<dt>Changes<\/dt><dd><span class="mono">dark-theme<\/span><span class="dtag">Draft<\/span><\/dd>/);
});

test('an edited field shows its draft value in the request dialog', () => {
  const vm = adapt(sample());
  const id = 'show-the-offline-banner-sooner';
  const drafts = [
    draft('d-t', 'edit', { id, field: 'title', from: 'Show the offline banner sooner', to: 'Show the offline banner within two seconds' }),
    draft('d-d', 'edit', { id, field: 'description', from: 'x', to: 'Within **two seconds**.' }),
    draft('d-a', 'edit', { id, field: 'about', from: ['editing/offline-edits'], to: ['editing/offline-edits', 'sharing/share-links'] }),
  ];
  const bk = backlogView({ items: ITEMS, drafts, features: vm.features, me: 'asmith' });
  const h = dialogView(vm, ui({ tab: 'backlog', req: id }), { backlog: bk }).html;
  // Each field shows what the person wrote, marked as a draft; the feature they added is outlined.
  assert.match(h, /<h2 class="s-h1" id="dlg-t" tabindex="-1"><button class="ed" data-edit="title" aria-describedby="dlg-te">Show the offline banner within two seconds<\/button><\/h2><span class="dtag">Draft<\/span><\/div>/);
  assert.match(h, /<div class="ed ds dft" data-edit="description"><button class="s-btn sm eb" data-edit="description">Edit the description<\/button><p><span class="dtag">Draft<\/span><\/p><p>Within <b>two seconds<\/b>\.<\/p><\/div>/);
  assert.match(h, /<dt>Features <span class="dtag">Draft<\/span><\/dt><dd><span class="tg"><a [^>]*>Offline edits<\/a>.*?<\/span><span class="tg dft"><a class="s-link" href="\/explore\/sharing\/share-links" data-open="sharing\/share-links">Share links<\/a><button type="button" data-about-drop="sharing\/share-links" aria-label="Remove Share links">×<\/button><\/span>/);
  // The unsent line counts them.
  assert.match(h, /aria-expanded="false">3 unsent<\/button>/);
  // The description open: its Markdown in a field, with Cancel and Done; the title keeps the dialog's name.
  const d = dialogView(vm, ui({ tab: 'backlog', req: id }), { backlog: bk, editing: { req: id, field: 'description' } }).html;
  assert.match(d, /<form class="eo" data-form="edit" data-field="description" data-id="show-the-offline-banner-sooner"><label class="vh" for="edit-description">Description<\/label><textarea id="edit-description" name="value" placeholder="What you’d like, and why\. For a problem: what happens, what you expected, and where\.">Within \*\*two seconds\*\*\.<\/textarea><div class="ea"><button type="button" class="s-btn sm" data-edit-cancel="description">Cancel<\/button><button class="s-btn sm primary" aria-keyshortcuts="Control\+Enter" title="Done \(Ctrl\+Enter\)">Done<\/button><\/div><\/form>/);
  assert.doesNotMatch(d, /data-edit="description"/);
  const t = dialogView(vm, ui({ tab: 'backlog', req: id }), { backlog: bk, editing: { req: id, field: 'title' } }).html;
  assert.match(t, /<h2 class="s-h1 vh" id="dlg-t" tabindex="-1">Show the offline banner within two seconds<\/h2><form class="eo et" data-form="edit" data-field="title" data-id="show-the-offline-banner-sooner"><label class="vh" for="edit-title">Title<\/label><input id="edit-title" name="value" required value="Show the offline banner within two seconds">/);
  // A field open for another request opens nothing here.
  assert.doesNotMatch(dialogView(vm, ui({ tab: 'backlog', req: id }), { backlog: bk, editing: { req: 'other', field: 'title' } }).html, /data-form="edit"/);
});

test('who asked, when, notes and changes have no edit control', () => {
  const vm = adapt(sample());
  const bk = sampleBacklog(vm);
  const h = dialogView(vm, ui({ tab: 'backlog', req: 'show-the-offline-banner-sooner' }), { backlog: bk }).html;
  // Only the title and the description open for editing, and the features take Remove and Add.
  assert.deepEqual([...new Set([...h.matchAll(/data-edit="([a-z]+)"/g)].map((m) => m[1]))], ['title', 'description']);
  assert.match(h, /<span class="s-faint">jdoe · 11 Nov<\/span><\/div>/);
  for (const n of h.match(/<div class="note[^"]*">.*?<\/div>/g)) assert.doesNotMatch(n, /<button|<input|<textarea|data-edit/);
  assert.match(h, /<dt>Changes<\/dt><dd><span class="mono">offline-banner-delay<\/span><span class="rst to-review">/);
  assert.doesNotMatch(h.slice(h.indexOf('<dt>Changes</dt>'), h.indexOf('</dl>', h.indexOf('<dt>Changes</dt>'))), /<button|data-edit|data-about/);
  // A request whose file does not read is shown, with nothing to edit it by.
  const broken = backlogView({ items: [item('broken', { title: 'Broken', description: 'Text.', about: ['editing/offline-edits'], problems: [{ line: 3, message: 'bad' }] })], features: vm.features });
  const b = dialogView(vm, ui({ tab: 'backlog', req: 'broken' }), { backlog: broken }).html;
  assert.doesNotMatch(b, /data-edit|data-about-drop|data-about-add|data-form="note"/);
  assert.match(b, /<div class="ds"><p>Text\.<\/p><\/div>/);
});

test('a description shows as the blocks its Markdown makes, escaped', () => {
  assert.equal(mdBlocks('One **bold**\nline two\n\n## Steps\n\n1. open\n2. share\n- a\n- b\n  more'),
    '<p>One <b>bold</b><br>line two</p><p class="mh">Steps</p><ol><li>open</li><li>share</li></ol><ul><li>a</li><li>b more</li></ul>');
  assert.equal(mdBlocks('```\n<b>x</b>\n## not a heading\n```\nafter'), '<pre>&lt;b&gt;x&lt;/b&gt;\n## not a heading</pre><p>after</p>');
  assert.equal(mdBlocks('```\nleft open'), '<pre>left open</pre>');
  // A closing run of # needs a space before it; an ordered list keeps the number it starts at.
  assert.equal(mdBlocks('## Support C#\n### Steps ##'), '<p class="mh">Support C#</p><p class="mh">Steps</p>');
  assert.equal(mdBlocks('3. third\n4. fourth'), '<ol start="3"><li>third</li><li>fourth</li></ol>');
  assert.equal(mdBlocks('<img src=x onerror="alert(1)">'), '<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>');
  assert.equal(mdBlocks(''), '');
});

test('an empty backlog says how to add the first request', () => {
  const vm = adapt(sample());
  const empty = backlogView({ status: { state: 'absent' }, features: vm.features, where: { branch: 'backlog', repo: 'app' } });
  const html = renderPage(vm, ui({ tab: 'backlog' }), { backlog: empty });
  assert.match(html, /<h2 class="s-h1">No requests yet<\/h2><p>Add one with New request, or Suggest a change on a feature\. The first one you submit starts the backlog\.<\/p><button class="s-btn primary" data-act="new-request">\+ New request<\/button>/);
  assert.match(html, /Backlog <span class="n">0<\/span>/);
  assert.doesNotMatch(html, /class="bd|unsent|class="banner/);
  // Both ways it names are on the page: New request above, Suggest a change on every feature.
  assert.match(renderPage(vm, ui({ tab: 'explore', sel: 'importing/markdown-import' }), { backlog: empty }), /<div class="s-actions"><button class="s-btn" data-suggest="importing\/markdown-import">\+ Suggest a change<\/button><\/div>/);
  assert.match(renderPage(vm, ui({ sel: 'editing/offline-edits' }), { backlog: empty }), /data-suggest="editing\/offline-edits">\+ Suggest a change<\/button><button class="s-btn primary" data-review="editing\/offline-edits"/);
  // A backlog that cannot be reached and was never fetched is empty too, and the banner says why.
  const away = renderPage(vm, ui({ tab: 'backlog' }), { backlog: backlogView({ status: { state: 'unreachable', error: 'could not read from remote' }, features: vm.features, where: { branch: 'backlog' } }) });
  assert.match(away, /Couldn’t fetch the backlog \(<span class="mono">backlog<\/span>\)\. It shows what this computer last fetched\.<\/span><button class="s-btn" data-act="refresh">Try again<\/button>/);
  assert.match(away, /No requests yet/);
  // One drafted but none sent yet: the board shows the draft, not the empty state.
  const first = renderPage(vm, ui({ tab: 'backlog' }), { backlog: backlogView({ status: { state: 'absent' }, drafts: [draft('d-1', 'add', { title: 'Dark mode' })], features: vm.features, me: 'asmith' }) });
  assert.doesNotMatch(first, /No requests yet/);
  assert.match(first, /<div class="card dft"[^>]*><div class="cb"><button class="ct" data-req="d-1">Dark mode<\/button>/);
  // A map without a backlog offers none of it, and its address says so.
  const none = backlogView({ status: { state: 'unavailable', error: null } });
  assert.doesNotMatch(renderPage(vm, ui({ sel: 'editing/offline-edits' }), { backlog: none }), /data-tab="backlog"|Suggest a change|unsent/);
  assert.match(renderPage(vm, ui({ tab: 'backlog' }), { backlog: none }), /<h2 class="s-h1">There’s no backlog here<\/h2><p>This map runs without a backlog, so there are no requests to show\.<\/p>/);
});

test('suggest a change starts a request naming the feature', () => {
  const vm = adapt(sample());
  const bk = sampleBacklog(vm);
  // Every feature offers it: one in review beside Start review, an approved one on its own.
  assert.match(featurePage(vm, 'sharing/share-links', ui({ tab: 'explore' }), { backlog: bk }), /<button class="s-btn" data-suggest="sharing\/share-links">\+ Suggest a change<\/button><button class="s-btn primary" data-review="sharing\/share-links"/);
  assert.match(featurePage(vm, 'importing/import-report', ui({ tab: 'explore' }), { backlog: bk }), /<button class="s-btn" data-suggest="importing\/import-report">\+ Suggest a change<\/button>/);
  // Pressing it opens the create form over the feature, at its own address, the feature named.
  const opened = ui({ tab: 'explore', sel: 'importing/import-report', add: { about: ['importing/import-report'] } });
  assert.equal(pathFor(opened, vm), '/backlog/new?about=importing/import-report');
  assert.match(renderPage(vm, opened, { backlog: bk }), /<h2 class="s-h1">Import report<\/h2>/);
  const d = dialogView(vm, opened, { backlog: bk });
  assert.equal(d.title, 'New request');
  assert.equal(d.cls, 'dlg nw');
  assert.match(d.html, /<h2 class="s-h1" id="dlg-t" tabindex="-1">New request<\/h2>/);
  assert.match(d.html, /<span class="tg">Import report<button type="button" data-unabout="importing\/import-report" aria-label="Remove Import report">×<\/button><\/span>/);
  assert.match(d.html, /<label class="fl">Title<input name="title" required value=""><\/label>/);
  // One description, free text: a hint of what helps, no field to fill.
  assert.match(d.html, /<label class="fl">Description<textarea name="description" class="desc-in" placeholder="What you’d like, and why\. For a problem: what happens, what you expected, and where\."><\/textarea><\/label>/);
  assert.doesNotMatch(d.html, /What happens|What should happen|name="where"/);
  assert.match(d.html, /<button type="button" class="s-btn" data-act="close">Cancel<\/button><button class="s-btn primary">Save draft<\/button>/);
  // More features can be added; the one named is not offered twice.
  assert.match(d.html, /<select class="s-btn sm" data-addabout aria-label="Add a feature"><option value="">\+ Add<\/option><optgroup label="Editing"><option value="editing\/offline-edits">Offline edits<\/option>/);
  assert.doesNotMatch(d.html, /<option value="importing\/import-report">/);
  // Features picked since it opened replace the ones it opened with.
  assert.match(dialogView(vm, opened, { backlog: bk, form: { key: 'new', about: ['editing/tables'] } }).html, /data-unabout="editing\/tables"[\s\S]*<\/select>/);
  // Opening the address again opens the same form over the board.
  const again = parseLocation('/backlog/new', '?about=importing/import-report');
  assert.deepEqual(again.add, { about: ['importing/import-report'] });
  assert.equal(dialogView(vm, again, { backlog: bk }).html, d.html);
  // New request on the board names no feature.
  assert.doesNotMatch(dialogView(vm, ui({ tab: 'backlog', add: { about: [] } }), { backlog: bk }).html, /data-unabout/);
  // The person's unsent request opens in the same form, filled in, to change it.
  const mine = dialogView(vm, ui({ tab: 'backlog', req: 'd-1a2b3c4d5e6f' }), { backlog: bk });
  assert.match(mine.html, /<form data-form="add" data-key="d-1a2b3c4d5e6f">/);
  assert.match(mine.html, /<input name="title" required value="Import a zip of Markdown files">/);
  assert.match(mine.html, /data-unabout="importing\/markdown-import"/);
});

test('every view shows the unsent drafts and submit', () => {
  const vm = adapt(sample());
  const st = { backlog: sampleBacklog(vm) };
  const views = [
    ui(),
    ui({ sel: 'sharing/share-links' }),
    ui({ tab: 'explore', sel: 'importing/import-report' }),
    ui({ tab: 'explore', group: 'system', sel: 'importing/import-report' }),
    ui({ tab: 'search', q: 'link' }),
    ui({ tab: 'backlog' }),
    ui({ tab: 'backlog', closed: true }),
  ];
  for (const v of views) assert.match(renderPage(vm, v, st), UNSENT, JSON.stringify(v));
  // And at the foot of a request's dialog.
  assert.match(dialogView(vm, ui({ tab: 'backlog', req: 'pen-colour-presets' }), st).html, UNSENT);
  // The count opens the list of drafts, each with what it does and Discard.
  const open = renderPage(vm, ui({ tab: 'backlog' }), { ...st, draftsOpen: 'page' });
  assert.match(open, /<div class="tray"><div class="pop" role="dialog" aria-label="Unsent drafts"><ul>/);
  assert.match(open, /aria-expanded="true">3 unsent<\/button>/);
  assert.match(open, /<li><span class="k">New request<\/span><span class="w"><button class="s-link plain" data-req="d-1a2b3c4d5e6f">Import a zip of Markdown files<\/button><\/span><button class="s-btn icon sm" data-discard="d-1a2b3c4d5e6f" aria-label="Discard this draft">×<\/button><\/li>/);
  assert.match(open, /<span class="k">Note<\/span><span class="w"><button class="s-link plain" data-req="show-the-offline-banner-sooner">Show the offline banner sooner<\/button>/);
  assert.match(open, /<span class="k">Move<\/span><span class="w"><button class="s-link plain" data-req="undo-after-closing-a-note">Undo after closing a note → Ready<\/button>/);
  assert.equal(count(open, /aria-label="Discard this draft"/g), 3);
  // The dialog's own line opens its own list.
  assert.match(dialogView(vm, ui({ tab: 'backlog', req: 'pen-colour-presets' }), { ...st, draftsOpen: 'dlg' }).html, /aria-label="Unsent drafts"/);
  assert.doesNotMatch(renderPage(vm, ui({ tab: 'backlog' }), { ...st, draftsOpen: 'dlg' }), /aria-label="Unsent drafts"/);
  // While Submit runs it says so.
  assert.match(renderPage(vm, ui(), { ...st, submitting: true }), /<button class="s-btn sm" data-act="submit" disabled>Submitting…<\/button>/);
  // Nothing unsent, no line.
  const sent = { backlog: sampleBacklog(vm, { drafts: [] }) };
  for (const v of views) assert.doesNotMatch(renderPage(vm, v, sent), /class="tray"|data-act="submit"/);
});

test('the board shows each request by its state, with a Move menu on every card', () => {
  const vm = adapt(sample());
  const bk = sampleBacklog(vm);
  const html = renderPage(vm, ui({ tab: 'backlog' }), { backlog: bk });
  assert.match(html, /<div class="btb"><button class="s-btn" data-act="new-request">\+ New request<\/button><button class="fchip" data-act="closed" aria-pressed="false">Show done and parked<\/button><\/div>/);
  assert.doesNotMatch(html, /class="s-filters"/);
  const cols = [...html.matchAll(/<h3 class="colh">([^<]+) <span class="n">(\d+)<\/span><\/h3>/g)].map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(cols, [['New', 3], ['Discussing', 1], ['Ready', 2], ['In progress', 1], ['To review', 1]]);
  // The person's unsent request leads New, dashed and marked Draft, by them.
  assert.match(html, /<h3 class="colh">New <span class="n">3<\/span><\/h3><div class="card dft" draggable="true" data-drag="d-1a2b3c4d5e6f"><div class="cb"><button class="ct" data-req="d-1a2b3c4d5e6f">Import a zip of Markdown files<\/button><span class="s-faint"><span class="dtag">Draft<\/span> asmith<\/span><\/div><button class="mv" data-mv="d-1a2b3c4d5e6f" aria-haspopup="menu" aria-expanded="false" aria-label="Move Import a zip of Markdown files">⋯<\/button><\/div>/);
  // Every card has its Move button, named by its title.
  assert.equal(count(html, /<div class="card/g), 8);
  assert.equal(count(html, /<button class="mv" data-mv="[^"]+" aria-haspopup="menu" aria-expanded="false" aria-label="Move [^"]+">⋯<\/button>/g), 8);
  // A drag lands only on a state people set; In progress and To review follow a change.
  assert.deepEqual([...html.matchAll(/data-col="([^"]+)"/g)].map((m) => m[1]), ['new', 'discussing', 'ready']);
  // Done and Parked only once their filter is on.
  assert.doesNotMatch(html, /Share to email|Handwriting/);
  const all = renderPage(vm, ui({ tab: 'backlog', closed: true }), { backlog: bk });
  assert.match(all, /aria-pressed="true">Show done and parked/);
  assert.match(all, /<div class="bd all">/);
  assert.deepEqual([...all.matchAll(/<h3 class="colh">([^<]+) <span/g)].map((m) => m[1]), ['New', 'Discussing', 'Ready', 'In progress', 'To review', 'Done', 'Parked']);
  assert.match(all, /data-req="share-to-email">Share to email/);
  assert.match(all, /data-col="parked"/);
  assert.doesNotMatch(all, /data-col="done"/);
  // The menu lists the four states people set, the request's own checked: a drafted move counts.
  const menu = moveMenu(bk, 'undo-after-closing-a-note');
  assert.match(menu, /^<div class="menu" role="menu" aria-label="Move Undo after closing a note">/);
  assert.deepEqual([...menu.matchAll(/aria-checked="(true|false)"[^>]*data-move-to="([^"]+)"/g)].map((m) => [m[2], m[1]]), [['new', 'false'], ['discussing', 'false'], ['ready', 'true'], ['parked', 'false']]);
  assert.match(moveMenu(bk, 'faster-first-sync'), /aria-checked="true" tabindex="-1" data-move="faster-first-sync" data-move-to="ready"/);
  // A request whose file does not read cannot be moved or dragged, and is flagged.
  const broken = backlogView({ items: [item('dark-mode', { title: 'Dark mode', problems: [{ line: 3, message: 'about "x" is not a feature id' }] })], features: vm.features });
  const b = renderPage(vm, ui({ tab: 'backlog' }), { backlog: broken });
  assert.match(b, /<div class="card"><div class="cb">/);
  assert.match(b, /aria-label="Move Dark mode" disabled/);
  assert.match(b, /title="Its file doesn’t read as the format"/);
  assert.match(b, /<b>1 request doesn’t<\/b> read as the format: <button class="s-link plain" data-req="dark-mode">Dark mode<\/button>/);
  const bd = dialogView(vm, ui({ tab: 'backlog', req: 'dark-mode' }), { backlog: broken }).html;
  assert.match(bd, /1 format problem in this request’s file<\/div><div class="chg"><span class="mono">line 3<\/span><span>about &quot;x&quot; is not a feature id<\/span><\/div>/);
  assert.doesNotMatch(bd, /data-form="note"/);
});

test('the page lists a feature\'s open requests, and new requests wait in the list', () => {
  const vm = adapt(sample());
  const bk = sampleBacklog(vm);
  // A feature's requests that are not Done, each with its state and a link to it.
  const page = featurePage(vm, 'sharing/share-links', ui({ tab: 'explore' }), { backlog: bk });
  assert.match(page, /<h3 class="s-h2">Requests<\/h3><div class="rls"><div class="rl"><span class="rst new">.*?New<\/span><a class="s-link" href="\/backlog\/export-a-note-as-pdf" data-req="export-a-note-as-pdf">Export a note as PDF<\/a><\/div><div class="rl"><span class="rst discussing">.*?Discussing<\/span><a class="s-link" href="\/backlog\/keep-links-when-exporting" data-req="keep-links-when-exporting">Keep links when exporting<\/a><\/div><\/div>/);
  assert.doesNotMatch(page, /Share to email/);
  // An unsent request about a feature shows there too, marked Draft.
  assert.match(featurePage(vm, 'importing/markdown-import', ui({ tab: 'explore' }), { backlog: bk }), /href="\/backlog\/d-1a2b3c4d5e6f" data-req="d-1a2b3c4d5e6f">Import a zip of Markdown files<\/a><span class="dtag">Draft<\/span>/);
  // No request names it: no Requests heading.
  assert.doesNotMatch(featurePage(vm, 'accounts/sign-in', ui({ tab: 'explore' }), { backlog: bk }), /<h3 class="s-h2">Requests<\/h3>/);
  // Waiting for you: the New requests above the features, newest first, each with who asked.
  const waiting = renderPage(vm, ui(), { backlog: bk });
  assert.match(waiting, /Waiting for you <span class="n">6<\/span>/);
  assert.match(waiting, /<div class="s-sect"><span>New requests<\/span><span>2<\/span><\/div><button class="a-item" data-req="pen-colour-presets"><span class="t"><span class="ic new" title="New"><svg[^>]*>.*?<\/svg><\/span>Pen colour presets<\/span><span class="s">tbrown · 17 Nov<\/span><\/button><button class="a-item" data-req="export-a-note-as-pdf">.*?<span class="s">jdoe · 16 Nov<\/span><\/button><div class="s-sect"><span>Features<\/span><span>4<\/span><\/div>/);
  // Without a backlog the list is the features alone, as it always was.
  assert.match(renderPage(vm, ui()), /<div class="s-sect"><span>Newest change first<\/span><span>4<\/span><\/div>/);
});

test('a held draft shows both values, to apply again or drop', () => {
  const vm = adapt(sample());
  // Someone parked it after this person's draft moved it to Ready.
  const items = ITEMS.map((i) => (i.id === 'undo-after-closing-a-note' ? { ...i, state: 'parked', shown: 'parked' } : i));
  const drafts = [
    draft('d-held', 'move', { id: 'undo-after-closing-a-note', from: 'discussing', to: 'ready', held: { theirs: 'parked' } }),
    draft('d-text', 'edit', { id: 'pen-colour-presets', field: 'description', from: '', to: 'Mine <b>now</b>', held: { theirs: 'Theirs' } }),
  ];
  const bk = backlogView({ items, drafts, features: vm.features, me: 'asmith', heldBy: { 'd-held': 'tbrown', 'd-text': null } });
  const h = dialogView(vm, ui({ tab: 'backlog', req: 'undo-after-closing-a-note' }), { backlog: bk }).html;
  // The field keeps the other person's value; the notice holds both, with both choices.
  assert.match(h, /<dt>State<\/dt><dd><span class="rst parked">.*?Parked<\/span>/);
  assert.match(h, /<div class="cl" role="status"><p><span class="ic changes-requested" title="Changed meanwhile">.*?<\/span><span>Changed meanwhile by tbrown: <b>Parked<\/b>\. Yours: <b>Ready<\/b>\.<\/span><\/p><div class="s-actions"><button class="s-btn sm" data-held-drop="d-held">Drop mine<\/button><button class="s-btn sm" data-held-apply="d-held">Apply mine again<\/button><\/div><\/div>/);
  // A written field shows both texts, escaped.
  const t = dialogView(vm, ui({ tab: 'backlog', req: 'pen-colour-presets' }), { backlog: bk }).html;
  assert.match(t, /<span>Description changed meanwhile\.<\/span><\/p><div class="cv"><span class="s-faint">Theirs<\/span><div class="pre">Theirs<\/div><span class="s-faint">Yours<\/span><div class="pre">Mine &lt;b&gt;now&lt;\/b&gt;<\/div><\/div>/);
  // The card and the list of drafts say so too.
  const board = renderPage(vm, ui({ tab: 'backlog', closed: true }), { backlog: bk, draftsOpen: 'page' });
  assert.match(board, /data-req="undo-after-closing-a-note">Undo after closing a note<\/button><span class="s-faint"><span class="ic changes-requested" title="Changed meanwhile">/);
  assert.match(board, /Undo after closing a note → Ready<\/button> <span class="ic changes-requested" title="Changed meanwhile">.*?<\/span><span class="s-faint">Changed meanwhile<\/span>/);
  // A refused draft says why, and can be dropped.
  const refused = backlogView({ items, drafts: [draft('d-r', 'note', { id: 'handwriting', text: 'x', refused: 'its file does not read' })], features: vm.features });
  assert.match(dialogView(vm, ui({ tab: 'backlog', req: 'handwriting' }), { backlog: refused }).html, /Your note wasn’t sent: its file does not read<\/span><\/p><div class="s-actions"><button class="s-btn sm" data-discard="d-r">Drop mine<\/button>/);
});

test('submit that fails keeps a banner, and the drafts', () => {
  const vm = adapt(sample());
  const bk = sampleBacklog(vm);
  const unreachable = sampleBacklog(vm, { submit: { ok: false, unreachable: true, error: 'could not read from remote' } }).banners.find((b) => b.kind === 'submit-unreachable');
  const html = renderPage(vm, ui(), { backlog: bk, submitBanner: unreachable });
  assert.match(html, /<div class="banner req" role="status"><span class="bt">Couldn’t reach the backlog\. Nothing was sent; your 3 drafts are kept\.<\/span><button class="s-btn" data-act="submit">Try again<\/button><\/div>/);
  assert.match(html, UNSENT);
  // Drawn once, though Submit's own answer carries it in the backlog's banners too.
  const answered = sampleBacklog(vm, { submit: { ok: false, unreachable: true } });
  assert.equal(count(renderPage(vm, ui(), { backlog: answered, submitBanner: unreachable }), /Couldn’t reach the backlog/g), 1);
  assert.equal(count(renderPage(vm, ui(), { backlog: answered }), /Couldn’t reach the backlog/g), 0);
  const failed = renderPage(vm, ui({ tab: 'backlog' }), { backlog: bk, submitBanner: { kind: 'submit-failed', error: 'user.name is not set' } });
  assert.match(failed, /Nothing was sent: <span class="mono">user\.name is not set<\/span>\. Your 3 drafts are kept\.<\/span><button class="s-btn" data-act="submit">Try again<\/button>/);
});

test('a newer map offers restart to update, and says how the restart goes', () => {
  const vm = adapt(sample());
  vm.banners.push({ kind: 'map-update', tree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904' });
  assert.match(renderPage(vm, ui()), /<div class="banner " role="status"><span class="bt">A newer map is on main\.<\/span><button class="s-btn" data-act="restart">Restart to update<\/button><\/div>/);
  const restarting = renderPage(vm, ui(), { restart: { phase: 'restarting' } });
  assert.match(restarting, /Restarting the map… The page reloads when it is back\./);
  assert.doesNotMatch(restarting, /data-act="restart"/);
  assert.match(renderPage(vm, ui(), { restart: { phase: 'late' } }), /<div class="banner req" role="status"><span class="bt">The map didn’t come back within 30 seconds\. The page keeps trying/);
  assert.match(renderPage(vm, ui(), { restart: { phase: 'error', error: 'the map was not launched' } }), /The map couldn’t restart: <span class="mono">the map was not launched<\/span><\/span><button class="s-btn" data-act="restart">Restart to update<\/button>/);
  // While Submit sends, Restart waits.
  assert.match(renderPage(vm, ui(), { submitting: true }), /<button class="s-btn" data-act="restart" disabled title="Submit is sending your drafts">Restart to update<\/button>/);
  // A map with no newer one on main offers nothing.
  assert.doesNotMatch(renderPage(adapt(sample()), ui()), /Restart to update/);
});

test('what people write is escaped wherever the page shows it', () => {
  const vm = adapt(sample());
  const evil = '<img src=x onerror="alert(1)">';
  const items = [item('x', { title: evil, by: evil, description: evil, about: ['editing/offline-edits'], notes: [{ by: evil, at: '2026-11-12 10:04', text: evil }] })];
  const bk = backlogView({ items, drafts: [draft('d-x', 'note', { id: 'x', text: evil })], features: vm.features, me: evil });
  const pages = [
    renderPage(vm, ui(), { backlog: bk, draftsOpen: 'page' }),
    renderPage(vm, ui({ tab: 'backlog' }), { backlog: bk }),
    featurePage(vm, 'editing/offline-edits', ui({ tab: 'explore' }), { backlog: bk }),
    dialogView(vm, ui({ tab: 'backlog', req: 'x' }), { backlog: bk }).html,
    moveMenu(bk, 'x'),
  ];
  for (const p of pages) {
    assert.doesNotMatch(p, /<img/);
    assert.match(p, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  }
});
