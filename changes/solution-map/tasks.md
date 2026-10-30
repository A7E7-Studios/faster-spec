# Tasks: The Solution map, a local page over the overview

Each task is one line and names the test that proves it: `test:` a test path with its selector, or
a command. A task is ticked when its test passes. What no automation reaches has no task of its
own; the pull request names it under `## Not verified`.

## 1. Server and sources

- [x] 1.1 The command line, the repositories from `--repo` or the config; test: tools/solution-map/test/cli.test.mjs
- [x] 1.2 Fetch, `current` / `stale` / `missing`, and the banners; test: tools/solution-map/test/server.test.mjs
- [x] 1.3 The HTTP server on 127.0.0.1, the page, the map, Refresh and the boards by section; test: tools/solution-map/test/server.test.mjs
- [x] 1.4 `--from <overview.json>` for a look before the repositories carry version 3; test: tools/solution-map/test/cli.test.mjs, tools/solution-map/test/server.test.mjs::a saved overview is served without reading a repository

## 2. The adapter (after 1)

- [x] 2.1 The view model from version 3 as `design.md` reads it, on the sample; test: tools/solution-map/test/adapt.test.mjs
- [x] 2.2 Rebase on the format change once its overview lands, and align the adapter and the sample with the published schema; test: cd tools/solution-map && npm test
- [x] 2.3 Run the real overview in `server.test.mjs` in place of the stand-in; test: tools/solution-map/test/server.test.mjs

## 3. The page (after 2.1)

- [x] 3.1 Direction A: Waiting for you, Explore by domain and by system, search, addresses, banners, both themes; test: tools/solution-map/test/view.test.mjs
- [x] 3.2 The board `specs/overview/solution-map/looks/solution-map.html`, self-contained and under 30720 bytes, sections `waiting`, `explore-system`, `banners`, drawn from the page's own views and styles over the sample; test: node tools/gate/gate.mjs --local
- [x] 3.3 Start review opens CueReview in place of Copy for triage (Q15); test: tools/solution-map/test/server.test.mjs

## 4. Docs

- [x] 4.1 `tools/solution-map/README.md`; test: node tools/gate/gate.mjs --local
- [x] 4.2 The kit's README lists the Solution map, and `solutionMap` joins the config template, both protected paths the owner merges; test: node tools/gate/gate.mjs --local
