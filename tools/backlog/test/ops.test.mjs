import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, opProblem, summary, commitMessage } from '../lib/ops.mjs';
import { parseItem, writeItem } from '../lib/item.mjs';

const NOW = new Date('2026-11-19T14:05:00Z');
const LATER = new Date('2026-11-19T15:30:00Z');

function tipWith(...items) {
  return new Map(items.map((i) => [i.id, writeItem({ by: 'Pat Example', created: '2026-11-18', state: 'new', about: [], change: [], happens: '', should: '', where: '', notes: [], ...i })]));
}
const read = (files, id) => parseItem(files.get(id), { id });

test('an add is a new request in new, its id given when it is replayed', () => {
  const tip = tipWith({ id: 'export-a-note', title: 'Export a note' });
  const { files, results } = applyOps(tip, [
    { op: 'add', key: 'd1', title: 'Export a note', about: ['editing/export', 'editing/export'], happens: 'Only a link.\r\n', should: 'A PDF.', where: 'Share' },
    { op: 'note', ref: 'd1', text: 'Asked twice this week.' },
  ], { name: 'Sam Example', now: NOW });
  assert.deepEqual(results.map((r) => [r.status, r.id]), [['applied', 'export-a-note-2'], ['applied', 'export-a-note-2']]);
  assert.deepEqual([...files.keys()], ['export-a-note-2']);
  const item = read(files, 'export-a-note-2');
  assert.deepEqual(item.problems, []);
  assert.equal(item.by, 'Sam Example');
  assert.equal(item.created, '2026-11-19');
  assert.equal(item.state, 'new');
  assert.deepEqual(item.about, ['editing/export']);
  assert.equal(item.happens, 'Only a link.');
  assert.deepEqual(item.notes, [{ by: 'Sam Example', at: '2026-11-19 14:05', text: 'Asked twice this week.' }]);
});

test('two adds of one title in one write get two ids', () => {
  const { results } = applyOps(new Map(), [{ op: 'add', title: 'Dark mode' }, { op: 'add', title: 'Dark mode' }], { name: 'Pat Example', now: NOW });
  assert.deepEqual(results.map((r) => r.id), ['dark-mode', 'dark-mode-2']);
});

test('a note appends after every note the tip holds, and never clashes', () => {
  const tip = tipWith({ id: 'a', title: 'A', notes: [{ by: 'Sam Example', at: '2026-11-19 15:00', text: 'Theirs, sent first.' }] });
  const { files, results } = applyOps(tip, [{ op: 'note', id: 'a', text: 'Mine.' }], { name: 'Pat Example', now: LATER });
  assert.equal(results[0].status, 'applied');
  assert.deepEqual(read(files, 'a').notes.map((n) => n.text), ['Theirs, sent first.', 'Mine.']);
});

test('an edit or a move whose field holds neither its from nor its to is held with both values', () => {
  const tip = tipWith({ id: 'a', title: 'Sync notes between devices', state: 'ready' });
  const { files, results } = applyOps(tip, [
    { op: 'edit', id: 'a', field: 'title', from: 'Sync notes', to: 'Sync notes offline' },
    { op: 'move', id: 'a', from: 'new', to: 'parked' },
    { op: 'note', id: 'a', text: 'The rest still goes.' },
  ], { name: 'Pat Example', now: NOW });
  assert.deepEqual(results.map((r) => r.status), ['held', 'held', 'applied']);
  assert.equal(results[0].theirs, 'Sync notes between devices');
  assert.equal(results[0].op.to, 'Sync notes offline');
  assert.equal(results[1].theirs, 'ready');
  const item = read(files, 'a');
  assert.equal(item.title, 'Sync notes between devices');
  assert.equal(item.state, 'ready');
  assert.equal(item.notes.length, 1);
});

test('an edit or a move applies when its field holds its from, and is unchanged when it holds its to', () => {
  const tip = tipWith({ id: 'a', title: 'Old', state: 'new', about: ['editing/export'] });
  const r1 = applyOps(tip, [
    { op: 'edit', id: 'a', field: 'title', from: 'Old', to: 'New title' },
    { op: 'edit', id: 'a', field: 'about', from: ['editing/export'], to: ['editing/export', 'sync/devices'] },
    { op: 'edit', id: 'a', field: 'happens', from: '', to: 'It crashes.' },
    { op: 'move', id: 'a', from: 'new', to: 'ready' },
  ], { name: 'Pat Example', now: NOW });
  assert.deepEqual(r1.results.map((r) => r.status), ['applied', 'applied', 'applied', 'applied']);
  assert.equal(r1.results[3].before, 'new');
  const item = read(r1.files, 'a');
  assert.equal(item.title, 'New title');
  assert.deepEqual(item.about, ['editing/export', 'sync/devices']);
  assert.equal(item.happens, 'It crashes.');
  assert.equal(item.state, 'ready');
  const r2 = applyOps(r1.files, [
    { op: 'move', id: 'a', from: 'new', to: 'ready' },
    { op: 'edit', id: 'a', field: 'about', from: [], to: ['sync/devices', 'editing/export'] },
  ], { name: 'Sam Example', now: NOW });
  assert.deepEqual(r2.results.map((r) => r.status), ['unchanged', 'unchanged']);
  assert.equal(r2.files.size, 0);
});

test('a move with no from sets the state whatever it holds', () => {
  const tip = tipWith({ id: 'a', title: 'A', state: 'discussing' });
  const { files, results } = applyOps(tip, [{ op: 'move', id: 'a', to: 'parked' }], { name: 'Pat Example', now: NOW });
  assert.equal(results[0].status, 'applied');
  assert.equal(read(files, 'a').state, 'parked');
});

test('a link names a change once', () => {
  const tip = tipWith({ id: 'a', title: 'A' });
  const { files, results } = applyOps(tip, [{ op: 'link', id: 'a', change: 'export-pdf' }, { op: 'link', id: 'a', change: 'export-pdf' }], { name: 'Pat Example', now: NOW });
  assert.deepEqual(results.map((r) => r.status), ['applied', 'unchanged']);
  assert.deepEqual(read(files, 'a').change, ['export-pdf']);
});

test('an operation on no request, a broken file or an unsent request is refused, the rest applies', () => {
  const tip = tipWith({ id: 'a', title: 'A' });
  tip.set('broken', '---\ntitle: Broken\n---\n');
  const { files, results } = applyOps(tip, [
    { op: 'note', id: 'missing', text: 'x' },
    { op: 'note', id: 'broken', text: 'x' },
    { op: 'note', ref: 'never-added', text: 'x' },
    { op: 'move', id: 'a', to: 'done' },
    { op: 'note', id: 'a', text: 'kept' },
  ], { name: 'Pat Example', now: NOW });
  assert.deepEqual(results.map((r) => r.status), ['refused', 'refused', 'refused', 'refused', 'applied']);
  assert.match(results[0].reason, /no request "missing"/);
  assert.match(results[1].reason, /cannot be read/);
  assert.match(results[2].reason, /not sent with it/);
  assert.match(results[3].reason, /moves to new, discussing, ready, parked/);
  assert.deepEqual([...files.keys()], ['a']);
});

test('an operation\'s shape is checked before it is replayed', () => {
  assert.equal(opProblem({ op: 'add', title: 'A', about: ['editing/export'] }), null);
  assert.match(opProblem({ op: 'add', title: ' ' }), /title/);
  assert.match(opProblem({ op: 'add', title: 'A', about: ['Export'] }), /feature ids/);
  assert.match(opProblem({ op: 'note', id: 'a', text: '  \n' }), /needs text/);
  assert.match(opProblem({ op: 'note', text: 'x' }), /names one request/);
  assert.match(opProblem({ op: 'note', id: 'a', ref: 'd1', text: 'x' }), /names one request/);
  assert.match(opProblem({ op: 'edit', id: 'a', field: 'state', to: 'ready' }), /an edit changes/);
  assert.match(opProblem({ op: 'edit', id: 'a', field: 'title', to: '' }), /title/);
  assert.match(opProblem({ op: 'link', id: 'a', change: 'Not An Id' }), /not a change id/);
  assert.match(opProblem({ op: 'delete', id: 'a' }), /not an operation/);
});

test('a write\'s commit says who and what, counted and pluralised, one line per operation', () => {
  const tip = tipWith({ id: 'a', title: 'A' }, { id: 'b', title: 'B' });
  const { results } = applyOps(tip, [
    { op: 'add', title: 'Dark mode' },
    { op: 'note', id: 'a', text: 'one' },
    { op: 'note', id: 'b', text: 'two' },
    { op: 'move', id: 'a', from: 'new', to: 'ready' },
    { op: 'move', id: 'b', from: 'parked', to: 'ready' },
    { op: 'link', id: 'a', change: 'dark-mode' },
  ], { name: 'Pat Example', now: NOW });
  assert.equal(summary(results), '1 new request, 2 notes, 1 move, 1 link');
  assert.equal(commitMessage('Pat Example', results), 'Pat Example: 1 new request, 2 notes, 1 move, 1 link\n\nadd dark-mode: Dark mode\nnote a\nnote b\nmove a: new -> ready\nlink a: dark-mode\n');
  const two = applyOps(tip, [{ op: 'add', title: 'X' }, { op: 'add', title: 'Y' }, { op: 'edit', id: 'a', field: 'where', to: 'here' }], { name: 'Pat Example', now: NOW });
  assert.equal(summary(two.results), '2 new requests, 1 edit');
});
