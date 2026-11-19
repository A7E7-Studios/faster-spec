// The state an item shows: the one people set, until it names a change; then what became of its
// changes, read from their folders on main in every repository of the solution.
import fs from 'node:fs';
import { Repo } from '../../gate/lib/git.mjs';
import { SET_STATES } from './item.mjs';

/** Every state an item shows: the four people set, then the three its changes give. */
export const SHOWN_STATES = [...SET_STATES, 'in-progress', 'to-review', 'done'];
export const STATE_LABELS = {
  new: 'New',
  discussing: 'Discussing',
  ready: 'Ready',
  parked: 'Parked',
  'in-progress': 'In progress',
  'to-review': 'To review',
  done: 'Done',
};

/**
 * One change's state from its facts: its folder on main now gives `to-review`; landed on main and
 * removed since gives `done`; never landed gives `in-progress`.
 * @param {{ present?: boolean, landed?: boolean }} [fact]
 */
export function changeState(fact) {
  if (fact?.present) return 'to-review';
  if (fact?.landed) return 'done';
  return 'in-progress';
}

/**
 * The state an item shows. No change: the state people set (null when the file holds none it
 * may). Else any change in progress gives `in-progress`; else any on main gives `to-review`; else
 * every one landed and was removed: `done`.
 * @param {{ state: string, change?: string[] }} item
 * @param {Record<string, { present: boolean, landed: boolean }>} facts per change id
 */
export function shownState(item, facts = {}) {
  const ids = item.change ?? [];
  if (!ids.length) return SET_STATES.includes(item.state) ? item.state : null;
  const states = ids.map((id) => changeState(facts[id]));
  if (states.includes('in-progress')) return 'in-progress';
  if (states.includes('to-review')) return 'to-review';
  return 'done';
}

/**
 * What main says of each change id, across the solution's repositories: `present`, its folder
 * `changes/<id>/` is on `ref` now in any of them; `landed`, its `proposal.md` was added on `ref`'s
 * first-parent history in any of them (or the folder is there now). A repository that is missing,
 * or has no `ref`, says nothing.
 * @param {{ dir: string }[]} repos
 * @param {string[]} ids
 * @param {{ ref?: string }} [o]
 * @returns {Record<string, { present: boolean, landed: boolean }>}
 */
export function changeFacts(repos, ids, { ref = 'origin/main' } = {}) {
  const facts = Object.fromEntries(ids.map((id) => [id, { present: false, landed: false }]));
  if (!ids.length) return facts;
  for (const { dir } of repos) {
    if (!fs.existsSync(dir)) continue;
    const repo = new Repo(dir);
    const tip = repo.resolve(ref);
    if (!tip) continue;
    const { dirs } = repo.tree(tip);
    // One walk of main's first parents for every change at once; a renamed folder lands anew.
    const out = repo.git(['-c', 'log.follow=false', 'log', '--first-parent', '--no-renames', '--diff-filter=A', '--name-only', '--format=', tip, '--', ':(glob)changes/*/proposal.md']);
    const landed = new Set();
    for (const l of out.split('\n')) {
      const m = /^changes\/([^/]+)\/proposal\.md$/.exec(l.trim());
      if (m) landed.add(m[1]);
    }
    for (const id of ids) {
      const here = dirs.has(`changes/${id}`);
      if (here) facts[id].present = true;
      if (here || landed.has(id)) facts[id].landed = true;
    }
  }
  return facts;
}

/**
 * Items with what they show: each gains `shown` (its shown state) and `changes`, each change it
 * names with its state ([{ id, state }]).
 * @param {object[]} items as `parseItem` reads them
 * @param {{ dir: string }[]} repos the solution's repositories
 * @param {{ ref?: string }} [o]
 */
export function withShownStates(items, repos, { ref } = {}) {
  const ids = [...new Set(items.flatMap((i) => i.change ?? []))];
  const facts = changeFacts(repos, ids, { ref });
  return items.map((i) => ({
    ...i,
    shown: shownState(i, facts),
    changes: (i.change ?? []).map((id) => ({ id, state: changeState(facts[id]) })),
  }));
}
