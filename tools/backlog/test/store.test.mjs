import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { withTmp, project, writeFiles, git, show, commits, hasRef } from './helpers.mjs';
import { git as netGit } from '../../solution-map/lib/sources.mjs';
import { locateBacklog, backlogConfig, fetchBacklog, readBacklog, writeBacklog, MAX_TRIES } from '../lib/store.mjs';
import { parseItem, SET_STATES } from '../lib/item.mjs';

const NOW = new Date('2026-11-19T14:05:00Z');
const REQUEST = {
  op: 'add',
  title: 'Export a note as PDF',
  about: ['editing/export'],
  happens: 'Sharing a note sends a link only.',
  should: 'Share offers PDF.',
  where: 'The share sheet on a note.',
};
const at = (dir) => ({ dir, branch: 'backlog' });
const item = (dir, id, ref = 'origin/backlog') => parseItem(show(dir, ref, `backlog/${id}.md`), { id });

/** A runner for the network that does `before` just ahead of the first push, as if someone else pushed first. */
function pushedFirst(before) {
  let done = false;
  return async (dir, args, opts) => {
    if (!done && args[0] === 'push') {
      done = true;
      await before();
    }
    return netGit(dir, args, opts);
  };
}

test('the first write creates the branch with no shared history', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  assert.equal(hasRef(origin, 'refs/heads/backlog'), false);
  assert.deepEqual(await fetchBacklog(at(dir)), { state: 'absent', tip: null });
  assert.deepEqual(readBacklog(at(dir)), { tip: null, items: [], problems: [] });

  const w = await writeBacklog(at(dir), [REQUEST], { now: NOW });
  assert.equal(w.ok, true);
  const history = commits(origin, 'backlog');
  assert.equal(history.length, 1);
  assert.equal(history[0].sha, w.commit);
  assert.deepEqual(history[0].parents, []);
  assert.throws(() => git(origin, ['merge-base', 'main', 'backlog']));
  assert.deepEqual(git(origin, ['ls-tree', '-r', '--name-only', 'backlog']).split('\n'), ['backlog/export-a-note-as-pdf.md']);
}));

test('reads and writes the configured repository and branch', () => withTmp(async (tmp) => {
  const app = project(tmp, 'notes-app');
  const api = project(tmp, 'notes-api', { people: ['Pat Example', 'Sam Example'] });
  const config = {
    backlog: { repo: 'notes-api', branch: 'requests' },
    solutionMap: { repos: [{ id: 'notes-app', path: '.' }, { id: 'notes-api', path: '../notes-api-1' }] },
  };
  const where = locateBacklog({ config, root: app.clones[0] });
  assert.deepEqual({ ...where, dir: path.resolve(where.dir) }, { dir: path.resolve(api.clones[0]), branch: 'requests', repo: 'notes-api' });

  const w = await writeBacklog(where, [REQUEST], { now: NOW });
  assert.equal(w.ok, true);
  assert.equal(git(api.origin, ['rev-parse', 'requests']), w.commit);
  assert.deepEqual(git(app.origin, ['for-each-ref', '--format=%(refname)']).split('\n'), ['refs/heads/main']);
  assert.equal(hasRef(api.origin, 'refs/heads/backlog'), false);

  // Another clone of that repository reads it from that branch.
  const other = { dir: api.clones[1], branch: 'requests' };
  assert.equal((await fetchBacklog(other)).state, 'current');
  const read = readBacklog(other);
  assert.equal(read.tip, w.commit);
  assert.deepEqual(read.items.map((i) => [i.id, i.title, i.path]), [['export-a-note-as-pdf', 'Export a note as PDF', 'backlog/export-a-note-as-pdf.md']]);

  // Without the block: the branch `backlog` of the repository the tool runs in.
  assert.deepEqual(backlogConfig(null), { repo: null, branch: 'backlog' });
  const sub = path.join(app.clones[0], 'sub');
  fs.mkdirSync(sub);
  const plain = locateBacklog({ config: { solutionMap: config.solutionMap }, root: sub });
  assert.deepEqual({ ...plain, dir: path.resolve(plain.dir) }, { dir: path.resolve(app.clones[0]), branch: 'backlog', repo: null });
  assert.equal(locateBacklog({ repos: [{ id: 'notes-app', dir: app.clones[0] }], root: sub }).repo, 'notes-app');
  // A map run from a folder inside a clone's git directory: the backlog is that clone's.
  const launched = path.join(app.clones[0], '.git', 'faster-spec', 'maps', 'abc');
  fs.mkdirSync(launched, { recursive: true });
  const fromGitDir = locateBacklog({ root: launched });
  assert.equal(path.resolve(fromGitDir.dir), path.resolve(app.clones[0], '.git'));
  const w2 = await writeBacklog(fromGitDir, [{ op: 'add', title: 'From the git directory' }], { now: NOW });
  assert.equal(w2.ok, true);
  assert.equal(git(app.origin, ['rev-parse', 'backlog']), w2.commit);
  assert.throws(() => locateBacklog({ config: { backlog: { repo: 'nowhere' }, solutionMap: config.solutionMap }, root: app.clones[0] }), /not an id in solutionMap\.repos/);
  for (const branch of ['main', 'master', 'a..b', '-x', '']) assert.throws(() => backlogConfig({ backlog: { branch } }), /backlog\.branch/);
  assert.throws(() => backlogConfig({ backlog: { repo: 'x', bogus: 1 } }), /no key "bogus"/);
}));

function walk(dir, base = dir, out = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out[path.relative(base, p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  }
  return out;
}

/** What a checkout is: its HEAD, branches, index, status and files; the backlog's tracking ref aside. */
function snapshot(dir) {
  return {
    index: crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, '.git', 'index'))).digest('hex'),
    head: fs.readFileSync(path.join(dir, '.git', 'HEAD'), 'utf8'),
    refs: git(dir, ['for-each-ref', '--format=%(refname) %(objectname)']).split('\n').filter((l) => !l.startsWith('refs/remotes/origin/backlog ')),
    status: git(dir, ['--no-optional-locks', 'status', '--porcelain=v1', '-uall']),
    staged: git(dir, ['--no-optional-locks', 'diff', '--cached']),
    files: walk(dir),
  };
}

test('a write leaves main and every checkout untouched', () => withTmp(async (tmp) => {
  const { origin, clones, main } = project(tmp, 'notes-app', { files: { 'README.md': '# Notes\n', 'src/app.js': 'one\n' }, people: ['Pat Example', 'Sam Example'] });
  const [mine, theirs] = clones;
  // Work in progress: a staged file, an unstaged edit, an untracked file, on a branch of its own.
  git(mine, ['checkout', '-q', '-b', 'feature']);
  writeFiles(mine, { 'staged.txt': 'staged\n' });
  git(mine, ['add', 'staged.txt']);
  writeFiles(mine, { 'src/app.js': 'one, edited\n', 'untracked.txt': 'new\n' });
  const before = clones.map(snapshot);

  const add = await writeBacklog(at(mine), [REQUEST], { now: NOW });
  const id = add.results[0].id;
  for (const ops of [
    [{ op: 'note', id, text: 'A note.' }],
    [{ op: 'edit', id, field: 'where', from: 'The share sheet on a note.', to: 'The share sheet.' }],
    [{ op: 'move', id, from: 'new', to: 'ready' }],
    [{ op: 'link', id, change: 'export-pdf' }],
  ]) {
    const w = await writeBacklog(at(mine), ops, { now: NOW });
    assert.equal(w.results[0].status, 'applied');
  }
  assert.equal((await writeBacklog(at(theirs), [{ op: 'note', id, text: 'From the other clone.' }], { now: NOW })).ok, true);

  assert.deepEqual(clones.map(snapshot), before);
  assert.equal(git(origin, ['rev-parse', 'main']), main);
  assert.deepEqual(git(origin, ['for-each-ref', '--format=%(refname)', 'refs/heads']).split('\n'), ['refs/heads/backlog', 'refs/heads/main']);
  assert.equal(commits(origin, 'backlog').length, 6);
}));

test('a new item is one file holding the request, state new', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  const w = await writeBacklog(at(dir), [REQUEST], { now: NOW });
  assert.deepEqual(w.results.map((r) => [r.status, r.id]), [['applied', 'export-a-note-as-pdf']]);
  assert.deepEqual(git(origin, ['ls-tree', '-r', '--name-only', 'backlog']).split('\n'), ['backlog/export-a-note-as-pdf.md']);
  const text = show(origin, 'backlog', 'backlog/export-a-note-as-pdf.md');
  assert.equal(text, `---
title: Export a note as PDF
by: Pat Example
created: 2026-11-19
state: new
about:
  - editing/export
change:
---

## What happens

Sharing a note sends a link only.

## What should happen

Share offers PDF.

## Where

The share sheet on a note.

## Notes
`);
  const i = item(dir, 'export-a-note-as-pdf');
  assert.deepEqual(i.problems, []);
  assert.deepEqual([i.title, i.by, i.created, i.state, i.about], ['Export a note as PDF', 'Pat Example', '2026-11-19', 'new', ['editing/export']]);
}));

test('a note is appended with its author and time', () => withTmp(async (tmp) => {
  const { origin, clones: [pat, sam] } = project(tmp, 'notes-app', { people: ['Pat Example', 'Sam Example'] });
  const id = (await writeBacklog(at(pat), [REQUEST], { now: NOW })).results[0].id;
  await writeBacklog(at(pat), [{ op: 'note', id, text: 'Asked by three people.' }], { now: NOW });
  const w = await writeBacklog(at(sam), [{ op: 'note', id, text: 'Same here,\nwith a second line.' }], { now: new Date('2026-11-20T09:31:40Z') });
  assert.equal(w.ok, true);
  const text = show(origin, 'backlog', `backlog/${id}.md`);
  assert.ok(text.endsWith('## Notes\n\n### Pat Example · 2026-11-19 14:05 UTC\n\nAsked by three people.\n\n### Sam Example · 2026-11-20 09:31 UTC\n\nSame here,\nwith a second line.\n'), text);
  const notes = item(sam, id).notes;
  assert.deepEqual(notes.at(-1), { by: 'Sam Example', at: '2026-11-20 09:31', text: 'Same here,\nwith a second line.' });
  assert.equal(commits(origin, 'backlog')[0].author, 'Sam Example');
}));

test("a write changes only the item's own file", () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  const w1 = await writeBacklog(at(dir), [REQUEST, { op: 'add', title: 'Dark mode' }], { now: NOW });
  const [a, b] = w1.results.map((r) => r.id);
  const w2 = await writeBacklog(at(dir), [{ op: 'note', id: a, text: 'The mock-up is at https://example.com/mock-up.png' }], { now: NOW });
  assert.equal(git(origin, ['diff-tree', '--no-commit-id', '-r', '--name-status', w2.commit]), `M\tbacklog/${a}.md`);
  assert.equal(show(origin, w1.commit, `backlog/${b}.md`), show(origin, w2.commit, `backlog/${b}.md`));
  // The branch holds text files and nothing else: a link stays a link in the text.
  const tree = git(origin, ['ls-tree', '-r', 'backlog']).split('\n');
  assert.deepEqual(tree.map((l) => l.split(/\s+/).slice(0, 2).join(' ')), ['100644 blob', '100644 blob']);
  const text = show(origin, 'backlog', `backlog/${a}.md`);
  assert.equal(text.includes('\0'), false);
  assert.match(text, /^The mock-up is at https:\/\/example\.com\/mock-up\.png$/m);
}));

test('two notes sent at once both arrive', () => withTmp(async (tmp) => {
  const { origin, clones: [pat, sam] } = project(tmp, 'notes-app', { people: ['Pat Example', 'Sam Example'] });
  const id = (await writeBacklog(at(pat), [REQUEST], { now: NOW })).results[0].id;
  // Sam's write fetches and builds its commit; Pat's note lands before Sam's push gets there.
  let patsCommit;
  const net = pushedFirst(async () => {
    const w = await writeBacklog(at(pat), [{ op: 'note', id, text: "Pat's note." }], { now: NOW });
    patsCommit = w.commit;
  });
  const w = await writeBacklog(at(sam), [{ op: 'note', id, text: "Sam's note." }], { now: NOW, net });
  assert.equal(w.ok, true);
  const history = commits(origin, 'backlog');
  assert.deepEqual(history.slice(0, 2).map((c) => c.sha), [w.commit, patsCommit]);
  assert.deepEqual(history[0].parents, [patsCommit]);
  assert.deepEqual(item(sam, id).notes.map((n) => [n.by, n.text]), [['Pat Example', "Pat's note."], ['Sam Example', "Sam's note."]]);
}));

test('a field changed meanwhile is held with both values', () => withTmp(async (tmp) => {
  const { origin, clones: [pat, sam] } = project(tmp, 'notes-app', { people: ['Pat Example', 'Sam Example'] });
  const id = (await writeBacklog(at(pat), [{ op: 'add', title: 'Sync notes' }], { now: NOW })).results[0].id;
  await fetchBacklog(at(sam));
  // Sam prepares a title and a note; Pat renames it before Sam's push arrives.
  const net = pushedFirst(() => writeBacklog(at(pat), [{ op: 'edit', id, field: 'title', from: 'Sync notes', to: 'Sync notes between devices' }], { now: NOW }));
  const w = await writeBacklog(at(sam), [
    { op: 'edit', id, field: 'title', from: 'Sync notes', to: 'Sync notes offline' },
    { op: 'note', id, text: 'Offline matters most.' },
  ], { now: NOW, net });
  assert.equal(w.ok, true);
  const [edit, note] = w.results;
  assert.equal(edit.status, 'held');
  assert.equal(edit.theirs, 'Sync notes between devices');
  assert.equal(edit.op.to, 'Sync notes offline');
  assert.equal(note.status, 'applied');
  const now = item(sam, id);
  assert.equal(now.title, 'Sync notes between devices');
  assert.deepEqual(now.notes.map((n) => n.text), ['Offline matters most.']);
  assert.match(commits(origin, 'backlog')[0].subject, /^Sam Example: 1 note$/);
}));

test('a person moves an item to any state they set', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  const id = (await writeBacklog(at(dir), [REQUEST], { now: NOW })).results[0].id;
  for (const to of ['discussing', 'ready', 'parked', 'new', 'ready']) {
    const w = await writeBacklog(at(dir), [{ op: 'move', id, to }], { now: NOW });
    assert.equal(w.results[0].status, 'applied');
    assert.equal(item(dir, id).state, to);
    assert.equal(parseItem(show(origin, 'backlog', `backlog/${id}.md`), { id }).state, to);
  }
  assert.deepEqual(SET_STATES, ['new', 'discussing', 'ready', 'parked']);
  // The states an item's changes give are not set by people.
  const count = commits(origin, 'backlog').length;
  for (const to of ['in-progress', 'to-review', 'done']) {
    const w = await writeBacklog(at(dir), [{ op: 'move', id, to }], { now: NOW });
    assert.equal(w.results[0].status, 'refused');
    assert.equal(w.commit, null);
  }
  assert.equal(commits(origin, 'backlog').length, count);
}));

test('a remote that cannot be reached sends nothing and says so', () => withTmp(async (tmp) => {
  const { clones: [dir] } = project(tmp);
  await writeBacklog(at(dir), [REQUEST], { now: NOW });
  git(dir, ['remote', 'set-url', 'origin', path.join(tmp, 'gone.git')]);
  const f = await fetchBacklog(at(dir));
  assert.equal(f.state, 'unreachable');
  assert.ok(f.tip, 'what this clone last fetched stays readable');
  assert.equal(readBacklog(at(dir), { tip: f.tip }).items.length, 1);
  const w = await writeBacklog(at(dir), [{ op: 'note', id: 'export-a-note-as-pdf', text: 'x' }], { now: NOW });
  assert.equal(w.ok, false);
  assert.equal(w.unreachable, true);
  assert.ok(w.error);
}));

test('a backlog whose folder is missing is unreachable, not an error', () => withTmp(async (tmp) => {
  const gone = path.join(tmp, 'notes-app-moved');
  let ran = 0;
  const f = await fetchBacklog(at(gone), { net: async () => { ran++; return { ok: true, out: Buffer.alloc(0), err: '' }; } });
  assert.deepEqual(f, { state: 'unreachable', tip: null, error: `no repository at ${gone}` });
  assert.equal(ran, 0, 'no git runs in a folder that is not there');
}));

test('a push the remote refuses, with nobody pushing first, is reported once', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  await writeBacklog(at(dir), [REQUEST], { now: NOW });
  let pushes = 0;
  const net = async (d, args, opts) => {
    if (args[0] === 'push') {
      pushes++;
      return { ok: false, out: Buffer.alloc(0), err: 'remote: permission denied' };
    }
    return netGit(d, args, opts);
  };
  const w = await writeBacklog(at(dir), [{ op: 'note', id: 'export-a-note-as-pdf', text: 'x' }], { now: NOW, net });
  assert.deepEqual([w.ok, w.unreachable, w.error, pushes], [false, true, 'remote: permission denied', 1]);
  assert.equal(commits(origin, 'backlog').length, 1);
}));

test('a branch someone pushes to before every try ends after five, nothing sent', () => withTmp(async (tmp) => {
  const { origin, clones: [pat, sam] } = project(tmp, 'notes-app', { people: ['Pat Example', 'Sam Example'] });
  const id = (await writeBacklog(at(pat), [REQUEST], { now: NOW })).results[0].id;
  let pushes = 0;
  const net = async (d, args, opts) => {
    if (args[0] === 'push') {
      pushes++;
      await writeBacklog(at(pat), [{ op: 'note', id, text: `busy ${pushes}` }], { now: NOW });
    }
    return netGit(d, args, opts);
  };
  const w = await writeBacklog(at(sam), [{ op: 'note', id, text: 'Never lands.' }], { now: NOW, net });
  assert.deepEqual([w.ok, w.unreachable, pushes], [false, true, MAX_TRIES]);
  assert.match(w.error, /five|5/);
  assert.equal(commits(origin, 'backlog').length, 1 + MAX_TRIES);
  assert.equal(item(sam, id).notes.some((n) => n.text === 'Never lands.'), false);
}));

test('a branch holding anything but items is no backlog, and nothing is written to it', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  git(dir, ['push', '-q', 'origin', 'main:refs/heads/backlog']);
  const w = await writeBacklog(at(dir), [REQUEST], { now: NOW });
  assert.equal(w.ok, false);
  assert.equal(w.unreachable, false);
  assert.match(w.error, /README\.md is not an item/);
  assert.equal(git(origin, ['rev-parse', 'backlog']), git(origin, ['rev-parse', 'main']));
  assert.match(readBacklog(at(dir)).problems[0], /README\.md is not an item/);
}));

test('a branch deleted on the remote comes back with its history on the next write', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  const first = (await writeBacklog(at(dir), [REQUEST], { now: NOW })).commit;
  git(origin, ['branch', '-q', '-D', 'backlog']);
  assert.equal((await fetchBacklog(at(dir))).state, 'absent');
  assert.equal(readBacklog(at(dir)).items.length, 1, 'the clone still reads what it fetched');
  const w = await writeBacklog(at(dir), [{ op: 'note', id: 'export-a-note-as-pdf', text: 'Still wanted.' }], { now: NOW });
  assert.equal(w.ok, true);
  assert.deepEqual(commits(origin, 'backlog').map((c) => c.sha), [w.commit, first]);
}));

test('a clone with no git name and email writes nothing', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  git(dir, ['config', '--unset', 'user.name']);
  const w = await writeBacklog(at(dir), [REQUEST], { now: NOW });
  assert.deepEqual([w.ok, w.unreachable], [false, false]);
  assert.match(w.error, /user\.name/);
  assert.equal(hasRef(origin, 'refs/heads/backlog'), false);
}));
