# Tasks: Review rounds end when no blocker or major is left

Each task is one line and names the test that proves it. The scenarios of `agents/review-rounds`
are agent behaviour no automation reaches; the pull request names them under `## Not verified`.

## 1. The ship skill and the review checklist

- [x] 1.1 Checklist: only a `blocker` or `major` fails a round, `minor` and `nit` under `Follow-ups`; rounds from 2 review the fixes' diff; check 12 takes a test record older than head as no finding from round 2; test: node tools/gate/gate.mjs --local
- [x] 1.2 Ship: the self-check before round 1; the rounds go on only while the last found a `blocker` or `major`, the follow-ups fixed without another round unless their fixes changed code; fix notes name no commit; `## Tests` names the head once; the reviewed head may differ by the follow-ups' fixes; test: node tools/gate/gate.mjs --local
- [x] 1.3 The spec `agents/review-rounds` and this change folder; test: node tools/gate/gate.mjs --local
