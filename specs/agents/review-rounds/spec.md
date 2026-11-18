---
title: Review rounds
review: unreviewed
code:
  - .agents/skills/ship/SKILL.md
  - .agents/skills/ship/review-checklist.md
---
# Review rounds

## Summary

Before an agent merges a change, fresh reviewers read it in rounds. Only a blocker or a major
finding sends the change into another round; a minor finding or a nit is fixed or answered on the
way to the merge. After the first round a reviewer checks the fixes, not the whole change again,
and the builder checks its own work before the first round, so a change normally takes two rounds,
and a third only when the second finds a blocker or a major.

## Requirements

### Requirement: Only a blocker or a major fails a round
The review checklist SHALL fail a round only on an open `blocker` or `major` and list each `minor`
and `nit` under `Follow-ups`, because a round that fails on nits never ends: each round finds new
ones, while blockers and majors are what a further round is for.

#### Scenario: A round with only follow-ups passes
- **WHEN** a round finds a `minor` and a `nit` and nothing more severe
- **THEN** its verdict is `pass`, and both are listed under `Follow-ups`

#### Scenario: A round with a major fails
- **WHEN** a round finds a `major` and two `nit`s
- **THEN** its verdict is `fail`; the `major` is under `Findings`, the `nit`s under `Follow-ups`

### Requirement: A round with no blocker or major ends the review
When a round finds no `blocker` or `major`, the ship skill SHALL fix or answer that round's
follow-ups without another round, and only when those fixes changed code (more than docs, comments
or wording) have one more round review them, because a further whole round for wording costs more
than it finds, while a code fix can still break something.

#### Scenario: Wording follow-ups are fixed without another round
- **WHEN** round 2 passes with two `nit`s about a README's wording
- **THEN** the lead fixes both, records them in `## Review`, and goes on to the merge without a
  round 3

#### Scenario: A follow-up fix that changes code gets one more round
- **WHEN** round 1 passes with a `minor` whose fix changes code
- **THEN** round 2 reviews that fix; finding no `blocker` or `major`, it ends the review, its own
  follow-ups fixed or answered without a round 3

#### Scenario: A blocker or major open after round 3 goes to the owner
- **WHEN** a `blocker` or `major` is still open after round 3
- **THEN** the lead stops, lists each open finding for the owner and does not merge

### Requirement: Later rounds review the fixes
From round 2, the reviewer SHALL review the diff since the head it last reviewed, checking that
each fix holds and that nothing it touches broke (the code, its tests, and the spec, README and
comment lines that describe it), and on code the fixes left unchanged raise only a `blocker` or
`major`, because re-reading the whole change each round finds new nits on code that was already
accepted.

#### Scenario: A nit on unchanged code is not raised in round 2
- **WHEN** in round 2 the reviewer notices a naming nit in a file no fix touched
- **THEN** the round raises nothing for it

#### Scenario: A fix that leaves its README stale is a finding in round 2
- **WHEN** a fix changes what a command prints and leaves the README line that describes it as it
  was
- **THEN** round 2 raises the stale README line

### Requirement: The builder checks its own work before round 1
Before the first round, the ship skill SHALL run the checklist's checks of repository rules, specs,
docs and process on its own branch and its pull request body, and fix what they find, because a
mechanical finding in round 1 costs a whole round.

#### Scenario: The self-check runs before round 1
- **WHEN** the lead has committed the build and the gate passes
- **THEN** it runs the checklist's checks 3 and 5–14 and fixes what they find before it asks for
  round 1

### Requirement: The pull request names no commit a fix makes stale
The ship skill SHALL record a fixed finding as `→ fixed`, naming no commit, and name the head the
suites ran on once in `## Tests`, updated after the last fix, because a commit named in the pull
request goes stale with every later fix and becomes a finding of its own.

#### Scenario: A fix is recorded without a commit
- **WHEN** the lead records a fixed finding in `## Review`
- **THEN** the line ends `→ fixed`, with no commit

#### Scenario: A test record older than head is no finding from round 2
- **WHEN** in round 2 `## Tests` names the head before the fixes
- **THEN** the round raises nothing for it, and ship's final checks name the final head before the
  merge
