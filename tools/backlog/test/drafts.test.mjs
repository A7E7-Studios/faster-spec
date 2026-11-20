import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { withTmp, project, git, commits, hasRef } from './helpers.mjs';
import { gitAsync as netGit } from '../../gate/lib/git.mjs';
import { draftsPath, lockPath, readDrafts, saveDraft, dropDraft, submitDrafts, DRAFTS_BUSY, LOCK_STALE, SENDING_ELSEWHERE } from '../lib/drafts.mjs';
import { writeBacklog, readBacklog } from '../lib/store.mjs';

const NOW = new Date('2026-11-19T14:05:00Z');
const at = (dir) => ({ dir, branch: 'backlog' });
/** A second map on the same clone: its own copy of the module, writing the same drafts file. */
const anotherMap = (name) => import(`../lib/drafts.mjs?${name}=${Date.now()}`);
/** A runner for Submit's git whose push waits for `release()`; `pushing` resolves once the push is out. */
function heldPush() {
  let release;
  let started;
  const gate = new Promise((r) => { release = r; });
  const pushing = new Promise((r) => { started = r; });
  const net = async (d, args, o) => {
    if (args[0] === 'push') { started(); await gate; }
    return netGit(d, args, o);
  };
  return { net, pushing, release };
}

test('drafts live in the git common directory, out of git status, and survive a restart', () => withTmp(async (tmp) => {
  const { clones: [dir] } = project(tmp);
  const file = draftsPath(dir);
  assert.equal(path.resolve(file), path.resolve(dir, '.git', 'faster-spec', 'backlog-drafts.json'));
  assert.equal(path.resolve(lockPath(dir)), path.resolve(dir, '.git', 'faster-spec', 'backlog-drafts.lock'));
  assert.deepEqual(readDrafts(dir), []);
  const { draft } = await saveDraft(dir, { op: 'add', title: 'Dark mode' });
  assert.equal(git(dir, ['status', '--porcelain', '-uall']), '');
  // Written whole, then the lock let go: nothing is left beside the file.
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['backlog-drafts.json']);
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
  const a = (await saveDraft(dir, { op: 'add', title: 'Dark mode', about: ['editing/theme'] })).draft;
  assert.match(a.key, /^d-[0-9a-f]{12}$/);
  assert.equal(a.rev, 1);
  const n = (await saveDraft(dir, { op: 'note', ref: a.key, text: 'For night shifts.' })).draft;
  const changed = (await saveDraft(dir, { ...a, title: 'Dark mode everywhere' })).draft;
  assert.deepEqual([changed.key, changed.rev, changed.title], [a.key, 2, 'Dark mode everywhere']);
  assert.deepEqual(readDrafts(dir).map((d) => d.key), [a.key, n.key]);
  await assert.rejects(saveDraft(dir, { op: 'note', id: 'x', text: '' }), /needs text/);
  await assert.rejects(saveDraft(dir, { key: 'd-nothere', op: 'note', id: 'x', text: 'y' }), /no draft/);
  await assert.rejects(saveDraft(dir, { op: 'note', ref: n.key, text: 'y' }), /no unsent request/);
  // Dropping an unsent request drops what was written on it.
  assert.deepEqual(await dropDraft(dir, a.key), []);
  assert.deepEqual(readDrafts(dir), []);
}));

test('submit sends every draft as one commit and keeps a held one with both values', () => withTmp(async (tmp) => {
  const { origin, clones: [pat, sam] } = project(tmp, 'notes-app', { people: ['Pat Example', 'Sam Example'] });
  const id = (await writeBacklog(at(sam), [{ op: 'add', title: 'Sync notes' }], { now: NOW })).results[0].id;
  // Pat drafts against what Pat saw; Sam renames the request before Pat submits.
  const add = (await saveDraft(pat, { op: 'add', title: 'Dark mode' })).draft;
  await saveDraft(pat, { op: 'note', ref: add.key, text: 'For night shifts.' });
  await saveDraft(pat, { op: 'move', ref: add.key, from: 'new', to: 'ready' });
  await saveDraft(pat, { op: 'note', id, text: 'Offline matters most.' });
  const edit = (await saveDraft(pat, { op: 'edit', id, field: 'title', from: 'Sync notes', to: 'Sync notes offline' })).draft;
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
  await saveDraft(pat, { ...held[0], from: held[0].held.theirs });
  assert.equal(readDrafts(pat)[0].held, undefined);
  const again = await submitDrafts(at(pat), { now: NOW });
  assert.deepEqual([again.ok, again.sent.length, again.drafts], [true, 1, []]);
  assert.equal(readBacklog(at(pat)).items.find((i) => i.id === id).title, 'Sync notes offline');
}));

test('submit that cannot reach the backlog keeps every draft', () => withTmp(async (tmp) => {
  const { clones: [dir] } = project(tmp);
  await saveDraft(dir, { op: 'add', title: 'Dark mode' });
  await saveDraft(dir, { op: 'add', title: 'Export as PDF' });
  const before = readDrafts(dir);
  git(dir, ['remote', 'set-url', 'origin', path.join(tmp, 'gone.git')]);
  const s = await submitDrafts(at(dir), { now: NOW });
  assert.deepEqual([s.ok, s.unreachable, s.sent.length], [false, true, 0]);
  assert.ok(s.error);
  assert.deepEqual(readDrafts(dir), before);
}));

test('two Submits at once from two maps on one clone send each draft once', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  const add = (await saveDraft(dir, { op: 'add', title: 'Dark mode' })).draft;
  await saveDraft(dir, { op: 'note', ref: add.key, text: 'For night shifts.' });
  const [one, two] = [await anotherMap('first-map'), await anotherMap('second-map')];
  const results = await Promise.all([one.submitDrafts(at(dir), { now: NOW }), two.submitDrafts(at(dir), { now: NOW })]);
  // One sends; the other is refused, sending nothing, and says why.
  const sentBy = results.filter((r) => r.ok);
  const refused = results.filter((r) => !r.ok);
  assert.deepEqual(sentBy.map((r) => r.sent.length), [2]);
  assert.deepEqual(refused.map((r) => [r.busy, r.unreachable, r.error, r.sent]), [[true, false, SENDING_ELSEWHERE, []]]);
  assert.equal(commits(origin, 'backlog').length, 1);
  assert.deepEqual(git(origin, ['ls-tree', '-r', '--name-only', 'backlog']).split('\n'), ['backlog/dark-mode.md']);
  assert.deepEqual(readDrafts(dir), []);
  assert.equal(fs.existsSync(lockPath(dir)), false, 'the lock is let go');
}));

test('a lock whose process has gone, or that is too old, is taken over; a live one is not', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  const lock = lockPath(dir);
  const holder = (o) => fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: Date.now(), what: 'submit', token: 'theirs', ...o }));
  await saveDraft(dir, { op: 'add', title: 'Dark mode' });
  // A Submit of a live process holds it: nothing is sent, nothing changes.
  holder({});
  const busy = await submitDrafts(at(dir), { now: NOW });
  assert.deepEqual([busy.ok, busy.busy, busy.error], [false, true, SENDING_ELSEWHERE]);
  assert.equal(hasRef(origin, 'refs/heads/backlog'), false, 'nothing was sent');
  assert.equal(JSON.parse(fs.readFileSync(lock, 'utf8')).token, 'theirs', 'the live lock stays theirs');
  await assert.rejects(saveDraft(dir, { op: 'add', title: 'Export as PDF' }, { wait: 200 }), (e) => e.code === DRAFTS_BUSY && e.message === SENDING_ELSEWHERE);
  assert.equal(readDrafts(dir).length, 1);
  // Its process has gone: the lock is stale, taken over, and let go after.
  const gone = spawnSync(process.execPath, ['-e', '']).pid;
  holder({ pid: gone });
  const sent = await submitDrafts(at(dir), { now: NOW });
  assert.deepEqual([sent.ok, sent.sent.length], [true, 1]);
  assert.equal(fs.existsSync(lock), false);
  // A live process's lock older than LOCK_STALE is stale too.
  holder({ at: Date.now() - LOCK_STALE - 1000, what: 'write' });
  assert.equal((await saveDraft(dir, { op: 'add', title: 'Export as PDF' }, { wait: 0 })).draft.title, 'Export as PDF');
  assert.equal(fs.existsSync(lock), false);
}));

test('a draft saved while another map\'s Submit holds the drafts waits or is refused, and loses nothing', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  const add = (await saveDraft(dir, { op: 'add', title: 'Dark mode' })).draft;
  const other = await anotherMap('other-map');
  const push = heldPush();
  const sending = submitDrafts(at(dir), { now: NOW, net: push.net });
  try {
    await push.pushing;
    // While the push is out: a change of the request being sent is refused and changes nothing.
    await assert.rejects(other.saveDraft(dir, { ...add, title: 'Dark mode everywhere' }, { wait: 200 }), (e) => e.code === DRAFTS_BUSY && e.message === SENDING_ELSEWHERE);
    await assert.rejects(other.dropDraft(dir, add.key, { wait: 200 }), (e) => e.code === DRAFTS_BUSY);
    assert.deepEqual(readDrafts(dir), [add]);
    // A new draft waits for the lock, and is written once the Submit has let it go.
    const waiting = other.saveDraft(dir, { op: 'add', title: 'Export as PDF' }, { wait: 30000 });
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(readDrafts(dir), [add], 'not while the Submit holds the drafts');
    push.release();
    const s = await sending;
    assert.deepEqual([s.ok, s.sent.map((d) => d.key)], [true, [add.key]]);
    const later = (await waiting).draft;
    assert.deepEqual(readDrafts(dir).map((d) => [d.key, d.title]), [[later.key, 'Export as PDF']]);
  } finally { push.release(); }
  // The request went once, with the title Submit read.
  assert.deepEqual(git(origin, ['ls-tree', '-r', '--name-only', 'backlog']).split('\n'), ['backlog/dark-mode.md']);
}));

test('a draft another map changes while a submit is out, its lock taken over, keeps the change, never a second request', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  const id = (await writeBacklog(at(dir), [{ op: 'add', title: 'Sync notes' }], { now: NOW })).results[0].id;
  const add = (await saveDraft(dir, { op: 'add', title: 'Dark mode', about: ['editing/theme'] })).draft;
  const move = (await saveDraft(dir, { op: 'move', id, from: 'new', to: 'ready' })).draft;
  const other = await anotherMap('other-map');
  const net = async (d, args, opts) => {
    if (args[0] === 'push') {
      // The Submit's lock taken over as stale, as a Submit running past LOCK_STALE would have it.
      fs.rmSync(lockPath(dir));
      await other.saveDraft(dir, { ...add, title: 'Dark mode everywhere', description: 'Even at noon.' });
      await other.saveDraft(dir, { ...move, to: 'parked' });
      await other.saveDraft(dir, { op: 'note', ref: add.key, text: 'From the other window.' });
      // And a lock someone holds now, which the Submit must not let go of as its own.
      fs.writeFileSync(lockPath(dir), JSON.stringify({ pid: process.pid, at: Date.now(), what: 'write', token: 'later' }));
    }
    return netGit(d, args, opts);
  };
  const s = await submitDrafts(at(dir), { now: NOW, net });
  assert.equal(s.ok, true);
  assert.equal(JSON.parse(fs.readFileSync(lockPath(dir), 'utf8')).token, 'later');
  fs.rmSync(lockPath(dir));
  assert.deepEqual(s.sent.map((d) => [d.key, d.id]), [[add.key, 'dark-mode'], [move.key, id]]);
  // What was sent stays sent; the change is kept on top of it.
  assert.deepEqual(readDrafts(dir).map(({ op, id: target, field, from, to, text }) => ({ op, id: target, field, from, to, text })), [
    { op: 'edit', id: 'dark-mode', field: 'title', from: 'Dark mode', to: 'Dark mode everywhere', text: undefined },
    { op: 'edit', id: 'dark-mode', field: 'description', from: '', to: 'Even at noon.', text: undefined },
    { op: 'move', id, field: undefined, from: 'ready', to: 'parked', text: undefined },
    { op: 'note', id: 'dark-mode', field: undefined, from: undefined, to: undefined, text: 'From the other window.' },
  ]);
  const again = await submitDrafts(at(dir), { now: NOW });
  assert.deepEqual([again.ok, again.held, again.refused, again.drafts], [true, [], [], []]);
  assert.deepEqual(git(origin, ['ls-tree', '-r', '--name-only', 'backlog']).split('\n'), ['backlog/dark-mode.md', `backlog/${id}.md`]);
  const items = Object.fromEntries(readBacklog(at(dir)).items.map((i) => [i.id, i]));
  assert.deepEqual([items['dark-mode'].title, items['dark-mode'].description, items['dark-mode'].about, items['dark-mode'].notes.map((n) => n.text)], ['Dark mode everywhere', 'Even at noon.', ['editing/theme'], ['From the other window.']]);
  assert.equal(items[id].state, 'parked');
}));

test('two submits of one map run one after the other', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  await saveDraft(dir, { op: 'add', title: 'Dark mode' });
  const [a, b] = await Promise.all([submitDrafts(at(dir), { now: NOW }), submitDrafts(at(dir), { now: NOW })]);
  assert.deepEqual([a.sent.length, b.ok, b.sent.length, b.commit], [1, true, 0, null]);
  assert.equal(commits(origin, 'backlog').length, 1);
}));
