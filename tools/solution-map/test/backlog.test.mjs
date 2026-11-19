import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backlogView, boardColumns, applyDrafts, requestAddress } from '../lib/backlog-view.mjs';

const FEATURES = {
  'editing/export': { title: 'Export' },
  'editing/offline-edits': { title: 'Offline edits' },
  'sharing/links': { title: 'Share links' },
};

/** An item as `withShownStates` gives it: the state it is set to shows unless it names a change. */
function item(id, o = {}) {
  const state = o.state ?? 'new';
  const changes = o.changes ?? [];
  return {
    id,
    path: `backlog/${id}.md`,
    title: o.title ?? id,
    by: o.by ?? 'jdoe',
    created: o.created ?? '2026-11-10',
    state,
    about: o.about ?? [],
    change: changes.map((c) => c.id),
    happens: o.happens ?? '',
    should: '',
    where: '',
    notes: o.notes ?? [],
    problems: o.problems ?? [],
    shown: o.shown ?? state,
    changes,
  };
}

/** A draft as `readDrafts` gives it. */
const draft = (key, op, rest = {}, savedAt = '2026-11-18T10:00:00.000Z') => ({ key, op, ...rest, rev: 1, savedAt });

test('new requests wait beside the features, newest first', () => {
  const items = [
    item('export-a-note-as-pdf', { by: 'jdoe', created: '2026-11-16' }),
    item('pen-colour-presets', { by: 'tbrown', created: '2026-11-17' }),
    item('keep-links-when-exporting', { state: 'discussing', created: '2026-11-18' }),
    // Set to New, but its change is in progress: it shows In progress, not New.
    item('faster-first-sync', { created: '2026-11-19', changes: [{ id: 'first-sync', state: 'in-progress' }], shown: 'in-progress' }),
    item('dark-mode', { by: 'asmith', created: '2026-11-02' }),
    item('bigger-buttons', { by: 'asmith', created: '2026-11-02' }),
  ];
  const vm = backlogView({ items, drafts: [draft('d-1a2b3c4d5e6f', 'add', { title: 'Import a zip of Markdown files' })], me: 'asmith', features: FEATURES });
  assert.deepEqual(vm.waiting, ['pen-colour-presets', 'export-a-note-as-pdf', 'bigger-buttons', 'dark-mode']);
  assert.deepEqual(vm.waiting.map((id) => [vm.requests[id].title, vm.requests[id].by, vm.requests[id].created]), [
    ['pen-colour-presets', 'tbrown', '2026-11-17'],
    ['export-a-note-as-pdf', 'jdoe', '2026-11-16'],
    ['bigger-buttons', 'asmith', '2026-11-02'],
    ['dark-mode', 'asmith', '2026-11-02'],
  ]);
  // An unsent request is the person's own: it waits in the drafts, not in the owner's queue.
  assert.ok(!vm.waiting.includes('d-1a2b3c4d5e6f'));
  assert.deepEqual(backlogView({ items: [] }).waiting, []);
});

test('items show by state, done and parked behind a filter', () => {
  const items = [
    item('pen-colour-presets', { created: '2026-11-17' }),
    item('export-a-note-as-pdf', { created: '2026-11-16' }),
    item('keep-links-when-exporting', { state: 'discussing' }),
    item('sync-status-in-the-list', { state: 'ready' }),
    item('faster-first-sync', { state: 'ready', changes: [{ id: 'first-sync', state: 'in-progress' }], shown: 'in-progress' }),
    item('show-the-offline-banner-sooner', { changes: [{ id: 'offline-banner-delay', state: 'to-review' }], shown: 'to-review' }),
    item('share-to-email', { state: 'discussing', changes: [{ id: 'share-email', state: 'done' }], shown: 'done' }),
    item('handwriting', { state: 'parked' }),
  ];
  const vm = backlogView({ items });
  assert.deepEqual(vm.board.open.map((c) => [c.state, c.label, c.requests]), [
    ['new', 'New', ['pen-colour-presets', 'export-a-note-as-pdf']],
    ['discussing', 'Discussing', ['keep-links-when-exporting']],
    ['ready', 'Ready', ['sync-status-in-the-list']],
    ['in-progress', 'In progress', ['faster-first-sync']],
    ['to-review', 'To review', ['show-the-offline-banner-sooner']],
  ]);
  // Done and Parked are the columns behind the filter, and nowhere else.
  assert.deepEqual(vm.board.closed.map((c) => [c.state, c.label, c.requests]), [
    ['done', 'Done', ['share-to-email']],
    ['parked', 'Parked', ['handwriting']],
  ]);
  const open = vm.board.open.flatMap((c) => c.requests);
  assert.ok(!open.includes('share-to-email') && !open.includes('handwriting'));
  assert.deepEqual(vm.totals, { open: 6, closed: 2, unsent: 0 });
  assert.deepEqual(vm.states.filter((s) => s.closed).map((s) => s.id), ['done', 'parked']);
  assert.deepEqual(vm.states.filter((s) => s.set).map((s) => s.label), ['New', 'Discussing', 'Ready', 'Parked']);
  // The same columns from the requests alone.
  const { requests } = applyDrafts(items, []);
  assert.deepEqual(boardColumns(requests, { closed: true }), vm.board.closed);
});

test('a request added on the page is a draft in new', () => {
  const add = draft('d-0a1b2c3d4e5f', 'add', {
    title: 'Export a whole notebook as one file',
    happens: 'Each note exports on its own.',
    should: 'A notebook exports as one file.',
    where: 'The export menu.',
    about: ['editing/export'],
  });
  const items = [item('export-a-note-as-pdf', { created: '2026-11-16', about: ['editing/export'] })];
  const vm = backlogView({ items, drafts: [add], me: 'asmith', features: FEATURES });
  const r = vm.requests[add.key];
  assert.deepEqual(
    [r.draft, r.key, r.shown, r.label, r.state, r.by, r.created, r.title, r.happens, r.should, r.where, r.address],
    [true, add.key, 'new', 'New', 'new', 'asmith', null, 'Export a whole notebook as one file', 'Each note exports on its own.', 'A notebook exports as one file.', 'The export menu.', '/backlog/d-0a1b2c3d4e5f'],
  );
  assert.deepEqual(r.about, [{ id: 'editing/export', title: 'Export', exists: true }]);
  // In New, before the requests that were sent, and on the list of what is unsent.
  assert.deepEqual(vm.board.open[0].requests, [add.key, 'export-a-note-as-pdf']);
  assert.deepEqual(vm.drafts, [{ key: add.key, op: 'add', request: add.key, title: add.title, held: null, refused: null, missing: false, savedAt: add.savedAt }]);
  assert.deepEqual(vm.totals, { open: 1, closed: 0, unsent: 1 });
  assert.deepEqual(vm.byFeature['editing/export'], [add.key, 'export-a-note-as-pdf']);
});

test('a feature lists the requests about it that are not done', () => {
  const items = [
    item('export-a-note-as-pdf', { created: '2026-11-16', about: ['editing/export'] }),
    item('keep-links-when-exporting', { state: 'discussing', created: '2026-11-18', about: ['editing/export', 'sharing/links'] }),
    item('export-to-word', { state: 'parked', about: ['editing/export'] }),
    item('export-faster', { about: ['editing/export'], changes: [{ id: 'export-speed', state: 'done' }], shown: 'done' }),
    item('share-to-email', { about: ['sharing/links'], changes: [{ id: 'share-email', state: 'done' }], shown: 'done' }),
  ];
  const vm = backlogView({ items, features: FEATURES });
  const open = (f) => (vm.byFeature[f] ?? []).map((id) => [vm.requests[id].title, vm.requests[id].label, vm.requests[id].address]);
  assert.deepEqual(open('editing/export'), [
    ['export-a-note-as-pdf', 'New', '/backlog/export-a-note-as-pdf'],
    ['keep-links-when-exporting', 'Discussing', '/backlog/keep-links-when-exporting'],
    ['export-to-word', 'Parked', '/backlog/export-to-word'],
  ]);
  assert.deepEqual(open('sharing/links'), [['keep-links-when-exporting', 'Discussing', '/backlog/keep-links-when-exporting']]);
  assert.deepEqual(open('editing/offline-edits'), []);
  assert.equal(requestAddress('a b'), '/backlog/a%20b');
});

test('a request shows its notes in order with drafts last, its features, its changes and a held draft with both values', () => {
  const banner = item('show-the-offline-banner-sooner', {
    title: 'Show the offline banner sooner',
    by: 'jdoe',
    created: '2026-11-11',
    about: ['editing/offline-edits', 'gone/feature'],
    changes: [{ id: 'offline-banner-delay', state: 'to-review' }],
    shown: 'to-review',
    notes: [
      { by: 'asmith', at: '2026-11-12 10:04', text: 'Five seconds was a guess.' },
      { by: 'jdoe', at: '2026-11-12 14:31', text: 'Two customers mentioned it.' },
    ],
  });
  const undo = item('undo-after-closing-a-note', { title: 'Undo after closing a note', state: 'parked', by: 'tbrown', created: '2026-11-09' });
  const drafts = [
    draft('d-note', 'note', { id: banner.id, text: 'Could it say how many edits wait?' }),
    draft('d-edit', 'edit', { id: banner.id, field: 'title', from: banner.title, to: 'Show the offline banner within two seconds' }),
    draft('d-move', 'move', { id: undo.id, from: 'discussing', to: 'ready', held: { theirs: 'parked' } }),
  ];
  const vm = backlogView({ items: [banner, undo], drafts, me: 'asmith', features: FEATURES, heldBy: { 'd-move': 'tbrown' } });
  const r = vm.requests[banner.id];
  assert.deepEqual(r.notes.map((n) => [n.by, n.at, n.text, n.draft]), [
    ['asmith', '2026-11-12 10:04', 'Five seconds was a guess.', false],
    ['jdoe', '2026-11-12 14:31', 'Two customers mentioned it.', false],
    ['asmith', null, 'Could it say how many edits wait?', true],
  ]);
  assert.deepEqual(r.about, [{ id: 'editing/offline-edits', title: 'Offline edits', exists: true }, { id: 'gone/feature', title: 'gone/feature', exists: false }]);
  assert.deepEqual(r.changes, [{ id: 'offline-banner-delay', state: 'to-review', label: 'To review', draft: false }]);
  // A drafted edit shows what the person wrote, and names its draft.
  assert.equal(r.title, 'Show the offline banner within two seconds');
  assert.deepEqual(r.drafted, { title: 'd-edit' });
  assert.equal(r.unsent, 2);
  // A held move leaves the other person's value, and says both.
  const u = vm.requests[undo.id];
  assert.deepEqual([u.state, u.shown, u.label, u.drafted], ['parked', 'parked', 'Parked', {}]);
  assert.deepEqual(u.held, [{ key: 'd-move', field: 'state', theirs: 'parked', yours: 'ready', by: 'tbrown' }]);
  assert.deepEqual(vm.drafts.map((d) => [d.key, d.op, d.title, d.held]), [
    ['d-note', 'note', 'Show the offline banner within two seconds', null],
    ['d-edit', 'edit', 'Show the offline banner within two seconds', null],
    ['d-move', 'move', 'Undo after closing a note', { theirs: 'parked', yours: 'ready', by: 'tbrown' }],
  ]);
  assert.equal(vm.drafts[2].toLabel, 'Ready');
});

test('a drafted move shows the request where it was moved, unless a change decides its state', () => {
  const items = [
    item('pen-colour-presets', { created: '2026-11-17' }),
    item('faster-first-sync', { changes: [{ id: 'first-sync', state: 'in-progress' }], shown: 'in-progress' }),
  ];
  const drafts = [
    draft('d-1', 'move', { id: 'pen-colour-presets', from: 'new', to: 'discussing' }),
    draft('d-2', 'move', { id: 'faster-first-sync', from: 'new', to: 'parked' }),
    draft('d-3', 'note', { id: 'no-such-request', text: 'Gone?' }),
    draft('d-4', 'note', { id: 'pen-colour-presets', text: 'Kept back.' }, '2026-11-18T11:00:00.000Z'),
  ];
  drafts[3].refused = 'backlog/pen-colour-presets.md cannot be read';
  const vm = backlogView({ items, drafts, me: 'asmith' });
  assert.deepEqual(vm.board.open.map((c) => c.requests), [[], ['pen-colour-presets'], [], ['faster-first-sync'], []]);
  // The person moved it: it no longer waits for them.
  assert.deepEqual(vm.waiting, []);
  assert.deepEqual(vm.requests['faster-first-sync'].drafted, { state: 'd-2' });
  // A draft naming a request that is gone, and one Submit refused, stay on the list.
  assert.deepEqual(vm.drafts.filter((d) => d.missing).map((d) => [d.key, d.request, d.title]), [['d-3', 'no-such-request', null]]);
  assert.deepEqual(vm.requests['pen-colour-presets'].refused, [{ key: 'd-4', op: 'note', reason: drafts[3].refused }]);
  assert.equal(vm.requests['pen-colour-presets'].notes.length, 0);
});

test('the backlog says what cannot be read or reached', () => {
  const broken = item('hand-edited', { state: 'someday', shown: null, problems: [{ line: 4, message: 'state "someday" is not new, discussing, ready, parked' }] });
  const vm = backlogView({
    items: [broken, item('dark-mode')],
    drafts: [draft('d-1', 'add', { title: 'Dark mode everywhere' })],
    status: { state: 'unreachable', error: 'could not read from remote' },
    problems: ['notes.txt is not an item'],
    submit: { ok: false, unreachable: true, error: 'could not read from remote' },
  });
  assert.deepEqual(vm.board.unreadable, ['hand-edited']);
  assert.equal(vm.requests['hand-edited'].label, null);
  assert.deepEqual(vm.banners, [
    { kind: 'backlog-stale', error: 'could not read from remote' },
    { kind: 'backlog-branch', problems: ['notes.txt is not an item'] },
    { kind: 'backlog-format', requests: [{ id: 'hand-edited', title: 'hand-edited', message: broken.problems[0].message }] },
    { kind: 'submit-unreachable', drafts: 1, error: 'could not read from remote' },
  ]);
  assert.deepEqual(backlogView({ status: { state: 'unavailable', error: 'backlog.repo "x" is not an id' } }).banners, [{ kind: 'backlog-off', error: 'backlog.repo "x" is not an id' }]);
  assert.deepEqual(backlogView({ status: { state: 'absent' } }).banners, []);
  assert.deepEqual(backlogView({ submit: { ok: false, unreachable: false, error: 'git has no user.name' } }).banners, [{ kind: 'submit-failed', error: 'git has no user.name' }]);
});
