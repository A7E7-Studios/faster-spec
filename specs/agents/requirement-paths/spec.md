---
title: Every path a requirement covers
review: unreviewed
code:
  - .agents/skills/spec/SKILL.md
  - .agents/skills/spec/templates/proposal.md
  - .agents/skills/design/templates/tasks.md
---
# Every path a requirement covers

## Summary

A requirement often holds for something several parts of the code do: every save of a note, each
way a sync can start. Before anything is built, the agent that writes the spec lists each of those
code paths, and the change gets a task and a test for each one, so it cannot cover one path of
several while its spec claims them all.

## Requirements

### Requirement: The spec lists each code path a requirement covers
When the spec skill looks up the facts for a change, it SHALL list every code path each requirement
covers (each caller of what it changes, each entry point that reaches the behaviour) in the
proposal's `## What changes`, and the change's tasks SHALL give each path its own task and test,
because a requirement about every case that is built for one path of several reads as done and
fails in the paths that were missed.

#### Scenario: A requirement about every save covers each save
- **GIVEN** a notes app that saves a note from the editor, from autosave and from the conflict
  screen
- **WHEN** a requirement says every save of a note trims trailing spaces
- **THEN** the proposal's `## What changes` names the three paths, and `tasks.md` has a task and a
  test for each
