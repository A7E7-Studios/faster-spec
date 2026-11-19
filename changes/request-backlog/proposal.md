---
title: A backlog for requests before they become changes
capabilities:
  - requests/backlog
  - overview/solution-map
  - overview/map-launcher
---
# A backlog for requests before they become changes

## Why

Requests reach the owner from people who never open the repositories: in chat, in meetings, in
passing. They have no place to land, be discussed and wait until the owner hands them to an agent,
so they get lost or retyped, and the spec skill starts from the owner's memory of them. A tracker
outside the repositories, such as a planner board or an issue tracker, cannot see the specs or the
changes, and its API makes agents second-class readers. The backlog keeps requests next to the specs
in git, readable by people on the Solution map and by agents as plain files, and the launcher opens
the map for people who are not developers.

## What changes

- Requests live on a branch of their own, by default `backlog` in the project's repository with no
  history shared with main, or another repository and branch the config names (The first item
  creates the branch; A project names another repository and branch; Main and every checkout stay
  untouched).
- A request is one file, `backlog/<id>.md`: the request, then its notes appended in order (A new
  item holds the request; A note is appended with its author and time; A write changes only the
  item's own file).
- Every write fetches, applies itself to the latest commit as an operation and pushes, so writes
  made at once never lose a note, and a field changed meanwhile is held, not overwritten (Two notes
  sent at once both arrive; A field changed meanwhile is held, not overwritten).
- People set New, Discussing, Ready and Parked; once a request names a change, its state follows
  that change's folders on main: In progress, To review, Done (A person moves an item; An item's
  changes decide what it shows).
- `node tools/backlog/backlog.mjs` lists, shows, adds, notes, moves and links, one commit per
  write (Each write command sends one commit; Show prints an item with its notes and its state;
  List filters by state).
- spec takes `backlog:<id>` and links the change back; triage lists New requests (A request
  becomes a change; New requests wait beside the features).
- The Solution map gains a Backlog view, New requests in Waiting for you, the open requests on each
  feature and Suggest a change (Items show by state; An item shows what became of it; A person adds
  a request; The backlog's branch does not exist yet; New requests wait beside the features; A
  feature lists its open requests; Suggest a change starts a request about the feature; Refresh
  shows what others sent to the backlog).
- What people write on the map waits as drafts until Submit, which sends one commit (Every view
  shows what is unsent; Drafts survive a restart; Submit sends every draft as one commit; A
  clashing draft stays unsent with both values; Submit without the network keeps the drafts; Only
  the map's own page can write).
- A printed setup command and a shortcut on Windows, macOS and Linux run the newest map from main,
  with Restart to update (the Map launcher's scenarios).

## Review

At a desk, with two clones of a sample project (a notes app and its backend). From each clone add
a request, write notes on the same one, move one to Ready, submit both at once, and make a clash on
one field. Open a feature, see its requests and Suggest a change. Run spec on `backlog:<id>` and
watch the request show In progress; land the change, then remove its folder, and watch To review
and Done. Under a second computer account with no checkout, run setup, open the shortcut, push a
map change to main and press Restart to update. Judge the views against the board design draws.

## Settled questions

- **Q1 Store**: a branch the config names, by default `backlog` in the project's own repository,
  sharing no history with main; no pull requests and no gate. Rejected: main, with a pull request
  per submit; always a separate repository.
- **Q2 Writing**: on the map, adds, notes, edits and moves wait as drafts on this computer, and
  Submit sends them as one commit; the command line writes at once. Rejected: every action pushes
  at once.
- **Q3 States**: people set New, Discussing, Ready and Parked; In progress, To review and Done
  follow from the request's changes and their folders on main. Rejected: every state stored and
  set by the skills.
- **Q4 Ready**: anyone who can push may set any state; the spec rounds' confirmation is the gate.
  Rejected: only owners named in the config.
- **Q5 Features**: both ways; a feature lists the open requests about it and offers Suggest a
  change. Rejected: the Backlog view only.
- **Q6 Agents**: spec takes `backlog:<id>` and links the change back; triage lists New requests.
  Rejected: an intake skill that picks up Ready requests, now; no agent hooks.
- **Q7 Launcher**: in this change. Rejected: a change of its own after this one.
- **Q8 Clash**: the other person's value stays; the clashing draft stays unsent showing both
  values, and the rest is sent. Rejected: the last submit wins.
- **Q9 Systems**: the launcher runs on Windows, macOS and Linux, its shortcut made for the system
  setup runs on. Rejected: Windows only.
- **Q10 Setup**: setup checks Git and Node 22, says what to install and where, and stops; it never
  installs software; it asks for a git name and email when none is set. Rejected: installing
  through the system's package manager.
- **Q11 Summary**: the owner confirmed the requirements, and asked how notes are stored (Q12).
- **Q12 Notes**: one file per request, notes appended to it; every write replays onto the latest
  commit, so appends never clash. Rejected: one file per note.
- **Q13 Look**: the board; a request opens the way established task tools open an item from a
  board, not in a side sheet (the owner's words: "I would actually go with the board approach for
  this one. Not sure about a side panel for the details of a task. I would rather follow best
  practices from Jira or other task tools"). Rejected: a third tab with a list and detail pane; a
  board with a side sheet; a conversation thread.
- **Q14 Look D**: the board with a centred two-column request dialog, as drawn, with everything
  not strictly needed removed from view ("Simple, clean, minimal"). Rejected: changes to D.
- **Q15 Repositories**: each `solutionMap.repos` entry may carry its clone address; setup clones
  every one that does. Rejected: setup clones only the backlog's repository.
- **Q16 Setup command**: `setup.mjs --print-command` prints one command per system for a project's
  README or a message. Rejected: steps in the README.

## Calls for the owner

- **Change id** `request-backlog`, not `backlog`: the feature's own default branch is `backlog`.
- **Domain**: a new domain, Requests, holds `requests/backlog`; the launcher is
  `overview/map-launcher`, in the map's domain. Moving either is a rename of its folder.
- **The overview's JSON stays as it is** (version 3): the map and triage read the backlog through
  `tools/backlog`. Putting requests in the index instead means a version 4 and the map reading it.
- **Where the launcher lives**: `tools/solution-map/launcher/`, so every project that syncs the
  map gets it without a new path in `kit.json`.
- **Ids** are kebab-case, taken from the title and made unique; spec takes a request's id as the
  change id when it is free. Opaque numbers instead would read worse in a file list.
- **Notes** carry the author's git name and the time in UTC. A GitHub account name instead would
  need the network to read it.
- **Editing and removing**: the backlog and the map's drafts take an edit of a request's text from
  anyone who can push, and git history keeps the old text, but no view offers one: the boards draw
  no edit control and the command line has no `edit`. Nothing is deleted; Parked takes its place. A
  delete would need its own rule for the history.
- **Done and Parked stay** in the tree, shown behind a filter. Removing them would make the branch
  forget who asked.
- **Search** stays on features; requests are found on the Backlog view.
- **The map now writes**, reversing the Solution map's own "the page writes nothing" (its change's
  Q4): to the backlog's branch only, only on Submit, only from the map's own page.
- **The branch's rules**: the first write creates it; the README advises a branch rule against
  force-pushes and deletion. The kit sets no rule itself.
- **A newer map** for Restart to update means main changed what the map runs from
  (`tools/solution-map/`, `tools/backlog/`, `tools/overview/`, `tools/gate/lib/`,
  `tools/gate/config.json`), not any commit.
- **`specs/systems.json`**: `tools/backlog/` joins a new system, Backlog; `tools/solution-map/`
  gets the system it lacks, Solution map. Ship adds both.

## Out of scope

- Hosting the map behind a sign-in for people without repository access; the backlog's store keeps
  room for a hosted one, a later change.
- Notifications of new requests or notes.
- An intake skill that picks up Ready requests on its own.
- Uploaded files on requests: links only, since git history is permanent.
- Deleting requests, and a Ready that only some people may set.
- Editing the backlog's branch by hand with plain git: it works, but nothing guards it.
