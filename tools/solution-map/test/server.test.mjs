import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildMap } from '../lib/build.mjs';
import { createMapServer, withSection, PAGE_DIR, MAX_BODY, SENDING } from '../lib/server.mjs';
import { gitAsync } from '../../gate/lib/git.mjs';
import { fetchRepo } from '../../gate/lib/repos.mjs';
import { readAt } from '../lib/sources.mjs';
import http from 'node:http';
import { reviewCommand, startReview } from '../lib/review.mjs';
import { EventEmitter } from 'node:events';
// Git reads no global or system config while these tests run (the backlog's test helpers set it).
import { project, commits, hasRef } from '../../backlog/test/helpers.mjs';
import { writeBacklog, fetchBacklog, readBacklog } from '../../backlog/lib/store.mjs';
import { readDrafts } from '../../backlog/lib/drafts.mjs';

const ID = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main'];
const g = (dir, ...args) => execFileSync('git', ['-C', dir, ...ID, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const BOARD = '<!doctype html><html><head><style>body{margin:0}</style></head><body><section id="banner">offline banner<section class="detail">its detail pane</section></section><section id="other">other</section></body></html>';

const SPEC = `---
title: Offline edits
review: unreviewed
code:
  - src/
---
# Offline edits

## Summary

You can keep writing when the connection drops, and a banner says you are offline.

## Looks

- looks/offline-banner.html#banner — The banner after five seconds offline

## Requirements

### Requirement: Edits made offline are kept
When the connection drops, the app SHALL keep every edit, because a user otherwise loses work.

#### Scenario: An edit made offline is kept
- **WHEN** a user edits a note offline
- **THEN** the edit is kept
- **PROOF** test: src/offline.test.js
`;
const FILES = {
  'specs/domains.json': JSON.stringify([{ id: 'editing', title: 'Editing', purpose: 'Writing and changing notes.' }]),
  'specs/systems.json': JSON.stringify([{ id: 'editor', title: 'Editor', purpose: 'The app people write notes in.', paths: ['src/'] }]),
  'specs/editing/offline-edits/spec.md': SPEC,
  'specs/editing/offline-edits/looks/offline-banner.html': BOARD,
  'src/offline.test.js': '// the test\n',
};

/** A bare origin and a clone of it with one commit on main, a notes app's spec in it; returns both folders. */
function repoPair(tmp, name) {
  const origin = path.join(tmp, `${name}.git`);
  const work = path.join(tmp, name);
  fs.mkdirSync(origin);
  g(origin, 'init', '--bare', '-q');
  fs.mkdirSync(work);
  g(work, 'init', '-q');
  for (const [p, body] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(path.join(work, p)), { recursive: true });
    fs.writeFileSync(path.join(work, p), body);
  }
  g(work, 'add', '.');
  g(work, 'commit', '-q', '-m', 'first');
  g(work, 'remote', 'add', 'origin', origin);
  g(work, 'push', '-q', 'origin', 'HEAD:main');
  g(work, 'fetch', '-q', 'origin');
  return { origin, work };
}

/** A clone pushing a second commit to the origin, as another person would. */
function landElsewhere(tmp, origin) {
  const other = fs.mkdtempSync(path.join(tmp, 'other-'));
  execFileSync('git', ['clone', '-q', origin, other]);
  fs.writeFileSync(path.join(other, 'NEW.md'), 'landed\n');
  g(other, 'add', '.');
  g(other, 'commit', '-q', '-m', 'landed later');
  g(other, 'push', '-q', 'origin', 'HEAD:main');
  return g(other, 'rev-parse', 'HEAD');
}

/** A stand-in for the overview that reports only the commit each repository is at, so a fetch's effect is seen alone. */
const standIn = (version = 3) => (repos) => ({
  version, generatedAt: new Date().toISOString(),
  repos: repos.map((r) => ({ id: r.id, name: r.id, ref: r.ref, commit: g(r.dir, 'rev-parse', r.ref) })),
  domains: [], systems: [], capabilities: [], changes: [], uncovered: [],
});

async function serve(build, more = {}) {
  const s = createMapServer({ build, ...more });
  const port = await s.listen(0);
  const base = `http://127.0.0.1:${port}`;
  return { ...s, port, base, close: () => new Promise((r) => s.server.close(r)) };
}

/** A GET with a `Host` header of our choosing, which `fetch` does not allow. */
const getWithHost = (port, p, host) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p, headers: { host } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
});

const withTmp = async (fn) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'solution-map-'));
  try { await fn(tmp); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
};

test('serves the page and the map on 127.0.0.1 only', () => withTmp(async (tmp) => {
  const { work } = repoPair(tmp, 'app');
  const s = await serve(() => buildMap({ repos: [{ id: 'app', dir: work }], overview: standIn() }));
  try {
    assert.equal(s.server.address().address, '127.0.0.1');
    const page = await fetch(`${s.base}/explore/editing/x`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<script type="module" src="\/page\/app\.mjs">/);
    const view = await fetch(`${s.base}/page/view.mjs`);
    assert.match(view.headers.get('content-type'), /text\/javascript/);
    const map = await (await fetch(`${s.base}/api/map`)).json();
    assert.equal(map.repos[0].state, 'current');
    assert.equal((await fetch(`${s.base}/page/%2e%2e%2flib%2fserver.mjs`)).status, 404);
    // The backlog's addresses are the page too.
    for (const p of ['/backlog', '/backlog/dark-mode', '/backlog/new?about=editing/export']) {
      assert.match(await (await fetch(`${s.base}${p}`)).text(), /<script type="module" src="\/page\/app\.mjs">/, p);
    }
    // A name rebound to 127.0.0.1 is not this server's.
    assert.equal(await getWithHost(s.port, '/api/map', `evil.example:${s.port}`), 403);
    assert.equal(await getWithHost(s.port, '/api/map', `localhost:${s.port}`), 200);
    assert.equal(await getWithHost(s.port, '/api/map', `127.0.0.1:${s.port + 1}`), 403);
  } finally { await s.close(); }
}));

test('Refresh fetches again and rebuilds the map', () => withTmp(async (tmp) => {
  const { origin, work } = repoPair(tmp, 'app');
  const first = g(work, 'rev-parse', 'origin/main');
  const s = await serve(() => buildMap({ repos: [{ id: 'app', dir: work }], overview: standIn() }));
  try {
    assert.equal((await (await fetch(`${s.base}/api/map`)).json()).repos[0].commit, first);
    const landed = landElsewhere(tmp, origin);
    assert.equal((await (await fetch(`${s.base}/api/map`)).json()).repos[0].commit, first);
    assert.equal((await fetch(`${s.base}/api/refresh`, { method: 'POST' })).status, 403);
    const after = await (await fetch(`${s.base}/api/refresh`, { method: 'POST', headers: { 'x-solution-map': '1' } })).json();
    assert.equal(after.repos[0].commit, landed);
    // Opening the page asks for the same refresh, so it shows main as it is now.
    assert.match(fs.readFileSync(path.join(PAGE_DIR, 'app.mjs'), 'utf8'), /\nload\('\/api\/refresh', 'POST'\);/);
  } finally { await s.close(); }
}));

test('Start review opens CueReview, and says so when it is missing', async () => {
  // Where CueReview is looked for.
  assert.deepEqual(reviewCommand({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' } }),
    { command: 'C:\\Users\\me\\AppData\\Local\\Programs\\CueReview\\cuereview.exe', args: [], check: 'C:\\Users\\me\\AppData\\Local\\Programs\\CueReview\\cuereview.exe' });
  assert.deepEqual(reviewCommand({ platform: 'darwin' }), { command: 'open', args: ['-a', 'CueReview'], check: null });
  assert.deepEqual(reviewCommand({ platform: 'linux' }), { command: 'cuereview', args: [], check: null });
  assert.deepEqual(reviewCommand({ platform: 'win32', config: { solutionMap: { review: { app: 'D:/Tools/cuereview.exe' } } } }).command, 'D:/Tools/cuereview.exe');

  // Starting it: detached, and a missing program said in words.
  const started = [];
  const run = (command, args, opts) => {
    started.push({ command, args, detached: opts.detached });
    const child = new EventEmitter();
    child.unref = () => {};
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
  const cmd = { command: 'C:/CueReview/cuereview.exe', args: [], check: 'C:/CueReview/cuereview.exe' };
  assert.deepEqual(await startReview(cmd, { exists: () => true, run }), { ok: true });
  assert.deepEqual(started, [{ command: 'C:/CueReview/cuereview.exe', args: [], detached: true }]);
  const missing = await startReview(cmd, { exists: () => false, run });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /CueReview isn't at C:\/CueReview\/cuereview\.exe\. Install it, or name it in solutionMap\.review\.app\./);
  const failing = (command) => { const c = new EventEmitter(); queueMicrotask(() => c.emit('error', new Error(`spawn ${command} ENOENT`))); return c; };
  assert.match((await startReview({ command: 'cuereview', args: [], check: null }, { run: failing })).error, /did not start: spawn cuereview ENOENT/);

  // Through the server: only the map's own page may ask.
  let asked = 0;
  const s = await serve(async () => ({ model: {}, dirs: {}, commits: {} }), { review: async () => { asked++; return { ok: true }; } });
  try {
    assert.equal((await fetch(`${s.base}/api/review`, { method: 'POST' })).status, 403);
    assert.equal(asked, 0);
    assert.deepEqual(await (await fetch(`${s.base}/api/review`, { method: 'POST', headers: { 'x-solution-map': '1' } })).json(), { ok: true });
    assert.equal(asked, 1);
  } finally { await s.close(); }
});

test('a board section is served from the board by its id', () => withTmp(async (tmp) => {
  const { work } = repoPair(tmp, 'app');
  // The kit's own overview, version 3, reading the spec above.
  const s = await serve(() => buildMap({ repos: [{ id: 'app', dir: work }] }));
  try {
    const map = await (await fetch(`${s.base}/api/map`)).json();
    const f = map.features['editing/offline-edits'];
    assert.equal(f.review, 'unreviewed');
    assert.deepEqual(map.waiting, ['editing/offline-edits']);
    assert.deepEqual(f.systems.map((x) => x.title), ['Editor']);
    assert.deepEqual(f.tested, [1, 1]);
    assert.deepEqual(f.looks.map((l) => [l.kind, l.src, l.exists]), [['board', '/board/app/specs/editing/offline-edits/looks/offline-banner.html?section=banner', true]]);
    const url = `${s.base}/board/app/specs/editing/offline-edits/looks/offline-banner.html`;
    const r = await fetch(`${url}?section=banner`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy'), /^sandbox;/);
    const html = await r.text();
    // Every other section hides; the chosen one's own nested sections do not.
    assert.ok(html.includes('<style>section:not(#banner):not(#banner section):not(:has(#banner)){display:none!important}</style></head>'));
    assert.match(html, /offline banner<section class="detail">its detail pane<\/section>/);
    assert.equal((await fetch(`${url}?section=nope`)).status, 404);
    assert.equal((await fetch(`${s.base}/board/app/specs/editing/x/looks/missing.html`)).status, 404);
    assert.equal(withSection('<section id="a">', 'a"><script>'), null);
    assert.equal(withSection('<section data-id="a">x</section>', 'a'), null, 'only an id attribute names a section');
  } finally { await s.close(); }
}));

test('a repository that cannot be fetched keeps its last fetch, with a banner', () => withTmp(async (tmp) => {
  const { work } = repoPair(tmp, 'app');
  const commit = g(work, 'rev-parse', 'origin/main');
  g(work, 'remote', 'set-url', 'origin', path.join(tmp, 'gone.git'));
  const { model } = await buildMap({ repos: [{ id: 'app', dir: work }], overview: standIn() });
  assert.equal(model.repos[0].state, 'stale');
  assert.equal(model.repos[0].commit, commit);
  const b = model.banners.find((x) => x.kind === 'stale');
  assert.equal(b.repo, 'app');
  assert.equal(b.commit, commit);
  assert.ok(b.fetchedAt, 'the time of the last good fetch');
}));

test('a repository that is missing leaves the others, with a banner', () => withTmp(async (tmp) => {
  const { work } = repoPair(tmp, 'app');
  const gone = path.join(tmp, 'notes-api');
  const { model } = await buildMap({ repos: [{ id: 'app', dir: work }, { id: 'api', dir: gone }], overview: standIn() });
  assert.deepEqual(model.repos.map((r) => [r.id, r.state]), [['app', 'current'], ['api', 'missing']]);
  assert.deepEqual(model.banners.filter((b) => b.kind === 'missing'), [{ kind: 'missing', repo: 'api', dir: gone }]);
}));

test('an overview of another version gives a banner, not a page error', () => withTmp(async (tmp) => {
  const { work } = repoPair(tmp, 'app');
  const s = await serve(() => buildMap({ repos: [{ id: 'app', dir: work }], overview: standIn(2) }));
  try {
    const r = await fetch(`${s.base}/api/map`);
    assert.equal(r.status, 200);
    const model = await r.json();
    assert.deepEqual(model.banners, [{ kind: 'version', found: 2, reads: 3 }]);
    assert.equal(model.totals.features, 0);
  } finally { await s.close(); }
}));

test('a saved overview is served without reading a repository', async () => {
  const sample = JSON.parse(fs.readFileSync(new URL('./fixtures/overview-v3.json', import.meta.url), 'utf8'));
  let fetched = 0;
  const fetchRepo = async () => { fetched++; return { state: 'current', fetchedAt: null }; };
  const { model, dirs, commits } = await buildMap({ repos: [], overview: () => sample, fromFile: true, fetchRepo });
  assert.equal(fetched, 0);
  assert.deepEqual([dirs, commits], [{}, {}]);
  assert.equal(model.totals.features, 8);
  const boards = Object.values(model.features).flatMap((f) => f.looks).filter((l) => l.kind === 'board');
  assert.ok(boards.length > 0 && boards.every((l) => l.unserved === true), 'its boards are marked as not served');
  const old = await buildMap({ repos: [], overview: () => ({ ...sample, version: 2 }), fromFile: true });
  assert.deepEqual(old.model.banners, [{ kind: 'version', found: 2, reads: 3 }]);
});

/* ---------- the backlog ---------- */

const at = (dir) => ({ dir, branch: 'backlog', repo: 'app' });
const WRITE = { 'x-solution-map': '1', 'content-type': 'application/json' };

/**
 * A map of one clone whose backlog is that clone's branch `backlog`, wired as the command line wires
 * it; `more` goes to each build, `net` runs Submit's git and `restart` is Restart to update.
 */
function serveBacklog(dir, more = {}, { net, restart } = {}) {
  const where = at(dir);
  const repos = [{ id: 'app', dir }];
  return serve(() => buildMap({ repos, overview: standIn(), backlog: where, ...more }), { backlog: { where, repos, net }, restart });
}

/** A runner for Submit's git whose push waits for `release()`; `pushing` resolves once the push is out. */
function heldPush() {
  let release;
  let started;
  const gate = new Promise((r) => { release = r; });
  const pushing = new Promise((r) => { started = r; });
  const net = async (d, args, o) => {
    if (args[0] === 'push') { started(); await gate; }
    return gitAsync(d, args, o);
  };
  return { net, pushing, release };
}

/** A write as the map's page sends it; resolves the JSON answer. */
async function write(s, route, body = {}) {
  const r = await fetch(`${s.base}${route}`, { method: 'POST', headers: WRITE, body: JSON.stringify(body) });
  const out = await r.json();
  assert.equal(r.status, 200, out.error);
  return out;
}

const backlogOf = async (s) => (await fetch(`${s.base}/api/backlog`)).json();

/** A POST with a `Host` header of our choosing; resolves its status. */
const postWithHost = (port, p, host, body) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { ...WRITE, host } }, (res) => { res.resume(); resolve(res.statusCode); });
  req.on('error', reject);
  req.end(body);
});

const CLI = fileURLToPath(new URL('../solution-map.mjs', import.meta.url));

/** The map's command line started in `cwd` on a free port; resolves its address and `stop`, which waits for it to end. */
function startMap(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args, '--port', '0', '--no-open'], { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    const seen = (c) => {
      out += c;
      const m = /http:\/\/127\.0\.0\.1:\d+/.exec(out);
      if (m) resolve({ base: m[0], stop: () => new Promise((r) => { child.once('exit', r); child.kill(); }) });
    };
    child.stdout.on('data', seen);
    child.stderr.on('data', (c) => { out += c; });
    child.on('exit', (code) => reject(new Error(`the map stopped (${code}): ${out}`)));
  });
}

test('Refresh shows what others sent to the backlog', () => withTmp(async (tmp) => {
  const { clones: [pat, sam] } = project(tmp, 'notes-app', { people: ['Pat Example', 'Sam Example'] });
  // Pat's clone fetches main alone, so only the backlog's own fetch can bring what Sam sends.
  g(pat, 'config', 'remote.origin.fetch', '+refs/heads/main:refs/remotes/origin/main');
  const order = [];
  const s = await serveBacklog(pat, {
    fetchRepo: async (dir) => { order.push('repo'); const r = await fetchRepo(dir); order.push('repo done'); return r; },
    fetchBacklog: async (w) => { order.push('backlog'); return fetchBacklog(w); },
  });
  try {
    const opened = await backlogOf(s);
    assert.equal(opened.status, 'absent');
    assert.deepEqual(opened.requests, {});
    // Sam sends a request and a note on it after Pat's page opened.
    const sent = await writeBacklog(at(sam), [{ op: 'add', key: 'a', title: 'Sync notes offline' }, { op: 'note', ref: 'a', text: 'On the train, mostly.' }]);
    const id = sent.results[0].id;
    assert.deepEqual((await backlogOf(s)).requests, {}, 'not before Refresh');
    assert.equal((await fetch(`${s.base}/api/refresh`, { method: 'POST', headers: { 'x-solution-map': '1' } })).status, 200);
    const after = await backlogOf(s);
    assert.equal(after.status, 'current');
    const r = after.requests[id];
    assert.deepEqual([r.title, r.by, r.label], ['Sync notes offline', 'Sam Example', 'New']);
    assert.deepEqual(r.notes.map((n) => [n.by, n.text, n.draft]), [['Sam Example', 'On the train, mostly.', false]]);
    assert.deepEqual(after.waiting, [id]);
    // Each build fetches the backlog's branch after the repository's own fetch, never beside it.
    assert.deepEqual(order, ['repo', 'repo done', 'backlog', 'repo', 'repo done', 'backlog']);
  } finally { await s.close(); }
}));

test('drafts survive a restart of the map', () => withTmp(async (tmp) => {
  const { origin, clones: [pat] } = project(tmp, 'notes-app', { people: ['Pat Example'] });
  const args = ['--repo', `app=${pat}`];
  const first = await startMap(pat, args);
  let key;
  try {
    const post = async (body) => (await fetch(`${first.base}/api/drafts`, { method: 'POST', headers: WRITE, body: JSON.stringify(body) })).json();
    key = (await post({ save: { op: 'add', title: 'Dark mode', about: ['editing/theme'] } })).draft.key;
    assert.equal((await post({ save: { op: 'note', ref: key, text: 'For night shifts.' } })).ok, true);
  } finally { await first.stop(); }
  const again = await startMap(pat, args);
  try {
    const b = await (await fetch(`${again.base}/api/backlog`)).json();
    assert.deepEqual(b.drafts.map((d) => [d.op, d.request]), [['add', key], ['note', key]]);
    assert.deepEqual([b.requests[key].draft, b.requests[key].title, b.requests[key].notes.map((n) => [n.text, n.draft])], [true, 'Dark mode', [['For night shifts.', true]]]);
    assert.equal(b.totals.unsent, 2);
  } finally { await again.stop(); }
  // Still unsent: the backlog's branch does not exist.
  assert.equal(hasRef(origin, 'refs/heads/backlog'), false);
}));

test('submit sends every draft as one commit', () => withTmp(async (tmp) => {
  const { origin, clones: [pat, sam] } = project(tmp, 'notes-app', { people: ['Pat Example', 'Sam Example'] });
  const id = (await writeBacklog(at(sam), [{ op: 'add', title: 'Sync notes offline' }])).results[0].id;
  const s = await serveBacklog(pat);
  try {
    const add = (await write(s, '/api/drafts', { save: { op: 'add', title: 'Dark mode', happens: 'The app is white at night.', should: 'It follows the system.', where: 'Every screen.', about: ['editing/theme'] } })).draft;
    await write(s, '/api/drafts', { save: { op: 'note', ref: add.key, text: 'For night shifts.' } });
    await write(s, '/api/drafts', { save: { op: 'move', ref: add.key, to: 'ready' } });
    const drafted = await write(s, '/api/drafts', { save: { op: 'note', id, text: 'Offline matters most.' } });
    assert.equal(drafted.backlog.totals.unsent, 4);
    const before = commits(origin, 'backlog').length;
    const r = await write(s, '/api/submit');
    assert.equal(r.ok, true);
    const log = commits(origin, 'backlog');
    assert.equal(log.length, before + 1);
    assert.deepEqual([log[0].sha, log[0].author, log[0].subject], [r.commit, 'Pat Example', 'Pat Example: 1 new request, 2 notes, 1 move']);
    assert.deepEqual(r.sent.map((d) => [d.op, d.id]), [['add', 'dark-mode'], ['note', 'dark-mode'], ['move', 'dark-mode'], ['note', id]]);
    assert.deepEqual([r.held, r.refused, r.unreachable, r.error], [[], [], false, null]);
    // Nothing is left unsent, and the map shows what was sent.
    const b = await backlogOf(s);
    assert.deepEqual([b.drafts, b.totals.unsent, b.status], [[], 0, 'current']);
    const dark = b.requests['dark-mode'];
    assert.deepEqual([dark.draft, dark.by, dark.state, dark.label, dark.happens], [false, 'Pat Example', 'ready', 'Ready', 'The app is white at night.']);
    assert.deepEqual(dark.notes.map((n) => [n.by, n.text, n.draft]), [['Pat Example', 'For night shifts.', false]]);
    assert.deepEqual(b.requests[id].notes.map((n) => n.text), ['Offline matters most.']);
    assert.deepEqual(readDrafts(pat), []);
    // A Submit with nothing to send sends nothing.
    const none = await write(s, '/api/submit');
    assert.deepEqual([none.ok, none.commit, commits(origin, 'backlog').length], [true, null, before + 1]);
  } finally { await s.close(); }
}));

test('a clashing draft stays unsent with both values', () => withTmp(async (tmp) => {
  const { origin, clones: [pat, sam] } = project(tmp, 'notes-app', { people: ['Pat Example', 'Sam Example'] });
  const [undo, sync] = (await writeBacklog(at(sam), [{ op: 'add', title: 'Undo after closing a note' }, { op: 'add', title: 'Sync notes' }])).results.map((x) => x.id);
  const s = await serveBacklog(pat);
  try {
    await backlogOf(s); // the page opens: the map fetches the backlog
    // Pat's move, as the page sends it, carries the state Pat saw; then a note and a rename.
    const move = (await write(s, '/api/drafts', { save: { op: 'move', id: undo, to: 'ready' } })).draft;
    assert.equal(move.from, 'new');
    await write(s, '/api/drafts', { save: { op: 'note', id: undo, text: 'Same on the tablet.' } });
    const rename = (await write(s, '/api/drafts', { save: { op: 'edit', id: sync, field: 'title', to: 'Sync notes offline' } })).draft;
    assert.equal(rename.from, 'Sync notes');
    // Sam parks the one and renames the other before Pat submits.
    await writeBacklog(at(sam), [{ op: 'move', id: undo, to: 'parked' }, { op: 'edit', id: sync, field: 'title', to: 'Sync notes between devices' }]);
    const r = await write(s, '/api/submit');
    assert.equal(r.ok, true);
    assert.deepEqual(r.sent.map((d) => [d.op, d.id]), [['note', undo]]);
    assert.deepEqual(r.held, [
      { key: move.key, op: 'move', id: undo, field: 'state', theirs: 'parked', yours: 'ready' },
      { key: rename.key, op: 'edit', id: sync, field: 'title', theirs: 'Sync notes between devices', yours: 'Sync notes offline' },
    ]);
    assert.equal(commits(origin, 'backlog')[0].subject, 'Pat Example: 1 note');
    // Both stay unsent, showing whose value holds and Pat's.
    const b = await backlogOf(s);
    assert.deepEqual(b.drafts.map((d) => [d.key, d.held]), [
      [move.key, { theirs: 'parked', yours: 'ready', by: 'Sam Example' }],
      [rename.key, { theirs: 'Sync notes between devices', yours: 'Sync notes offline', by: 'Sam Example' }],
    ]);
    assert.deepEqual([b.requests[undo].state, b.requests[undo].label, b.requests[undo].held], ['parked', 'Parked', [{ key: move.key, field: 'state', theirs: 'parked', yours: 'ready', by: 'Sam Example' }]]);
    assert.equal(b.requests[sync].title, 'Sync notes between devices');
    // Pat applies the move again over Sam's value, and drops the rename.
    const again = await write(s, '/api/drafts', { apply: move.key });
    assert.deepEqual([again.draft.from, again.draft.held], ['parked', undefined]);
    assert.deepEqual((await write(s, '/api/drafts', { drop: rename.key })).backlog.drafts.map((d) => d.key), [move.key]);
    const r2 = await write(s, '/api/submit');
    assert.deepEqual([r2.ok, r2.sent.map((d) => d.key), r2.backlog.drafts], [true, [move.key], []]);
    assert.equal(r2.backlog.requests[undo].state, 'ready');
    assert.equal(r2.backlog.requests[sync].title, 'Sync notes between devices');
    const bad = await fetch(`${s.base}/api/drafts`, { method: 'POST', headers: WRITE, body: JSON.stringify({ apply: move.key }) });
    assert.deepEqual([bad.status, (await bad.json()).error], [400, `no held draft "${move.key}"`]);
  } finally { await s.close(); }
}));

test('a held move made again is made over the value shown, and is sent', () => withTmp(async (tmp) => {
  const { clones: [pat, sam] } = project(tmp, 'notes-app', { people: ['Pat Example', 'Sam Example'] });
  const id = (await writeBacklog(at(sam), [{ op: 'add', title: 'Undo after closing a note' }])).results[0].id;
  const s = await serveBacklog(pat);
  try {
    await backlogOf(s);
    const move = (await write(s, '/api/drafts', { save: { op: 'move', id, to: 'ready' } })).draft;
    await writeBacklog(at(sam), [{ op: 'move', id, to: 'parked' }]);
    const held = await write(s, '/api/submit');
    assert.deepEqual(held.held.map((h) => [h.key, h.theirs]), [[move.key, 'parked']]);
    // The page shows Parked; Move again, to Discussing, changes the held draft by its key.
    assert.equal(held.backlog.requests[id].state, 'parked');
    const again = (await write(s, '/api/drafts', { save: { op: 'move', id, to: 'discussing', key: move.key } })).draft;
    assert.deepEqual([again.key, again.from, again.to, again.held], [move.key, 'parked', 'discussing', undefined]);
    const r = await write(s, '/api/submit');
    assert.deepEqual([r.ok, r.sent.map((d) => d.key), r.held], [true, [move.key], []]);
    assert.equal(r.backlog.requests[id].state, 'discussing');
  } finally { await s.close(); }
}));

test('a draft is not changed while Submit sends, and says why', () => withTmp(async (tmp) => {
  const { origin, clones: [pat] } = project(tmp, 'notes-app', { people: ['Pat Example'] });
  const push = heldPush();
  const s = await serveBacklog(pat, {}, { net: push.net });
  try {
    const add = (await write(s, '/api/drafts', { save: { op: 'add', title: 'Dark mode' } })).draft;
    const sending = write(s, '/api/submit');
    await push.pushing;
    // The unsent request changed in its form, a new one, a drop and an apply-again: each refused.
    for (const body of [{ save: { ...add, title: 'Dark mode everywhere' } }, { save: { op: 'add', title: 'Export as PDF' } }, { drop: add.key }, { apply: add.key }]) {
      const r = await fetch(`${s.base}/api/drafts`, { method: 'POST', headers: WRITE, body: JSON.stringify(body) });
      assert.deepEqual([r.status, await r.json()], [409, { ok: false, error: SENDING }], JSON.stringify(body));
    }
    push.release();
    const sent = await sending;
    assert.deepEqual([sent.ok, sent.sent.map((d) => [d.key, d.id])], [true, [[add.key, 'dark-mode']]]);
    assert.deepEqual(readDrafts(pat), []);
    // Once it is done, drafts change again; the request was sent once, as it was when Submit read it.
    assert.equal((await write(s, '/api/drafts', { save: { op: 'note', id: 'dark-mode', text: 'Everywhere, please.' } })).ok, true);
    assert.deepEqual(execFileSync('git', ['-C', origin, 'ls-tree', '-r', '--name-only', 'backlog'], { encoding: 'utf8' }).trim().split('\n'), ['backlog/dark-mode.md']);
  } finally {
    push.release(); // a failed check never leaves the push waiting
    s.server.closeAllConnections();
    await s.close();
  }
}));

test('Restart hands over only once a Submit out has cleared what it sent', () => withTmp(async (tmp) => {
  const { origin, clones: [pat] } = project(tmp, 'notes-app', { people: ['Pat Example'] });
  const push = heldPush();
  const handed = [];
  const s = await serveBacklog(pat, {}, { net: push.net, restart: async () => ({ ok: true, handOver: () => { handed.push(readDrafts(pat)); } }) });
  try {
    await write(s, '/api/drafts', { save: { op: 'add', title: 'Dark mode' } });
    const sending = write(s, '/api/submit');
    await push.pushing;
    assert.deepEqual(await write(s, '/api/restart'), { ok: true });
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(handed, [], 'not while the push is out');
    // A Submit asked for now would never run: it is refused, not left waiting.
    const late = await fetch(`${s.base}/api/submit`, { method: 'POST', headers: WRITE, body: '{}', signal: AbortSignal.timeout(10000) });
    assert.deepEqual([late.status, (await late.json()).error], [409, 'the map is restarting']);
    push.release();
    assert.equal((await sending).ok, true);
    for (const until = Date.now() + 5000; !handed.length && Date.now() < until;) await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(handed, [[]], 'handed over once, with the sent drafts cleared');
    assert.equal(commits(origin, 'backlog').length, 1);
  } finally {
    push.release();
    s.server.closeAllConnections();
    await s.close();
  }
}));

test('submit without the network keeps every draft', () => withTmp(async (tmp) => {
  const { origin, clones: [pat] } = project(tmp, 'notes-app', { people: ['Pat Example'] });
  const s = await serveBacklog(pat);
  try {
    const add = (await write(s, '/api/drafts', { save: { op: 'add', title: 'Dark mode' } })).draft;
    await write(s, '/api/drafts', { save: { op: 'note', ref: add.key, text: 'For night shifts.' } });
    const before = readDrafts(pat);
    g(pat, 'remote', 'set-url', 'origin', path.join(tmp, 'gone.git'));
    const r = await write(s, '/api/submit');
    assert.deepEqual([r.ok, r.unreachable, r.commit, r.sent, r.held, r.refused], [false, true, null, [], [], []]);
    assert.ok(r.error, 'says why');
    assert.deepEqual(r.backlog.banners.filter((x) => x.kind === 'submit-unreachable').map((x) => x.drafts), [2]);
    assert.deepEqual(r.backlog.drafts.map((d) => d.key), before.map((d) => d.key));
    assert.deepEqual(readDrafts(pat), before);
    assert.equal(hasRef(origin, 'refs/heads/backlog'), false);
  } finally { await s.close(); }
}));

test('a write from another page is refused', () => withTmp(async (tmp) => {
  const { origin, clones: [pat] } = project(tmp, 'notes-app', { people: ['Pat Example'] });
  const s = await serveBacklog(pat);
  try {
    const body = JSON.stringify({ save: { op: 'add', title: 'Dark mode' } });
    const status = async (route, headers, b = body, method = 'POST') => (await fetch(`${s.base}${route}`, { method, headers, body: b })).status;
    for (const route of ['/api/drafts', '/api/submit']) {
      // A page of another site cannot send the map's header without asking first ...
      assert.equal(await status(route, { 'content-type': 'application/json' }), 403, route);
      // ... and the map never says yes to that question.
      const asked = await fetch(`${s.base}${route}`, { method: 'OPTIONS', headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type, x-solution-map' } });
      assert.equal(asked.headers.get('access-control-allow-origin'), null, route);
      assert.equal(asked.headers.get('access-control-allow-headers'), null, route);
      // A page that names another origin, a name rebound to 127.0.0.1, a form's text.
      assert.equal(await status(route, { ...WRITE, origin: 'http://evil.example' }), 403, route);
      assert.equal(await status(route, { ...WRITE, origin: 'null' }), 403, route);
      assert.equal(await postWithHost(s.port, route, `evil.example:${s.port}`, body), 403, route);
      assert.equal(await status(route, { 'x-solution-map': '1', 'content-type': 'text/plain' }), 415, route);
      assert.equal(await status(route, { 'x-solution-map': '1', 'content-type': 'application/x-www-form-urlencoded' }, 'save=1'), 415, route);
    }
    // Too big, or not JSON.
    const big = JSON.stringify({ save: { op: 'add', title: 'Dark mode', happens: 'x'.repeat(MAX_BODY) } });
    assert.equal(await status('/api/drafts', WRITE, big), 413);
    assert.equal(await status('/api/drafts', WRITE, '{"save":'), 400);
    assert.equal(await status('/api/drafts', WRITE, '[]'), 400);
    // Nothing was kept or sent.
    assert.deepEqual(readDrafts(pat), []);
    assert.equal(hasRef(origin, 'refs/heads/backlog'), false);
    // The map's own page writes.
    assert.equal(await status('/api/drafts', { ...WRITE, origin: s.base }), 200);
    assert.equal(await status('/api/drafts', { ...WRITE, origin: `http://localhost:${s.port}` }), 200);
    assert.equal(readDrafts(pat).length, 2);
  } finally { await s.close(); }
}));

test('a map without a backlog says why, and writes nothing', () => withTmp(async (tmp) => {
  const { work } = repoPair(tmp, 'app');
  const s = await serve(() => buildMap({ repos: [{ id: 'app', dir: work }], overview: standIn() }), { backlog: { error: 'backlog.repo "api" is not an id in solutionMap.repos' } });
  try {
    const b = await backlogOf(s);
    assert.deepEqual([b.status, b.banners], ['unavailable', [{ kind: 'backlog-off', error: 'this map has no backlog: backlog.repo "api" is not an id in solutionMap.repos' }]]);
    const r = await fetch(`${s.base}/api/drafts`, { method: 'POST', headers: WRITE, body: JSON.stringify({ save: { op: 'add', title: 'Dark mode' } }) });
    assert.equal(r.status, 409);
    assert.match((await r.json()).error, /this map has no backlog/);
    assert.deepEqual(readDrafts(work), []);
  } finally { await s.close(); }
  // A saved overview has no backlog, and no banner for it.
  const saved = await serve(async () => ({ model: { features: {} }, dirs: {}, commits: {}, backlog: null }));
  try {
    assert.deepEqual([(await backlogOf(saved)).status, (await backlogOf(saved)).banners], ['unavailable', []]);
  } finally { await saved.close(); }
}));

/* ---------- a clone without blobs; Restart to update ---------- */

/**
 * How many requests for objects (`git fetch … --stdin`) the git processes `fn` starts make: git's
 * own for an object it lacks, and the map's for many at once. Read from git's trace2 events.
 */
async function objectRequests(tmp, fn) {
  const trace = path.join(fs.mkdtempSync(path.join(tmp, 'trace-')), 'events.json');
  const before = process.env.GIT_TRACE2_EVENT;
  process.env.GIT_TRACE2_EVENT = trace;
  try {
    await fn();
  } finally {
    if (before === undefined) delete process.env.GIT_TRACE2_EVENT;
    else process.env.GIT_TRACE2_EVENT = before;
  }
  if (!fs.existsSync(trace)) return 0;
  return fs.readFileSync(trace, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((e) => e.event === 'start' && e.argv.includes('fetch') && e.argv.includes('--stdin')).length;
}

test('a clone without blobs gets what a build reads in one request', () => withTmp(async (tmp) => {
  // An origin that serves clones without blobs; its main has two versions of the spec, and a request.
  const { origin, work } = repoPair(tmp, 'app');
  g(origin, 'config', 'uploadpack.allowFilter', 'true');
  const specFile = path.join(work, 'specs', 'editing', 'offline-edits', 'spec.md');
  fs.writeFileSync(specFile, SPEC.replace('review: unreviewed', 'review: approved'));
  g(work, 'commit', '-q', '-am', 'approve offline edits');
  const approved = g(work, 'rev-parse', 'HEAD');
  g(work, 'push', '-q', 'origin', 'HEAD:main');
  g(work, 'config', 'user.name', 'Pat Example');
  g(work, 'config', 'user.email', 'pat@example.com');
  const sent = (await writeBacklog(at(work), [{ op: 'add', title: 'Sync notes offline' }])).results[0].id;
  const blobless = (name) => {
    const dir = path.join(tmp, name);
    execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', pathToFileURL(origin).href, dir], { stdio: 'pipe' });
    return dir;
  };
  const build = (dir, more = {}) => buildMap({ repos: [{ id: 'app', dir }], backlog: at(dir), probe: async () => true, webOf: async () => null, ...more });

  // Left to git, each file comes in a request of its own.
  const plain = blobless('plain');
  assert.ok(await objectRequests(tmp, () => build(plain, { prefetch: async () => {} })) > 1);

  const dir = blobless('clone');
  let built;
  assert.equal(await objectRequests(tmp, async () => { built = await build(dir); }), 1);
  const f = built.model.features['editing/offline-edits'];
  assert.deepEqual([f.review, f.reviewed?.commit], ['approved', approved]); // the review stamp reads the spec's history
  // The board and the backlog then read with no request more.
  assert.equal(await objectRequests(tmp, async () => {
    assert.match(String(await readAt(dir, built.commits.app, 'specs/editing/offline-edits/looks/offline-banner.html')), /offline banner/);
    assert.deepEqual(readBacklog(at(dir)).items.map((i) => i.id), [sent]);
  }), 0);

  // Main moves: the next build fetches what changed, again in one request.
  fs.writeFileSync(specFile, SPEC.replace('review: unreviewed', 'review: changes-requested'));
  fs.writeFileSync(path.join(work, 'src', 'offline.js'), '// keeps edits\n');
  g(work, 'add', '.');
  g(work, 'commit', '-q', '-m', 'changes requested');
  g(work, 'push', '-q', 'origin', 'HEAD:main');
  assert.equal(await objectRequests(tmp, async () => { built = await build(dir); }), 1);
  assert.equal(built.model.features['editing/offline-edits'].review, 'changes-requested');
  // A full clone has every blob: nothing is asked for.
  assert.equal(await objectRequests(tmp, () => build(work)), 0);
}));

test('Restart to update answers on a launched map only, behind the guard of every write', () => withTmp(async (tmp) => {
  const { work } = repoPair(tmp, 'app');
  const build = () => buildMap({ repos: [{ id: 'app', dir: work }], overview: standIn() });
  const restartAt = (s, headers = WRITE, body = '{}') => fetch(`${s.base}/api/restart`, { method: 'POST', headers, body });

  const fromCheckout = await serve(build);
  try {
    const r = await restartAt(fromCheckout);
    const body = await r.json();
    assert.deepEqual([r.status, body.ok], [409, false]);
    assert.match(body.error, /shortcut/);
  } finally { await fromCheckout.close(); }

  // A launched map: the hand-over runs once, after the answer, which it would cut off if it ran first.
  let can = { ok: false, error: 'the launcher is not at /gone/launch.mjs' };
  let handed = 0;
  let s;
  s = await serve(build, { restart: async () => (can.ok ? { ok: true, handOver: () => { handed++; s.server.closeAllConnections(); } } : can) });
  try {
    assert.equal((await restartAt(s, { 'content-type': 'application/json' })).status, 403);
    assert.equal((await restartAt(s, { ...WRITE, origin: 'http://evil.example' })).status, 403);
    assert.equal(await postWithHost(s.port, '/api/restart', `evil.example:${s.port}`, '{}'), 403);
    assert.equal((await restartAt(s, { 'x-solution-map': '1', 'content-type': 'text/plain' })).status, 415);
    const missing = await restartAt(s);
    assert.deepEqual([missing.status, await missing.json()], [409, can]);
    assert.equal(handed, 0);
    can = { ok: true };
    const r = await restartAt(s);
    assert.deepEqual([r.status, await r.json()], [200, { ok: true }]);
    assert.equal(handed, 1);
    const again = await restartAt(s);
    assert.deepEqual([again.status, (await again.json()).error], [409, 'the map is restarting']);
    assert.equal(handed, 1);
  } finally { await s.close(); }
}));

test('a launched map waits for its port while the map it replaces lets go of it', async () => {
  const before = http.createServer();
  await new Promise((r) => before.listen(0, '127.0.0.1', r));
  const port = before.address().port;
  const empty = async () => ({ model: { features: {}, banners: [] }, dirs: {}, commits: {} });
  // Not waiting, it takes another port.
  const elsewhere = createMapServer({ build: empty });
  assert.notEqual(await elsewhere.listen(port), port);
  await new Promise((r) => elsewhere.server.close(r));
  // Waiting, it takes the port once the map before it closes.
  const next = createMapServer({ build: empty });
  setTimeout(() => before.close(), 500);
  try {
    assert.equal(await next.listen(port, { wait: 10000 }), port);
  } finally { await new Promise((r) => next.server.close(r)); }
});
