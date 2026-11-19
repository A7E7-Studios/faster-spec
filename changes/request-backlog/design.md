# Design: A backlog for requests before they become changes

## Context

The Solution map (`tools/solution-map/`) is a `node:http` server on 127.0.0.1 that fetches each
repository, builds the overview in process (`buildOverview` from `tools/overview/overview.mjs`) and
serves a page of plain ES modules (`page/view.mjs` pure HTML, `page/app.mjs` events and addresses).
Its only POSTs, `/api/refresh` and `/api/review`, need the header `x-solution-map: 1`. The gate's
library already parses the kit's YAML-subset front matter (`tools/gate/lib/spec.mjs`
`parseFrontMatter`, `ID`) and runs git with batch reads (`tools/gate/lib/git.mjs` `runGit`,
`parseCatFileBatch`). The constraints: no dependencies, Node 22, `node --test`, every OS the kit
supports, no product names, and nothing the backlog does may touch main or a checkout.

## Decisions

| Decision | Chosen | Alternatives, and why not | Sources |
|---|---|---|---|
| Where items are stored | One branch, by default `backlog` in the repository the map runs in, created on the first write with no parent; config `backlog: { "repo": "<id>", "branch": "<name>" }` names another of `solutionMap.repos` and branch | Main: a pull request and a gate run per submit (Q1); always a second repository: extra setup for every project (Q1) | git-commit-tree, https://git-scm.com/docs/git-commit-tree |
| How a write reaches the branch | Plumbing only: `git fetch origin <branch>`; a temporary index (`GIT_INDEX_FILE`) filled by `read-tree <tip>`; `hash-object -w` the new file; `update-index --cacheinfo`; `write-tree`; `commit-tree -p <tip>`; `push origin <commit>:refs/heads/<branch>`. A rejected non-fast-forward push fetches and replays, at most five times | A checkout of the branch: moves files and branches under a person's feet; a worktree per write: slow and leaves folders; a hosting API: a token and a service per project | git-read-tree, git-update-index, git-push docs, https://git-scm.com/docs |
| The item file | `backlog/<id>.md`: front matter `title`, `by`, `created` (date), `state` (`new`, `discussing`, `ready`, `parked`), `about` (feature ids), `change` (change ids); then `## What happens`, `## What should happen`, `## Where`, `## Notes`, each note `### <git name> · <YYYY-MM-DD HH:MM> UTC` and its text (Q12) | A file per note: a folder walk to read one request (Q12); JSON: not readable on a repository's web page | `specs/README.md` front matter subset |
| Parsing it | The gate's `parseFrontMatter` and `ID`, imported, and a small section reader in `tools/backlog/lib/item.mjs` | A second front-matter parser: two dialects of one format | `tools/gate/lib/spec.mjs` |
| Ids | Kebab-case from the title, ASCII-folded, at most 60 characters, `-2`, `-3` when taken; given at replay time, so a draft keeps a local key until it is sent | Numbers: unreadable in a file list; ids given when drafted: two people draft the same title | — |
| A write is an operation | `add`, `note`, `edit {field, from, to}`, `move {from, to}`, `link {change}`, applied to the tip's text. A note appends and never clashes; an edit or a move whose field now holds neither `from` nor `to` is held with both values, the rest of the submit applies (Q8) | Three-way merge of the file: can interleave notes and cannot say whose value won | — |
| Who wrote it | The commit author is the repository's `user.name` and `user.email`; `by` and a note's heading take `user.name`; times in UTC | A hosting account name: needs the network and a token | git-config, https://git-scm.com/docs/git-config |
| The commit | One per submit (map) or per command (command line); subject `<name>: 1 new request, 2 notes, 1 move`, body one line per operation | One commit per operation from the map: noise in the history the owner reads (Q2) | — |
| Drafts | `<git common dir>/faster-spec/backlog-drafts.json` of the backlog's repository: per clone, never committed, out of `git status`, kept across restarts and launcher updates | The browser's storage: lost with a new port or browser, and the server needs them to submit; a file in the working tree: shows in `git status` and gets committed | git-rev-parse `--git-common-dir`, https://git-scm.com/docs/git-rev-parse |
| The state an item shows | A pure function `shownState(item, facts)` in `tools/backlog/lib/state.mjs`; facts per change id across the solution's repositories: its folder on `origin/main` now, or added and later removed on main's first-parent history (`git log --first-parent --diff-filter=A/D -- changes/<id>/proposal.md`). Any change in progress → In progress; else any on main → To review; all removed after landing → Done (Q3) | Storing the shown state: drifts from the repositories (Q3); reading the overview's JSON: has no history of removed folders | git-log, https://git-scm.com/docs/git-log |
| Where the map gets the backlog | `tools/backlog/lib/` imported by the map's server; the overview's JSON stays version 3 | Requests in the overview's index: a version 4 and every reader migrating, for a branch the overview does not need | `tools/overview/README.md` |
| The map's routes | `GET /api/backlog` (items, shown states, drafts); `POST /api/drafts` (add, change or drop a draft); `POST /api/submit`. Every POST keeps the `x-solution-map: 1` guard and the loopback host check; Refresh also fetches the backlog's branch | A second server or port: a second origin and guard | Fetch standard, CORS preflight, https://fetch.spec.whatwg.org/#cors-preflight-fetch |
| The view model | `lib/backlog-view.mjs` turns items and drafts into the board, the dialog and each feature's requests; `lib/adapt.mjs` stays the only reader of the overview's fields | Folding requests into `adapt.mjs`: two sources behind one seam | — |
| The request dialog | The native `<dialog>` opened with `showModal()`: focus moves in, the board behind is inert, Escape closes, focus returns to the card. Full-screen below 720 px. Addresses `/backlog`, `/backlog/<id>`, `/backlog/new?about=<feature>` open the board with the dialog | A hand-made modal: its own focus trap to get right; a side sheet: the owner's Q13 answer | MDN, `<dialog>`, https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog; WAI-ARIA APG modal dialog, https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ |
| Moving a card | A Move menu on every card (the four states people set); dragging a card is an extra over the same move | Drag only: fails WCAG 2.5.7 | WCAG 2.2, 2.5.7 Dragging Movements, https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html |
| The setup command | `node tools/solution-map/launcher/setup.mjs --print-command` prints one command per system (PowerShell 5.1 without `&&`, and POSIX `sh`): it checks `git` and `node` and names their download pages when one is missing, clones the backlog's repository with `--filter=blob:none --no-checkout`, reads `setup.mjs` from its objects and runs it (Q16) | Steps in the README: more for a non-developer to follow (Q16) | git-clone, https://git-scm.com/docs/git-clone |
| What setup does | Checks Node 22 or later; asks for `user.name` and `user.email` when unset; clones each `solutionMap.repos` entry that carries a `url`, side by side as config lays them out, with no working files (Q15); copies `launch.mjs` into `<git common dir>/faster-spec/launcher/`; writes the shortcut; a second run keeps the clones and the drafts | Installing Git or Node: rejected by Q10 | Node.js `process.versions`, https://nodejs.org/api/process.html |
| The shortcut | Windows: `<Desktop>\<name> map.cmd`, the Desktop from `[Environment]::GetFolderPath('Desktop')` (it may be redirected); macOS: `~/Desktop/<name> map.command`, executable; Linux: `~/.local/share/applications/<name>-map.desktop`, and a copy on the desktop `xdg-user-dir DESKTOP` names, when there is one (Q9) | A `.lnk` file: binary, needs a COM call | Desktop Entry Specification, https://specifications.freedesktop.org/desktop-entry-spec/latest/; .NET `Environment.GetFolderPath`, https://learn.microsoft.com/dotnet/api/system.environment.getfolderpath |
| Running the newest map | `launch.mjs --root <clone> [-- <map arguments>]` fetches every clone, takes the tree id of the map's code on `origin/main` (`tools/solution-map/`, `tools/backlog/`, `tools/overview/`, `tools/gate/lib/`, `tools/gate/config.json`), writes those paths into `<git common dir>/faster-spec/maps/<tree id>/` with a temporary index and `checkout-index` when that folder is missing (the blobs a clone lacks in one request), takes main's copy of itself from there when it differs and passes `node --check` (it runs from the next opening), and runs the map from there as its child in the shortcut's window, with `--launched <tree id> --root <clone>`, a `--repo` per config entry and the arguments after `--`. The map imports the launcher's `mapTree`, so the two take the tree id one way. A failed fetch runs the newest folder there | `git archive \| tar`: a second tool to rely on; running from a checkout: a non-developer has none | git-checkout-index, https://git-scm.com/docs/git-checkout-index |
| Restart to update | A launched map compares its tree id with `origin/main`'s at every build; when they differ, the banner offers Restart. Restart answers the page, then the map stops listening, sends its port to the launcher over the IPC channel and exits with `RESTART_CODE` (75); the launcher, waiting in the same window, runs every step of the row above again in the same process, with that port and `--no-open`. The new map waits up to 10 s for the port, the page polls `/api/map` and reloads. Ctrl+C or a closed window ends the launcher and the map, a restarted one too. A map started without `--launched`, or with no launcher waiting on it, never restarts | Restarting in process: modules cannot be unloaded; a detached launcher started by the map: the restarted map runs apart from the shortcut's window, which no longer stops it | Node.js `child_process.spawn` `stdio` `'ipc'` and the `'close'` event, https://nodejs.org/api/child_process.html#optionsstdio |
| Config | `tools/gate/config.json`: `backlog { repo, branch }`, optional; `solutionMap.repos[].url`, optional; both documented in the starter config | — | — |
| The skills | `spec` accepts `backlog:<id>`: `backlog.mjs show <id> --json`, quotes it in Why, then `link <id> <change>` and a note; `triage` with no input adds `backlog.mjs list --state new` | An intake skill: out of scope (Q6) | — |

## What it touches

| Area | Detail |
|---|---|
| Modules and READMEs | `tools/backlog/` (new): `backlog.mjs` (command line), `lib/item.mjs` (format), `lib/ops.mjs` (operations and replay), `lib/store.mjs` (git), `lib/state.mjs` (shown state), `lib/drafts.mjs`, `test/`, `README.md`. `tools/solution-map/`: `lib/server.mjs` routes, `lib/backlog-view.mjs` (new), `page/` (board, dialog, create form, unsent line, banners), `launcher/` (new: `setup.mjs`, `launch.mjs`), `README.md` |
| Code reused | `parseFrontMatter` and `ID` from `tools/gate/lib/spec.mjs`; `runGit`, `gitAsync` and `parseCatFileBatch` from `tools/gate/lib/git.mjs`; `fetchRepo`, `readConfig`, `resolveRepos` and `samePath` from `tools/gate/lib/repos.mjs`, moved there from the map's `lib/sources.mjs` so the backlog and the map do not import each other; the map's banner and dialog styles |
| State on the network | The backlog's branch on the repository's remote is the only shared state: anyone who can push changes it; every writer replays onto its tip. Drafts never leave the computer before Submit |
| Formats and contracts | The item file (new, described in `tools/backlog/README.md`); the config keys `backlog` and `solutionMap.repos[].url` (new, optional: a project's next sync needs nothing unless it uses them); the overview's JSON unchanged (version 3) |
| Storage | The branch, kept for good; drafts and launched maps under the clone's git directory, removed with the clone |
| Kit | `kit.json` adds `tools/backlog/`; `specs/systems.json` adds the systems Backlog (`tools/backlog/`) and Solution map (`tools/solution-map/`) |

## Test plan

| Scenario or logic | Test |
|---|---|
| The first item creates the branch | `tools/backlog/test/store.test.mjs::the first write creates the branch with no shared history`, new |
| A project names another repository and branch | `tools/backlog/test/store.test.mjs::reads and writes the configured repository and branch`, new |
| Main and every checkout stay untouched | `tools/backlog/test/store.test.mjs::a write leaves main and every checkout untouched`, new |
| A new item holds the request | `tools/backlog/test/store.test.mjs::a new item is one file holding the request, state new`, new |
| A note is appended with its author and time | `tools/backlog/test/store.test.mjs::a note is appended with its author and time`, new |
| A write changes only the item's own file | `tools/backlog/test/store.test.mjs::a write changes only the item's own file`, new |
| Two notes sent at once both arrive | `tools/backlog/test/store.test.mjs::two notes sent at once both arrive`, new |
| A field changed meanwhile is held, not overwritten | `tools/backlog/test/store.test.mjs::a field changed meanwhile is held with both values`, new |
| A person moves an item | `tools/backlog/test/store.test.mjs::a person moves an item to any state they set`, new |
| An item's changes decide what it shows | `tools/backlog/test/state.test.mjs::an item's changes decide its shown state`, new |
| Each write command sends one commit | `tools/backlog/test/cli.test.mjs::each write command sends one commit`, new |
| Show prints an item with its notes and its state | `tools/backlog/test/cli.test.mjs::show prints the item, its notes and its shown state`, new |
| List filters by state | `tools/backlog/test/cli.test.mjs::list filters by the state an item shows`, new |
| Item format: parse and write back unchanged; note headings; ids | `tools/backlog/test/item.test.mjs::*`, unit test |
| Replay: add, note, edit, move, link against a changed tip | `tools/backlog/test/ops.test.mjs::*`, unit test |
| Refresh shows what others sent to the backlog | `tools/solution-map/test/server.test.mjs::Refresh shows what others sent to the backlog`, new |
| New requests wait beside the features | `tools/solution-map/test/backlog.test.mjs::new requests wait beside the features, newest first`, new |
| Items show by state | `tools/solution-map/test/backlog.test.mjs::items show by state, done and parked behind a filter`, new |
| An item shows what became of it | `tools/solution-map/test/view.test.mjs::an item shows its notes, its features and its changes`, new |
| A person adds a request | `tools/solution-map/test/backlog.test.mjs::a request added on the page is a draft in new`, new |
| The backlog's branch does not exist yet | `tools/solution-map/test/view.test.mjs::an empty backlog says how to add the first request`, new |
| A feature lists its open requests | `tools/solution-map/test/backlog.test.mjs::a feature lists the requests about it that are not done`, new |
| Suggest a change starts a request about the feature | `tools/solution-map/test/view.test.mjs::suggest a change starts a request naming the feature`, new |
| Every view shows what is unsent | `tools/solution-map/test/view.test.mjs::every view shows the unsent drafts and submit`, new |
| Drafts survive a restart | `tools/solution-map/test/server.test.mjs::drafts survive a restart of the map`, new |
| Submit sends every draft as one commit | `tools/solution-map/test/server.test.mjs::submit sends every draft as one commit`, new |
| A clashing draft stays unsent with both values | `tools/solution-map/test/server.test.mjs::a clashing draft stays unsent with both values`, new |
| Submit without the network keeps the drafts | `tools/solution-map/test/server.test.mjs::submit without the network keeps every draft`, new |
| Only the map's own page can write | `tools/solution-map/test/server.test.mjs::a write from another page is refused`, new |
| Every view has its own address (the backlog's) | `tools/solution-map/test/view.test.mjs::every view has its own address`, existing, extended |
| Something missing stops setup and says what to install | `tools/solution-map/test/launcher.test.mjs::setup names what is missing and stops`, new; the printed commands' checks run under `sh` where the test has one |
| Setup asks for a name and email when git has none | `tools/solution-map/test/launcher.test.mjs::setup asks for a git name and email when none is set`, new |
| A developer prints the setup command | `tools/solution-map/test/launcher.test.mjs::print-command prints one setup command per system`, new |
| Setup clones each repository with no working files | `tools/solution-map/test/launcher.test.mjs::setup clones each repository with no working files`, new |
| The shortcut fits the system | `tools/solution-map/test/launcher.test.mjs::setup writes the shortcut for each system`, new, each system's file written to a temporary home |
| Running setup again keeps the clone and the drafts | `tools/solution-map/test/launcher.test.mjs::setup run again keeps the clone and the drafts`, new |
| The map runs from main's code | `tools/solution-map/test/launcher.test.mjs::the launched map runs from main's code`, new |
| Without the network the last map runs | `tools/solution-map/test/launcher.test.mjs::without the network the last map runs`, new |
| A launcher fixed on main reaches the shortcut | `tools/solution-map/test/launcher.test.mjs::the launcher takes main's copy of itself, never into a checkout`, new |
| A newer map on main shows a banner | `tools/solution-map/test/launcher.test.mjs::a newer map on main offers a restart`, new |
| Restart runs the newer map and keeps the drafts | `tools/solution-map/test/launcher.test.mjs::restart runs the newer map and keeps the drafts`, new |
| A map run from a checkout never offers a restart | `tools/solution-map/test/launcher.test.mjs::a map run from a checkout offers no restart`, new |
| The shortcut opens the browser on the map | none: untested, because no automation double-clicks a desktop icon and watches a browser open |
| A request becomes a change | none: untested, because it is an agent following the spec skill's text; the `link` and `note` commands it runs are tested |
| New requests wait beside the features (triage) | none: untested, because it is an agent following the triage skill's text; `list --state new` is tested |

Every git test runs against throwaway bare origins and clones in the OS temp folder, as the map's
server tests do.

## Risks

- **Someone force-pushes or deletes the branch** and the discussion is gone from the remote. The
  README advises a branch rule against both; every clone still holds the last fetched tip.
- **A push asks for credentials** from the map's server process. Git's credential helper opens its
  own window on a desktop; a push that fails for any reason but a non-fast-forward keeps the drafts
  and shows the unreachable banner, so nothing is lost.
- **Five rejected pushes in a row** (a busy branch) end the submit with the drafts kept and the
  banner; the person submits again.
- **The tip cannot be read as the format** (a hand edit broke an item): that item shows with its
  problem, as the map shows a broken spec, and writes to it are refused until it is fixed.
- **A redirected or missing desktop folder**: setup writes the shortcut where the system says the
  desktop is, and prints the path it wrote.
- **The restart races the port**: the new map retries listening for 10 s; the page keeps polling
  and says so if the map does not come back.
