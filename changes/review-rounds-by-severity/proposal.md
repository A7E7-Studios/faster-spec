---
title: Review rounds end when no blocker or major is left
capabilities:
  - agents/review-rounds
---
# Review rounds end when no blocker or major is left

## Why

Changes built with the ship skill took three to four and a half review rounds on average across
the projects that carry the kit, up to 4.25 rounds per pull request in one project's busiest days.
An analysis of the review sections of 271 merged pull requests found the exit rules themselves
cause it: a round passed only with no finding of any severity open, a fresh reviewer re-read the
whole change every round and found new nits on code already accepted, and every fix made a
recorded commit or a document stale, which the next round found. In one project, letting a round
with no blocker end the review took the mean from 4.2 rounds to 2.0, while the pull requests grew.
Late rounds there and elsewhere still found blockers and majors, so those must keep failing a
round.

## What changes

- **Only a `blocker` or `major` fails a round.** The checklist lists `minor` and `nit` under
  `Follow-ups`, which never fail a verdict ("A round with only follow-ups passes", "A round with
  a major fails").
- **A round with no blocker or major ends the review.** Its follow-ups are fixed or answered
  without another round; when those fixes changed code, one more round reviews them. Round 3 still
  hands the owner what is open, now only a `blocker` or `major` ("Wording follow-ups are fixed
  without another round", "A follow-up fix that changes code gets one more round", "A blocker or
  major open after round 3 goes to the owner"). The final head may differ from the last reviewed
  one by the follow-ups' fixes.
- **Later rounds review the fixes.** From round 2 the reviewer reviews
  `git diff <head last reviewed>..HEAD`: each fix holds and nothing it touches broke, docs
  included; on unchanged code it raises only a `blocker` or `major` ("A nit on unchanged code is
  not raised in round 2", "A fix that leaves its README stale is a finding in round 2").
- **The builder self-checks.** Before round 1, ship runs checklist checks 3 and 5–14 on its branch
  and its pull request body and fixes what they find ("The self-check runs before round 1").
- **No stale records.** A fix is recorded `→ fixed`, with no commit; `## Tests` names the head
  once and is updated after the last fix; from round 2 an older test record is no finding, since
  ship's final checks update it at merge ("A fix is recorded without a commit", "A test record
  older than head is no finding from round 2").

## Review

At a desk: read the ship skill's steps 3, 4, 5 and 6.3–6.4 and the review checklist's check 12,
Severity, Round 2 and later, and Output; then, after a project's next sync, compare the rounds per
pull request there with the rounds before.

## Settled questions

- **Q1 Which findings fail a round**: only a `blocker` or `major`; `minor` and `nit` are
  follow-ups. Rejected: every finding of any severity; only a `blocker`, since late rounds still
  find majors.
- **Q2 What later rounds review**: the fixes' diff and what each fix touches; on unchanged code
  only a `blocker` or `major`. Rejected: the whole change again each round.
- **Q3 Builder self-check and records**: the builder runs checks 3 and 5–14 before round 1; fix
  notes name no commit; `## Tests` names the head once, updated after the last fix. Rejected:
  leaving mechanical findings to round 1; a commit per fix note.
- **Q4 Follow-ups after the last round**: fixed or answered without another round; one more round
  only when their fixes changed code, and it must find no `blocker` or `major`. Rejected: every
  follow-up fix reviewed in a round of its own; follow-ups left for later work.
- **Q5 Plan documents and scope**: unchanged for now (see Out of scope). Rejected: changing them in
  this change.

## Calls for the owner

- **"Code" for the follow-up round** is anything more than docs, comments or wording: a test or a
  config change counts as code. Alternative: only source files; a test change would then skip its
  round.
- **The self-check covers the pull request body** for checks 12 and 14, which need it, though the
  body is written in step 4 after the self-check's step 3. Alternative: skip those two checks in
  the self-check; round 1 would find a missing section.
- **Round 3's stop counts only a `blocker` or `major`**; follow-ups are fixed or answered before
  the merge, as every finding is. Alternative: any open finding stops at round 3; a nit would then
  reach the owner.

## Out of scope

- **Plan documents record decisions, not code detail**: checklist check 5 would read "The specs
  agree with what was built. `proposal.md`, `look.md` and `design.md` are the approved plan: a
  finding only where the build reverses a decision they record." A possible later change, when the
  templates are next touched.
- **No new scope during review, and very large pull requests split**: a possible later change.
- Updating the projects that carry the kit: each takes this on its next sync, with nothing to change
  in its config.
