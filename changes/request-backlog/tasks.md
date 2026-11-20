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

- [x] 2.1 `GET /api/backlog`, `POST /api/drafts`, `POST /api/submit` behind the existing guard; Refresh fetches the backlog's branch; test: tools/solution-map/test/server.test.mjs
- [x] 2.2 `lib/backlog-view.mjs`: board columns, the dialog's model, each feature's open requests, New requests for Waiting for you; test: tools/solution-map/test/backlog.test.mjs
- [x] 2.3 Update `tools/solution-map/README.md`: routes, the writes and where drafts live; test: node tools/gate/gate.mjs --local

## 3. The map's page (after 2)

- [x] 3.1 The Backlog tab and board: columns by shown state, Move menu on every card, Show done and parked; test: tools/solution-map/test/view.test.mjs
- [x] 3.2 The request dialog (`<dialog>`, `showModal`), its narrow full-screen layout, the create form from New request and Suggest a change; test: tools/solution-map/test/view.test.mjs::suggest a change starts a request naming the feature
- [x] 3.3 A feature's open requests; New requests in Waiting for you; test: tools/solution-map/test/view.test.mjs::an item shows its notes, its features and its changes
- [x] 3.4 The unsent line with Submit on every view, the held draft in the dialog, the empty and unreachable states; test: tools/solution-map/test/view.test.mjs::every view shows the unsent drafts and submit
- [x] 3.5 Addresses `/backlog`, `/backlog/<id>`, `/backlog/new?about=<feature>`; test: tools/solution-map/test/view.test.mjs::every view has its own address
- [x] 3.6 Compare the page with `specs/overview/solution-map/looks/backlog.html`; test: node tools/gate/gate.mjs --local

## 4. The launcher (after 2)

- [x] 4.1 `launcher/setup.mjs`: Node check, git identity, clones of each `solutionMap.repos` entry with a `url`, the copied `launch.mjs`, the shortcut per system; `--print-command`; test: tools/solution-map/test/launcher.test.mjs
- [x] 4.2 `launcher/launch.mjs`: fetch, the map's tree id, `maps/<tree id>/` by `checkout-index`, the last folder when the fetch fails, `--launched`; test: tools/solution-map/test/launcher.test.mjs::the launched map runs from main's code
- [x] 4.3 The restart banner and route in the map; test: tools/solution-map/test/launcher.test.mjs::restart runs the newer map and keeps the drafts
- [x] 4.4 README: setup, the printed command, the shortcut, what a project adds to its config; test: node tools/gate/gate.mjs --local

## 5. The skills and the kit (after 1)

- [x] 5.1 `spec` accepts `backlog:<id>`: show, quote in Why, `link` and a note; test: node tools/gate/gate.mjs --local
- [x] 5.2 `triage` with no input lists `backlog.mjs list --state new`; test: node tools/gate/gate.mjs --local
- [x] 5.3 `kit.json` adds `tools/backlog/`; `specs/systems.json` adds Backlog and Solution map; `config.template.json` documents `backlog` and `solutionMap.repos[].url`; test: cd tools/kit && npm test
- [x] 5.4 The kit's `README.md` lists the backlog and the launcher; test: node tools/gate/gate.mjs --local

## 6. Free text and editing in place (Q17–Q20, after 1–5)

- [x] 6.1 `lib/item.mjs`: one description up to `## Notes`, its own headings kept, a `## Notes` line escaped; test: tools/backlog/test/item.test.mjs
- [x] 6.2 `lib/ops.mjs`: `add` takes `description`; `edit` sets `title`, `description` or `about` only; test: tools/backlog/test/ops.test.mjs::an edit of who asked, when, a note or a change is refused
- [x] 6.3 `backlog.mjs`: `add --text`, `edit <id> --title --text --about`, `show` prints the description; test: tools/backlog/test/cli.test.mjs::each write command sends one commit
- [x] 6.4 `lib/backlog-view.mjs`: `description` in place of the three fields; test: tools/solution-map/test/backlog.test.mjs::an edit made in the dialog is a draft of that field
- [ ] 6.5 The page: the create form's Description with its hint; the title, description and features edited in place, each a draft; test: tools/solution-map/test/view.test.mjs::an edited field shows its draft value in the request dialog
- [ ] 6.6 Nothing edits who asked, when, notes or changes; test: tools/solution-map/test/view.test.mjs::who asked, when, notes and changes have no edit control
- [ ] 6.7 READMEs of `tools/backlog/` and `tools/solution-map/`; compare the page with the boards; test: node tools/gate/gate.mjs --local

## 7. The quality gate (after 1–6)

- [ ] 7.1 Every suite in AGENTS.md's Quality gate, with `tools/backlog`; test: cd tools/backlog && npm test
- [ ] 7.2 The formality gate; test: node tools/gate/gate.mjs --local
