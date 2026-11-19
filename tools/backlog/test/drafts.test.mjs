import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { withTmp, project, git, commits } from './helpers.mjs';
import { gitAsync as netGit } from '../../gate/lib/git.mjs';
import { draftsPath, readDrafts, saveDraft, dropDraft, submitDrafts } from '../lib/drafts.mjs';
import { writeBacklog, readBacklog } from '../lib/store.mjs';

const NOW = new Date('2026-11-19T14:05:00Z');
const at = (dir) => ({ dir, branch: 'backlog' });

test('drafts live in the git common directory, out of git status, and survive a restart', () => withTmp(async (tmp) => {
  const { clones: [dir] } = project(tmp);
  const file = draftsPath(dir);
  assert.equal(path.resolve(file), path.resolve(dir, '.git', 'faster-spec', 'backlog-drafts.json'));
  assert.deepEqual(readDrafts(dir), []);
  const { draft } = saveDraft(dir, { op: 'add', title: 'Dark mode' });
  assert.equal(git(dir, ['status', '--porcelain', '-uall']), '');
  // A worktree of the same clone shares them; a new process reads them from the file.
  const wt = path.join(tmp, 'wt');
  git(dir, ['worktree', 'add', '-q', '-b', 'side', wt]);
  assert.equal(path.resolve(draftsPath(wt)), path.resolve(file));
  const again = await import(`../lib/drafts.mjs?restart=${Date.now()}`);
  assert.deepEqual(again.readDrafts(wt), [draft]);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, 1);
}));

test('a draft is added, changed and dropped', () => withTmp(async (tmp) => {
  const { clones: [dir] } = project(tmp);
  const a = saveDraft(dir, { op: 'add', title: 'Dark mode', about: ['editing/theme'] }).draft;
  assert.match(a.key, /^d-[0-9a-f]{12}$/);
  assert.equal(a.rev, 1);
  const n = saveDraft(dir, { op: 'note', ref: a.key, text: 'For night shifts.' }).draft;
  const changed = saveDraft(dir, { ...a, title: 'Dark mode everywhere' }).draft;
  assert.deepEqual([changed.key, changed.rev, changed.title], [a.key, 2, 'Dark mode everywhere']);
  assert.deepEqual(readDrafts(dir).map((d) => d.key), [a.key, n.key]);
  assert.throws(() => saveDraft(dir, { op: 'note', id: 'x', text: '' }), /needs text/);
  assert.throws(() => saveDraft(dir, { key: 'd-nothere', op: 'note', id: 'x', text: 'y' }), /no draft/);
  assert.throws(() => saveDraft(dir, { op: 'note', ref: n.key, text: 'y' }), /no unsent request/);
  // Dropping an unsent request drops what was written on it.
  assert.deepEqual(dropDraft(dir, a.key), []);
  assert.deepEqual(readDrafts(dir), []);
}));

test('submit sends every draft as one commit and keeps a held one with both values', () => withTmp(async (tmp) => {
  const { origin, clones: [pat, sam] } = project(tmp, 'notes-app', { people: ['Pat Example', 'Sam Example'] });
  const id = (await writeBacklog(at(sam), [{ op: 'add', title: 'Sync notes' }], { now: NOW })).results[0].id;
  // Pat drafts against what Pat saw; Sam renames the request before Pat submits.
  const add = saveDraft(pat, { op: 'add', title: 'Dark mode' }).draft;
  saveDraft(pat, { op: 'note', ref: add.key, text: 'For night shifts.' });
  saveDraft(pat, { op: 'move', ref: add.key, from: 'new', to: 'ready' });
  saveDraft(pat, { op: 'note', id, text: 'Offline matters most.' });
  const edit = saveDraft(pat, { op: 'edit', id, field: 'title', from: 'Sync notes', to: 'Sync notes offline' }).draft;
  await writeBacklog(at(sam), [{ op: 'edit', id, field: 'title', to: 'Sync notes between devices' }], { now: NOW });

  const before = commits(origin, 'backlog').length;
  const s = await submitDrafts(at(pat), { now: NOW });
  assert.equal(s.ok, true);
  assert.equal(commits(origin, 'backlog').length, before + 1);
  assert.equal(commits(origin, 'backlog')[0].subject, 'Pat Example: 1 new request, 2 notes, 1 move');
  assert.deepEqual(s.sent.map((d) => [d.op, d.id]), [['add', 'dark-mode'], ['note', 'dark-mode'], ['move', 'dark-mode'], ['note', id]]);
  assert.equal(s.held.length, 1);
  const held = readDrafts(pat);
  assert.deepEqual(held.map((d) => [d.key, d.from, d.to, d.held]), [[edit.key, 'Sync notes', 'Sync notes offline', { theirs: 'Sync notes between devices' }]]);
  const items = Object.fromEntries(readBacklog(at(pat)).items.map((i) => [i.id, i]));
  assert.equal(items['dark-mode'].state, 'ready');
  assert.equal(items[id].title, 'Sync notes between devices');

  // Applying it again over their value sends it; the drafts are then empty.
  saveDraft(pat, { ...held[0], from: held[0].held.theirs });
  assert.equal(readDrafts(pat)[0].held, undefined);
  const again = await submitDrafts(at(pat), { now: NOW });
  assert.deepEqual([again.ok, again.sent.length, again.drafts], [true, 1, []]);
  assert.equal(readBacklog(at(pat)).items.find((i) => i.id === id).title, 'Sync notes offline');
}));

test('submit that cannot reach the backlog keeps every draft', () => withTmp(async (tmp) => {
  const { clones: [dir] } = project(tmp);
  saveDraft(dir, { op: 'add', title: 'Dark mode' });
  saveDraft(dir, { op: 'add', title: 'Export as PDF' });
  const before = readDrafts(dir);
  git(dir, ['remote', 'set-url', 'origin', path.join(tmp, 'gone.git')]);
  const s = await submitDrafts(at(dir), { now: NOW });
  assert.deepEqual([s.ok, s.unreachable, s.sent.length], [false, true, 0]);
  assert.ok(s.error);
  assert.deepEqual(readDrafts(dir), before);
}));

test('a draft saved while a submit is out stays as it was saved', () => withTmp(async (tmp) => {
  const { clones: [dir] } = project(tmp);
  const first = saveDraft(dir, { op: 'add', title: 'Dark mode' }).draft;
  let later;
  const net = async (d, args, opts) => {
    if (args[0] === 'push' && !later) later = saveDraft(dir, { op: 'add', title: 'Written meanwhile' }).draft;
    return netGit(d, args, opts);
  };
  const s = await submitDrafts(at(dir), { now: NOW, net });
  assert.deepEqual(s.sent.map((d) => d.key), [first.key]);
  assert.deepEqual(readDrafts(dir).map((d) => d.key), [later.key]);
}));

test('two submits of one clone run one after the other', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  saveDraft(dir, { op: 'add', title: 'Dark mode' });
  const [a, b] = await Promise.all([submitDrafts(at(dir), { now: NOW }), submitDrafts(at(dir), { now: NOW })]);
  assert.deepEqual([a.sent.length, b.sent.length, b.commit], [1, 0, null]);
  assert.equal(commits(origin, 'backlog').length, 1);
}));
