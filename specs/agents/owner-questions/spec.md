---
title: Questions to the owner
code:
  - .agents/skills/spec/SKILL.md
  - .agents/skills/design/SKILL.md
---
# Questions to the owner

## Purpose

When an agent needs the owner's decision, the owner gets the questions as a picker with the
recommended answer first, not a wall of text.

## Requirements

### Requirement: Questions go through the harness's question tool
The spec and design skills SHALL ask the owner through the harness's question tool when it has one,
at most 4 questions per call and 2–4 options each, the recommended option first with its label
ending "(Recommended)", one short description per option and a preview for any example to compare,
because answering a picker is faster and surer than answering a wall of text.

#### Scenario: A round of five questions in Claude Code
- **GIVEN** a request whose first round holds five questions
- **WHEN** the spec skill asks them in Claude Code
- **THEN** the owner gets two question pickers, one of four questions and one of one, each
  question headed with its number and its recommended option first
- **PROOF** desk: open

### Requirement: Without a question tool, each option is its own list item
The skills SHALL write the questions as text only for a harness without a question tool, each
option its own top-level list item with its details nested under it, never options run together on
one line and never a plain line straight after a nested list, because Markdown folds such a line
into the last bullet.

#### Scenario: A round asked as text
- **GIVEN** a harness with no question tool
- **WHEN** the spec skill asks a round
- **THEN** each question is numbered, each option a list item of its own with the recommended one
  first, and every line renders where it was written
- **PROOF** desk: open
