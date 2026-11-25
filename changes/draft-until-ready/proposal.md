---
title: A pull request stays a draft until its final head, so CI runs once per change
capabilities:
  - agents/ready-once
---
# A pull request stays a draft until its final head, so CI runs once per change

## Why

The ship skill opens a pull request ready for review and then pushes every fix of its review
rounds, so a project's CI runs in full on each of them. Measured with the GitHub REST API (the
`actions/runs` list and each run's `jobs`, billable minutes rounded up per job as GitHub bills,
which the billing usage report confirms within 10 %), in six projects that carry the kit, over
the nine days of the last month on which hosted CI was not blocked, 4,719 of 14,446 billable
minutes (33 %) went to pull-request commits that were not the head that merged: pull requests
pushed a median of 3 to 4 heads, up to 25. The builder had already run the same suites locally on
each of those heads, and the owner's Actions budget runs out within days of each month whatever
it is set to.

## What changes

- **The pull request opens as a draft** (`gh pr create --draft`) and stays one through the review
  rounds. Scenario: "A change with three review rounds runs CI once". Path:
  `.agents/skills/ship/SKILL.md` section 4 and its description.
- **It is marked ready on the final head**, after the final checks, and merges only once the
  checks CI runs there pass; a failing check sends it back to a draft for a fix that is
  self-checked and reviewed as a round's fix is. Scenario: "A check fails after the pull request is
  marked ready". Path: `.agents/skills/ship/SKILL.md` step 6.4.
- **A check GitHub never started** proves nothing either way: it is named under `## Not verified`
  and the owner is told. Scenario: "A check GitHub never started". Path:
  `.agents/skills/ship/SKILL.md` step 6.4.
- README.md's line on the skills says the same.

A project takes this on its next sync, and gets the saving only where its CI skips draft pull
requests: a job-level condition such as
`github.event_name != 'pull_request' || github.event.pull_request.draft == false`, with
`ready_for_review` among its `pull_request` types. The kit's own `gate.yml` already skips drafts.

## Review

At a desk: read ship section 4 and step 6.4. Then, in a project whose CI skips drafts, look at the
Actions runs of the next pull request a ship run lands: one run of each workflow, on the head that
merged.

## Settled questions

None.

## Calls for the owner

- **Ready after the final checks, not before the first review round.** Basis: every fix of a round
  is a new head, and the final checks are where the head stops changing. Alternative: ready at the
  first round, which runs CI on each round's fixes; changing it is one sentence of section 4.
- **A failing check after ready goes back to a draft.** Basis: the fix is a new head, and a ready
  pull request would run CI on it and on every later fix as well. Alternative: stay ready and let CI
  run on each fix; changing it is one clause of step 6.4.
- **A check that never started does not hold the merge.** Basis: the builder's local suites are the
  record of every earlier head already, and GitHub refusing a runner says nothing about the code.
  Alternative: hold the merge for the owner, which today would stop every merge for as long as the
  budget is spent; changing it is one sentence of step 6.4.
- **The kit's workflows change nothing.** Basis: `gate.yml` already skips drafts; a project's own CI
  is its own file, and the pull request of this change says what a project adds. Alternative: a
  starter CI workflow in the kit with the draft condition, which every project would then have to
  reconcile with its own; adding one later is a change of its own.
- **The gate's `protected` failure in CI is the owner's merge, not a failing check.** Basis: the
  gate fails that check on purpose for every pull request the owner merges, so a builder that
  fixed failing checks would loop on it. Alternative: none while the gate fails that check; the
  change `owner-merge-narrowed` would make it pass with its own result.

## Out of scope

- **A project's own CI workflows**: each project adds its draft condition in its own pull request.
- **Re-running CI on main after a squash merge of a tree the pull request already passed**: a
  project-side change to its CI workflow.
- **Local CI runners**: a change of its own.
