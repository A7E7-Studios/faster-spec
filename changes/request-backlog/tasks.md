# Tasks: A backlog for requests before they become changes

Each task is one line and names the test that proves it: `test:` a test path with its selector, or
a command. A task is ticked when its test passes. A scenario no automation reaches has no task of
its own; the pull request names it under `## Not verified`. Each group ends by updating the README
nearest the code it changes.

## 1. The backlog library and command line, `tools/backlog/`

- [x] 1.1 `lib/item.mjs`: parse and write the item file with the gate's `parseFrontMatter`; note headings; ids from titles; test: tools/backlog/test/item.test.mjs
- [x] 1.2 `lib/ops.mjs`: `add`, `note`, `edit`, `move`, `link` applied to an item's text, with held clashes; test: tools/backlog/test/ops.test.mjs
- [x] 1.3 `lib/state.mjs`: `shownState(item, facts)` and the git facts per change id; test: tools/backlog/test/state.test.mjs::an item's changes decide its shown state
- [x] 1.4 `lib/store.mjs`: read the branch through git objects; write by plumbing with replay and five retries; first write without a parent; config `backlog { repo, branch }`; test: tools/backlog/test/store.test.mjs
- [x] 1.5 `lib/drafts.mjs`: drafts in the git common directory; test: tools/backlog/test/drafts.test.mjs
- [x] 1.6 `backlog.mjs`: `list`, `show`, `add`, `note`, `move`, `link`, `--json`; test: tools/backlog/test/cli.test.mjs
- [x] 1.7 `package.json` (`node --test`) and `README.md`: the item format, the commands, the config, the branch rule to set; test: node tools/gate/gate.mjs --local

## 2. The map's server (after 1)

- [ ] 2.1 `GET /api/backlog`, `POST /api/drafts`, `POST /api/submit` behind the existing guard; Refresh fetches the backlog's branch; test: tools/solution-map/test/server.test.mjs
- [ ] 2.2 `lib/backlog-view.mjs`: board columns, the dialog's model, each feature's open requests, New requests for Waiting for you; test: tools/solution-map/test/backlog.test.mjs
- [ ] 2.3 Update `tools/solution-map/README.md`: routes, the writes and where drafts live; test: node tools/gate/gate.mjs --local

## 3. The map's page (after 2)

- [ ] 3.1 The Backlog tab and board: columns by shown state, Move menu on every card, Show done and parked; test: tools/solution-map/test/view.test.mjs
- [ ] 3.2 The request dialog (`<dialog>`, `showModal`), its narrow full-screen layout, the create form from New request and Suggest a change; test: tools/solution-map/test/view.test.mjs::suggest a change starts a request naming the feature
- [ ] 3.3 A feature's open requests; New requests in Waiting for you; test: tools/solution-map/test/view.test.mjs::an item shows its notes, its features and its changes
- [ ] 3.4 The unsent line with Submit on every view, the held draft in the dialog, the empty and unreachable states; test: tools/solution-map/test/view.test.mjs::every view shows the unsent drafts and submit
- [ ] 3.5 Addresses `/backlog`, `/backlog/<id>`, `/backlog/new?about=<feature>`; test: tools/solution-map/test/view.test.mjs::every view has its own address
- [ ] 3.6 Compare the page with `specs/overview/solution-map/looks/backlog.html`; test: node tools/gate/gate.mjs --local

## 4. The launcher (after 2)

- [ ] 4.1 `launcher/setup.mjs`: Node check, git identity, clones of each `solutionMap.repos` entry with a `url`, the copied `launch.mjs`, the shortcut per system; `--print-command`; test: tools/solution-map/test/launcher.test.mjs
- [ ] 4.2 `launcher/launch.mjs`: fetch, the map's tree id, `maps/<tree id>/` by `checkout-index`, the last folder when the fetch fails, `--launched`; test: tools/solution-map/test/launcher.test.mjs::the launched map runs from main's code
- [ ] 4.3 The restart banner and route in the map; test: tools/solution-map/test/launcher.test.mjs::restart runs the newer map and keeps the drafts
- [ ] 4.4 README: setup, the printed command, the shortcut, what a project adds to its config; test: node tools/gate/gate.mjs --local

## 5. The skills and the kit (after 1)

- [ ] 5.1 `spec` accepts `backlog:<id>`: show, quote in Why, `link` and a note; test: node tools/gate/gate.mjs --local
- [ ] 5.2 `triage` with no input lists `backlog.mjs list --state new`; test: node tools/gate/gate.mjs --local
- [ ] 5.3 `kit.json` adds `tools/backlog/`; `specs/systems.json` adds Backlog and Solution map; `config.template.json` documents `backlog` and `solutionMap.repos[].url`; test: cd tools/kit && npm test
- [ ] 5.4 The kit's `README.md` lists the backlog and the launcher; test: node tools/gate/gate.mjs --local

## 6. The quality gate (after 1–5)

- [ ] 6.1 Every suite in AGENTS.md's Quality gate, with `tools/backlog`; test: cd tools/backlog && npm test
- [ ] 6.2 The formality gate; test: node tools/gate/gate.mjs --local
