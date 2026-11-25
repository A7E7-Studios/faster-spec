# Tasks: A pull request stays a draft until its final head, so CI runs once per change

Each task is one line and names the test that proves it. The scenarios of `agents/ready-once` are
agent behaviour no automation reaches; the pull request names them under `## Not verified`.

## 1. The ship skill

- [x] 1.1 Section 4: open the pull request as a draft, kept one through the review rounds; the description says so; test: node tools/gate/gate.mjs --local
- [x] 1.2 Step 6.4: mark it ready after the final checks, wait for CI's checks, a failing check as a failing suite, a check that never started under `## Not verified`; test: node tools/gate/gate.mjs --local
- [x] 1.3 The spec `agents/ready-once` and this change folder; test: node tools/gate/gate.mjs --local
- [x] 1.4 Update README.md's line on the skills to state what ship does; test: node tools/gate/gate.mjs --local
