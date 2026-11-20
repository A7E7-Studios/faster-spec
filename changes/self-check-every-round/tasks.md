# Tasks: The builder self-checks every round, and the spec lists each code path

Each task is one line and names the test that proves it. The scenarios of `agents/review-rounds`
and `agents/requirement-paths` are agent behaviour no automation reaches; the pull request names
them under `## Not verified`.

## 1. The skills and their templates

- [x] 1.1 Ship: the self-check runs every check of the review checklist before round 1 (step 3.4) and on each round's fixes (step 5.3), and the description says so; test: node tools/gate/gate.mjs --local
- [x] 1.2 Spec: the facts step lists every code path each requirement covers; the proposal template's `## What changes` names them; test: node tools/gate/gate.mjs --local
- [x] 1.3 The tasks template: a task and a test for each code path the proposal names; test: node tools/gate/gate.mjs --local
- [x] 1.4 The specs `agents/review-rounds` and `agents/requirement-paths`, and this change folder; test: node tools/gate/gate.mjs --local
- [x] 1.5 Update README.md's line on the skills to state what they do; test: node tools/gate/gate.mjs --local
