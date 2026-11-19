# Backlog

The backlog's library and command line: requests that wait before they become a change, one file
each on a branch of their own, read through git objects and written by git plumbing alone. The
Solution map's server calls the library; agents and scripts use the command line. What it does for
a person: the kit's spec `requests/backlog`.

No npm dependencies; Node 22 or later; Git 2.29 or later (it fetches with
`--no-write-fetch-head`). It imports the gate's library alone: front matter from
[`tools/gate/lib/spec.mjs`](../gate/lib/spec.mjs), git from
[`tools/gate/lib/git.mjs`](../gate/lib/git.mjs), and the config and the solution's repositories from
[`tools/gate/lib/repos.mjs`](../gate/lib/repos.mjs).

```
node tools/backlog/backlog.mjs list [--state <state>] [--json]
node tools/backlog/backlog.mjs show <id> [--json]
node tools/backlog/backlog.mjs add <title> [--about <feature-id>]... [--happens <text>] [--should <text>] [--where <text>] [--json]
node tools/backlog/backlog.mjs note <id> <text>
node tools/backlog/backlog.mjs move <id> <new|discussing|ready|parked>
node tools/backlog/backlog.mjs link <id> <change-id>
```

| Command | Does, and prints |
|---|---|
| `list` | every request, newest first: its id, the state it shows, its title, who asked and when; `--state` keeps those showing that state (`new`, `discussing`, `ready`, `parked`, `in-progress`, `to-review`, `done`) |
| `show <id>` | one request: its fields, the request, its notes in order, the state it shows and each change it names with that change's state |
| `add <title>` | a new request in New, by your git name, about the features `--about` names; prints its id |
| `note <id> <text>` | appends a note by your git name at the time in UTC; text `-` reads it from stdin |
| `move <id> <state>` | sets the state people set, whatever it holds |
| `link <id> <change-id>` | names a change the request led to |

`--json` prints JSON: `list` an array of `{ id, title, by, created, state, shown, about, change }`,
with `problems` on an item that does not read;
`show` the item as the library reads it (below) with `shown` and `changes: [{ id, state }]`; `add`
`{ id, commit }`. A read fetches the backlog's branch, then each repository (`git fetch origin`);
when the branch cannot be fetched it reads what this clone last fetched, and says so on stderr.
Each write sends exactly one commit; a write that changes nothing (a move to the state it holds, a
change already named) sends none.

Exit: **0** done, **1** nothing sent or no such request (the reason on stderr), **2** usage error.

## Where the backlog lives

```json
{ "backlog": { "repo": "notes-api", "branch": "requests" } }
```

Both keys of `tools/gate/config.json`'s `backlog` are optional. `repo` is an id in
`solutionMap.repos`; without it, the repository the tool runs in (the work tree holding the folder,
else the git directory holding it, else the first of the map's repositories). `branch` defaults to
`backlog`, and is never `main`, `master` or `HEAD`.

The branch is the backlog's only shared state. Its first write creates it with a commit of no
parent, so it shares no history with main. It holds `backlog/<id>.md` files and nothing else; a
branch holding anything else is no backlog, and nothing is written to it. A project should protect
it with a branch rule against force-pushes and deletion; the kit sets none. A clone that still holds
a branch deleted on the remote brings it back, history and all, with its next write.

## The item file

```
---
title: Export a note as PDF
by: <git user.name>
created: <YYYY-MM-DD>
state: new
about:
  - editing/export
change:
  - export-pdf
---

## What happens

Sharing a note sends a link only.

## What should happen

Share offers PDF.

## Where

The share sheet on a note.

## Notes

### <git user.name> · <YYYY-MM-DD HH:MM> UTC

The note's text.
```

| Part | Holds |
|---|---|
| `title` | one line |
| `by`, a note's name | the writer's git `user.name` |
| `created`, a note's time | the date, and the time to the minute, in UTC |
| `state` | the state people set: `new`, `discussing`, `ready`, `parked` |
| `about` | feature ids, `<domain>/<capability>`; may be empty |
| `change` | the ids of the changes it led to; may be empty |
| `## What happens`, `## What should happen`, `## Where` | the request, any Markdown; each may be empty |
| `## Notes` | the notes in the order they arrived, each under its `###` heading |

- **Ids** are the title in kebab-case, accents folded to ASCII, at most 60 characters, cut at a word;
  `-2`, `-3` when taken, and `new`, the map's address of a request being written, always is. A
  title with no letter or digit gives `request`. An id is given when the write is replayed, so a
  draft has none until it is sent.
- **A person's text cannot break the file**: a line that would read as a section (`## `), or in a
  note as a note heading (`### `), is written with a backslash before its `#` and read back
  without it; a code fence left open is closed.
- **A file that does not read as the format** (a hand edit) reads as an item with its `problems`,
  `[{ line, message }]`: the map shows it, and every write to it is refused until it is fixed.
  Writing what was read gives the same text back.

## A write

Every write is a list of operations, replayed onto the branch's latest commit:

| Operation | Does |
|---|---|
| `{ op: 'add', key?, title, happens?, should?, where?, about? }` | a new request in New; `key` names it for the operations sent with it |
| `{ op: 'note', id \| ref, text }` | appends a note; never clashes |
| `{ op: 'edit', id \| ref, field, from?, to }` | sets `title`, `happens`, `should`, `where` or `about` |
| `{ op: 'move', id \| ref, from?, to }` | sets the state |
| `{ op: 'link', id \| ref, change }` | names a change, once |

`id` is a request on the branch, `ref` the `key` of an `add` in the same write. An edit or a move
whose field holds neither its `from` nor its `to` is **held**: the field keeps the other person's
value, the result carries it as `theirs`, and the rest of the write is applied. Without `from` it
sets the field whatever it holds, as the command line's `move` does.

One write is one commit: `git fetch origin +refs/heads/<branch>:refs/remotes/origin/<branch>`; a
temporary index (`GIT_INDEX_FILE`) filled by `read-tree <tip>`; `hash-object -w` each changed file;
`update-index`; `write-tree`; `commit-tree -p <tip>`; `push origin <commit>:refs/heads/<branch>`.
The author and committer are the repository's `user.name` and `user.email`; with either unset
nothing is written. The subject counts what was applied, `<name>: 1 new request, 2 notes, 1 move`
(edits and links too), and the body has a line per operation (`add <id>: <title>`, `note <id>`,
`edit <id>: <field>`, `move <id>: <from> -> <to>`, `link <id>: <change>`).

Each fetch and push may take 60 s. A push refused because someone pushed first fetches and
replays, five tries in all. A push that reports failure though it landed (it timed out, or the
connection went once the remote had it) is sent: the branch fetched then holds its commit, as its
tip or beneath it, and nothing is replayed, so no note arrives twice and no request is added again.
Any other failure, a remote that cannot be reached or a push refused while the branch did not move,
sends nothing and reports `unreachable`. No write touches main, a checkout's HEAD, index, branches
or files; it moves only this clone's `refs/remotes/origin/<branch>`. Fetch the backlog after the
repositories' own fetch, never beside it: two fetches in one repository race for its refs.

## The state an item shows

| The item's changes | It shows |
|---|---|
| none | the state people set |
| one whose folder never landed on main | `in-progress` |
| none in progress, one whose folder is on main | `to-review` |
| every one's folder landed on main and was removed since | `done` |

Read from `origin/main` of every repository in the solution: a change's folder is there now
(`changes/<id>/`), or its `proposal.md` was added on main's first-parent history and the folder is
gone. A change across repositories counts in any of them.

## Drafts

What a person writes on the map waits in `<git common dir>/faster-spec/backlog-drafts.json` of the
backlog's repository: per clone and shared by its worktrees, never committed, out of `git status`,
kept across restarts. `{ "version": 1, "drafts": [<operation> + { key, rev, savedAt }] }`, oldest
first. Submit sends every draft as one write: a sent draft goes, and a draft naming a sent request
by `ref` names it by its `id`; a held one stays with `held: { theirs }`, a refused one with
`refused: <reason>`; a draft saved while the write was out stays as saved; when nothing could be
sent, every draft stays. Submits of one clone run one after the other.

## Library

| Module | Exports |
|---|---|
| `lib/store.mjs` | `locateBacklog({ config, repos, root })` → `{ dir, branch, repo }`; `backlogConfig(config)` → `{ repo, branch }`; `fetchBacklog(where)` → `{ state: 'current' \| 'absent' \| 'unreachable', tip, error? }`; `readBacklog(where, { tip? })` → `{ tip, items, problems }`; `writeBacklog(where, ops, { now? })` → `{ ok: true, commit, results }` or `{ ok: false, unreachable, error }`; `gitIdentity(dir)`; `backlogTip(where)` |
| `lib/state.mjs` | `withShownStates(items, repos)` → items with `shown` and `changes: [{ id, state }]`; `shownState(item, facts)`; `changeState(fact)`; `changeFacts(repos, ids)`; `SHOWN_STATES`; `STATE_LABELS` |
| `lib/drafts.mjs` | `readDrafts(dir)`; `saveDraft(dir, draft)` → `{ draft, drafts }` (a `key` changes that draft); `dropDraft(dir, key)` → drafts left (an `add` takes the drafts naming it); `submitDrafts(where, { now? })` → `{ ok, commit, sent, held, refused, drafts, unreachable?, error? }`; `draftsPath(dir)` |
| `lib/ops.mjs` | `applyOps(tip, ops, { name, now })` → `{ files, results }`; `opProblem(op)`; `fieldOf(op)`, the field a move (`state`) or an edit sets; `summary(results)`; `commitMessage(name, results)` |
| `lib/item.mjs` | `parseItem(text, { id })`; `writeItem(item)`; `newId(title, taken)`; `itemProblem(item)`; `SET_STATES`; `SECTIONS` |

`where` is `{ dir, branch }`, as `locateBacklog` gives it. An item is `{ id, path, title, by,
created, state, about, change, happens, should, where, notes: [{ by, at, text }], problems }`. A
write's `results` hold one entry per operation, in order: `{ op, status, id?, before?, theirs?,
reason? }`, `status` one of `applied`, `unchanged`, `held`, `refused`. `fetchBacklog`,
`writeBacklog` and `submitDrafts` take `net`, the runner for git's network commands, with the
signature of `gitAsync` in `tools/gate/lib/git.mjs`.

For the map: `GET /api/backlog` is `readBacklog` + `withShownStates` + `readDrafts`; `POST
/api/drafts` is `saveDraft` or `dropDraft`; `POST /api/submit` is `submitDrafts`; Refresh calls
`fetchBacklog` after the repositories' fetch.

## Files

| Path | What |
|---|---|
| `backlog.mjs` | the command line |
| `lib/item.mjs` | the item file: parse, write, ids |
| `lib/ops.mjs` | operations and their replay onto the tip; the commit message |
| `lib/state.mjs` | the state an item shows, and the facts of its changes on main |
| `lib/store.mjs` | the branch: where it lives, fetch, read, write |
| `lib/drafts.mjs` | the drafts file and Submit |
| `test/` | `node --test`, against throwaway origins and clones in the OS temp folder |
