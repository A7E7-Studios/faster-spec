---
title: The change format
review: unreviewed
code:
  - changes/README.md
  - tools/gate/lib/spec.mjs
  - tools/gate/lib/checks.mjs
---
# The change format

## Summary

A change folder is the working plan of one change: the owner's request, the questions settled,
the design picked and the tasks, in text only. It lands with the code and is deleted once the
owner has approved every feature it names; it holds no review state of its own.

## Requirements

### Requirement: A change folder holds its plan and nothing else
When the gate reads a change folder, it SHALL fail one without `proposal.md`, a file other than
`proposal.md`, `look.md`, `design.md` and `tasks.md`, or a proposal whose front matter breaks the
format, because the folder is the plan and every review artefact lives elsewhere or nowhere.

#### Scenario: A frame in a change folder fails
- **WHEN** a pull request adds `changes/<id>/evidence/frame.png`
- **THEN** the gate fails, saying no images or videos are committed

#### Scenario: An old review key fails
- **WHEN** a proposal's front matter holds `review: unreviewed`
- **THEN** the gate names the unknown key

### Requirement: A spec edit carries its change folder
When a pull request changes a spec's text (its Summary, Looks lines or boards, requirements or
scenarios), the gate SHALL fail it unless it adds or modifies a change folder naming the
capability, because the owner reviews every behaviour change.

#### Scenario: A board edit without a change folder fails
- **WHEN** a pull request edits a feature's board and adds no change folder
- **THEN** the gate fails and names the capability
