# Solution map

A local web page over the [overview](../overview/README.md)'s index and the
[backlog](../backlog/README.md): what waits for the owner (features to review, new requests),
every feature by domain or by the system it ships in, how well each is tested, and the requests
people raise. It serves on 127.0.0.1 only and deploys nothing. The one thing it writes is the
backlog's branch, only when a person presses Submit on the map's own page. People who are not
developers open it from a shortcut that runs the newest map from main ([Launcher](#launcher)). What
it does for a person: the kit's specs `overview/solution-map` and `overview/map-launcher`.

No npm dependencies; Node 22 or later; Git 2.29 or later (`GIT_MIN` in `launcher/setup.mjs`). It
reads the overview's JSON **version 3** only.

```
node tools/solution-map/solution-map.mjs [--repo <id>=<folder>]... [--port <n>] [--pages <address>] [--no-open]
node tools/solution-map/solution-map.mjs --from <overview.json> [--port <n>] [--no-open]
```

| Option | Does |
|---|---|
| `--repo <id>=<folder>` | a repository to read, any number; without it, `solutionMap.repos` in the project's `tools/gate/config.json` |
| `--port <n>` | the port on 127.0.0.1; default 7317, or the next free one of the 20 after it. A launched map first waits up to 10 s for it, which the map a restart replaces may still hold |
| `--pages <address>` | the base address a Looks `page:` path is joined to; default `solutionMap.pages` |
| `--from <file>` | serve a saved overview instead of fetching and building one; boards are not served, and there is no backlog |
| `--no-open` | do not open the browser |
| `--launched <tree id>`, `--root <folder>` | given by the launcher, both or neither: the tree id of main's map code this map runs, and the clone it runs for. They make it a launched map: [Restart to update](#launcher), and the theme from that clone's `origin/main`; it ends when the launcher waiting on it goes |

Exit: **2** on a usage error or a port it cannot listen on; **75** (`RESTART_CODE`) for Restart to
update; otherwise it runs until stopped.

## Config

```json
{ "solutionMap": { "repos": [{ "id": "app", "path": "." }, { "id": "api", "path": "../notes-api" }], "pages": "http://localhost:5173" } }
```

`path` is relative to the repository the command runs in; an entry's optional `url` is the address
the launcher's setup clones it from ([Launcher](#launcher)). `pages` is optional, and so is
`review.app`, the CueReview program Start review opens; without it, CueReview's default install:
`%LOCALAPPDATA%\Programs\CueReview\cuereview.exe` on Windows, the CueReview app on macOS,
`cuereview` on PATH on Linux. Where the backlog lives is `backlog { repo, branch }`
([the backlog's config](../backlog/README.md#where-the-backlog-lives)); a value it refuses leaves
the map without a backlog, and a banner says why.

## What one build does

On start, on opening the page and on Refresh:

1. **Fetch** each repository (`git fetch origin`, 20 s, in parallel), and a launched map's clone
   when the config does not name it. A repository with no `origin/main` is `missing`; one whose
   fetch fails is `stale` and keeps its existing `origin/main`, with the time of its last good
   fetch (`FETCH_HEAD`'s modification time).
2. **Fetch the backlog's branch** (`fetchBacklog`), after the repositories' fetch and never beside
   it: two fetches in one repository race for its refs. It is `current`, `absent` (nobody has sent
   a request yet) or `unreachable` (what this clone last fetched shows, or no folder there).
3. **Bring the blobs** a clone made without them lacks, in one request per clone fetched now
   (`prefetchClone`, with the launcher's `missingObjects` and `fetchObjects`: `rev-list --objects
   --missing=print`, then `fetch --filter=blob:none --stdin`): every file of `origin/main`, since
   the overview lists the tree with each file's size and git answers that by fetching the file;
   every version of each spec on main's first-parent history, whose diffs the overview's review
   stamp searches; and the backlog's items at its tip, with the clone it lives in. Left to git,
   each file or commit would be a request of its own. A full clone skips this.
4. **Build** the overview in the process (`buildOverview` from `tools/overview`) over every
   repository that is not missing, at `origin/main`. Another version than 3 gives a banner and an
   empty map.
5. **Ask** each Looks page address once whether it answers (`HEAD`, 2 s).
6. **Adapt** the index into the view model the page draws (`lib/adapt.mjs`, the only code that
   reads the overview's fields).
7. **For a launched map**, take the tree id of the map's code on its clone's `origin/main`, as the
   launcher takes it (`mainMapTree`); when it is not `--launched`'s, the model's `banners` start
   with `{ kind: 'map-update', tree }`.

The backlog is read from this clone's git objects at each `GET /api/backlog`, so a draft saved or a
Submit made shows at once; its items' shown states are read again when the branch or a build
moves. Fetches and Submit's push take turns.

## Routes

| Route | Sends | Answers |
|---|---|---|
| `GET /api/map` | | the map's view model (`lib/adapt.mjs`) |
| `POST /api/refresh` | | builds again (above); the map's view model |
| `POST /api/review` | | opens CueReview: `{ ok, error? }` |
| `GET /api/backlog` | | the backlog's view model (below) |
| `POST /api/drafts` | `{ "save": <operation> }` adds a draft, and with the draft's `key` changes it; `{ "drop": "<key>" }` drops it (an unsent request with the drafts naming it); `{ "apply": "<key>" }` applies a held draft again over the other person's value | `{ ok: true, draft, backlog }`; a draft that is not one: `400 { ok: false, error }`; while a Submit is out: `409 { ok: false, error }` (`SENDING`), nothing changed |
| `POST /api/submit` | `{}` | `{ ok, unreachable, error, commit, sent: [{ key, op, id }], held: [{ key, op, id, field, theirs, yours }], refused: [{ key, op, reason }], backlog }`; `ok` false when nothing was sent, every draft kept; once a restart is under way: `409 { ok: false, error }` |
| `POST /api/restart` | `{}` | a launched map: `{ ok: true }`, then [Restart to update](#launcher); any other, one no launcher waits on, or a restart under way: `409 { ok: false, error }` |
| `GET /board/<repo>/<path>?section=<id>` | | a board at the commit read |

- **Only the map's own page writes.** Every POST needs the header `x-solution-map: 1`, which a
  page of another site cannot send without the browser asking this server first, and it never says
  yes; a `Host` of `127.0.0.1` or `localhost` at the map's port; and no `Origin` but the map's own.
  A draft, a Submit or a restart is `application/json` of at most 256 KiB. Anything else is refused
  (403, 415, 413, 400), and nothing is kept or sent. A map without a backlog answers 409.
- **An operation** is the backlog's ([A write](../backlog/README.md#a-write)). A move or an edit
  of a sent request saved without `from` takes the value the map last read, a changed draft keeps
  its own, and a held draft changed again takes the other person's value it was held over, the one
  the page shows; so Submit holds it only when someone changed the field meanwhile.
- **A Submit out holds the drafts still.** From the moment the map takes a Submit until it is done,
  no draft is saved, dropped or applied again (409): Submit sends the drafts as it read them and
  clears what it sent, so a draft changed meanwhile, an unsent request's form above all, would stay
  a draft and be sent a second time.
- **Drafts** live in the backlog's repository's git directory, per clone, out of `git status`, kept
  across restarts ([Drafts](../backlog/README.md#drafts)). Submit sends them all as one commit to
  the backlog's branch, nothing else: no checkout, branch or file of the repository moves.

## The backlog's view model

`lib/backlog-view.mjs`, pure functions the server calls with the branch's items (each with its
shown state), this clone's drafts and the map's features; the page receives the result.

| Field | Holds |
|---|---|
| `status`, `error` | `current`, `absent`, `unreachable`, or `unavailable` (no backlog), and why |
| `branch`, `repo`, `me` | the backlog's branch and repository id; this clone's git name, who the drafts are by |
| `states` | `[{ id, label, set, closed }]` in the board's order; `set` for the four a person moves to, `closed` for Done and Parked |
| `requests` | by id, an unsent one by its draft's `key`: `{ id, key, draft, title, by, created, state, shown, label, happens, should, where, about: [{ id, title, exists }], changes: [{ id, state, label, draft }], notes: [{ by, at, text, draft, key }], drafted: { <field>: <key> }, held: [{ key, field, theirs, yours, by }], refused: [{ key, op, reason }], unsent, problems, address, savedAt }` |
| `board` | `open`: New, Discussing, Ready, In progress, To review; `closed`: Done and Parked, shown once their filter is on; each `{ state, label, requests: [id] }`, unsent first, then newest first; `unreadable`: requests whose file gives no state |
| `waiting` | the requests in New that were sent, newest first |
| `byFeature` | per feature id, the requests about it that are not Done |
| `drafts` | what is unsent, oldest first: `{ key, op, request, title, field?, to?, toLabel?, text?, change?, held, refused, missing, savedAt }` |
| `totals` | `{ open, closed, unsent }`: sent requests in the open and the closed columns, and drafts |
| `banners` | `backlog-stale`, `backlog-off`, `backlog-branch`, `backlog-format`, `backlog-drafts`, `submit-unreachable { drafts, error }`, `submit-failed { error }` |

What a person sees is the branch with their drafts on it: a drafted note comes after the sent
ones (`at` null), a drafted edit or move shows its value and names its draft in `drafted`, and a
held one leaves the other person's value with both in `held`, `by` the git name of the commit that
set theirs. `held`'s `theirs` and `yours` are the field's values: a state id, feature ids, or text.

## Launcher

For people who are not developers: one pasted command sets a computer up, and a shortcut opens
the newest map from main, with nothing to pull or update.

```
node tools/solution-map/launcher/setup.mjs --print-command      # in a checkout: the command to give people
node tools/solution-map/launcher/setup.mjs [--root <folder>]    # sets this computer up
node <git common dir>/faster-spec/launcher/launch.mjs --root <folder> [-- <map arguments>]   # what the shortcut runs
```

What a project adds to its `tools/gate/config.json`: a `url` on each `solutionMap.repos` entry to
clone, the address people clone it from (one without a `url` is not cloned), and `backlog.repo`
when the backlog lives in another of those repositories ([Config](#config)).

- **The printed command** is one line for PowerShell 5.1 (no `&&`) and one for POSIX `sh`. Each
  checks for `git` and `node` and names the missing one's download page; clones the backlog's
  repository (its `url`, else its `origin`) into `~/<name>-map/<name>` with `--filter=blob:none
  --no-checkout`, `<name>` the address's last part without `.git`; takes what setup imports,
  `tools/solution-map/launcher/`, `tools/solution-map/lib/sources.mjs` and `tools/gate/lib/`
  (`SETUP_PATHS`), from its `origin/main` into the clone's `.git/faster-spec/setup/` with
  `git restore`; and runs setup from there. Pasted again, it fetches and runs setup again. An SSH
  address is printed with a warning: the other computer needs a key.
- **Setup** reads `origin/main:tools/gate/config.json` of `--root` (default: the repository holding
  the current folder). It checks for Git 2.29 or later and Node 22 or later; when one is missing or
  older it names it and its download page and stops, having changed nothing, and it never installs
  anything. Git 2.29 (`GIT_MIN`) brought what the launcher fetches missing blobs with
  (`fetch --stdin`, `fetch.negotiationAlgorithm=noop`) and what the backlog fetches its branch with
  (`fetch --no-write-fetch-head`); the rest each uses is older. It asks for git's `user.name` and
  `user.email` when either is unset and sets them `--global`; clones each `solutionMap.repos` entry
  with a `url` at its `path` relative to `--root`, blobless and with no checkout, keeping a folder
  that already holds a clone and stopping at one that holds other files; copies `launch.mjs` into
  `<git common dir>/faster-spec/launcher/` of the backlog's repository; and writes the shortcut and
  prints its path. Run again, it keeps the clones and the drafts. Exit: 0 done, 1 something missing
  or failed, 2 a usage error.
- **The shortcut** runs `<node> launch.mjs --root <clone>`, with the node setup ran under, in a
  terminal window; closing the window, or Ctrl+C, stops the launcher and the map, a restarted one
  too. Windows: `<Desktop>\<name> map.cmd`, the
  Desktop from `[Environment]::GetFolderPath('Desktop')`; macOS: `~/Desktop/<name> map.command`,
  executable; Linux: `~/.local/share/applications/<name>-map.desktop`, and a copy on the desktop
  `xdg-user-dir DESKTOP` names.
- **Launch** fetches every clone the config names (20 s each, in parallel); takes one tree id over
  main's `tools/solution-map/`, `tools/backlog/`, `tools/overview/`, `tools/gate/lib/` and
  `tools/gate/config.json` (`MAP_PATHS`, `mapTree`); when `maps/<tree id>/` is missing, fetches the
  blobs the clone lacks in one request and writes those paths there with `checkout-index`. It
  takes main's copy of itself from that folder when the two differ and the copy passes
  `node --check`; the copy runs from the shortcut's next opening, as the launcher running goes on
  with the code it started with. A copy in a checkout is never replaced. It removes every map
  folder but the one it runs and the one run before it, which may still run in another window
  (`pruneMaps`): each is renamed aside, then removed, and on Windows one a running map works in
  cannot be renamed and stays; a folder another launch is writing (`<tree id>.part-<pid>`) stays.
  It runs the map from that folder as its child, in the shortcut's window (inherited output, and
  an IPC channel), with `--launched <tree id> --root <clone>`, a `--repo` per entry of that
  folder's config and the arguments after `--`, and waits; Ctrl+C or a closed window it passes on
  to the map. When the fetch fails it runs the map last run (the folder it touched last). It never
  moves a clone's HEAD, index or working files.
- **Restart to update**: at every build a launched map compares its `--launched` tree id with
  main's and, when they differ, gives the `map-update` banner. `POST /api/restart` answers
  `{ ok: true }`; once the answer is out and the fetches and Submits taken before it are done (they
  take turns), the map stops listening, sends its port to the launcher over the IPC channel and
  exits with the restart code (`RESTART_CODE`), so it never exits between a Submit's push and the
  clearing of the drafts it sent. The launcher, waiting in the same window, runs all of the above
  again in the same process, the port and `--no-open` added to the map's arguments; any other exit
  code ends the launcher with that code. The newer map waits up to 10 s for the port, and the page,
  asking `/api/map` until it answers, reloads. A map started without `--launched`, or one no
  launcher waits on, answers 409.
- **What it keeps** lives under the clone's `<git common dir>/faster-spec/`: `setup/`,
  `launcher/launch.mjs` and `maps/<tree id>/` (the map run last and the one before it), beside the
  drafts (`backlog-drafts.json`), which a restart, a newer map and setup run again all keep. None
  of it shows in `git status`, and it goes with the clone.

## Files

| Path | What |
|---|---|
| `solution-map.mjs` | the command line; Restart to update's hand-over to the launcher |
| `launcher/setup.mjs` | setup and the printed command; imports, beyond Node, only `lib/sources.mjs` and `tools/gate/lib/`, which the command takes with it (`SETUP_PATHS`) |
| `launcher/launch.mjs` | what the shortcut runs; Node's own modules only, since setup copies it alone. The map imports its `MAP_PATHS`, `TREE_ID`, `RESTART_CODE`, `mapTree`, `mainMapTree`, `missingObjects` and `fetchObjects` |
| `lib/sources.mjs` | the map's own reads of a repository: its origin's address and a file at a commit. Naming and fetching the repositories, and the config, are the gate's [`lib/repos.mjs`](../gate/lib/repos.mjs), which the backlog shares |
| `lib/build.mjs` | one build: fetch, the backlog's fetch, the blobs a clone without them lacks, overview, page probes, adapt, the `map-update` banner; who set a held draft's field |
| `lib/adapt.mjs` | the overview's JSON to the view model: features, the queue, the groups, links, banners |
| `lib/backlog-view.mjs` | the backlog and the drafts to the backlog's view model |
| `lib/review.mjs` | Start review: where CueReview is, and opening it detached |
| `lib/server.mjs` | the HTTP server: the page at its views' addresses (`/`, `/waiting/…`, `/explore/…`, `/search/…`, `/backlog/…`) and the routes above |
| `page/` | the page: `index.html`, `style.css`, `html.mjs` (escaping, inline Markdown, icons, the banner line), `view.mjs` (pure HTML from the view models), `backlog.mjs` (the backlog's views: the board, the Move menu, the request dialog, the create form, the unsent line, its banners) and `app.mjs` (events, the address, the dialog; the only module that touches the DOM) |

- **Addresses**: `/waiting/<feature>`, `/explore/<feature>`, `/explore/by-system/<system>/<feature>`,
  `/search/<feature>?q=<text>`; a feature id is `<domain>/<capability>`. `/backlog` is the board,
  `/backlog/<id>` a request in its dialog (an unsent one by its draft's key), and
  `/backlog/new?about=<feature>` the create form with that feature named (`about` may repeat; New
  request gives `/backlog/new`). A dialog's address keeps the view under it in the history entry, so
  back, forward and reload show both again.
- **Drafts and Submit** go through `POST /api/drafts` and `/api/submit`; a failed Submit's banner
  stays until a Submit goes through. A draft changed while Submit sends gets the server's refusal
  as a toast, and what was typed stays in its form. The `map-update` banner's Restart to update,
  disabled while Submit sends, sends `POST /api/restart`; after `{ ok: true }` the page polls `/api/map` every second, reloads when the
  new map answers, and after 30 s says the map has not come back while it keeps polling.
- **Boards** come from git at the commit read, showing only the section with the id, in a sandboxed
  frame that runs no script.
- **Links** go to GitHub at the commit read, for a repository whose `origin` is on GitHub; any
  other repository gets plain text.
- **Theme**: light and dark follow the system; the page's toggle is kept in the browser. A project
  restyles the page by overriding its CSS custom properties in `kit-pages/theme.css`, served as
  `/theme.css` after the page's own styles: from the checkout the map runs in, and for a launched
  map, whose folder holds the map's code alone, from its clone's `origin/main`.

## Tests

```
cd tools/solution-map && npm test     # node --test; throwaway repositories in the OS temp folder
```

The adapter and view tests run on a sample index held to the overview's schema
(`test/fixtures/overview-v3.json`, checked with the overview's own `test/schema.mjs`); the backlog's
view model tests on items and drafts made in the test, and the backlog's view tests on a sample
backlog built with `backlogView` (`test/fixtures/backlog.mjs`). The server tests build bare origins and
clones and push to them, with git reading no global or system config (the backlog's
`test/helpers.mjs`); the board test runs the kit's overview on a spec there, the others a stand-in
that reports only each repository's commit, so a fetch's effect is seen alone. A clone made without
blobs is counted in requests from git's trace2 events (`GIT_TRACE2_EVENT`).

The launcher tests run setup and the launcher against bare origins and blobless clones, with a
throwaway home folder and git config and no system config; each system's shortcut is written into
the throwaway home. Those of a running map put this checkout's map code on a project's main, open
it as the shortcut does and Restart it; every node process they start loads a hook
(`NODE_OPTIONS=--import`) that notes it with its parent, so a test sees the restarted map is the
first launcher's child, and ends it when the test says so.
