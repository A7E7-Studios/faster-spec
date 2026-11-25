# Tasks: A built interface is checked against its profile before the owner sees it

Each task is one line and names the test that proves it. The scenarios of `agents/built-interface`
are agent behaviour no automation reaches; the pull request names them under `## Not verified`.

## 1. The gate reads `design.profiles`

- [x] 1.1 `designProblems` accepts `profiles`, a list of one or more repository paths to files, none twice; test: tools/gate/test/units.test.mjs::config: the design block names a tokens file and a brief, and optionally catalogues, a render command and profiles
- [x] 1.2 The design check fails on a named profile missing at head and counts the profiles in its summary; test: tools/gate/test/gate.test.mjs::design: skipped without a design block; with the starter's, its tokens file, brief and profile are present at head
- [x] 1.3 The starter config names the web profile, a file the kit ships; test: tools/gate/test/units.test.mjs::config: the design block names a tokens file and a brief, and optionally catalogues, a render command and profiles
- [x] 1.4 Update tools/gate/README.md to state what the `design` check and key do; test: node tools/gate/gate.mjs --local

## 2. The web profile and the skills (after 1)

- [x] 2.1 `tools/design/profiles/web.md`: the Standards and the Checks; test: node tools/gate/gate.mjs --local
- [x] 2.2 Design: the profiles in step 0, each new component's states and the narrow width on the board in step 1.7; the look template's States table; the tasks template's task per check; test: node tools/gate/gate.mjs --local
- [x] 2.3 Ship step 2, "The built look": the Standards, the Checks as tests, the comparison with the board; test: node tools/gate/gate.mjs --local
- [x] 2.4 The review checklist: the profiles under Read, check 8 and the Severity table; test: node tools/gate/gate.mjs --local
- [x] 2.5 The specs `agents/built-interface` and `agents/design-system`, and this change folder; test: node tools/gate/gate.mjs --local
- [x] 2.6 Update tools/design/README.md and README.md's line on `tools/design/` to state what they hold; test: node tools/gate/gate.mjs --local
