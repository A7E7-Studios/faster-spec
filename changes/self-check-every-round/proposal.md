---
title: The builder self-checks every round, and the spec lists each code path
capabilities:
  - agents/review-rounds
  - agents/requirement-paths
---
# The builder self-checks every round, and the spec lists each code path

## Why

Two pull requests built with the ship skill in CueReview took three review rounds each, and the
first had a fourth running. They were built on a kit from before rounds ended on severity, so 14 of
their 17 findings, the minors and nits, would now be follow-ups. Three would still fail a round,
all in the first pull request:

- **Round 1, blocker**: its requirement said every final transcription, and the build changed one
  of the four code paths that make one (checklist check 1, correct).
- **Round 1, major**: suites AGENTS.md names for the area were neither run nor named (check 12).
  The self-check on main already runs this check.
- **Round 3, major**: a round-2 fix changed a limit in the code while the requirement still stated
  the old one.

The self-check on main runs once, before round 1, and skips checks 1 (correct), 2 (reused) and 4
(tested). Its last finding, a new branch without a test, was check 4.

## What changes

- **The self-check runs every check**, 1 to 14, before round 1: ship step 3.4. Scenario: "The
  self-check runs before round 1".
- **The fixes are self-checked**: after each round's fixes, the builder runs every check on the
  fixes' diff as the checklist's *Round 2 and later* reviews them, and fixes what they find before
  the next round or the merge, then gates and reruns the suites they touch: ship step 5.3. What it
  fixes counts among the round's fixes: a code fix among a passing round's follow-ups still gets
  step 5.4's further round, and step 6.3 lets the final head carry the rest. The self-check before
  round 1 commits its fixes and reruns the gate and suites the same way. Scenario: "The self-check
  of a fix finds the requirement it left stale".
- **The spec lists each code path a requirement covers**: the spec skill's facts step lists the
  paths each outcome reaches, the proposal template's `## What changes` names them, and the tasks
  template gives each its own task, with a test wherever automation reaches it, else a line under
  the pull request's `## Not verified`. Scenario: "A requirement about every save covers each
  save".
- The ship skill's description and README.md's line on the skills say the same.

## Review

At a desk: read ship steps 3.4, 5.3, 5.4 and 6.3, the spec skill's facts step, and the proposal
and tasks templates. After CueReview's next sync, compare the rounds of its next few pull requests
with the three these took.

## Settled questions

- **Q1 When the self-check runs**: before round 1 on the whole change, and after each round's
  fixes on the fixes' diff, with the reviewer's own round-2 rule. Rejected: before round 1 only;
  before round 1 and once before the merge.
- **Q2 What it covers**: every check of the review checklist, 1 to 14. Rejected: checks 1 and 4
  added but not 2; checks 3 and 5–14 as they were.
- **Q3 Explicit pattern items in the checklist** (every path a claim names, a test that fails
  without each new branch, every named suite and the test inventory, the words re-read after the
  code): none. The owner asked for the simplest version that holds, without over-reviewing; the
  checks already cover each pattern, and Q1, Q2 and Q4 make them run where the findings came from.
  Rejected: the four items.
- **Q4 The paths at spec time**: the spec skill's facts step lists every code path a requirement
  covers; the proposal names them; the tasks give each a task and a test. Rejected: ship's
  self-check alone.
- **Q5 The summary**: the two ship edits, the facts step and the two templates; the checklist
  stays as it is. Rejected: one line in check 1, "a claim about every X holds for each X".

## Calls for the owner

- **The path rule is a feature of its own**, `agents/requirement-paths`, since it belongs to the
  spec skill and the templates, not to the review rounds. Alternative: a requirement in
  `agents/review-rounds`; moving it costs one spec edit.
- **The tasks template holds the rule** for a task per path; design and ship write `tasks.md` from
  it, so neither skill restates it. Alternative: a line in design's step 2.3 as well.
- **The self-check of the fixes also runs on a passing round's follow-ups**, before the merge. What
  it fixes counts among those follow-ups' fixes, so a code fix gets one more round and a wording fix
  does not. Alternative: only before a further round; a follow-up fix would then reach the merge
  unchecked.

## Out of scope

- **New checklist items for the patterns** (Q3, Q5).
- **A gate check** that every suite AGENTS.md names for the changed paths is under `## Tests` or
  `## Not verified`, and **recording the self-check** in the pull request body: left out as more
  than the simplest version (Q5).
- **Plan documents record decisions, not code detail**: still the possible later change the review
  rounds change named.
- **CueReview** takes this on its next sync, with nothing to change in its config.
