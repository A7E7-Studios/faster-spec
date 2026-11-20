import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTmp, project, land, git, writeFiles } from './helpers.mjs';
import { shownState, changeState, changeFacts, withShownStates, SHOWN_STATES } from '../lib/state.mjs';

const PROPOSAL = (title) => `---\ntitle: ${title}\ncapabilities:\n  - editing/export\n---\n# ${title}\n`;

test("an item's changes decide its shown state", () => withTmp((tmp) => {
  // Main's history: a change lands and is removed after review, another lands and stays; a third
  // is on a branch that never reached main. A second repository holds one change of its own.
  const app = project(tmp, 'notes-app');
  const [dir] = app.clones;
  land(dir, { 'changes/landed-then-removed/proposal.md': PROPOSAL('Done') }, 'land a change');
  land(dir, { 'changes/on-main/proposal.md': PROPOSAL('On main'), 'changes/on-main/tasks.md': '# Tasks\n' }, 'land another');
  land(dir, { 'changes/landed-then-removed': null }, 'approve it: the folder goes');
  git(dir, ['checkout', '-q', '-b', 'never-landed']);
  writeFiles(dir, { 'changes/never-landed/proposal.md': PROPOSAL('Still in review') });
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'a change on its branch']);
  git(dir, ['push', '-q', 'origin', 'HEAD:refs/heads/never-landed']);
  git(dir, ['checkout', '-q', 'main']);
  const api = project(tmp, 'notes-api');
  land(api.clones[0], { 'changes/api-side/proposal.md': PROPOSAL('API side') }, 'land on the api');
  for (const d of [dir, api.clones[0]]) git(d, ['fetch', '-q', 'origin']);
  const repos = [{ id: 'notes-app', dir }, { id: 'notes-api', dir: api.clones[0] }, { id: 'gone', dir: `${tmp}/missing` }];

  const facts = changeFacts(repos, ['landed-then-removed', 'on-main', 'never-landed', 'api-side']);
  assert.deepEqual(facts, {
    'landed-then-removed': { present: false, landed: true },
    'on-main': { present: true, landed: true },
    'never-landed': { present: false, landed: false },
    'api-side': { present: true, landed: true },
  });

  const shows = (state, change) => shownState({ state, change }, facts);
  // none: the state people set
  for (const s of ['new', 'discussing', 'ready', 'parked']) assert.equal(shows(s, []), s);
  // one whose folder is not on main: in progress, whatever else it names
  assert.equal(shows('ready', ['never-landed']), 'in-progress');
  assert.equal(shows('ready', ['on-main', 'never-landed', 'landed-then-removed']), 'in-progress');
  // none in progress, one whose folder is on main (in either repository): to review
  assert.equal(shows('ready', ['on-main', 'landed-then-removed']), 'to-review');
  assert.equal(shows('parked', ['api-side']), 'to-review');
  // every one landed on main and was removed since: done
  assert.equal(shows('ready', ['landed-then-removed']), 'done');

  const [item] = withShownStates([{ id: 'a', state: 'ready', change: ['on-main', 'landed-then-removed'] }], repos);
  assert.equal(item.shown, 'to-review');
  assert.deepEqual(item.changes, [{ id: 'on-main', state: 'to-review' }, { id: 'landed-then-removed', state: 'done' }]);
}));

test('a change is in progress until it lands, to review while its folder is on main, done once removed', () => {
  assert.equal(changeState(undefined), 'in-progress');
  assert.equal(changeState({ present: false, landed: false }), 'in-progress');
  assert.equal(changeState({ present: true, landed: true }), 'to-review');
  assert.equal(changeState({ present: false, landed: true }), 'done');
  assert.equal(shownState({ state: 'bogus', change: [] }), null);
  assert.deepEqual(SHOWN_STATES, ['new', 'discussing', 'ready', 'parked', 'in-progress', 'to-review', 'done']);
});

test('items that name no change read no history', () => {
  assert.deepEqual(changeFacts([{ dir: '/nowhere' }], []), {});
  const [item] = withShownStates([{ id: 'a', state: 'discussing', change: [] }], [{ dir: '/nowhere' }]);
  assert.equal(item.shown, 'discussing');
  assert.deepEqual(item.changes, []);
});
