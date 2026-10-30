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
the page of directions the owner picked from, the design picked and the tasks: text, and that one
self-contained page. It lands with the code and is deleted once the owner has approved every
feature it names; it holds no review state of its own.

## Requirements

### Requirement: A change folder holds its plan and nothing else
When the gate reads a change folder, it SHALL fail one without `proposal.md`, a file other than
`proposal.md`, `looks.html`, `look.md`, `design.md` and `tasks.md`, a `looks.html` that loads
anything from outside itself, or a proposal whose front matter breaks the format, because the
folder is the plan, its one page shows the directions without reaching outside the repository, and
every other review artefact lives elsewhere or nowhere.

#### Scenario: A frame in a change folder fails
- **WHEN** a pull request adds `changes/<id>/evidence/frame.png`
- **THEN** the gate fails, saying no images or videos are committed
- **PROOF** test: tools/gate/test/gate.test.mjs::specs and changes: no image or video file is committed anywhere under specs/ or changes/

#### Scenario: The directions page is self-contained
- **WHEN** a change folder's `looks.html` loads a stylesheet from `https://…`
- **THEN** the gate fails and names the line
- **AND** a page with its CSS inline and only `data:` URLs passes
- **PROOF** test: tools/gate/test/gate.test.mjs::changes: a folder without proposal.md, a bad id, bad front matter, a missing capability, a stray file, a directions page that loads from outside

#### Scenario: An old review key fails
- **WHEN** a proposal's front matter holds `review: unreviewed`
- **THEN** the gate names the unknown key
- **PROOF** test: tools/gate/test/units.test.mjs::change: the contract example parses; review and follow-ups are no keys of a proposal

### Requirement: A spec edit carries its change folder
When a pull request changes a spec's text (its Summary, Looks lines or boards, requirements or
scenarios), the gate SHALL fail it unless it adds or modifies a change folder naming the
capability, because the owner reviews every behaviour change.

#### Scenario: A board edit without a change folder fails
- **WHEN** a pull request edits a feature's board and adds no change folder
- **THEN** the gate fails and names the capability
- **PROOF** test: tools/gate/test/gate.test.mjs::changes: a board added, edited or deleted is a change to its spec's text, which needs a change folder naming it
