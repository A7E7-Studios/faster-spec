---
title: CI runs once per change
review: unreviewed
code:
  - .agents/skills/ship/SKILL.md
---
# CI runs once per change

## Summary

While agents build and review a change, its pull request is a draft, and a project's CI runs
nothing on a draft: the agent's own runs of the suites are the record of each attempt. The pull
request is marked ready only when the last review round has passed, so CI checks the head that
merges, once, instead of every commit the review loop pushed.

## Requirements

### Requirement: The pull request is a draft until its final head
The ship skill SHALL open the pull request as a draft and keep it one through the review rounds,
because CI then spends nothing on the commits a review loop supersedes, which were most of the
minutes CI spent in the projects that carry the kit.

#### Scenario: A change with three review rounds runs CI once
- **GIVEN** a project whose CI runs no job on a draft pull request
- **WHEN** the ship skill builds a change that takes three review rounds and two fix pushes
- **THEN** the pull request is a draft until the final checks, and CI runs on one head: the one
  that merges

### Requirement: A ready pull request merges only on its checks
When the ship skill marks the pull request ready, it SHALL wait for the checks CI runs on that
head and treat a failing check as a failing suite, because CI is the one check of the head that
merges that the builder did not run itself.

#### Scenario: A check fails after the pull request is marked ready
- **WHEN** a CI check fails on the ready head
- **THEN** the pull request goes back to a draft, the fix is self-checked and reviewed as a
  round's fix is, and the pull request is marked ready again on the fixed head

#### Scenario: A check GitHub never started
- **WHEN** CI's checks end without a runner starting, as when the account's Actions budget is spent
- **THEN** the pull request names them under `## Not verified`, the owner is told in one line, and
  the merge goes on on the record of the local suites
