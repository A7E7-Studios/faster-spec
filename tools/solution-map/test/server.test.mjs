import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildMap } from '../lib/build.mjs';
import { createMapServer, withSection } from '../lib/server.mjs';

const ID = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main'];
const g = (dir, ...args) => execFileSync('git', ['-C', dir, ...ID, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const BOARD = '<!doctype html><html><head><style>body{margin:0}</style></head><body><section id="banner">offline banner</section><section id="other">other</section></body></html>';

/** A bare origin and a clone of it with one commit on main; returns both folders. */
function repoPair(tmp, name) {
  const origin = path.join(tmp, `${name}.git`);
  const work = path.join(tmp, name);
  fs.mkdirSync(origin);
  g(origin, 'init', '--bare', '-q');
  fs.mkdirSync(work);
  g(work, 'init', '-q');
  fs.mkdirSync(path.join(work, 'specs/editing/offline-edits/looks'), { recursive: true });
  fs.writeFileSync(path.join(work, 'specs/editing/offline-edits/looks/offline-banner.html'), BOARD);
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

/** A stand-in for the overview while version 3 is not written: the commit each repository is at. */
const standIn = (version = 3) => (repos) => ({
  version, generatedAt: new Date().toISOString(),
  repos: repos.map((r) => ({ id: r.id, name: r.id, ref: r.ref, commit: g(r.dir, 'rev-parse', r.ref) })),
  domains: [], systems: [], capabilities: [], changes: [], uncovered: [],
});

async function serve(build) {
  const s = createMapServer({ build });
  const port = await s.listen(0);
  const base = `http://127.0.0.1:${port}`;
  return { ...s, port, base, close: () => new Promise((r) => s.server.close(r)) };
}

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
    assert.equal((await fetch(`${s.base}/page/../lib/server.mjs`)).status, 404);
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
    const after = await (await fetch(`${s.base}/api/refresh`, { method: 'POST' })).json();
    assert.equal(after.repos[0].commit, landed);
  } finally { await s.close(); }
}));

test('a board section is served from the board by its id', () => withTmp(async (tmp) => {
  const { work } = repoPair(tmp, 'app');
  const s = await serve(() => buildMap({ repos: [{ id: 'app', dir: work }], overview: standIn() }));
  try {
    const url = `${s.base}/board/app/specs/editing/offline-edits/looks/offline-banner.html`;
    const r = await fetch(`${url}?section=banner`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy'), /^sandbox;/);
    const html = await r.text();
    assert.match(html, /<style>section:not\(#banner\)\{display:none!important\}<\/style><\/head>/);
    assert.match(html, /offline banner/);
    assert.equal((await fetch(`${url}?section=nope`)).status, 404);
    assert.equal((await fetch(`${s.base}/board/app/specs/editing/x/looks/missing.html`)).status, 404);
    assert.equal(withSection('<section id="a">', 'a"><script>'), null);
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
