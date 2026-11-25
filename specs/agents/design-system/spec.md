---
title: Design system contract
review: unreviewed
code:
  - .agents/skills/design/SKILL.md
  - tools/design/
  - tools/gate/lib/index.mjs
  - tools/gate/lib/checks.mjs
---
# Design system contract

## Summary

A project declares its design system once (its tokens, its style brief, where its components can
be seen) and every visual design is built on it, critiqued against the brief and checked for
accessibility before the owner sees it on one page in the change folder. It also names the
profile of each kind of application it builds: the standards an interface keeps and the checks
that prove them on the build. A project without its own style starts from the kit's house style
and its web profile.

## Requirements

### Requirement: The project's config declares its design system
When a project's `tools/gate/config.json` holds a `design` block, the gate SHALL check that its
tokens file, its brief and each profile it names exist, because a design built on missing tokens
is built on nothing and a build checked against a missing profile is not checked.

#### Scenario: A design block naming a missing brief fails
- **WHEN** the config's `design.brief` names a file that is not there
- **THEN** the gate's design check fails and names the file
- **PROOF** test: tools/gate/test/gate.test.mjs::design: skipped without a design block; with the starter's, its tokens file, brief and profile are present at head
- **PROOF** test: tools/gate/test/units.test.mjs::config: the design block names a tokens file and a brief, and optionally catalogues, a render command and profiles

#### Scenario: A design block naming a missing profile fails
- **WHEN** the config's `design.profiles` names a file that is not there
- **THEN** the gate's design check fails and names the file
- **PROOF** test: tools/gate/test/gate.test.mjs::design: skipped without a design block; with the starter's, its tokens file, brief and profile are present at head

#### Scenario: A profile list that names no file is refused
| `design.profiles` | The config |
|---|---|
| not a list, or an empty one | is refused |
| a folder, or a path outside the repository | is refused |
| the same file twice | is refused |
- **PROOF** test: tools/gate/test/units.test.mjs::config: the design block names a tokens file and a brief, and optionally catalogues, a render command and profiles

#### Scenario: No design block skips the check
- **WHEN** the config has no `design` block
- **THEN** the gate's design check is skipped
- **PROOF** test: tools/gate/test/gate.test.mjs::design: skipped without a design block; with the starter's, its tokens file, brief and profile are present at head

### Requirement: Directions are critiqued before the owner sees them
When the design skill draws directions, it SHALL build them on the project's tokens, critique each
against the style brief and check it against the accessibility list, because the owner's time goes
to choosing between sound directions, not to finding contrast errors.

#### Scenario: Directions reach the owner with their critique
- **WHEN** the design skill shows the owner its directions
- **THEN** each comes with its critique against the brief and its accessibility check, and
  `look.md` records both for the pick

### Requirement: The owner picks from one page in the change folder
When the design skill shows the owner its directions, it SHALL draw them on the change's page,
`changes/<id>/looks.html`, open it in the harness's built-in browser with its path given and ask
for the pick as it asks the owner a question, because a page inside the change's worktree opens
beside the conversation in any agent app, where the owner can compare the directions.

#### Scenario: The owner picks from the page in the built-in browser
- **WHEN** the design skill has critiqued its directions
- **THEN** `changes/<id>/looks.html` holds the current state, the directions side by side, each
  one's trade-offs against the research and the critique, and the recommended pick
- **AND** the page is open in the harness's built-in browser, its path given, and the pick is
  asked as a question to the owner, through the harness's question tool when it has one

#### Scenario: The page lands with the pick and leaves with the folder
- **WHEN** the owner has picked a direction
- **THEN** `looks.html` is committed with `look.md`, the picked design lands as the board beside
  the spec, and the page goes when triage deletes the change folder

### Requirement: The kit ships a house style
The kit SHALL ship a house style (tokens and a brief) and a web profile that the starter config
points at, because a new project needs a design system and a standard to build to before it has
its own.

#### Scenario: A new project designs on the house style
- **GIVEN** a project whose config started from the starter
- **WHEN** the design skill draws directions
- **THEN** they use the house style's tokens and are critiqued against its brief

#### Scenario: The starter names a profile the kit ships
- **WHEN** a project starts from the starter config
- **THEN** its `design.profiles` names the web profile, a file the kit holds
- **PROOF** test: tools/gate/test/units.test.mjs::config: the design block names a tokens file and a brief, and optionally catalogues, a render command and profiles
