# Solution map

A local web page over the [overview](../overview/README.md)'s index and the
[backlog](../backlog/README.md): what waits for the owner (features to review, new requests),
every feature by domain or by the system it ships in, how well each is tested, and the requests
people raise. It serves on 127.0.0.1 only and deploys nothing. The one thing it writes is the
backlog's branch, only when a person presses Submit on the map's own page. What it does for a
person: the kit's spec `overview/solution-map`.

No npm dependencies; Node 22 or later. It reads the overview's JSON **version 3** only.

```
node tools/solution-map/solution-map.mjs [--repo <id>=<folder>]... [--port <n>] [--pages <address>] [--no-open]
node tools/solution-map/solution-map.mjs --from <overview.json> [--port <n>] [--no-open]
```

| Option | Does |
|---|---|
| `--repo <id>=<folder>` | a repository to read, any number; without it, `solutionMap.repos` in the project's `tools/gate/config.json` |
| `--port <n>` | the port on 127.0.0.1; default 7317, or the next free one of the 20 after it |
| `--pages <address>` | the base address a Looks `page:` path is joined to; default `solutionMap.pages` |
| `--from <file>` | serve a saved overview instead of fetching and building one; boards are not served, and there is no backlog |
| `--no-open` | do not open the browser |

Exit: **2** on a usage error or a port it cannot listen on; otherwise it runs until stopped.

## Config

```json
{ "solutionMap": { "repos": [{ "id": "app", "path": "." }, { "id": "api", "path": "../notes-api" }], "pages": "http://localhost:5173" } }
```

`path` is relative to the repository the command runs in. `pages` is optional, and so is
`review.app`, the CueReview program Start review opens; without it, CueReview's default install:
`%LOCALAPPDATA%\Programs\CueReview\cuereview.exe` on Windows, the CueReview app on macOS,
`cuereview` on PATH on Linux. Where the backlog lives is `backlog { repo, branch }`
([the backlog's config](../backlog/README.md#where-the-backlog-lives)); a value it refuses leaves
the map without a backlog, and a banner says why.

## What one build does

On start, on opening the page and on Refresh:

1. **Fetch** each repository (`git fetch origin`, 20 s, in parallel). A repository with no
   `origin/main` is `missing`; one whose fetch fails is `stale` and keeps its existing
   `origin/main`, with the time of its last good fetch (`FETCH_HEAD`'s modification time).
2. **Fetch the backlog's branch** (`fetchBacklog`), after the repositories' fetch and never beside
   it: two fetches in one repository race for its refs. It is `current`, `absent` (nobody has sent
   a request yet) or `unreachable` (what this clone last fetched shows).
3. **Build** the overview in the process (`buildOverview` from `tools/overview`) over every
   repository that is not missing, at `origin/main`. Another version than 3 gives a banner and an
   empty map.
4. **Ask** each Looks page address once whether it answers (`HEAD`, 2 s).
5. **Adapt** the index into the view model the page draws (`lib/adapt.mjs`, the only code that
   reads the overview's fields).

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
| `POST /api/drafts` | `{ "save": <operation> }` adds a draft, and with the draft's `key` changes it; `{ "drop": "<key>" }` drops it (an unsent request with the drafts naming it); `{ "apply": "<key>" }` applies a held draft again over the other person's value | `{ ok: true, draft, backlog }`; a draft that is not one: `400 { ok: false, error }` |
| `POST /api/submit` | `{}` | `{ ok, unreachable, error, commit, sent: [{ key, op, id }], held: [{ key, op, id, field, theirs, yours }], refused: [{ key, op, reason }], backlog }`; `ok` false when nothing was sent, every draft kept |
| `GET /board/<repo>/<path>?section=<id>` | | a board at the commit read |

- **Only the map's own page writes.** Every POST needs the header `x-solution-map: 1`, which a
  page of another site cannot send without the browser asking this server first, and it never says
  yes; a `Host` of `127.0.0.1` or `localhost` at the map's port; and no `Origin` but the map's own.
  A draft or a Submit is `application/json` of at most 256 KiB. Anything else is refused (403, 415,
  413, 400), and nothing is kept or sent. A map without a backlog answers 409.
- **An operation** is the backlog's ([A write](../backlog/README.md#a-write)). A move or an edit
  of a sent request saved without `from` takes the value the map last read, and a changed draft
  keeps its own, so Submit holds it when someone changed the field meanwhile.
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

## Files

| Path | What |
|---|---|
| `solution-map.mjs` | the command line |
| `lib/sources.mjs` | naming, fetching and reading the repositories |
| `lib/build.mjs` | one build: fetch, the backlog's fetch, overview, page probes, adapt; who set a held draft's field |
| `lib/adapt.mjs` | the overview's JSON to the view model: features, the queue, the groups, links, banners |
| `lib/backlog-view.mjs` | the backlog and the drafts to the backlog's view model |
| `lib/review.mjs` | Start review: where CueReview is, and opening it detached |
| `lib/server.mjs` | the HTTP server: the page at its views' addresses (`/`, `/waiting/…`, `/explore/…`, `/search/…`, `/backlog/…`) and the routes above |
| `page/` | the page: `index.html`, `style.css`, `view.mjs` (pure HTML from the view model), `app.mjs` (events and the address) |

- **Addresses**: `/waiting/<feature>`, `/explore/<feature>`, `/explore/by-system/<system>/<feature>`,
  `/search/<feature>?q=<text>`; a feature id is `<domain>/<capability>`.
- **Boards** come from git at the commit read, showing only the section with the id, in a sandboxed
  frame that runs no script.
- **Links** go to GitHub at the commit read, for a repository whose `origin` is on GitHub; any
  other repository gets plain text.
- **Theme**: light and dark follow the system; the page's toggle is kept in the browser. A project
  restyles the page by overriding its CSS custom properties in `kit-pages/theme.css`, served as
  `/theme.css` after the page's own styles.

## Tests

```
cd tools/solution-map && npm test     # node --test; throwaway repositories in the OS temp folder
```

The adapter and view tests run on a sample index held to the overview's schema
(`test/fixtures/overview-v3.json`, checked with the overview's own `test/schema.mjs`); the backlog's
view model tests on items and drafts made in the test. The server tests build bare origins and
clones and push to them, with git reading no global or system config (the backlog's
`test/helpers.mjs`); the board test runs the kit's overview on a spec there, the others a stand-in
that reports only each repository's commit, so a fetch's effect is seen alone.
