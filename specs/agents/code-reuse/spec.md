---
title: Building on the code that is there
review: unreviewed
code:
  - .agents/skills/ship/SKILL.md
  - .agents/skills/ship/review-checklist.md
---
# Building on the code that is there

## Summary

When an agent builds a change, it first looks for code that already does the job and extends or
refactors it, rather than writing a second version; the independent review then checks for
duplication. The codebase keeps one home per concern as it grows.

## Requirements

### Requirement: Ship extends existing code before writing new code
When the ship skill starts a task, the agent SHALL search the repository for code that already
does the task or nearly does, and integrate into it or refactor it into one shared implementation,
because a second version of the same logic drifts from the first and doubles every later fix.

#### Scenario: A task that existing code nearly covers extends that code
- **WHEN** a task needs behaviour a module already has in part
- **THEN** the change extends or refactors that module, and the pull request says where code was
  reused or refactored

### Requirement: The review finds duplication
When the independent reviewer reads a pull request, it SHALL report re-implementation of what the
codebase already has, duplicated or copied logic, new code that belongs in an existing module, and
drift from the codebase's structure, because only a fresh reader sees what the author did not look
for.

#### Scenario: A copied helper is a finding
- **WHEN** a pull request adds a function that repeats one the codebase has
- **THEN** the review lists it as a finding naming both places
