// A sample backlog for the page's tests: items as the backlog's library reads them, drafts as the
// drafts file holds them, turned into the backlog's view model by the map's own `backlogView`. The
// features it names are the sample overview's (`overview-v3.json`).
import { backlogView } from '../../lib/backlog-view.mjs';

/** An item as `withShownStates` gives it: the state it is set to shows unless it names a change. */
export function item(id, o = {}) {
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
    should: o.should ?? '',
    where: o.where ?? '',
    notes: o.notes ?? [],
    problems: o.problems ?? [],
    shown: o.shown ?? state,
    changes,
  };
}

/** A draft as `readDrafts` gives it. */
export const draft = (key, op, rest = {}, savedAt = '2026-11-18T10:00:00.000Z') => ({ key, op, ...rest, rev: 1, savedAt });

/** The requests the notes app's backlog holds, in every state. */
export const ITEMS = [
  item('show-the-offline-banner-sooner', {
    title: 'Show the offline banner sooner',
    by: 'jdoe',
    created: '2026-11-11',
    state: 'discussing',
    about: ['editing/offline-edits'],
    changes: [{ id: 'offline-banner-delay', state: 'to-review' }],
    shown: 'to-review',
    happens: 'The offline banner shows five seconds after the connection drops; people keep typing and think their edits are lost.',
    should: 'The banner shows within a second or two, and says the edits are kept.',
    where: 'Any open note, when the network drops.',
    notes: [
      { by: 'asmith', at: '2026-11-12 10:04', text: 'Five seconds was a guess. One second may flicker on a weak connection; let us try two.' },
      { by: 'jdoe', at: '2026-11-12 14:31', text: 'Two customers mentioned it this week. Either is better than five.' },
      { by: 'asmith', at: '2026-11-13 09:15', text: 'Started change `offline-banner-delay` from this request.' },
    ],
  }),
  item('pen-colour-presets', { title: 'Pen colour presets', by: 'tbrown', created: '2026-11-17' }),
  item('export-a-note-as-pdf', { title: 'Export a note as PDF', by: 'jdoe', created: '2026-11-16', about: ['sharing/share-links'] }),
  item('keep-links-when-exporting', { title: 'Keep links when exporting', state: 'discussing', about: ['sharing/share-links'] }),
  item('undo-after-closing-a-note', { title: 'Undo after closing a note', by: 'tbrown', created: '2026-11-09', state: 'discussing' }),
  item('sync-status-in-the-note-list', { title: 'Sync status in the note list', by: 'asmith', state: 'ready' }),
  item('faster-first-sync', { title: 'Faster first sync', state: 'ready', changes: [{ id: 'first-sync', state: 'in-progress' }], shown: 'in-progress' }),
  item('share-to-email', { title: 'Share to email', state: 'discussing', about: ['sharing/share-links'], changes: [{ id: 'share-email', state: 'done' }], shown: 'done' }),
  item('handwriting', { title: 'Handwriting', state: 'parked' }),
];

/** Three drafts: a new request, a note and a move. */
export const DRAFTS = [
  draft('d-1a2b3c4d5e6f', 'add', { title: 'Import a zip of Markdown files', about: ['importing/markdown-import'] }, '2026-11-18T09:00:00.000Z'),
  draft('d-2b3c4d5e6f70', 'note', { id: 'show-the-offline-banner-sooner', text: 'Could the banner also say how many edits are waiting to send?' }),
  draft('d-3c4d5e6f7081', 'move', { id: 'undo-after-closing-a-note', from: 'discussing', to: 'ready' }),
];

/** The backlog's view model over the sample's items and drafts, by `asmith`, about the map's features. */
export const sampleBacklog = (vm, o = {}) => backlogView({ items: ITEMS, drafts: DRAFTS, features: vm.features, me: 'asmith', where: { branch: 'backlog', repo: 'app' }, ...o });
