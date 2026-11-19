import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withTmp, project, land, commits } from './helpers.mjs';
import { writeBacklog } from '../lib/store.mjs';
import { parseArgs } from '../backlog.mjs';

const CLI = fileURLToPath(new URL('../backlog.mjs', import.meta.url));
const PROPOSAL = '---\ntitle: A change\ncapabilities:\n  - editing/export\n---\n# A change\n';

/** Runs the command line in `cwd`, as a person or an agent would. */
function cli(cwd, args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, input, encoding: 'utf8', windowsHide: true });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('each write command sends one commit', () => withTmp(async (tmp) => {
  const { origin, clones: [dir] } = project(tmp);
  const sent = [];
  const expectOne = (args, subject, input) => {
    const r = cli(dir, args, input);
    assert.equal(r.code, 0, r.err);
    const history = commits(origin, 'backlog');
    assert.equal(history.length, sent.length + 1, `${args[0]} sends one commit`);
    assert.equal(history[0].author, 'Pat Example');
    assert.equal(history[0].subject, subject);
    sent.push(history[0]);
    return { ...r, commit: history[0] };
  };
  const add = expectOne(['add', 'Export a note as PDF', '--about', 'editing/export', '--happens', 'Only a link.', '--should', 'A PDF.', '--where', 'Share'], 'Pat Example: 1 new request');
  assert.equal(add.out.trim(), 'export-a-note-as-pdf');
  assert.equal(add.commit.body, 'add export-a-note-as-pdf: Export a note as PDF');
  const id = add.out.trim();
  expectOne(['note', id, 'Asked twice this week.'], 'Pat Example: 1 note');
  expectOne(['note', id, '-'], 'Pat Example: 1 note', 'Read from stdin,\nwith two lines.\n');
  const move = expectOne(['move', id, 'ready'], 'Pat Example: 1 move');
  assert.equal(move.commit.body, `move ${id}: new -> ready`);
  const link = expectOne(['link', id, 'export-pdf'], 'Pat Example: 1 link');
  assert.equal(link.commit.body, `link ${id}: export-pdf`);
  const json = expectOne(['add', 'Dark mode', '--json'], 'Pat Example: 1 new request');
  assert.deepEqual(JSON.parse(json.out), { id: 'dark-mode', commit: json.commit.sha });

  // A write that changes nothing sends nothing; one that cannot apply says why.
  for (const [args, code] of [[['move', id, 'ready'], 0], [['link', id, 'export-pdf'], 0], [['note', 'no-such-request', 'x'], 1], [['move', id, 'done'], 1]]) {
    const r = cli(dir, args);
    assert.equal(r.code, code, `${args.join(' ')}: ${r.err}`);
  }
  assert.equal(commits(origin, 'backlog').length, sent.length);
  assert.equal(cli(dir, ['move', id]).code, 2);
  assert.equal(cli(dir, ['frobnicate']).code, 2);
}));

test('show prints the item, its notes and its shown state', () => withTmp(async (tmp) => {
  const { clones: [pat, sam] } = project(tmp, 'notes-app', { people: ['Pat Example', 'Sam Example'] });
  const id = cli(pat, ['add', 'Export a note as PDF', '--about', 'editing/export', '--happens', 'Only a link.', '--should', 'A PDF.', '--where', 'Share']).out.trim();
  assert.equal(cli(pat, ['note', id, 'First.']).code, 0);
  assert.equal(cli(sam, ['note', id, 'Second, from another clone.']).code, 0);
  assert.equal(cli(sam, ['link', id, 'export-pdf']).code, 0);
  // The change lands on main from somewhere else: show fetches it.
  land(sam, { 'changes/export-pdf/proposal.md': PROPOSAL }, 'land the change');

  const r = cli(pat, ['show', id, '--json']);
  assert.equal(r.code, 0, r.err);
  const item = JSON.parse(r.out);
  assert.equal(item.id, id);
  assert.equal(item.title, 'Export a note as PDF');
  assert.equal(item.by, 'Pat Example');
  assert.match(item.created, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(item.state, 'new');
  assert.equal(item.shown, 'to-review');
  assert.deepEqual(item.about, ['editing/export']);
  assert.deepEqual(item.change, ['export-pdf']);
  assert.deepEqual(item.changes, [{ id: 'export-pdf', state: 'to-review' }]);
  assert.deepEqual([item.happens, item.should, item.where], ['Only a link.', 'A PDF.', 'Share']);
  assert.deepEqual(item.notes.map((n) => [n.by, n.text]), [['Pat Example', 'First.'], ['Sam Example', 'Second, from another clone.']]);
  for (const n of item.notes) assert.match(n.at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.deepEqual(item.problems, []);

  const text = cli(pat, ['show', id]);
  assert.equal(text.code, 0, text.err);
  assert.match(text.out, /^Export a note as PDF\n/);
  assert.match(text.out, /To review \(set: New\) · asked by Pat Example/);
  assert.match(text.out, /Changes: export-pdf \(To review\)/);
  assert.ok(text.out.indexOf('First.') < text.out.indexOf('Second, from another clone.'));
  assert.equal(cli(pat, ['show', 'no-such-request']).code, 1);
}));

test('list filters by the state an item shows', () => withTmp(async (tmp) => {
  const { clones: [dir] } = project(tmp);
  land(dir, { 'changes/on-main/proposal.md': PROPOSAL, 'changes/landed-then-removed/proposal.md': PROPOSAL }, 'two changes land');
  land(dir, { 'changes/landed-then-removed': null }, 'one is approved');
  const w = await writeBacklog({ dir, branch: 'backlog' }, [
    { op: 'add', key: 'n', title: 'A new one' },
    { op: 'add', key: 'd', title: 'Being discussed' },
    { op: 'move', ref: 'd', to: 'discussing' },
    { op: 'add', key: 'r', title: 'Ready to go' },
    { op: 'move', ref: 'r', to: 'ready' },
    { op: 'add', key: 'p', title: 'Parked for now' },
    { op: 'move', ref: 'p', to: 'parked' },
    { op: 'add', key: 'i', title: 'Being built' },
    { op: 'link', ref: 'i', change: 'never-landed' },
    { op: 'add', key: 't', title: 'Waiting for review' },
    { op: 'link', ref: 't', change: 'on-main' },
    { op: 'add', key: 'x', title: 'All done' },
    { op: 'link', ref: 'x', change: 'landed-then-removed' },
  ]);
  assert.equal(w.ok, true);
  const expect = {
    new: 'a-new-one',
    discussing: 'being-discussed',
    ready: 'ready-to-go',
    parked: 'parked-for-now',
    'in-progress': 'being-built',
    'to-review': 'waiting-for-review',
    done: 'all-done',
  };
  for (const [state, id] of Object.entries(expect)) {
    const r = cli(dir, ['list', '--state', state, '--json']);
    assert.equal(r.code, 0, r.err);
    const items = JSON.parse(r.out);
    assert.deepEqual(items.map((i) => [i.id, i.shown]), [[id, state]], state);
    assert.equal(items[0].by, 'Pat Example');
    assert.match(items[0].created, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(items[0].title);
  }
  assert.equal(JSON.parse(cli(dir, ['list', '--json']).out).length, 7);
  const text = cli(dir, ['list', '--state', 'new']);
  assert.match(text.out, /^a-new-one\s+New\s+A new one\s+\(Pat Example, \d{4}-\d{2}-\d{2}\)\n$/);
  assert.equal(cli(dir, ['list', '--state', 'bogus']).code, 2);
}));

test('the command line takes the commands, arguments and options it lists, and no others', () => {
  assert.deepEqual(parseArgs(['add', 'T', '--about', 'a/b', '--about', 'c/d', '--happens', 'h', '--json']), { cmd: 'add', args: ['T'], about: ['a/b', 'c/d'], json: true, help: false, happens: 'h' });
  assert.deepEqual(parseArgs(['note', 'x', '--', '--starts with dashes']).args, ['x', '--starts with dashes']);
  assert.equal(parseArgs([]).help, true);
  assert.throws(() => parseArgs(['note', 'x', 'y', '--json']), /note takes no --json/);
  assert.throws(() => parseArgs(['show']), /show takes 1 argument/);
  assert.throws(() => parseArgs(['list', '--state']), /--state needs a value/);
  assert.throws(() => parseArgs(['list', '--state', 'later']), /--state is one of/);
  assert.throws(() => parseArgs(['delete', 'x']), /unknown command/);
});
