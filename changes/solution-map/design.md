# Design: The Solution map, a local page over the overview

## Context

`tools/overview/overview.mjs` exports `buildOverview(repos)`, which reads each repository through
git objects at a ref and returns the index; version 3 (the format change "the review on the
feature") adds each feature's `review`, Summary, Looks lines, systems and tested coverage. The
kit's `kit.json` already reserves `tools/solution-map/` and syncs it into every project, so the map
holds to the kit's rules: no dependencies, Node 22, `node --test`, no product names, examples
neutral (a notes app and its backend).

## Decisions

| Decision | Chosen | Alternatives, and why not | Sources |
|---|---|---|---|
| Server | `node:http` bound to `127.0.0.1`, one process: build the map, serve the page, its data and the boards | Express or another framework: a dependency in every project; a static file written to disk: no Refresh | Node.js `http` docs, https://nodejs.org/api/http.html |
| The index | `buildOverview` imported in the process, after a `git fetch origin` per repository | Spawning `overview.mjs --out`: a temp file and a second parse; reading a committed JSON: stale | `tools/overview/README.md` |
| One seam to the index | `lib/adapt.mjs` turns the overview's JSON into the view model the page draws; nothing else reads the overview's fields | The page reading the overview's JSON directly: every version change reaches the page | — |
| The page | plain ES modules served as files: `page/view.mjs` builds HTML strings from the view model (pure, imported by the tests), `page/app.mjs` wires events and the address | A framework or a bundler: dependencies and a build step in every project | MDN, JavaScript modules, https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules |
| Addresses | the path names the view (`/waiting/<feature>`, `/explore/<feature>`, `/explore/by-system/<system>/<feature>`, `/search/<feature>?q=<text>`, a feature id being `<domain>/<capability>`), `history.pushState`, and the server answers every such path with the page | Hash routes: work too, but read worse in a pasted link | MDN, History API, https://developer.mozilla.org/en-US/docs/Web/API/History_API |
| Boards | `GET /board/<repo>/<capability path>/looks/<name>.html` returns the board from git at the commit read; with `?section=<id>` the server adds a style that hides every section that is not the chosen one, not inside it and not holding it, and the page shows it in an `iframe` with `sandbox` and no scripts, the response also carrying a `sandbox` content security policy | Inlining the section into the page: the board's CSS would leak into the page | MDN, `iframe` `sandbox`, https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe |
| Start review | `POST /api/review` makes the server start CueReview detached (`lib/review.mjs`); a POST needs the header `x-solution-map: 1`, which a page of another origin cannot send without a CORS preflight this server never answers | A `cuereview:` link from the page: CueReview registers none; `cue record`: refuses to run beside the app and needs a source | Fetch standard, CORS preflight, https://fetch.spec.whatwg.org/#cors-preflight-fetch; CueReview's README, Agent CLI |
| Live pages | the server asks each page line's address with a `HEAD` request (2 s) once per build; the page embeds an answering one in an `iframe`, else a placeholder | Asking from the browser: blocked by the page's own origin rules | — |
| A failed fetch | keep the repository's existing `origin/main`; the banner gives the time of the last good fetch (`FETCH_HEAD`'s modification time) and its commit | Refusing to build: Q8 | git-fetch docs, https://git-scm.com/docs/git-fetch |
| A missing repository | build from the others; the banner names the folder and `--repo <id>=<folder>` | — | — |
| Another overview version | a banner naming the version found and the one read, and the map empty | Reading version 2 as well: the review state differs in kind | — |
| Theme | CSS custom properties, light and dark by `prefers-color-scheme`, a toggle kept in `localStorage`, styled through the project's `kit-pages/theme.css` when it has one | A fixed theme: the kit's pages are restyled per project (the format change's Q10) | — |

## What it touches

| Area | Detail |
|---|---|
| Modules and READMEs | `tools/solution-map/` (new): `solution-map.mjs` (command line), `lib/sources.mjs` (fetch and repository state), `lib/build.mjs` (overview, page probes, banners), `lib/adapt.mjs` (view model), `lib/server.mjs` (HTTP), `page/` (the page), `test/`, `README.md` |
| Code reused | `buildOverview` from `tools/overview/overview.mjs`, imported rather than re-run; the overview's schema check, moved to `tools/overview/test/schema.mjs` so its suite and the map's share it |
| Formats and contracts | reads the overview's JSON, version 3 only; writes nothing. The view model is internal to the map |
| Storage | none in the repositories; the page keeps its theme and grouping in the browser's `localStorage` |
| Config | `tools/gate/config.json` gains an optional `solutionMap` block (`repos`, `pages`, `review.app`); a project without it passes `--repo` |

### What the map reads from version 3

The adapter reads these fields of `tools/overview/overview.schema.json`; its tests run on a sample
held to that schema (`test/fixtures/overview-v3.json`, checked by `tools/overview/test/schema.mjs`). A change to
the schema changes only `lib/adapt.mjs` and the sample.

| Field | Used for |
|---|---|
| `version` (3), `generatedAt`, `repos[] { id, name, ref, commit }` | the top bar, the version banner |
| `domains[]`, `systems[] { id, title, purpose, sides[] { repo, paths } }` | Explore's groups |
| `capabilities[] { id, domain, title, summary, review, reviewed { commit, date, pr } \| null, systems[], sides[] { repo, spec, code[], problems[] { line, message } }, looks[], requirements[] { repo, name, text, scenarios[] { name, tested, proofs[] } } }` | every feature view |
| a Looks entry: `{ repo, kind: "board", path, id, caption, exists }` or `{ repo, kind: "page", target, caption }` | the Looks |
| a PROOF line with `state: "test"`: `{ path, selector? }` | each scenario's test link |
| `changes[] { id, title, sides[] { repo, capabilities[], review (the Review section's text, or null), landed { commit, date, pr } \| null } }` | what to look at, the changes since approval, the queue's order |
| `uncovered[] { repo, system, path }` | code inside a system that no spec names |

`--from <overview.json>` serves a saved index without reading any repository, so its boards are
shown as not served.

## Test plan

| Scenario or logic | Test |
|---|---|
| The map answers on the loopback address only | `tools/solution-map/test/server.test.mjs::serves the page and the map on 127.0.0.1 only`, new |
| The repositories come from the project or the command line | `tools/solution-map/test/cli.test.mjs::reads the repositories from the config or the command line`, new |
| Refresh shows what landed since the page opened | `tools/solution-map/test/server.test.mjs::Refresh fetches again and rebuilds the map`, new |
| The queue holds every feature not approved, newest change first | `tools/solution-map/test/adapt.test.mjs::the queue holds every feature not approved, newest change first`, new |
| A feature in review shows what to judge it by | `tools/solution-map/test/adapt.test.mjs::a feature in review carries its looks, review note and changes since approval`, new |
| Start review opens CueReview | `tools/solution-map/test/server.test.mjs::Start review opens CueReview, and says so when it is missing` and `tools/solution-map/test/view.test.mjs::start review says what to say at the start of the take`, new |
| Nothing waits | `tools/solution-map/test/view.test.mjs::nothing waiting says so and points at untested scenarios`, new |
| Features by domain and by system | `tools/solution-map/test/adapt.test.mjs::features group by domain and by system`, new |
| A system with no feature shows what the specs do not cover | `tools/solution-map/test/adapt.test.mjs::a system no feature ships in is listed as a gap` and `tools/solution-map/test/view.test.mjs::a system no feature ships in, and a project with no spec, say so in words`, new |
| An approved feature shows what it does and where its code is | `tools/solution-map/test/view.test.mjs::an approved feature folds its behaviour away`, new |
| A board section is drawn from the board by its id | `tools/solution-map/test/server.test.mjs::a board section is served from the board by its id`, new |
| A page that does not answer becomes a placeholder | `tools/solution-map/test/view.test.mjs::a page line that does not answer becomes a placeholder`, new |
| Search finds a feature by what it does | `tools/solution-map/test/view.test.mjs::search finds features by title, summary, requirement, scenario and system`, new |
| Every view has its own address | `tools/solution-map/test/view.test.mjs::every view has its own address`, new |
| Code links point at the commit read | `tools/solution-map/test/adapt.test.mjs::a feature's code links point at the commit read`, new |
| A repository that cannot be fetched keeps its last fetch | `tools/solution-map/test/server.test.mjs::a repository that cannot be fetched keeps its last fetch, with a banner`, new |
| A missing repository leaves the others | `tools/solution-map/test/server.test.mjs::a repository that is missing leaves the others, with a banner`, new |
| A spec that breaks the format still shows | `tools/solution-map/test/adapt.test.mjs::a spec's format problems reach its feature and a banner`, new |
| An overview of another version says so | `tools/solution-map/test/server.test.mjs::an overview of another version gives a banner, not a page error`, new |
| A project with no spec yet | `tools/solution-map/test/adapt.test.mjs::an empty project has no features and lists its systems` and `tools/solution-map/test/view.test.mjs::a system no feature ships in, and a project with no spec, say so in words`, new |
| The sample held to the overview's schema | `tools/solution-map/test/adapt.test.mjs::the sample holds to the overview schema the kit publishes`, unit test |
| `--from`: a saved overview | `tools/solution-map/test/server.test.mjs::a saved overview is served without reading a repository`, unit test |
| Explore by system with nothing to group | `tools/solution-map/test/view.test.mjs::explore by system without systems says so, and keeps the features`, unit test |
| The page at phone width and with a keyboard only | none: untested, because the kit runs no browser in its suites; checked by hand, as the pull request says |

The server tests build throwaway repositories in the OS temp folder, as the overview's tests do.
The board test runs the kit's own overview on a spec and `specs/systems.json` there; the others
use a stand-in that reports each repository's commit, so a fetch's effect is seen alone.

## Risks

- **Version 3 moves on.** Only the adapter and its sample change, and the sample's schema test
  fails first.
- **A slow fetch.** Each fetch has a 20 s timeout and runs in parallel; the page shows the last
  map until the new one is built.
- **A board that runs script.** Boards are shown in a sandboxed `iframe` without `allow-scripts`.
